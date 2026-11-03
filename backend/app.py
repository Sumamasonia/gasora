"""FastAPI app: login, customers, deliveries, today's plan, audit check."""
import logging
import os
from datetime import date
from typing import Literal, Optional

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from backend import eventlog, security, services, settings
from backend.models import Base, Customer, Delivery, User

log = logging.getLogger("gasora")
router = APIRouter()
bearer = HTTPBearer(auto_error=False)


# ---------- request and response shapes ----------
class LoginIn(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str


class UserIn(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    password: str = Field(min_length=8, max_length=100)
    role: Literal["owner", "driver"]


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    role: str


class CustomerIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    phone: Optional[str] = None
    address: Optional[str] = None
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    demand: int = Field(default=1, ge=1, le=10)


class CustomerOut(CustomerIn):
    model_config = ConfigDict(from_attributes=True)
    id: int


class DeliveryIn(BaseModel):
    customer_id: int
    cylinders: int = Field(default=1, ge=1, le=10)
    delivered_on: Optional[date] = None          # default: today


class DeliveryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    customer_id: int
    delivered_on: date
    cylinders: int
    driver: str
    event_id: Optional[int]


# ---------- dependencies ----------
def get_session(request: Request):
    with request.app.state.SessionLocal() as session:
        yield session


def current_user(request: Request,
                 creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
                 session: Session = Depends(get_session)) -> User:
    if creds is None:
        raise HTTPException(401, "login required")
    try:
        data = security.decode_token(creds.credentials, request.app.state.secret)
        user = session.get(User, int(data["sub"]))
    except Exception:
        raise HTTPException(401, "invalid or expired token")
    if user is None:
        raise HTTPException(401, "invalid or expired token")
    return user


def require(*roles):
    def check(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(403, "not allowed for your role")
        return user
    return check


# ---------- routes ----------
@router.get("/health")
def health():
    return {"status": "ok"}


@router.post("/auth/login", response_model=TokenOut)
def login(body: LoginIn, request: Request, session: Session = Depends(get_session)):
    user = session.scalar(select(User).where(User.username == body.username))
    ok = security.verify_password(body.password, user.password_hash if user else security.DUMMY_HASH)
    if user is None or not ok:
        raise HTTPException(401, "wrong username or password")
    token = security.create_token(user.id, user.role, request.app.state.secret, settings.TOKEN_MINUTES)
    return TokenOut(access_token=token, role=user.role)


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(body: UserIn, request: Request, session: Session = Depends(get_session),
                me: User = Depends(require("owner"))):
    if session.scalar(select(User).where(User.username == body.username)):
        raise HTTPException(409, "username already exists")
    user = User(username=body.username, password_hash=security.hash_password(body.password), role=body.role)
    session.add(user)
    session.flush()
    eventlog.append(request.app.state.events, me.username, "user.created",
                    {"user_id": user.id, "username": user.username, "role": user.role})
    session.commit()
    return user


@router.post("/customers", response_model=CustomerOut, status_code=201)
def create_customer(body: CustomerIn, request: Request, session: Session = Depends(get_session),
                    me: User = Depends(require("owner"))):
    c = Customer(**body.model_dump())
    session.add(c)
    session.flush()
    eventlog.append(request.app.state.events, me.username, "customer.created",
                    {"customer_id": c.id, "name": c.name})
    session.commit()
    return c


@router.get("/customers", response_model=list[CustomerOut])
def list_customers(session: Session = Depends(get_session), me: User = Depends(require("owner", "driver"))):
    return session.scalars(select(Customer).order_by(Customer.id)).all()


@router.post("/deliveries", response_model=DeliveryOut, status_code=201)
def create_delivery(body: DeliveryIn, request: Request, session: Session = Depends(get_session),
                    me: User = Depends(require("owner", "driver"))):
    day = body.delivered_on or date.today()
    if day > date.today():
        raise HTTPException(400, "delivery date is in the future")
    try:
        d = services.record_delivery(session, request.app.state.events, me.username,
                                     body.customer_id, day, body.cylinders)
    except LookupError:
        raise HTTPException(404, "customer not found")
    session.commit()
    return d


@router.get("/deliveries", response_model=list[DeliveryOut])
def list_deliveries(customer_id: Optional[int] = None, limit: int = Query(100, ge=1, le=1000),
                    session: Session = Depends(get_session), me: User = Depends(require("owner"))):
    q = select(Delivery).order_by(Delivery.id.desc()).limit(limit)
    if customer_id is not None:
        q = q.where(Delivery.customer_id == customer_id)
    return session.scalars(q).all()


@router.get("/plan/today")
def plan_today(day: Optional[date] = None, seconds: float = Query(2.0, ge=0.1, le=30),
               session: Session = Depends(get_session), me: User = Depends(require("owner"))):
    return services.build_plan(session, day or date.today(), seconds)


@router.get("/audit/verify")
def audit_verify(request: Request, me: User = Depends(require("owner"))):
    events = request.app.state.events
    ok, message = eventlog.verify(events)
    n = events.execute("SELECT COUNT(*) FROM events").fetchone()[0]
    return {"ok": ok, "message": message, "events": n, "head": eventlog.head(events)}


# ---------- app factory ----------
def create_app(db_url=None, events_path=None, secret=None):
    db_url = db_url or settings.DB_URL
    events_path = events_path or settings.EVENTS_PATH
    secret = secret or settings.SECRET
    if secret == settings.DEFAULT_SECRET:
        log.warning("Using the default secret. Set GASORA_SECRET before real use.")

    kwargs = {}
    if db_url.startswith("sqlite"):
        kwargs["connect_args"] = {"check_same_thread": False}
        if db_url in ("sqlite://", "sqlite:///:memory:"):
            kwargs["poolclass"] = StaticPool                 # keep one in-memory database
        else:
            os.makedirs(os.path.dirname(db_url.replace("sqlite:///", "")) or ".", exist_ok=True)
    if events_path != ":memory:":
        os.makedirs(os.path.dirname(events_path) or ".", exist_ok=True)

    engine = create_engine(db_url, **kwargs)
    Base.metadata.create_all(engine)

    app = FastAPI(title="Gasora API")
    app.state.SessionLocal = sessionmaker(engine, expire_on_commit=False)
    app.state.events = eventlog.connect(events_path)
    app.state.secret = secret
    app.include_router(router)
    return app
