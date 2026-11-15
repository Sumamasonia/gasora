"""Expenses of the agency (fuel, salaries, repairs and so on). Append-only: a mistake is corrected by adding a
negative entry with a note, never by editing or deleting (see models.py)."""
from datetime import date

from sqlalchemy import select

from backend import eventlog
from backend.models import Expense

CATEGORIES = ["fuel", "salary", "maintenance", "rent", "other"]


def add_expense(session, events, actor, category, amount, day=None, note=None):
    if category not in CATEGORIES:
        raise ValueError(f"category must be one of: {', '.join(CATEGORIES)}")
    if amount == 0:
        raise ValueError("an expense cannot be zero")
    if amount < 0 and not (note and note.strip()):
        raise ValueError("a negative entry (a correction) needs a note that says why")
    e = Expense(day=day or date.today(), category=category, amount=amount, note=(note or "").strip() or None, actor=actor)
    session.add(e)
    session.flush()
    e.event_id, _ = eventlog.append(events, actor, "expense.added", {
        "expense_id": e.id, "category": category, "amount": amount})
    session.flush()
    return e


def expenses_view(session, start=None, end=None):
    q = select(Expense).order_by(Expense.day.desc(), Expense.id.desc())
    if start:
        q = q.where(Expense.day >= start)
    if end:
        q = q.where(Expense.day <= end)
    rows = session.scalars(q).all()
    totals = {c: 0 for c in CATEGORIES}
    for e in rows:
        totals[e.category] += e.amount
    return {"total": sum(totals.values()), "by_category": totals, "categories": CATEGORIES,
            "entries": [{"id": e.id, "day": e.day.isoformat(), "category": e.category, "amount": e.amount,
                         "note": e.note, "actor": e.actor} for e in rows[:500]]}
