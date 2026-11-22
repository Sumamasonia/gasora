"""What a customer may see and do: their own balance, bills, empties, next delivery and requests.

A customer account is tied to one customer record (users.customer_id). Every function here takes that record from the
logged-in account, never from the request, so one customer can never reach another's data. Internal notes and the names of
staff are not shown. Requests are limited so that a customer cannot flood the planner.
"""
from datetime import date, timedelta

from sqlalchemy import func, select

from backend import accounts, eventlog, services
from backend.models import Customer, Delivery, DeliveryRequest, Invoice, LedgerEntry, UrgentRequest

MAX_OPEN_NORMAL = 2
MAX_OPEN_URGENT = 1
MAX_URGENT_PER_WEEK = 2


def _customer(session, user):
    if user.customer_id is None:
        raise LookupError("this account is not linked to a customer")
    c = session.get(Customer, user.customer_id)
    if c is None:
        raise LookupError("customer not found")
    return c


def next_expected(dates, today):
    """(text, date or None) from the customer's own delivery history; says so when there is too little history."""
    if len(dates) < 3:
        return "Not enough history yet", None
    gaps = [(b - a).days for a, b in zip(dates, dates[1:])]
    mean = sum(gaps) / len(gaps)
    due = dates[-1] + timedelta(days=round(mean))
    return f"About every {round(mean)} days; next around {due.isoformat()}", due


def overview(session, user, today=None):
    today = today or date.today()
    c = _customer(session, user)
    dates = sorted(session.scalars(select(Delivery.delivered_on).where(Delivery.customer_id == c.id)).all())
    text, due = next_expected(dates, today)
    balance = int(session.scalar(select(func.coalesce(func.sum(LedgerEntry.amount), 0)).where(LedgerEntry.customer_id == c.id)))
    empties = services.empties_state(session, today).get(c.id)
    rows = session.scalars(select(LedgerEntry).where(LedgerEntry.customer_id == c.id)
                           .order_by(LedgerEntry.created_on.desc(), LedgerEntry.id.desc()).limit(30)).all()
    kind_label = {"invoice": "Bill", "payment": "Payment", "adjustment": "Adjustment"}
    return {
        "name": c.name,
        "balance": balance,
        "last_delivery": dates[-1].isoformat() if dates else None,
        "next_expected": text,
        "next_expected_date": due.isoformat() if due else None,
        "empties_held": empties["held"] if empties else 0,
        "empties_days": empties["days_holding"] if empties else None,
        "price": accounts.get_price(session),
        "entries": [{"date": e.created_on.isoformat(), "kind": kind_label.get(e.kind, e.kind), "amount": e.amount,
                     "invoice_id": e.invoice_id,
                     "invoice_number": accounts.invoice_number(e.invoice_id) if e.invoice_id else None} for e in rows],
        "open_requests": ([{"kind": "Urgent", "note": u.note, "date": u.created_on.isoformat()}
                           for u in session.scalars(select(UrgentRequest).where(UrgentRequest.customer_id == c.id, UrgentRequest.status == "open"))] +
                          [{"kind": "Normal", "note": r.note, "date": r.created_on.isoformat()}
                           for r in session.scalars(select(DeliveryRequest).where(DeliveryRequest.customer_id == c.id, DeliveryRequest.status == "open"))]),
    }


def make_request(session, events, user, urgent, note, today=None):
    today = today or date.today()
    c = _customer(session, user)
    note = (note or "").strip()[:200] or None
    if urgent:
        open_urgent = session.scalar(select(func.count(UrgentRequest.id)).where(UrgentRequest.customer_id == c.id, UrgentRequest.status == "open"))
        week = session.scalar(select(func.count(UrgentRequest.id)).where(UrgentRequest.customer_id == c.id,
                                                                         UrgentRequest.created_on >= today - timedelta(days=6)))
        if open_urgent >= MAX_OPEN_URGENT:
            raise ValueError("you already have an urgent request waiting; the agency has been told")
        if week >= MAX_URGENT_PER_WEEK:
            raise ValueError("you have reached the limit of urgent requests this week; please phone the agency")
        u = services.create_urgent(session, events, user.username, c.id, note)
        return {"kind": "urgent", "id": u.id}
    open_normal = session.scalar(select(func.count(DeliveryRequest.id)).where(DeliveryRequest.customer_id == c.id, DeliveryRequest.status == "open"))
    if open_normal >= MAX_OPEN_NORMAL:
        raise ValueError("you already have requests waiting; the agency will contact you")
    r = DeliveryRequest(customer_id=c.id, note=note, created_by=user.username, created_on=today)
    session.add(r)
    session.flush()
    eventlog.append(events, user.username, "request.created", {"request_id": r.id, "customer_id": c.id})
    return {"kind": "normal", "id": r.id}


def own_invoice(session, user, invoice_id):
    """The invoice id if it belongs to this customer, else LookupError (the same error for 'missing' and 'not yours')."""
    c = _customer(session, user)
    inv = session.get(Invoice, invoice_id)
    if inv is None or inv.customer_id != c.id:
        raise LookupError("invoice not found")
    return inv.id


# ---------- the owner's side ----------
def open_requests(session):
    rows = session.execute(select(DeliveryRequest, Customer).join(Customer, Customer.id == DeliveryRequest.customer_id)
                           .where(DeliveryRequest.status == "open").order_by(DeliveryRequest.id)).all()
    bal = accounts.balances(session)
    return [{"request_id": r.id, "customer_id": c.id, "name": c.name, "phone": c.phone, "note": r.note,
             "created_on": r.created_on.isoformat(), "by": r.created_by, "balance": bal.get(c.id, 0)} for r, c in rows]


def close_request(session, events, actor, request_id, make_urgent=False):
    r = session.get(DeliveryRequest, request_id)
    if r is None or r.status != "open":
        raise LookupError("request not found")
    r.status = "done"
    if make_urgent:
        services.create_urgent(session, events, actor, r.customer_id, r.note)
    eventlog.append(events, actor, "request.closed", {"request_id": r.id, "made_urgent": make_urgent})
    return r
