"""Cylinder register: state machine, lifecycle transitions, and auditing.

State transitions (single source of truth):
  Empty -> Filled        (refill at the plant; no customer)
  Filled -> Delivered    (needs customer_id; customer must exist and be active; sets cylinder.customer_id)
  Delivered -> Recovered (empty collected back from the customer; clears cylinder.customer_id)
  Recovered -> Empty     (returned to plant/stock as empty; no customer)

Any other transition is invalid. A cylinder with owner "Customer" follows the same flow.
"""
from datetime import date, timedelta

from sqlalchemy import func, select

from backend import eventlog
from backend.models import Customer, Cylinder, CylinderTransaction

RETURN_DUE_DAYS = 15

ALLOWED_TRANSITIONS: dict[str, list[str]] = {
    "Empty": ["Filled"],
    "Filled": ["Delivered"],
    "Delivered": ["Recovered"],
    "Recovered": ["Empty"],
}


def register_cylinder(session, events, actor, serial_no, cylinder_type="11.8 kg", owner="Company"):
    """Register a new cylinder in state Empty. Writes a transaction and event log entry. Caller commits."""
    existing = session.scalar(select(Cylinder).where(Cylinder.serial_no == serial_no))
    if existing is not None:
        raise ValueError(f"Cylinder with serial_no '{serial_no}' already exists")

    cyl = Cylinder(
        serial_no=serial_no,
        cylinder_type=cylinder_type or "11.8 kg",
        state="Empty",
        owner=owner or "Company",
        customer_id=None,
    )
    session.add(cyl)
    session.flush()

    txn = CylinderTransaction(
        cylinder_id=cyl.id,
        txn_type="register",
        from_state=None,
        to_state="Empty",
        customer_id=None,
        delivery_id=None,
        actor=actor,
        note=None,
    )
    session.add(txn)
    session.flush()

    event_id, _ = eventlog.append(
        events, actor, "cylinder.registered",
        {"cylinder_id": cyl.id, "serial_no": cyl.serial_no}
    )
    txn.event_id = event_id
    session.flush()
    return cyl


def transition_cylinder(session, events, actor, cylinder_id, to_state,
                        customer_id=None, delivery_id=None, note=None, due_date=None):
    """Transition a cylinder to a new state according to the state machine. Caller commits."""
    cyl = session.get(Cylinder, cylinder_id)
    if cyl is None:
        raise LookupError(f"Cylinder {cylinder_id} not found")

    from_state = cyl.state
    allowed = ALLOWED_TRANSITIONS.get(from_state, [])
    if to_state not in allowed:
        raise ValueError(f"Invalid transition from {from_state} to {to_state}")

    txn_cust_id = None
    txn_due_date = due_date
    if to_state == "Delivered":
        if customer_id is None:
            raise ValueError("customer_id is required for Delivered transition")
        cust = session.get(Customer, customer_id)
        if cust is None:
            raise LookupError("customer not found")
        if getattr(cust, "is_active", True) is False:
            raise ValueError("customer is inactive")
        cyl.customer_id = customer_id
        txn_cust_id = customer_id
        if txn_due_date is None:
            txn_due_date = date.today() + timedelta(days=RETURN_DUE_DAYS)
    elif to_state == "Recovered":
        txn_cust_id = customer_id or cyl.customer_id
        cyl.customer_id = None
    elif to_state in ("Filled", "Empty"):
        cyl.customer_id = None
        txn_cust_id = None

    cyl.state = to_state

    txn = CylinderTransaction(
        cylinder_id=cyl.id,
        txn_type="transition",
        from_state=from_state,
        to_state=to_state,
        customer_id=txn_cust_id,
        delivery_id=delivery_id,
        actor=actor,
        note=note,
        due_date=txn_due_date,
    )
    session.add(txn)
    session.flush()

    event_id, _ = eventlog.append(
        events, actor, "cylinder.transition",
        {
            "cylinder_id": cyl.id,
            "from_state": from_state,
            "to_state": to_state,
            "customer_id": txn_cust_id,
        }
    )
    txn.event_id = event_id
    session.flush()
    return cyl


def cylinder_history(session, cylinder_id):
    """Return transactions for a cylinder, oldest first."""
    cyl = session.get(Cylinder, cylinder_id)
    if cyl is None:
        raise LookupError(f"Cylinder {cylinder_id} not found")
    return session.scalars(
        select(CylinderTransaction)
        .where(CylinderTransaction.cylinder_id == cylinder_id)
        .order_by(CylinderTransaction.id.asc())
    ).all()


def cylinder_summary(session):
    """Return cylinder count summary by state, by owner, and customers currently holding Delivered cylinders."""
    by_state = {"Empty": 0, "Filled": 0, "Delivered": 0, "Recovered": 0}
    for state, count in session.execute(
        select(Cylinder.state, func.count(Cylinder.id)).group_by(Cylinder.state)
    ):
        by_state[state] = count

    by_owner = {"Company": 0, "Customer": 0}
    for owner, count in session.execute(
        select(Cylinder.owner, func.count(Cylinder.id)).group_by(Cylinder.owner)
    ):
        by_owner[owner] = count

    rows = session.execute(
        select(Customer.id, Customer.name, func.count(Cylinder.id))
        .join(Customer, Customer.id == Cylinder.customer_id)
        .where(Cylinder.state == "Delivered")
        .group_by(Customer.id, Customer.name)
        .order_by(Customer.id)
    ).all()
    held_by_customers = [
        {"customer_id": cid, "name": name, "cylinders": count}
        for cid, name, count in rows
    ]

    return {
        "by_state": by_state,
        "by_owner": by_owner,
        "held_by_customers": held_by_customers,
    }

