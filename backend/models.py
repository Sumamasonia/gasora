from datetime import date, datetime, timezone

from sqlalchemy import DDL, Date, DateTime, ForeignKey, String, event
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


class EmptiesLedger(Base):
    """Count of cylinders given to a customer and empties collected back. held = delivered - collected."""
    __tablename__ = "empties_ledger"
    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    delivery_id: Mapped[int | None] = mapped_column(default=None)
    delivered: Mapped[int] = mapped_column(default=0)
    collected: Mapped[int] = mapped_column(default=0)
    kind: Mapped[str] = mapped_column(String(12), default="delivery")          # delivery or adjustment
    note: Mapped[str | None] = mapped_column(String(200), default=None)
    actor: Mapped[str] = mapped_column(String(50))
    created_on: Mapped[date]
    event_id: Mapped[int | None] = mapped_column(default=None)


class Cylinder(Base):
    __tablename__ = "cylinders"
    id: Mapped[int] = mapped_column(primary_key=True)
    serial_no: Mapped[str] = mapped_column(String(30), unique=True)
    cylinder_type: Mapped[str] = mapped_column(String(30), default="11.8 kg")
    state: Mapped[str] = mapped_column(String(12), default="Empty")
    owner: Mapped[str] = mapped_column(String(10), default="Company")
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id"), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))


class CylinderTransaction(Base):
    __tablename__ = "cylinder_transactions"
    id: Mapped[int] = mapped_column(primary_key=True)
    cylinder_id: Mapped[int] = mapped_column(ForeignKey("cylinders.id"))
    txn_type: Mapped[str] = mapped_column(String(20))
    from_state: Mapped[str | None] = mapped_column(String(12), default=None)
    to_state: Mapped[str] = mapped_column(String(12))
    customer_id: Mapped[int | None] = mapped_column(ForeignKey("customers.id"), default=None)
    delivery_id: Mapped[int | None] = mapped_column(default=None)
    actor: Mapped[str] = mapped_column(String(50))
    note: Mapped[str | None] = mapped_column(String(200), default=None)
    due_date: Mapped[date | None] = mapped_column(Date, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    event_id: Mapped[int | None] = mapped_column(default=None)


# ---------- money: price, invoices, ledger (protocol-independent business layer) ----------
class Setting(Base):
    """Small key and value settings that the owner can change (for example the price of one cylinder)."""
    __tablename__ = "settings"
    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    value: Mapped[str] = mapped_column(String(200))


class Invoice(Base):
    """One bill per delivery. Never changed after it is written (a database trigger refuses updates and deletes).
    The invoice number is derived from the id: INV-000001."""
    __tablename__ = "invoices"
    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    delivery_id: Mapped[int | None] = mapped_column(default=None)
    issued_on: Mapped[date]
    cylinders: Mapped[int]
    unit_price: Mapped[int]
    total: Mapped[int]
    actor: Mapped[str] = mapped_column(String(50))


class LedgerEntry(Base):
    """Append-only customer ledger. amount > 0: the customer owes more (invoice, or an adjustment up);
    amount < 0: the customer owes less (payment, or an adjustment down). Mistakes are corrected with an
    adjustment entry that carries a note, never by editing or deleting. A trigger enforces this."""
    __tablename__ = "ledger_entries"
    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    kind: Mapped[str] = mapped_column(String(12))                 # invoice, payment or adjustment
    amount: Mapped[int]
    invoice_id: Mapped[int | None] = mapped_column(default=None)
    delivery_id: Mapped[int | None] = mapped_column(default=None)
    note: Mapped[str | None] = mapped_column(String(200), default=None)
    actor: Mapped[str] = mapped_column(String(50))
    created_on: Mapped[date]
    event_id: Mapped[int | None] = mapped_column(default=None)    # set once, right after the event is logged


_LEDGER_COLUMNS = ("customer_id", "kind", "amount", "invoice_id", "delivery_id", "note", "actor", "created_on")
_SQLITE_TRIGGERS = {
    LedgerEntry.__table__: [
        "CREATE TRIGGER IF NOT EXISTS ledger_no_delete BEFORE DELETE ON ledger_entries "
        "BEGIN SELECT RAISE(ABORT, 'the ledger is append-only'); END;",
        # the only allowed update: filling in event_id once, with every other column unchanged
        "CREATE TRIGGER IF NOT EXISTS ledger_no_update BEFORE UPDATE ON ledger_entries WHEN OLD.event_id IS NOT NULL OR "
        + " OR ".join(f"NEW.{c} IS NOT OLD.{c}" for c in _LEDGER_COLUMNS)
        + " BEGIN SELECT RAISE(ABORT, 'the ledger is append-only'); END;",
    ],
    Invoice.__table__: [
        "CREATE TRIGGER IF NOT EXISTS invoice_no_delete BEFORE DELETE ON invoices "
        "BEGIN SELECT RAISE(ABORT, 'invoices cannot be changed'); END;",
        "CREATE TRIGGER IF NOT EXISTS invoice_no_update BEFORE UPDATE ON invoices "
        "BEGIN SELECT RAISE(ABORT, 'invoices cannot be changed'); END;",
    ],
}
for _table, _statements in _SQLITE_TRIGGERS.items():
    for _sql in _statements:
        event.listen(_table, "after_create", DDL(_sql).execute_if(dialect="sqlite"))


# ---------- expenses and stock (also append-only) ----------
class Expense(Base):
    """Money the agency spent. Never edited or deleted; a mistake is corrected with a negative entry and a note."""
    __tablename__ = "expenses"
    id: Mapped[int] = mapped_column(primary_key=True)
    day: Mapped[date]
    category: Mapped[str] = mapped_column(String(20))
    amount: Mapped[int]
    note: Mapped[str | None] = mapped_column(String(200), default=None)
    actor: Mapped[str] = mapped_column(String(50))
    event_id: Mapped[int | None] = mapped_column(default=None)


class StockMovement(Base):
    """Filled cylinders in stock. purchase +, sale - (written automatically for each delivery), adjustment +/-
    (loss, damage, count correction, opening stock). Never edited or deleted."""
    __tablename__ = "stock_movements"
    id: Mapped[int] = mapped_column(primary_key=True)
    day: Mapped[date]
    kind: Mapped[str] = mapped_column(String(12))
    quantity: Mapped[int]
    unit_cost: Mapped[int | None] = mapped_column(default=None)
    supplier: Mapped[str | None] = mapped_column(String(100), default=None)
    note: Mapped[str | None] = mapped_column(String(200), default=None)
    delivery_id: Mapped[int | None] = mapped_column(default=None)
    actor: Mapped[str] = mapped_column(String(50))
    event_id: Mapped[int | None] = mapped_column(default=None)


def _append_only(table, name, columns):
    """Triggers (SQLite): no delete, and no update except filling in event_id once."""
    sql_delete = (f"CREATE TRIGGER IF NOT EXISTS {name}_no_delete BEFORE DELETE ON {table.name} "
                  f"BEGIN SELECT RAISE(ABORT, '{table.name} is append-only'); END;")
    changed = " OR ".join(f"NEW.{c} IS NOT OLD.{c}" for c in columns)
    sql_update = (f"CREATE TRIGGER IF NOT EXISTS {name}_no_update BEFORE UPDATE ON {table.name} "
                  f"WHEN OLD.event_id IS NOT NULL OR {changed} "
                  f"BEGIN SELECT RAISE(ABORT, '{table.name} is append-only'); END;")
    for sql in (sql_delete, sql_update):
        event.listen(table, "after_create", DDL(sql).execute_if(dialect="sqlite"))


_append_only(Expense.__table__, "expense", ("day", "category", "amount", "note", "actor"))
_append_only(StockMovement.__table__, "stock", ("day", "kind", "quantity", "unit_cost", "supplier", "note", "delivery_id", "actor"))
