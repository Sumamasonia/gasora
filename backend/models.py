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
