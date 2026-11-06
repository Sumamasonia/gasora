"""FastAPI app: login, customers, deliveries, today's plan, audit check."""
import logging
import os
from datetime import date, datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from backend import cylinders, eventlog, security, services, settings
from planner.road_router import RoadRouter, StraightRouter
from backend.models import Base, Customer, Cylinder, CylinderTransaction, Delivery, User

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


class CylinderIn(BaseModel):
    serial_no: str = Field(min_length=1, max_length=30)
    cylinder_type: str = Field(default="11.8 kg", min_length=1, max_length=30)
    owner: Literal["Company", "Customer"] = "Company"


class CylinderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    serial_no: str
    cylinder_type: str
    state: str
    owner: str
    customer_id: Optional[int]
    created_at: datetime


class CylinderTransitionIn(BaseModel):
    to_state: Literal["Empty", "Filled", "Delivered", "Recovered"]
    customer_id: Optional[int] = None
    delivery_id: Optional[int] = None
    note: Optional[str] = Field(default=None, max_length=200)
    due_date: Optional[date] = None


class CylinderTransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    cylinder_id: int
    txn_type: str
    from_state: Optional[str]
    to_state: str
    customer_id: Optional[int]
    delivery_id: Optional[int]
    actor: str
    note: Optional[str]
    due_date: Optional[date] = None
    created_at: datetime
    event_id: Optional[int]


class CustomerHeldSummary(BaseModel):
    customer_id: int
    name: str
    cylinders: int


class CylinderSummaryOut(BaseModel):
    by_state: dict[str, int]
    by_owner: dict[str, int]
    held_by_customers: list[CustomerHeldSummary]


class DeliveryIn(BaseModel):
    customer_id: int
    cylinders: int = Field(default=1, ge=1, le=10)
    empties_collected: Optional[int] = Field(default=None, ge=0, le=20)   # default: as many as delivered
    delivered_on: Optional[date] = None          # default: today


class DeliveryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    customer_id: int
    delivered_on: date
    cylinders: int
    driver: str
    event_id: Optional[int]


class UrgentIn(BaseModel):
    customer_id: int
    note: Optional[str] = Field(default=None, max_length=200)


class PublishIn(BaseModel):
    day: Optional[date] = None
    seconds: float = Field(default=2.0, ge=0.1, le=30)


class AssignIn(BaseModel):
    username: str


class DeliverIn(BaseModel):
    cylinders: Optional[int] = Field(default=None, ge=1, le=10)
    empties_collected: Optional[int] = Field(default=None, ge=0, le=20)


class AdjustEmptiesIn(BaseModel):
    customer_id: int
    delta: int = Field(ge=-20, le=20)
    note: Optional[str] = Field(default=None, max_length=200)
    since: Optional[date] = None                 # when the customer started holding them (sets their age)


class PathsIn(BaseModel):
    routes: list[list[int]] = Field(max_length=10)


class SkipIn(BaseModel):
    reason: str = Field(min_length=1, max_length=200)


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


@router.post("/cylinders", response_model=CylinderOut, status_code=201)
def create_cylinder(body: CylinderIn, request: Request, session: Session = Depends(get_session),
                    me: User = Depends(require("owner"))):
    try:
        cyl = cylinders.register_cylinder(
            session, request.app.state.events, me.username,
            body.serial_no, body.cylinder_type, body.owner
        )
    except ValueError as e:
        raise HTTPException(409, str(e))
    session.commit()
    return cyl


@router.get("/cylinders", response_model=list[CylinderOut])
def list_cylinders(state: Optional[Literal["Empty", "Filled", "Delivered", "Recovered"]] = None,
                   owner: Optional[Literal["Company", "Customer"]] = None,
                   customer_id: Optional[int] = None,
                   session: Session = Depends(get_session),
                   me: User = Depends(require("owner", "driver"))):
    q = select(Cylinder).order_by(Cylinder.id)
    if state is not None:
        q = q.where(Cylinder.state == state)
    if owner is not None:
        q = q.where(Cylinder.owner == owner)
    if customer_id is not None:
        q = q.where(Cylinder.customer_id == customer_id)
    return session.scalars(q).all()


@router.get("/cylinders/summary", response_model=CylinderSummaryOut)
def get_cylinder_summary(session: Session = Depends(get_session),
                         me: User = Depends(require("owner"))):
    return cylinders.cylinder_summary(session)


@router.get("/cylinders/{id}", response_model=CylinderOut)
def get_cylinder(id: int, session: Session = Depends(get_session),
                 me: User = Depends(require("owner", "driver"))):
    cyl = session.get(Cylinder, id)
    if cyl is None:
        raise HTTPException(404, "cylinder not found")
    return cyl


@router.get("/cylinders/{id}/history", response_model=list[CylinderTransactionOut])
def get_cylinder_history(id: int, session: Session = Depends(get_session),
                         me: User = Depends(require("owner", "driver"))):
    try:
        return cylinders.cylinder_history(session, id)
    except LookupError as e:
        raise HTTPException(404, str(e))


@router.post("/cylinders/{id}/transition", response_model=CylinderOut)
def transition_cylinder_endpoint(id: int, body: CylinderTransitionIn, request: Request,
                                 session: Session = Depends(get_session),
                                 me: User = Depends(require("owner", "driver"))):
    try:
        cyl = cylinders.transition_cylinder(
            session, request.app.state.events, me.username,
            id, body.to_state, body.customer_id, body.delivery_id, body.note,
            due_date=body.due_date,
        )
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(409, str(e))
    session.commit()
    return cyl


@router.post("/deliveries", response_model=DeliveryOut, status_code=201)
def create_delivery(body: DeliveryIn, request: Request, session: Session = Depends(get_session),
                    me: User = Depends(require("owner", "driver"))):
    day = body.delivered_on or date.today()
    if day > date.today():
        raise HTTPException(400, "delivery date is in the future")
    try:
        d = services.record_delivery(session, request.app.state.events, me.username,
                                     body.customer_id, day, body.cylinders, body.empties_collected)
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
def plan_today(request: Request, day: Optional[date] = None, seconds: float = Query(2.0, ge=0.1, le=30),
               session: Session = Depends(get_session), me: User = Depends(require("owner"))):
    return services.build_plan(session, day or date.today(), seconds, request.app.state.router)


@router.post("/paths")
def paths(body: PathsIn, request: Request, session: Session = Depends(get_session),
          me: User = Depends(require("owner", "driver"))):
    return {"paths": services.route_paths(session, request.app.state.router, body.routes)}


@router.get("/audit/verify")
def audit_verify(request: Request, me: User = Depends(require("owner"))):
    events = request.app.state.events
    ok, message = eventlog.verify(events)
    n = events.execute("SELECT COUNT(*) FROM events").fetchone()[0]
    return {"ok": ok, "message": message, "events": n, "head": eventlog.head(events)}


@router.get("/users", response_model=list[UserOut])
def list_users(session: Session = Depends(get_session), me: User = Depends(require("owner"))):
    return session.scalars(select(User).order_by(User.id)).all()


@router.post("/urgent", status_code=201)
def create_urgent(body: UrgentIn, request: Request, session: Session = Depends(get_session),
                  me: User = Depends(require("owner"))):
    try:
        u = services.create_urgent(session, request.app.state.events, me.username, body.customer_id, body.note)
    except LookupError:
        raise HTTPException(404, "customer not found")
    session.commit()
    return {"urgent_id": u.id}


@router.get("/urgent")
def list_urgent(session: Session = Depends(get_session), me: User = Depends(require("owner"))):
    return services.open_urgent(session)


@router.post("/plan/publish", status_code=201)
def publish(body: PublishIn, request: Request, session: Session = Depends(get_session),
            me: User = Depends(require("owner"))):
    day = body.day or date.today()
    try:
        services.publish_plan(session, request.app.state.events, me.username, day, body.seconds,
                                 request.app.state.router)
    except ValueError as e:
        raise HTTPException(409, str(e))
    session.commit()
    return services.routes_view(session, day)


@router.get("/routes")
def list_routes(day: Optional[date] = None, session: Session = Depends(get_session),
                me: User = Depends(require("owner"))):
    return services.routes_view(session, day or date.today())


@router.patch("/routes/{route_id}/assign")
def assign(route_id: int, body: AssignIn, request: Request, session: Session = Depends(get_session),
           me: User = Depends(require("owner"))):
    try:
        services.assign_route(session, request.app.state.events, me.username, route_id, body.username)
    except LookupError as e:
        raise HTTPException(404, str(e))
    session.commit()
    return {"ok": True}


@router.get("/my-routes")
def my_routes(session: Session = Depends(get_session), me: User = Depends(require("owner", "driver"))):
    return services.routes_view(session, date.today(), driver_id=me.id)


def _stop_action(stop_id, action, request, session, me, cylinders=None, reason=None, empties_collected=None):
    try:
        services.complete_stop(session, request.app.state.events, me, stop_id, action, cylinders, reason,
                               empties_collected)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except PermissionError as e:
        raise HTTPException(403, str(e))
    except ValueError as e:
        raise HTTPException(409, str(e))
    session.commit()
    return {"ok": True}


@router.get("/empties")
def empties(session: Session = Depends(get_session), me: User = Depends(require("owner"))):
    return services.empties_summary(session, date.today())


@router.post("/empties/adjust", status_code=201)
def empties_adjust(body: AdjustEmptiesIn, request: Request, session: Session = Depends(get_session),
                   me: User = Depends(require("owner"))):
    try:
        services.adjust_empties(session, request.app.state.events, me.username, body.customer_id, body.delta, body.note, body.since)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))
    session.commit()
    return services.empties_summary(session, date.today())


@router.post("/route-stops/{stop_id}/deliver")
def deliver_stop(stop_id: int, body: DeliverIn, request: Request, session: Session = Depends(get_session),
                 me: User = Depends(require("owner", "driver"))):
    return _stop_action(stop_id, "deliver", request, session, me, cylinders=body.cylinders,
                        empties_collected=body.empties_collected)


@router.post("/route-stops/{stop_id}/skip")
def skip_stop(stop_id: int, body: SkipIn, request: Request, session: Session = Depends(get_session),
              me: User = Depends(require("owner", "driver"))):
    return _stop_action(stop_id, "skip", request, session, me, reason=body.reason)


# ---------- app factory ----------
def create_app(db_url=None, events_path=None, secret=None, routing=None, graph_path=None, cache_path=None):
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
    graph_path = graph_path or settings.ROAD_GRAPH
    routing = routing or settings.ROUTING
    if routing == "auto":
        routing = "road" if os.path.exists(graph_path) else "straight"
    if routing == "road":
        app.state.router = RoadRouter(graph_path, cache_path or settings.ROAD_CACHE)
    else:
        app.state.router = StraightRouter()
    log.info("Routing mode: %s", app.state.router.mode)
    app.include_router(router)
    return app
