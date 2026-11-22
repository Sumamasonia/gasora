"""Reports: the owner's dashboard, the ageing report as PDF and CSV exports.

Everything here only reads. Amounts are whole rupees. "Cash" figures are recorded money in and out (payments received,
expenses, purchases of stock). They are not an accounting profit.
"""
import csv
import io
from datetime import timedelta

from sqlalchemy import func, select

from backend import accounts, runtime, stock
from backend.models import Customer, Delivery, Expense, Invoice, LedgerEntry, StockMovement, UrgentRequest

EXPORTS = ["customers", "deliveries", "invoices", "ledger", "expenses", "stock"]


# ---------- dashboard ----------
def _deliveries_between(session, start, end):
    n, cyl = session.execute(select(func.count(Delivery.id), func.coalesce(func.sum(Delivery.cylinders), 0))
                             .where(Delivery.delivered_on >= start, Delivery.delivered_on <= end)).one()
    return {"deliveries": int(n), "cylinders": int(cyl)}


def dashboard(session, today):
    start30, start7 = today - timedelta(days=29), today - timedelta(days=6)
    by_day = {d: (n, c) for d, n, c in session.execute(
        select(Delivery.delivered_on, func.count(Delivery.id), func.sum(Delivery.cylinders))
        .where(Delivery.delivered_on >= today - timedelta(days=13), Delivery.delivered_on <= today)
        .group_by(Delivery.delivered_on)).all()}
    series = []
    for i in range(13, -1, -1):
        d = today - timedelta(days=i)
        n, c = by_day.get(d, (0, 0))
        series.append({"day": d.isoformat(), "deliveries": int(n), "cylinders": int(c or 0)})

    def ledger_sum(kind):
        return int(session.scalar(select(func.coalesce(func.sum(LedgerEntry.amount), 0))
                                  .where(LedgerEntry.kind == kind, LedgerEntry.created_on >= start30,
                                         LedgerEntry.created_on <= today)))
    billed, collected = ledger_sum("invoice"), -ledger_sum("payment")
    spent = int(session.scalar(select(func.coalesce(func.sum(Expense.amount), 0))
                               .where(Expense.day >= start30, Expense.day <= today)))
    bought = int(session.scalar(select(func.coalesce(func.sum(StockMovement.quantity * StockMovement.unit_cost), 0))
                                .where(StockMovement.kind == "purchase", StockMovement.day >= start30,
                                       StockMovement.day <= today)))
    rec = accounts.receivables(session, today)
    st = stock.stock_view(session, limit=0)
    return {
        "date": today.isoformat(),
        "customers": int(session.scalar(select(func.count(Customer.id)))),
        "open_urgent": int(session.scalar(select(func.count(UrgentRequest.id)).where(UrgentRequest.status == "open"))),
        "today": _deliveries_between(session, today, today),
        "last_7_days": _deliveries_between(session, start7, today),
        "last_30_days": _deliveries_between(session, start30, today),
        "series": series,
        "money_30_days": {"billed": billed, "collected": collected, "expenses": spent, "stock_purchases": bought,
                          "recorded_cash_net": collected - spent - bought},
        "price_set": accounts.get_price(session) is not None,
        "receivables": {"total_owed": rec["total_owed"], "customers_owing": rec["customers_owing"],
                        "oldest_days": max((r["days"] for r in rec["customers"]), default=0),
                        "buckets": rec["buckets"], "top": rec["customers"][:5]},
        "stock": {"tracking": st["tracking"], "on_hand": st["on_hand"], "low": st["low"], "negative": st["negative"]},
    }


# ---------- CSV ----------
def _safe(value):
    """Stop a spreadsheet from running a text cell as a formula (cells starting with = + - @)."""
    if isinstance(value, str) and value[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + value
    return value


def _rows(session, kind, start, end):
    names = {c.id: c.name for c in session.scalars(select(Customer))}

    def window(q, col):
        if start:
            q = q.where(col >= start)
        if end:
            q = q.where(col <= end)
        return q

    if kind == "customers":
        yield ["id", "name", "phone", "address", "lat", "lon", "cylinders_per_refill"]
        for c in session.scalars(select(Customer).order_by(Customer.id)):
            yield [c.id, c.name, c.phone, c.address, c.lat, c.lon, c.demand]
    elif kind == "deliveries":
        yield ["id", "date", "customer_id", "customer", "cylinders", "driver"]
        for d in session.scalars(window(select(Delivery), Delivery.delivered_on).order_by(Delivery.delivered_on, Delivery.id)):
            yield [d.id, d.delivered_on.isoformat(), d.customer_id, names.get(d.customer_id), d.cylinders, d.driver]
    elif kind == "invoices":
        yield ["invoice", "date", "customer_id", "customer", "cylinders", "unit_price", "total", "delivery_id"]
        for i in session.scalars(window(select(Invoice), Invoice.issued_on).order_by(Invoice.issued_on, Invoice.id)):
            yield [accounts.invoice_number(i.id), i.issued_on.isoformat(), i.customer_id, names.get(i.customer_id),
                   i.cylinders, i.unit_price, i.total, i.delivery_id]
    elif kind == "ledger":
        yield ["entry", "date", "customer_id", "customer", "kind", "amount", "invoice", "note", "actor"]
        for e in session.scalars(window(select(LedgerEntry), LedgerEntry.created_on).order_by(LedgerEntry.created_on, LedgerEntry.id)):
            yield [e.id, e.created_on.isoformat(), e.customer_id, names.get(e.customer_id), e.kind, e.amount,
                   accounts.invoice_number(e.invoice_id) if e.invoice_id else None, e.note, e.actor]
    elif kind == "expenses":
        yield ["id", "date", "category", "amount", "note", "actor"]
        for e in session.scalars(window(select(Expense), Expense.day).order_by(Expense.day, Expense.id)):
            yield [e.id, e.day.isoformat(), e.category, e.amount, e.note, e.actor]
    elif kind == "stock":
        yield ["id", "date", "kind", "quantity", "unit_cost", "supplier", "note", "delivery_id", "actor"]
        for m in session.scalars(window(select(StockMovement), StockMovement.day).order_by(StockMovement.day, StockMovement.id)):
            yield [m.id, m.day.isoformat(), m.kind, m.quantity, m.unit_cost, m.supplier, m.note, m.delivery_id, m.actor]
    else:
        raise ValueError(f"unknown export: {kind}")


def export_csv(session, kind, start=None, end=None):
    """CSV text (with a byte-order mark so that Excel reads names and accents correctly)."""
    if kind not in EXPORTS:
        raise ValueError(f"unknown export: {kind}")
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\r\n")
    for row in _rows(session, kind, start, end):
        w.writerow(["" if v is None else _safe(v) for v in row])
    return "﻿" + buf.getvalue()


# ---------- ageing report as PDF ----------
def receivables_pdf(session, today):
    """The list of customers who owe money, oldest debt first, with the ageing summary. Needs reportlab."""
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas

    rec = accounts.receivables(session, today)
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    w, h = A4
    left, right = 15 * mm, w - 15 * mm
    page = [0]

    def header():
        page[0] += 1
        c.setFont("Helvetica-Bold", 15)
        c.drawString(left, h - 18 * mm, "Gasora LPG Agency: amounts owed by customers")
        c.setFont("Helvetica", 9)
        c.drawString(left, h - 24 * mm, f"As of {today.isoformat()}. Oldest debt first (payments settle the oldest debts first).")
        c.drawRightString(right, 12 * mm, f"Page {page[0]}")
        return h - 34 * mm

    y = header()
    c.setFont("Helvetica-Bold", 10)
    c.drawString(left, y, f"Total owed: {runtime.currency()} {rec['total_owed']:,}   Customers owing: {rec['customers_owing']}")
    y -= 7 * mm
    c.setFont("Helvetica", 9)
    for b in rec["buckets"]:
        c.drawString(left, y, f"{b['label']} days: {b['customers']} customers, {runtime.currency()} {b['amount']:,}")
        y -= 5 * mm
    y -= 5 * mm

    def columns(y):
        c.setFont("Helvetica-Bold", 9)
        c.drawString(left, y, "Customer")
        c.drawRightString(left + 105 * mm, y, f"Owes ({runtime.currency()})")
        c.drawRightString(left + 125 * mm, y, "Days")
        c.drawString(left + 130 * mm, y, "Last payment")
        c.line(left, y - 1.5 * mm, right, y - 1.5 * mm)
        return y - 6 * mm

    y = columns(y)
    c.setFont("Helvetica", 9)
    for r in rec["customers"]:
        if y < 20 * mm:
            c.showPage()
            y = columns(header())
            c.setFont("Helvetica", 9)
        c.drawString(left, y, f"{r['customer_id']}  {r['name']}"[:48])
        c.drawRightString(left + 105 * mm, y, f"{r['balance']:,}")
        c.drawRightString(left + 125 * mm, y, str(r["days"]))
        c.drawString(left + 130 * mm, y, r["last_payment"] or "none")
        y -= 5.2 * mm
    if not rec["customers"]:
        c.drawString(left, y, "No customer owes money.")
    c.showPage()
    c.save()
    return buf.getvalue()
