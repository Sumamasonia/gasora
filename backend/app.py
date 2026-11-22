"""FastAPI app: login, customers, deliveries, today's plan, audit check."""
import logging
import os
from datetime import date, datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from backend import accounts, assistant, backup, cylinders, eventlog, expenses, portal, reports, runtime, security, services, settings, staff, stock
from backend.routers import StraightRouter
from backend.models import Base, Customer, Cylinder, CylinderTransaction, DailyNote, Delivery, Invoice, User

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
    role: Literal["owner", "driver", "manager", "ceo", "customer"]
    customer_id: Optional[int] = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    role: str
    active: bool = True
    customer_id: Optional[int] = None


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
    serials_delivered: Optional[list[str]] = Field(default=None, max_length=20)    # all or none
    serials_collected: Optional[list[str]] = Field(default=None, max_length=20)
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
    serials_delivered: Optional[list[str]] = Field(default=None, max_length=20)    # all or none
    serials_collected: Optional[list[str]] = Field(default=None, max_length=20)
    cash_received: Optional[int] = Field(default=None, ge=0, le=10_000_000)   # money taken at the door, in rupees


class PriceIn(BaseModel):
    unit_price: int = Field(ge=1, le=1_000_000)


class PaymentIn(BaseModel):
    customer_id: int
    amount: int = Field(ge=1, le=10_000_000)
    note: Optional[str] = Field(default=None, max_length=200)


class AdjustmentIn(BaseModel):
    customer_id: int
    amount: int = Field(ge=-10_000_000, le=10_000_000)        # positive: the customer owes more
    note: str = Field(min_length=1, max_length=200)


class PurchaseIn(BaseModel):
    quantity: int = Field(ge=1, le=100_000)
    unit_cost: int = Field(ge=1, le=1_000_000)
    supplier: Optional[str] = Field(default=None, max_length=100)
    day: Optional[date] = None
    note: Optional[str] = Field(default=None, max_length=200)


class StockAdjustIn(BaseModel):
    quantity: int = Field(ge=-100_000, le=100_000)           # positive adds to stock, negative removes
    note: str = Field(min_length=1, max_length=200)
    day: Optional[date] = None


class ThresholdIn(BaseModel):
    threshold: int = Field(ge=0, le=100_000)


class ExpenseIn(BaseModel):
    category: str = Field(max_length=20)
    amount: int = Field(ge=-10_000_000, le=10_000_000)
    day: Optional[date] = None
    note: Optional[str] = Field(default=None, max_length=200)


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
    if user is None or not user.active or data.get("pv") != security.password_version(user.password_hash):
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


class PasswordIn(BaseModel):
    old_password: str
    new_password: str = Field(min_length=8, max_length=100)


class ResetPasswordIn(BaseModel):
    new_password: str = Field(min_length=8, max_length=100)


def _address(request):
    return request.client.host if request.client else "unknown"


@router.post("/auth/login", response_model=TokenOut)
def login(body: LoginIn, request: Request, session: Session = Depends(get_session)):
    limiter, address = request.app.state.limiter, _address(request)
    if limiter.blocked(address, body.username):
        raise HTTPException(429, "too many failed attempts; wait ten minutes and try again")
    user = session.scalar(select(User).where(User.username == body.username))
    ok = security.verify_password(body.password, user.password_hash if user else security.DUMMY_HASH)
    if user is None or not ok or not user.active:
        limiter.fail(address, body.username)
        raise HTTPException(401, "wrong username or password")
    limiter.clear(address, body.username)
    token = security.create_token(user.id, user.role, request.app.state.secret, settings.TOKEN_MINUTES,
                                  pv=security.password_version(user.password_hash))
    return TokenOut(access_token=token, role=user.role)


@router.post("/auth/password")
def change_password(body: PasswordIn, request: Request, session: Session = Depends(get_session),
                    me: User = Depends(current_user)):
    limiter, address = request.app.state.limiter, _address(request)
    if limiter.blocked(address, me.username):
        raise HTTPException(429, "too many failed attempts; wait ten minutes and try again")
    if not security.verify_password(body.old_password, me.password_hash):
        limiter.fail(address, me.username)
        raise HTTPException(401, "the current password is wrong")
    if body.new_password == body.old_password:
        raise HTTPException(422, "choose a password different from the current one")
    me.password_hash = security.hash_password(body.new_password)
    eventlog.append(request.app.state.events, me.username, "password.changed", {"user_id": me.id})
    session.commit()
    token = security.create_token(me.id, me.role, request.app.state.secret, settings.TOKEN_MINUTES,
                                  pv=security.password_version(me.password_hash))
    return TokenOut(access_token=token, role=me.role)          # the old token stops working; this one replaces it


@router.post("/users/{user_id}/password")
def reset_password(user_id: int, body: ResetPasswordIn, request: Request, session: Session = Depends(get_session),
                   me: User = Depends(require("owner"))):
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(404, "user not found")
    user.password_hash = security.hash_password(body.new_password)
    eventlog.append(request.app.state.events, me.username, "password.reset", {"user_id": user.id})
    session.commit()
    return {"ok": True}


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(body: UserIn, request: Request, session: Session = Depends(get_session),
                me: User = Depends(require("owner"))):
    if session.scalar(select(User).where(User.username == body.username)):
        raise HTTPException(409, "username already exists")
    if body.role == "customer":
        if body.customer_id is None or session.get(Customer, body.customer_id) is None:
            raise HTTPException(422, "a customer account needs an existing customer")
        if session.scalar(select(User).where(User.customer_id == body.customer_id)):
            raise HTTPException(409, "that customer already has a login")
    elif body.customer_id is not None:
        raise HTTPException(422, "only customer accounts are linked to a customer")
    user = User(username=body.username, password_hash=security.hash_password(body.password), role=body.role,
                customer_id=body.customer_id)
    session.add(user)
    session.flush()
    eventlog.append(request.app.state.events, me.username, "user.created",
                    {"user_id": user.id, "username": user.username, "role": user.role, "customer_id": user.customer_id})
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


@router.put("/customers/{customer_id}", response_model=CustomerOut)
def update_customer(customer_id: int, body: CustomerIn, request: Request, session: Session = Depends(get_session),
                    me: User = Depends(require("owner"))):
    c = session.get(Customer, customer_id)
    if c is None:
        raise HTTPException(404, "customer not found")
    changed = {k: v for k, v in body.model_dump().items() if getattr(c, k) != v}
    for k, v in changed.items():
        setattr(c, k, v)
    # only the names of the changed fields go into the log, not the personal details themselves
    eventlog.append(request.app.state.events, me.username, "customer.updated",
                    {"customer_id": c.id, "changed": sorted(changed)})
    session.commit()
    return c


@router.get("/customers", response_model=list[CustomerOut])
def list_customers(session: Session = Depends(get_session), me: User = Depends(require("owner", "driver", "manager"))):
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
                    me: User = Depends(require("owner", "driver", "manager"))):
    day = body.delivered_on or date.today()
    if day > date.today():
        raise HTTPException(400, "delivery date is in the future")
    try:
        d = services.record_delivery(session, request.app.state.events, me.username,
                                     body.customer_id, day, body.cylinders, body.empties_collected,
                                     body.serials_delivered, body.serials_collected)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(409, str(e))
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


@router.get("/audit/events")
def audit_events(request: Request, limit: int = Query(50, ge=1, le=500), me: User = Depends(require("owner"))):
    return eventlog.recent(request.app.state.events, limit)


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


def _stop_action(stop_id, action, request, session, me, cylinders=None, reason=None, empties_collected=None,
                 serials_delivered=None, serials_collected=None, cash_received=None):
    try:
        services.complete_stop(session, request.app.state.events, me, stop_id, action, cylinders, reason,
                               empties_collected, serials_delivered, serials_collected, cash_received)
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
                        empties_collected=body.empties_collected, serials_delivered=body.serials_delivered,
                        serials_collected=body.serials_collected, cash_received=body.cash_received)


@router.post("/route-stops/{stop_id}/skip")
def skip_stop(stop_id: int, body: SkipIn, request: Request, session: Session = Depends(get_session),
              me: User = Depends(require("owner", "driver"))):
    return _stop_action(stop_id, "skip", request, session, me, reason=body.reason)


# ---------- money: price, payments, ledger, invoices ----------
@router.get("/settings/price")
def get_price(session: Session = Depends(get_session), me: User = Depends(require("owner", "driver", "manager"))):
    return {"unit_price": accounts.get_price(session)}


@router.put("/settings/price")
def put_price(body: PriceIn, request: Request, session: Session = Depends(get_session),
              me: User = Depends(require("owner"))):
    accounts.set_price(session, request.app.state.events, me.username, body.unit_price)
    session.commit()
    return {"unit_price": body.unit_price}


@router.post("/payments", status_code=201)
def post_payment(body: PaymentIn, request: Request, session: Session = Depends(get_session),
                 me: User = Depends(require("owner", "driver", "manager"))):
    try:
        accounts.record_payment(session, request.app.state.events, me.username, body.customer_id, body.amount, body.note)
    except LookupError as e:
        raise HTTPException(404, str(e))
    session.commit()
    return {"balance": accounts.balances(session).get(body.customer_id, 0)}


@router.post("/ledger/adjust", status_code=201)
def post_adjustment(body: AdjustmentIn, request: Request, session: Session = Depends(get_session),
                    me: User = Depends(require("owner"))):
    try:
        accounts.adjust(session, request.app.state.events, me.username, body.customer_id, body.amount, body.note)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))
    session.commit()
    return accounts.ledger_view(session, body.customer_id)


@router.get("/ledger/{customer_id}")
def get_ledger(customer_id: int, session: Session = Depends(get_session), me: User = Depends(require("owner", "manager"))):
    try:
        return accounts.ledger_view(session, customer_id)
    except LookupError as e:
        raise HTTPException(404, str(e))


@router.get("/receivables")
def get_receivables(session: Session = Depends(get_session), me: User = Depends(require("owner", "manager"))):
    return accounts.receivables(session, date.today())


@router.get("/invoices/{invoice_id}/pdf")
def get_invoice_pdf(invoice_id: int, session: Session = Depends(get_session), me: User = Depends(require("owner", "manager"))):
    try:
        pdf = accounts.invoice_pdf(session, invoice_id)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ImportError:
        raise HTTPException(501, "PDF invoices need the reportlab package (pip install reportlab)")
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{accounts.invoice_number(invoice_id)}.pdf"'})


# ---------- stock and expenses ----------
@router.get("/stock")
def get_stock(session: Session = Depends(get_session), me: User = Depends(require("owner", "manager"))):
    return stock.stock_view(session)


@router.post("/stock/purchase", status_code=201)
def post_purchase(body: PurchaseIn, request: Request, session: Session = Depends(get_session),
                  me: User = Depends(require("owner", "manager"))):
    try:
        stock.record_purchase(session, request.app.state.events, me.username, body.quantity, body.unit_cost,
                              body.supplier, body.day, body.note)
    except ValueError as e:
        raise HTTPException(422, str(e))
    session.commit()
    return stock.stock_view(session)


@router.post("/stock/adjust", status_code=201)
def post_stock_adjust(body: StockAdjustIn, request: Request, session: Session = Depends(get_session),
                      me: User = Depends(require("owner"))):
    try:
        stock.adjust(session, request.app.state.events, me.username, body.quantity, body.note, body.day)
    except ValueError as e:
        raise HTTPException(422, str(e))
    session.commit()
    return stock.stock_view(session)


@router.put("/settings/low-stock")
def put_low_stock(body: ThresholdIn, request: Request, session: Session = Depends(get_session),
                  me: User = Depends(require("owner"))):
    stock.set_threshold(session, request.app.state.events, me.username, body.threshold)
    session.commit()
    return stock.stock_view(session)


@router.get("/expenses")
def get_expenses(start: Optional[date] = None, end: Optional[date] = None, session: Session = Depends(get_session),
                 me: User = Depends(require("owner", "manager"))):
    return expenses.expenses_view(session, start, end)


@router.post("/expenses", status_code=201)
def post_expense(body: ExpenseIn, request: Request, session: Session = Depends(get_session),
                 me: User = Depends(require("owner", "manager"))):
    try:
        expenses.add_expense(session, request.app.state.events, me.username, body.category, body.amount, body.day, body.note)
    except ValueError as e:
        raise HTTPException(422, str(e))
    session.commit()
    return expenses.expenses_view(session)


# ---------- reports, exports and backup ----------
@router.get("/reports/dashboard")
def get_dashboard(session: Session = Depends(get_session), me: User = Depends(require("owner", "ceo"))):
    return reports.dashboard(session, date.today())


@router.get("/reports/receivables.pdf")
def get_receivables_pdf(session: Session = Depends(get_session), me: User = Depends(require("owner"))):
    try:
        pdf = reports.receivables_pdf(session, date.today())
    except ImportError:
        raise HTTPException(501, "PDF reports need the reportlab package (pip install reportlab)")
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="amounts-owed-{date.today().isoformat()}.pdf"'})


@router.get("/export/{kind}.csv")
def get_export(kind: Literal["customers", "deliveries", "invoices", "ledger", "expenses", "stock"],
               start: Optional[date] = None, end: Optional[date] = None,
               session: Session = Depends(get_session), me: User = Depends(require("owner"))):
    text = reports.export_csv(session, kind, start, end)
    return Response(text.encode("utf-8"), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="gasora-{kind}-{date.today().isoformat()}.csv"'})


@router.get("/backup")
def get_backup(request: Request, me: User = Depends(require("owner"))):
    if not str(request.app.state.engine.url).startswith("sqlite"):
        raise HTTPException(501, "backup is implemented for SQLite only")
    data, manifest = backup.make_backup(request.app.state.engine, request.app.state.events)
    eventlog.append(request.app.state.events, me.username, "backup.created",
                    {"events_in_backup": manifest["events"], "chain_ok": manifest["event_chain_ok"]})
    stamp = manifest["created"][:19].replace(":", "").replace("-", "").replace("T", "-")
    return Response(data, media_type="application/zip", headers={
        "Content-Disposition": f'attachment; filename="gasora-backup-{stamp}.zip"',
        "X-Backup-Events": str(manifest["events"]), "X-Backup-Chain-Ok": str(manifest["event_chain_ok"]).lower(),
        "X-Backup-Head": manifest["event_head"][:16]})


# ---------- Could tier: staff, notes, invoice sharing, assistant ----------
class ActiveIn(BaseModel):
    active: bool


class NoteIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    label: Optional[str] = Field(default=None, max_length=30)


class QuestionIn(BaseModel):
    question: str = Field(min_length=1, max_length=assistant.MAX_QUESTION)


@router.patch("/users/{user_id}", response_model=UserOut)
def patch_user(user_id: int, body: ActiveIn, request: Request, session: Session = Depends(get_session),
               me: User = Depends(require("owner"))):
    try:
        user = staff.set_active(session, request.app.state.events, me.username, user_id, body.active)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(422, str(e))
    session.commit()
    return user


@router.get("/staff/activity")
def staff_activity(request: Request, days: int = Query(30, ge=1, le=365), session: Session = Depends(get_session),
                   me: User = Depends(require("owner"))):
    return staff.activity(session, request.app.state.events, days)


@router.get("/notes")
def list_notes(limit: int = Query(100, ge=1, le=500), session: Session = Depends(get_session),
               me: User = Depends(require("owner"))):
    rows = session.scalars(select(DailyNote).order_by(DailyNote.day.desc(), DailyNote.id.desc()).limit(limit)).all()
    return [{"id": n.id, "day": n.day.isoformat(), "label": n.label, "text": n.text, "actor": n.actor} for n in rows]


@router.post("/notes", status_code=201)
def add_note(body: NoteIn, session: Session = Depends(get_session), me: User = Depends(require("owner"))):
    if not body.text.strip():
        raise HTTPException(422, "write something in the note")
    n = DailyNote(day=date.today(), label=(body.label or "").strip() or None, text=body.text.strip(), actor=me.username)
    session.add(n)
    session.commit()
    return {"id": n.id, "day": n.day.isoformat(), "label": n.label, "text": n.text, "actor": n.actor}


@router.delete("/notes/{note_id}", status_code=204)
def delete_note(note_id: int, session: Session = Depends(get_session), me: User = Depends(require("owner"))):
    n = session.get(DailyNote, note_id)
    if n is None:
        raise HTTPException(404, "note not found")
    session.delete(n)
    session.commit()
    return Response(status_code=204)


@router.get("/invoices/{invoice_id}/share")
def share_invoice(invoice_id: int, session: Session = Depends(get_session), me: User = Depends(require("owner"))):
    """A WhatsApp link with the invoice details as text. The owner taps it and sends the message from their own phone."""
    inv = session.get(Invoice, invoice_id)
    if inv is None:
        raise HTTPException(404, "invoice not found")
    customer = session.get(Customer, inv.customer_id)
    return accounts.whatsapp_share(inv, customer, accounts.balances(session).get(inv.customer_id, 0))


@router.get("/assistant")
def assistant_status(me: User = Depends(require("owner"))):
    return {"configured": assistant.configured(), "model": assistant.MODEL}


@router.post("/assistant")
def assistant_ask(body: QuestionIn, request: Request, session: Session = Depends(get_session),
                  me: User = Depends(require("owner"))):
    if not assistant.configured():
        raise HTTPException(501, "the assistant is not set up: set GASORA_GEMINI_KEY and restart the server")
    try:
        answer = assistant.ask(session, date.today(), body.question)
    except ValueError as e:
        raise HTTPException(422, str(e))
    except ConnectionError as e:
        raise HTTPException(502, str(e))
    eventlog.append(request.app.state.events, me.username, "assistant.asked", {"question_chars": len(body.question)})
    return {"answer": answer}


# ---------- settings, customer app, requests ----------
class SettingsIn(BaseModel):
    currency: Optional[str] = None
    depot_lat: Optional[float] = None
    depot_lon: Optional[float] = None
    overdue_days: Optional[int] = None


class CustomerRequestIn(BaseModel):
    urgent: bool = False
    note: Optional[str] = Field(default=None, max_length=200)


class RequestDoneIn(BaseModel):
    make_urgent: bool = False


@router.get("/settings/public")
def public_settings(me: User = Depends(current_user)):
    return {"currency": runtime.currency()}


@router.get("/settings")
def get_settings(session: Session = Depends(get_session), me: User = Depends(require("owner"))):
    lat, lon = runtime.depot()
    return {"currency": runtime.currency(), "depot_lat": lat, "depot_lon": lon, "overdue_days": runtime.overdue_days(),
            "low_stock_threshold": stock.get_threshold(session), "unit_price": accounts.get_price(session)}


@router.put("/settings")
def put_settings(body: SettingsIn, request: Request, session: Session = Depends(get_session),
                 me: User = Depends(require("owner"))):
    values = {k: v for k, v in body.model_dump().items() if v is not None}
    try:
        runtime.save(session, request.app.state.events, me.username, values)
    except ValueError as e:
        raise HTTPException(422, str(e))
    session.commit()
    return get_settings(session, me)


@router.get("/me")
def my_overview(session: Session = Depends(get_session), me: User = Depends(require("customer"))):
    try:
        return portal.overview(session, me)
    except LookupError as e:
        raise HTTPException(404, str(e))


@router.post("/me/requests", status_code=201)
def my_request(body: CustomerRequestIn, request: Request, session: Session = Depends(get_session),
               me: User = Depends(require("customer"))):
    try:
        out = portal.make_request(session, request.app.state.events, me, body.urgent, body.note)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(429, str(e))
    session.commit()
    return out


@router.get("/me/invoices/{invoice_id}/pdf")
def my_invoice_pdf(invoice_id: int, session: Session = Depends(get_session), me: User = Depends(require("customer"))):
    try:
        inv_id = portal.own_invoice(session, me, invoice_id)
        pdf = accounts.invoice_pdf(session, inv_id)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ImportError:
        raise HTTPException(501, "PDF invoices need the reportlab package (pip install reportlab)")
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'inline; filename="{accounts.invoice_number(inv_id)}.pdf"'})


@router.get("/requests")
def list_requests(session: Session = Depends(get_session), me: User = Depends(require("owner"))):
    return portal.open_requests(session)


@router.post("/requests/{request_id}/done")
def request_done(request_id: int, body: RequestDoneIn, request: Request, session: Session = Depends(get_session),
                 me: User = Depends(require("owner"))):
    try:
        portal.close_request(session, request.app.state.events, me.username, request_id, body.make_urgent)
    except LookupError as e:
        raise HTTPException(404, str(e))
    session.commit()
    return portal.open_requests(session)


# ---------- app factory ----------
def _add_missing_columns(engine):
    """create_all does not change existing tables. Add the columns that later versions need (SQLite only)."""
    if engine.dialect.name != "sqlite":
        return
    from sqlalchemy import inspect, text
    cols = {c["name"] for c in inspect(engine).get_columns("users")}
    if "active" not in cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN active BOOLEAN NOT NULL DEFAULT 1"))
    if "customer_id" not in cols:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN customer_id INTEGER REFERENCES customers(id)"))


def create_app(db_url=None, events_path=None, secret=None, routing=None, graph_path=None, cache_path=None, expose_docs=True):
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
    _add_missing_columns(engine)

    app = FastAPI(title="Gasora API", docs_url="/docs" if expose_docs else None, redoc_url=None,
                  openapi_url="/openapi.json" if expose_docs else None)
    app.state.limiter = security.LoginLimiter()
    app.state.engine = engine
    app.state.SessionLocal = sessionmaker(engine, expire_on_commit=False)
    with app.state.SessionLocal() as s0:
        runtime.load(s0)                                      # owner-editable settings (currency, depot, overdue days)
    app.state.events = eventlog.connect(events_path)
    app.state.secret = secret
    graph_path = graph_path or settings.ROAD_GRAPH
    routing = routing or settings.ROUTING
    if routing == "auto":
        routing = "road" if os.path.exists(graph_path) else "straight"
    if routing == "road":
        from planner.road_router import RoadRouter          # needs osmnx; imported only when road routing is on
        app.state.router = RoadRouter(graph_path, cache_path or settings.ROAD_CACHE)
    else:
        app.state.router = StraightRouter()
    log.info("Routing mode: %s", app.state.router.mode)
    app.include_router(router)
    return app
