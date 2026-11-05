from datetime import date, datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, inspect, text
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
    customer_type: Mapped[str] = mapped_column(String(20), default="domestic")
    cylinder_type: Mapped[str] = mapped_column(String(30), default="11.8 kg")
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))


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

def upgrade_schema(engine):
    """Idempotently add any missing columns to existing tables."""
    insp = inspect(engine)
    if not insp.has_table("customers"):
        return
    existing_cols = {col["name"] for col in insp.get_columns("customers")}
    with engine.begin() as conn:
        if "customer_type" not in existing_cols:
            conn.execute(text("ALTER TABLE customers ADD COLUMN customer_type VARCHAR(20) DEFAULT 'domestic'"))
        if "cylinder_type" not in existing_cols:
            conn.execute(text("ALTER TABLE customers ADD COLUMN cylinder_type VARCHAR(30) DEFAULT '11.8 kg'"))
        if "is_active" not in existing_cols:
            conn.execute(text("ALTER TABLE customers ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1"))
        if "created_at" not in existing_cols:
            conn.execute(text("ALTER TABLE customers ADD COLUMN created_at DATETIME"))
            now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")
            conn.execute(text("UPDATE customers SET created_at = :now WHERE created_at IS NULL"), {"now": now_str})
