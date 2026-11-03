from datetime import date

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True)
    password_hash: Mapped[str] = mapped_column(String(300))
    role: Mapped[str] = mapped_column(String(20))            # "owner" or "driver"


class Customer(Base):
    __tablename__ = "customers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    phone: Mapped[str | None] = mapped_column(String(30), default=None)
    address: Mapped[str | None] = mapped_column(String(200), default=None)
    lat: Mapped[float]
    lon: Mapped[float]
    demand: Mapped[int] = mapped_column(default=1)           # cylinders per usual refill


class Delivery(Base):
    __tablename__ = "deliveries"
    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    delivered_on: Mapped[date]
    cylinders: Mapped[int] = mapped_column(default=1)
    driver: Mapped[str] = mapped_column(String(50))
    event_id: Mapped[int | None] = mapped_column(default=None)   # id in the event log


class UrgentRequest(Base):
    __tablename__ = "urgent_requests"
    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    note: Mapped[str | None] = mapped_column(String(200), default=None)
    status: Mapped[str] = mapped_column(String(10), default="open")      # open or done
    created_by: Mapped[str] = mapped_column(String(50))
    created_on: Mapped[date]


class Route(Base):
    """A published route for one day and one vehicle."""
    __tablename__ = "routes"
    id: Mapped[int] = mapped_column(primary_key=True)
    day: Mapped[date]
    vehicle: Mapped[int]
    minutes: Mapped[int]
    driver_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), default=None)


class RouteStop(Base):
    __tablename__ = "route_stops"
    id: Mapped[int] = mapped_column(primary_key=True)
    route_id: Mapped[int] = mapped_column(ForeignKey("routes.id"))
    seq: Mapped[int]
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    risk: Mapped[float]
    band: Mapped[str] = mapped_column(String(10))
    urgent: Mapped[bool] = mapped_column(default=False)
    status: Mapped[str] = mapped_column(String(10), default="pending")   # pending, delivered, skipped
    reason: Mapped[str | None] = mapped_column(String(200), default=None)
    delivery_id: Mapped[int | None] = mapped_column(default=None)
