"""Settings the owner can change while the system runs (stored in the database, in the `settings` table).

  currency        label shown on invoices, reports and screens (default "Rs")
  depot           where the vans start and end (default: backend/settings.py, a placeholder in Faisalabad)
  overdue_days    days an agency lets a customer keep empties before they count as overdue (default 15). It sets the
                  first ageing tier; later tiers (30, 60, 90 days) stay as they are unless they would come first.
  low_stock       filled-cylinder count below which stock is flagged (kept by backend/stock.py)

The values are loaded once at start-up and again whenever the owner saves them. They are process-wide, which suits one
server process per agency (the deployment guide runs one).
"""
from backend import settings
from backend.models import Setting

KEYS = ("currency", "depot_lat", "depot_lon", "overdue_days")
_state = {}


def _defaults():
    return {"currency": "Rs", "depot_lat": settings.DEPOT_LAT, "depot_lon": settings.DEPOT_LON,
            "overdue_days": settings.EMPTY_OVERDUE_DAYS}


def reset():
    _state.clear()
    _state.update(_defaults())


def load(session):
    reset()
    for key in KEYS:
        row = session.get(Setting, key)
        if row is not None:
            _state[key] = type(_state[key])(row.value)


def currency():
    return _state["currency"]


def depot():
    return _state["depot_lat"], _state["depot_lon"]


def overdue_days():
    return _state["overdue_days"]


def ageing_tiers():
    """[(min days, weight, label)], the first tier starting at the overdue setting. Labels follow the thresholds."""
    base = settings.EMPTY_AGEING_TIERS
    first_weight = base[0][1]
    rest = [(d, w) for d, w, _ in base[1:] if d > overdue_days()]
    tiers = [(overdue_days(), first_weight)] + rest
    out = []
    for i, (d, w) in enumerate(tiers):
        label = f"{d}-{tiers[i + 1][0] - 1}" if i + 1 < len(tiers) else f"{d}+"
        out.append((d, w, label))
    return out


def validate(values):
    """Check a dict of new values and return it with the right types. Raises ValueError with a plain message."""
    out = {}
    if "currency" in values:
        c = str(values["currency"]).strip()
        if not 1 <= len(c) <= 6 or not c.isprintable():
            raise ValueError("the currency label must be 1 to 6 characters")
        out["currency"] = c
    if "depot_lat" in values or "depot_lon" in values:
        try:
            lat, lon = float(values["depot_lat"]), float(values["depot_lon"])
        except (KeyError, TypeError, ValueError):
            raise ValueError("give both the depot latitude and longitude as numbers")
        if not (-90 <= lat <= 90 and -180 <= lon <= 180):
            raise ValueError("the depot position is outside the map")
        out["depot_lat"], out["depot_lon"] = lat, lon
    if "overdue_days" in values:
        try:
            d = int(values["overdue_days"])
        except (TypeError, ValueError):
            raise ValueError("overdue days must be a whole number")
        if not 1 <= d <= 60:
            raise ValueError("overdue days must be between 1 and 60")
        out["overdue_days"] = d
    return out


def save(session, events, actor, values):
    from backend import eventlog
    checked = validate(values)
    changed = {}
    for key, value in checked.items():
        row = session.get(Setting, key)
        old = row.value if row else None
        if row is None:
            session.add(Setting(key=key, value=str(value)))
        else:
            row.value = str(value)
        changed[key] = {"old": old, "new": str(value)}
    if changed:
        eventlog.append(events, actor, "settings.changed", changed)
    session.flush()
    load(session)
    return checked


reset()
