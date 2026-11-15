"""Stock of filled cylinders: purchases from the plant, sales (one per cylinder delivered) and adjustments.

Stock tracking starts with the first purchase or adjustment. Before that, deliveries write no stock movements, so
an agency that has not entered its opening stock is not shown a negative number. After that, every delivery
takes its cylinders out of stock automatically. Movements are append-only (see models.py).
"""
from datetime import date, timedelta

from sqlalchemy import func, select

from backend import eventlog
from backend.models import Setting, StockMovement

LOW_STOCK_KEY = "low_stock_threshold"
DEFAULT_LOW_STOCK = 10


def tracking_started(session):
    return session.scalar(select(func.count(StockMovement.id))) > 0


def on_hand(session):
    return int(session.scalar(select(func.coalesce(func.sum(StockMovement.quantity), 0))))


def get_threshold(session):
    row = session.get(Setting, LOW_STOCK_KEY)
    return int(row.value) if row else DEFAULT_LOW_STOCK


def set_threshold(session, events, actor, value):
    if value < 0:
        raise ValueError("the threshold cannot be negative")
    row = session.get(Setting, LOW_STOCK_KEY)
    if row is None:
        session.add(Setting(key=LOW_STOCK_KEY, value=str(value)))
    else:
        row.value = str(value)
    eventlog.append(events, actor, "stock.threshold_set", {"threshold": value})


def _add(session, events, actor, kind, quantity, event_type, day=None, unit_cost=None, supplier=None, note=None,
         delivery_id=None):
    m = StockMovement(day=day or date.today(), kind=kind, quantity=quantity, unit_cost=unit_cost, supplier=supplier,
                      note=note, delivery_id=delivery_id, actor=actor)
    session.add(m)
    session.flush()
    m.event_id, _ = eventlog.append(events, actor, event_type, {
        "movement_id": m.id, "quantity": quantity, "unit_cost": unit_cost, "delivery_id": delivery_id})
    session.flush()
    return m


def record_purchase(session, events, actor, quantity, unit_cost, supplier=None, day=None, note=None):
    if quantity < 1:
        raise ValueError("a purchase must be at least 1 cylinder")
    if unit_cost < 1:
        raise ValueError("the cost of one cylinder must be at least 1 rupee")
    return _add(session, events, actor, "purchase", quantity, "stock.purchased", day, unit_cost,
                (supplier or "").strip() or None, note)


def adjust(session, events, actor, quantity, note, day=None):
    if quantity == 0:
        raise ValueError("an adjustment cannot be zero")
    if not note or not note.strip():
        raise ValueError("an adjustment needs a note that says why (opening stock, damage, count correction)")
    return _add(session, events, actor, "adjustment", quantity, "stock.adjusted", day, note=note.strip())


def record_sale(session, events, actor, delivery):
    """One movement for a delivery, only once stock tracking has started."""
    if not tracking_started(session):
        return None
    return _add(session, events, actor, "sale", -delivery.cylinders, "stock.sold", day=delivery.delivered_on,
                delivery_id=delivery.id)


def stock_view(session, limit=50):
    now = on_hand(session)
    threshold = get_threshold(session)
    started = tracking_started(session)
    rows = session.scalars(select(StockMovement).order_by(StockMovement.id.desc()).limit(limit)).all()
    since = date.today() - timedelta(days=30)
    bought = session.execute(
        select(func.coalesce(func.sum(StockMovement.quantity), 0),
               func.coalesce(func.sum(StockMovement.quantity * StockMovement.unit_cost), 0))
        .where(StockMovement.kind == "purchase", StockMovement.day >= since)).one()
    return {"tracking": started, "on_hand": now, "threshold": threshold,
            "low": started and now <= threshold, "negative": started and now < 0,
            "bought_last_30_days": int(bought[0]), "purchase_cost_last_30_days": int(bought[1]),
            "movements": [{"id": m.id, "day": m.day.isoformat(), "kind": m.kind, "quantity": m.quantity,
                           "unit_cost": m.unit_cost, "supplier": m.supplier, "note": m.note, "actor": m.actor,
                           "delivery_id": m.delivery_id} for m in rows]}
