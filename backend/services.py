"""Business logic: deliveries, urgent requests, today's plan, publishing routes to drivers."""
import math
from datetime import date

import numpy as np
from sqlalchemy import select

from backend import eventlog
from backend.models import Customer, Delivery, Route, RouteStop, UrgentRequest, User
from backend.settings import DEPOT_LAT, DEPOT_LON, LATE_COST_CRITICAL, LATE_COST_URGENT
from evaluation.policies import CANDIDATE_RISK
from planner.routing import plan
from predictor.risk import band, run_out_risk

DEFAULT_POOLED = (20.0, 4.0)      # mean and spread of days between refills, used when no data (placeholder)


# ---------- deliveries and urgent requests ----------
def record_delivery(session, events, actor, customer_id, delivered_on, cylinders):
    """Save a delivery, close open urgent requests of that customer, write events. Caller commits."""
    if session.get(Customer, customer_id) is None:
        raise LookupError("customer not found")
    d = Delivery(customer_id=customer_id, delivered_on=delivered_on, cylinders=cylinders, driver=actor)
    session.add(d)
    session.flush()                                            # gives d.id
    event_id, _ = eventlog.append(events, actor, "delivery.recorded", {
        "delivery_id": d.id, "customer_id": customer_id,
        "delivered_on": delivered_on.isoformat(), "cylinders": cylinders})
    d.event_id = event_id
    for u in session.scalars(select(UrgentRequest).where(
            UrgentRequest.customer_id == customer_id, UrgentRequest.status == "open")):
        u.status = "done"
        eventlog.append(events, actor, "urgent.closed", {"urgent_id": u.id, "delivery_id": d.id})
    return d


def create_urgent(session, events, actor, customer_id, note):
    if session.get(Customer, customer_id) is None:
        raise LookupError("customer not found")
    u = UrgentRequest(customer_id=customer_id, note=note, created_by=actor, created_on=date.today())
    session.add(u)
    session.flush()
    eventlog.append(events, actor, "urgent.created", {"urgent_id": u.id, "customer_id": customer_id})
    return u


def open_urgent(session):
    rows = session.execute(
        select(UrgentRequest, Customer).join(Customer, Customer.id == UrgentRequest.customer_id)
        .where(UrgentRequest.status == "open").order_by(UrgentRequest.id)).all()
    return [{"urgent_id": u.id, "customer_id": c.id, "name": c.name, "note": u.note,
             "created_on": u.created_on.isoformat(), "created_by": u.created_by} for u, c in rows]


# ---------- the plan ----------
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


def build_plan(session, today, seconds=2.0, router=None):
    customers = session.scalars(select(Customer).where(Customer.is_active.is_(True)).order_by(Customer.id)).all()
    deliveries = session.scalars(
        select(Delivery).where(Delivery.delivered_on <= today).order_by(Delivery.delivered_on)).all()
    urgent = {u["customer_id"] for u in open_urgent(session)}
    dates = {}
    for d in deliveries:
        dates.setdefault(d.customer_id, set()).add(d.delivered_on)

    rows, no_history = [], []
    for c in customers:
        ds = sorted(dates.get(c.id, []))
        if not ds and c.id not in urgent:
            no_history.append({"customer_id": c.id, "name": c.name})
            continue
        x, y = _xy_km(c.lat, c.lon)
        rows.append({
            "id": c.id, "name": c.name, "demand": c.demand, "x": x, "y": y, "lat": c.lat, "lon": c.lon,
            "intervals": [(b - a).days for a, b in zip(ds, ds[1:])],
            "days_since": (today - ds[-1]).days if ds else None,
            "n_deliveries": len(ds),
            "urgent": c.id in urgent,
        })

    mu, sd = _pooled(rows)
    for r in rows:
        if r["days_since"] is None:                    # urgent customer with no history: risk unknown
            r["risk"], r["band"] = 1.0, "Urgent"
        else:
            r["risk"] = run_out_risk(r, mu, sd)
            r["band"] = band(r["risk"])

    candidates = [r for r in rows if r["urgent"] or r["risk"] >= CANDIDATE_RISK]
    routes_out, visited, warnings = [], set(), []
    road = router is not None and router.mode == "road"
    if candidates:
        tm = km_matrix = None
        if road:
            m = router.matrix([(DEPOT_LAT, DEPOT_LON)] + [(r["lat"], r["lon"]) for r in candidates])
            tm, km_matrix = m["minutes"], m["km"]
            if m["far"]:
                warnings.append("%d place(s) are more than 1 km from the downloaded road map, "
                                "so their road times are approximate." % len(m["far"]))
        result = plan(candidates, [r["risk"] for r in candidates],
                      urgent_ids={r["id"] for r in candidates if r["urgent"]}, seconds=seconds, tm=tm,
                      urgent_late_cost=LATE_COST_URGENT, critical_late_cost=LATE_COST_CRITICAL)
        if result is not None:
            routes, visited_local = result
            visited = {candidates[k - 1]["id"] for k in visited_local}
            for v, (route, minutes) in enumerate(routes, start=1):
                km = None
                if road and route:
                    seq = [0] + list(route) + [0]
                    km = round(sum(km_matrix[a][b] for a, b in zip(seq, seq[1:])), 1)
                routes_out.append({
                    "vehicle": v, "minutes": minutes, "km": km,
                    "stops": [{"customer_id": candidates[k - 1]["id"], "name": candidates[k - 1]["name"],
                               "risk": round(candidates[k - 1]["risk"], 3), "band": candidates[k - 1]["band"],
                               "urgent": candidates[k - 1]["urgent"]} for k in route]})
    skipped = [{"customer_id": r["id"], "name": r["name"], "risk": round(r["risk"], 3), "band": r["band"],
                "urgent": r["urgent"]} for r in candidates if r["id"] not in visited]
    ranked = sorted(rows, key=lambda r: (-r["urgent"], -r["risk"]))
    return {
        "date": today.isoformat(),
        "depot": {"lat": DEPOT_LAT, "lon": DEPOT_LON},
        "routing": "road" if road else "straight",
        "warnings": warnings,
        "settings_note": "%s travel times; candidates are customers with risk >= %.2f, plus urgent requests"
                         % ("road" if road else "straight-line", CANDIDATE_RISK),
        "risk_table": [{"customer_id": r["id"], "name": r["name"], "risk": round(r["risk"], 3),
                        "band": r["band"], "urgent": r["urgent"], "days_since_delivery": r["days_since"],
                        "deliveries_seen": r["n_deliveries"]} for r in ranked],
        "routes": routes_out,
        "candidates_not_visited": skipped,
        "no_delivery_history": no_history,
    }


# ---------- routes for drivers ----------
def publish_plan(session, events, actor, day, seconds, router=None):
    """Plan the day and save the routes so drivers can see them. Caller commits."""
    existing = session.scalars(select(Route).where(Route.day == day)).all()
    if existing:
        stops = session.scalars(select(RouteStop).where(RouteStop.route_id.in_([r.id for r in existing]))).all()
        if any(s.status != "pending" for s in stops):
            raise ValueError("routes for this day are already in progress")
        for s in stops:
            session.delete(s)
        for r in existing:
            session.delete(r)
        session.flush()
    p = build_plan(session, day, seconds, router)
    created, n_stops = [], 0
    for r in p["routes"]:
        if not r["stops"]:
            continue
        route = Route(day=day, vehicle=r["vehicle"], minutes=r["minutes"])
        session.add(route)
        session.flush()
        for i, s in enumerate(r["stops"], start=1):
            session.add(RouteStop(route_id=route.id, seq=i, customer_id=s["customer_id"],
                                  risk=s["risk"], band=s["band"], urgent=s["urgent"]))
        created.append(route.id)
        n_stops += len(r["stops"])
    eventlog.append(events, actor, "plan.published", {"day": day.isoformat(), "route_ids": created, "stops": n_stops})


def routes_view(session, day, driver_id=None):
    q = select(Route).where(Route.day == day).order_by(Route.vehicle)
    if driver_id is not None:
        q = q.where(Route.driver_id == driver_id)
    out = []
    for r in session.scalars(q).all():
        rows = session.execute(
            select(RouteStop, Customer).join(Customer, Customer.id == RouteStop.customer_id)
            .where(RouteStop.route_id == r.id).order_by(RouteStop.seq)).all()
        driver = session.get(User, r.driver_id) if r.driver_id else None
        stops = [{"stop_id": s.id, "seq": s.seq, "customer_id": c.id, "name": c.name, "address": c.address,
                  "phone": c.phone, "lat": c.lat, "lon": c.lon, "cylinders": c.demand, "risk": s.risk,
                  "band": s.band, "urgent": s.urgent, "status": s.status, "reason": s.reason}
                 for s, c in rows]
        out.append({"route_id": r.id, "day": r.day.isoformat(), "vehicle": r.vehicle, "minutes": r.minutes,
                    "driver": driver.username if driver else None, "stops": stops,
                    "delivered": sum(s["status"] == "delivered" for s in stops),
                    "skipped": sum(s["status"] == "skipped" for s in stops), "total": len(stops)})
    return out


def assign_route(session, events, actor, route_id, username):
    route = session.get(Route, route_id)
    if route is None:
        raise LookupError("route not found")
    driver = session.scalar(select(User).where(User.username == username))
    if driver is None or driver.role != "driver":
        raise LookupError("driver not found")
    route.driver_id = driver.id
    eventlog.append(events, actor, "route.assigned", {"route_id": route.id, "driver": driver.username})


def complete_stop(session, events, user, stop_id, action, cylinders=None, reason=None):
    """A driver (or the owner) marks a stop as delivered or skipped. Caller commits."""
    stop = session.get(RouteStop, stop_id)
    if stop is None:
        raise LookupError("stop not found")
    route = session.get(Route, stop.route_id)
    if user.role != "owner" and route.driver_id != user.id:
        raise PermissionError("this stop is not on your route")
    if stop.status != "pending":
        raise ValueError("this stop is already closed")
    if route.day != date.today():
        raise ValueError("this route is not for today")
    if action == "deliver":
        cust = session.get(Customer, stop.customer_id)
        d = record_delivery(session, events, user.username, cust.id, date.today(), cylinders or cust.demand)
        stop.status, stop.delivery_id = "delivered", d.id
    else:
        stop.status, stop.reason = "skipped", reason
        eventlog.append(events, user.username, "stop.skipped",
                        {"stop_id": stop.id, "customer_id": stop.customer_id, "reason": reason})


def route_paths(session, router, sequences):
    """Road paths (lists of [lat, lon]) for routes given as lists of customer ids, depot to depot."""
    ids = {cid for seq in sequences for cid in seq}
    pos = {c.id: (c.lat, c.lon) for c in session.scalars(select(Customer).where(Customer.id.in_(ids)))} if ids else {}
    depot = (DEPOT_LAT, DEPOT_LON)
    out = []
    for seq in sequences:
        stops = [depot] + [pos[c] for c in seq if c in pos] + [depot]
        line = []
        for a, b in zip(stops, stops[1:]):
            leg = router.path(a, b)
            line.extend(leg if not line else leg[1:])
        out.append(line)
    return out
