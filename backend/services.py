"""Business logic: record a delivery (with its event) and build today's plan."""
import math
from datetime import date

import numpy as np
from sqlalchemy import select

from backend import eventlog
from backend.models import Customer, Delivery
from backend.settings import DEPOT_LAT, DEPOT_LON
from evaluation.policies import CANDIDATE_RISK
from planner.routing import plan
from predictor.risk import band, run_out_risk

DEFAULT_POOLED = (20.0, 4.0)      # mean and spread of days between refills, used when no data (placeholder)


def record_delivery(session, events, actor, customer_id, delivered_on, cylinders):
    """Save a delivery and write its event. The caller commits."""
    if session.get(Customer, customer_id) is None:
        raise LookupError("customer not found")
    d = Delivery(customer_id=customer_id, delivered_on=delivered_on, cylinders=cylinders, driver=actor)
    session.add(d)
    session.flush()                                            # gives d.id
    event_id, _ = eventlog.append(events, actor, "delivery.recorded", {
        "delivery_id": d.id, "customer_id": customer_id,
        "delivered_on": delivered_on.isoformat(), "cylinders": cylinders})
    d.event_id = event_id
    return d


def _xy_km(lat, lon):
    x = (lon - DEPOT_LON) * 111.32 * math.cos(math.radians(DEPOT_LAT))
    y = (lat - DEPOT_LAT) * 110.57
    return x, y


def _pooled(rows):
    ok = [r for r in rows if len(r["intervals"]) >= 2]
    if not ok:
        return DEFAULT_POOLED
    return (float(np.mean([np.mean(r["intervals"]) for r in ok])),
            float(np.mean([np.std(r["intervals"], ddof=1) for r in ok])))


def build_plan(session, today, seconds=2.0):
    customers = session.scalars(select(Customer).order_by(Customer.id)).all()
    deliveries = session.scalars(
        select(Delivery).where(Delivery.delivered_on <= today).order_by(Delivery.delivered_on)).all()
    dates = {}
    for d in deliveries:
        dates.setdefault(d.customer_id, set()).add(d.delivered_on)

    rows, no_history = [], []
    for c in customers:
        ds = sorted(dates.get(c.id, []))
        if not ds:
            no_history.append({"customer_id": c.id, "name": c.name})
            continue
        x, y = _xy_km(c.lat, c.lon)
        rows.append({
            "id": c.id, "name": c.name, "demand": c.demand, "x": x, "y": y,
            "intervals": [(b - a).days for a, b in zip(ds, ds[1:])],
            "days_since": (today - ds[-1]).days,
            "n_deliveries": len(ds),
        })

    mu, sd = _pooled(rows)
    for r in rows:
        r["risk"] = run_out_risk(r, mu, sd)
        r["band"] = band(r["risk"])

    candidates = [r for r in rows if r["risk"] >= CANDIDATE_RISK]
    routes_out, visited = [], set()
    if candidates:
        result = plan(candidates, [r["risk"] for r in candidates], seconds=seconds)
        if result is not None:
            routes, visited_local = result
            visited = {candidates[k - 1]["id"] for k in visited_local}
            for v, (route, minutes) in enumerate(routes, start=1):
                routes_out.append({
                    "vehicle": v, "minutes": minutes,
                    "stops": [{"customer_id": candidates[k - 1]["id"], "name": candidates[k - 1]["name"],
                               "risk": round(candidates[k - 1]["risk"], 3), "band": candidates[k - 1]["band"]}
                              for k in route]})
    skipped = [{"customer_id": r["id"], "name": r["name"], "risk": round(r["risk"], 3), "band": r["band"]}
               for r in candidates if r["id"] not in visited]
    ranked = sorted(rows, key=lambda r: -r["risk"])
    return {
        "date": today.isoformat(),
        "depot": {"lat": DEPOT_LAT, "lon": DEPOT_LON},
        "settings_note": "straight-line distances; candidates are customers with risk >= %.2f" % CANDIDATE_RISK,
        "risk_table": [{"customer_id": r["id"], "name": r["name"], "risk": round(r["risk"], 3),
                        "band": r["band"], "days_since_delivery": r["days_since"],
                        "deliveries_seen": r["n_deliveries"]} for r in ranked],
        "routes": routes_out,
        "candidates_not_visited": skipped,
        "no_delivery_history": no_history,
    }
