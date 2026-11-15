"""Money: the price of a cylinder, invoices, payments and the append-only customer ledger.

A customer's balance is the sum of their ledger entries: positive means the customer owes money.
  invoice     +total      written automatically for every delivery once a price is set
  payment     -amount     cash or other money received
  adjustment  +/-amount   a correction with a required note (entries are never edited or deleted)
Every entry is also written to the hash-chained event log, which holds ids and amounts, not personal details.
Amounts are whole rupees. Ageing uses first in, first out: payments settle the oldest debts first.
"""
import io
from datetime import date

from sqlalchemy import func, select

from backend import eventlog
from backend.models import Customer, Invoice, LedgerEntry, Setting

PRICE_KEY = "cylinder_price"
AGEING_BUCKETS = [(30, "0-30"), (60, "31-60"), (90, "61-90"), (None, "90+")]


def invoice_number(invoice_id):
    return f"INV-{invoice_id:06d}"


# ---------- price ----------
def get_price(session):
    row = session.get(Setting, PRICE_KEY)
    return int(row.value) if row else None


def set_price(session, events, actor, price):
    if price < 1:
        raise ValueError("the price must be at least 1 rupee")
    row = session.get(Setting, PRICE_KEY)
    old = int(row.value) if row else None
    if row is None:
        session.add(Setting(key=PRICE_KEY, value=str(price)))
    else:
        row.value = str(price)
    eventlog.append(events, actor, "price.set", {"old": old, "new": price})
    return price


# ---------- writing entries ----------
def _add_entry(session, events, actor, customer_id, kind, amount, event_type, day=None, note=None,
               invoice_id=None, delivery_id=None):
    entry = LedgerEntry(customer_id=customer_id, kind=kind, amount=amount, invoice_id=invoice_id,
                        delivery_id=delivery_id, note=note, actor=actor, created_on=day or date.today())
    session.add(entry)
    session.flush()
    entry.event_id, _ = eventlog.append(events, actor, event_type, {
        "entry_id": entry.id, "customer_id": customer_id, "amount": amount,
        "invoice_id": invoice_id, "delivery_id": delivery_id})
    session.flush()
    return entry


def bill_delivery(session, events, actor, delivery):
    """Write the invoice and its ledger entry for a delivery. Does nothing while no price is set."""
    price = get_price(session)
    if price is None:
        return None
    inv = Invoice(customer_id=delivery.customer_id, delivery_id=delivery.id, issued_on=delivery.delivered_on,
                  cylinders=delivery.cylinders, unit_price=price, total=price * delivery.cylinders, actor=actor)
    session.add(inv)
    session.flush()
    _add_entry(session, events, actor, delivery.customer_id, "invoice", inv.total, "invoice.created",
               day=delivery.delivered_on, invoice_id=inv.id, delivery_id=delivery.id)
    return inv


def record_payment(session, events, actor, customer_id, amount, note=None, day=None):
    if session.get(Customer, customer_id) is None:
        raise LookupError("customer not found")
    if amount < 1:
        raise ValueError("a payment must be at least 1 rupee")
    return _add_entry(session, events, actor, customer_id, "payment", -amount, "payment.recorded", day=day, note=note)


def adjust(session, events, actor, customer_id, amount, note):
    if session.get(Customer, customer_id) is None:
        raise LookupError("customer not found")
    if amount == 0:
        raise ValueError("an adjustment cannot be zero")
    if not note or not note.strip():
        raise ValueError("an adjustment needs a note that says why")
    return _add_entry(session, events, actor, customer_id, "adjustment", amount, "ledger.adjusted", note=note.strip())


# ---------- reading ----------
def balances(session):
    """customer id -> balance (only customers that have entries)."""
    rows = session.execute(select(LedgerEntry.customer_id, func.sum(LedgerEntry.amount))
                           .group_by(LedgerEntry.customer_id)).all()
    return {cid: int(total) for cid, total in rows}


def ledger_view(session, customer_id):
    customer = session.get(Customer, customer_id)
    if customer is None:
        raise LookupError("customer not found")
    rows = session.scalars(select(LedgerEntry).where(LedgerEntry.customer_id == customer_id)
                           .order_by(LedgerEntry.created_on, LedgerEntry.id)).all()
    running, entries = 0, []
    for e in rows:
        running += e.amount
        entries.append({"entry_id": e.id, "date": e.created_on.isoformat(), "kind": e.kind, "amount": e.amount,
                        "balance": running, "note": e.note, "actor": e.actor,
                        "invoice_id": e.invoice_id,
                        "invoice_number": invoice_number(e.invoice_id) if e.invoice_id else None})
    return {"customer_id": customer.id, "name": customer.name, "balance": running, "entries": entries}


def oldest_unpaid(rows):
    """Date of the oldest debt that payments have not yet settled (first in, first out), or None."""
    credit = -sum(e.amount for e in rows if e.amount < 0)
    for e in rows:                                           # rows are in date order
        if e.amount > 0:
            if credit >= e.amount:
                credit -= e.amount
            else:
                return e.created_on
    return None


def receivables(session, today):
    """Customers who owe money, oldest debt first, with an ageing summary."""
    owed = {cid: b for cid, b in balances(session).items() if b > 0}
    names = {c.id: c.name for c in session.scalars(select(Customer))}
    out = []
    for cid, bal in owed.items():
        rows = session.scalars(select(LedgerEntry).where(LedgerEntry.customer_id == cid)
                               .order_by(LedgerEntry.created_on, LedgerEntry.id)).all()
        since = oldest_unpaid(rows)
        paid = [e.created_on for e in rows if e.kind == "payment"]
        out.append({"customer_id": cid, "name": names.get(cid, "?"), "balance": bal,
                    "oldest_unpaid_since": since.isoformat() if since else None,
                    "days": (today - since).days if since else 0,
                    "last_payment": max(paid).isoformat() if paid else None})
    out.sort(key=lambda r: (-r["days"], -r["balance"], r["customer_id"]))
    buckets = [{"label": label, "customers": 0, "amount": 0} for _, label in AGEING_BUCKETS]
    for r in out:
        for i, (limit, _) in enumerate(AGEING_BUCKETS):
            if limit is None or r["days"] <= limit:
                buckets[i]["customers"] += 1
                buckets[i]["amount"] += r["balance"]
                break
    return {"total_owed": sum(r["balance"] for r in out), "customers_owing": len(out),
            "buckets": buckets, "customers": out}


# ---------- invoice as PDF ----------
def invoice_pdf(session, invoice_id):
    """The invoice as PDF bytes. Needs the reportlab package."""
    from reportlab.lib.pagesizes import A5
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    inv = session.get(Invoice, invoice_id)
    if inv is None:
        raise LookupError("invoice not found")
    customer = session.get(Customer, inv.customer_id)
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A5)
    w, h = A5
    y = h - 18 * mm
    c.setFont("Helvetica-Bold", 16)
    c.drawString(15 * mm, y, "Gasora LPG Agency")
    c.setFont("Helvetica", 10)
    c.drawRightString(w - 15 * mm, y, f"Invoice {invoice_number(inv.id)}")
    y -= 7 * mm
    c.drawRightString(w - 15 * mm, y, f"Date: {inv.issued_on.isoformat()}")
    y -= 12 * mm
    c.setFont("Helvetica-Bold", 10)
    c.drawString(15 * mm, y, "Bill to")
    c.setFont("Helvetica", 10)
    for line in (customer.name, customer.address or "", customer.phone or ""):
        if line:
            y -= 5.5 * mm
            c.drawString(15 * mm, y, line)
    y -= 12 * mm
    c.setFont("Helvetica-Bold", 10)
    c.drawString(15 * mm, y, "Item")
    c.drawRightString(w - 70 * mm, y, "Qty")
    c.drawRightString(w - 42 * mm, y, "Price")
    c.drawRightString(w - 15 * mm, y, "Amount")
    c.line(15 * mm, y - 2 * mm, w - 15 * mm, y - 2 * mm)
    y -= 8 * mm
    c.setFont("Helvetica", 10)
    c.drawString(15 * mm, y, "LPG cylinder refill")
    c.drawRightString(w - 70 * mm, y, str(inv.cylinders))
    c.drawRightString(w - 42 * mm, y, f"{inv.unit_price:,}")
    c.drawRightString(w - 15 * mm, y, f"{inv.total:,}")
    y -= 10 * mm
    c.line(15 * mm, y + 4 * mm, w - 15 * mm, y + 4 * mm)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(15 * mm, y - 2 * mm, "Total (Rs)")
    c.drawRightString(w - 15 * mm, y - 2 * mm, f"{inv.total:,}")
    bal = balances(session).get(inv.customer_id, 0)
    y -= 12 * mm
    c.setFont("Helvetica", 9)
    c.drawString(15 * mm, y, f"Account balance after all entries recorded so far: Rs {bal:,}"
                 + (" (customer owes)" if bal > 0 else ""))
    c.setFont("Helvetica-Oblique", 8)
    c.drawString(15 * mm, 12 * mm, "Generated by Gasora. Empty cylinders are tracked separately in the empties ledger.")
    c.showPage()
    c.save()
    return buf.getvalue()
