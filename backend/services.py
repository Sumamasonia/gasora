"""Business logic: deliveries, urgent requests, today's plan, publishing routes to drivers."""
import math
from datetime import date

import numpy as np
from sqlalchemy import select

from backend import accounts, eventlog, stock
from backend import cylinders as cylinder_service
from backend.models import Customer, Cylinder, Delivery, EmptiesLedger, Route, RouteStop, UrgentRequest, User
from backend.settings import (DEPOT_LAT, DEPOT_LON, EMPTY_AGEING_TIERS, EMPTY_OVERDUE_DAYS,
                              LATE_COST_CRITICAL, LATE_COST_URGENT)
from evaluation.policies import CANDIDATE_RISK
from config import CAPACITY, N_VEHICLES, SERVICE_MIN
from planner.greedy import nearest_neighbour_routes
from planner.routing import plan, travel_minutes
from predictor.risk import band, refill_window, run_out_risk

DEFAULT_POOLED = (20.0, 4.0)      # mean and spread of days between refills, used when no data (placeholder)


# ---------- deliveries and urgent requests ----------
def _serial_moves(session, customer_id, n_delivered, n_collected, serials_delivered, serials_collected):
    """Check optional serial numbers before anything is saved. Returns [(cylinder id, new state)].
    Serials are all-or-nothing: either every cylinder of the delivery has one, or none is given."""
    moves = []
    for serials, expected, wanted, label in ((serials_delivered, n_delivered, "Filled", "delivered"),
                                              (serials_collected, n_collected, "Delivered", "collected")):
        if serials is None:
            continue
        clean = [str(s).strip().upper() for s in serials]
        if len(clean) != expected or len(set(clean)) != len(clean):
            raise ValueError(f"enter all {expected} serial numbers of the {label} cylinders (no repeats), or none")
        for serial in clean:
            cyl = session.scalar(select(Cylinder).where(Cylinder.serial_no == serial))
            if cyl is None:
                raise LookupError(f"cylinder {serial} is not in the register")
            if cyl.state != wanted:
                raise ValueError(f"cylinder {serial} is {cyl.state}, expected {wanted}")
            if wanted == "Delivered" and cyl.customer_id != customer_id:
                raise ValueError(f"cylinder {serial} is not held by this customer")
            moves.append((cyl.id, "Delivered" if wanted == "Filled" else "Recovered"))
    return moves


def record_delivery(session, events, actor, customer_id, delivered_on, cylinders, empties_collected=None,
                    serials_delivered=None, serials_collected=None):
    """Save a delivery, note the empties collected (default: one for each cylinder delivered, a plain swap),
    close open urgent requests of that customer, write events. Caller commits.
    Optional serial numbers move the cylinders in the register automatically (Filled to Delivered, Delivered to
    Recovered); invalid serials stop the whole delivery before anything is saved."""
    if session.get(Customer, customer_id) is None:
        raise LookupError("customer not found")
    n_collected = cylinders if empties_collected is None else empties_collected
    moves = _serial_moves(session, customer_id, cylinders, n_collected, serials_delivered, serials_collected)
    d = Delivery(customer_id=customer_id, delivered_on=delivered_on, cylinders=cylinders, driver=actor)
    session.add(d)
    session.flush()                                            # gives d.id
    event_id, _ = eventlog.append(events, actor, "delivery.recorded", {
        "delivery_id": d.id, "customer_id": customer_id,
        "delivered_on": delivered_on.isoformat(), "cylinders": cylinders})
    d.event_id = event_id
    accounts.bill_delivery(session, events, actor, d)          # an invoice, once the owner has set a price
    stock.record_sale(session, events, actor, d)               # takes the cylinders out of stock, once stock is tracked
    collected = cylinders if empties_collected is None else empties_collected
    ledger = EmptiesLedger(customer_id=customer_id, delivery_id=d.id, delivered=cylinders, collected=collected,
                           kind="delivery", actor=actor, created_on=delivered_on)
    session.add(ledger)
    session.flush()
    ledger.event_id, _ = eventlog.append(events, actor, "empties.recorded", {
        "customer_id": customer_id, "delivery_id": d.id, "delivered": cylinders, "collected": collected})
    for u in session.scalars(select(UrgentRequest).where(
            UrgentRequest.customer_id == customer_id, UrgentRequest.status == "open")):
        u.status = "done"
        eventlog.append(events, actor, "urgent.closed", {"urgent_id": u.id, "delivery_id": d.id})
    for cyl_id, to_state in moves:
        cylinder_service.transition_cylinder(session, events, actor, cyl_id, to_state,
                                             customer_id=customer_id, delivery_id=d.id)
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


# ---------- empties held by customers ----------
NO_EMPTIES = {"held": 0, "days_holding": None, "overdue": False, "bucket": None, "swap_weight": None}


def _tier(days):
    """(skip-penalty weight, label) of the ageing tier for this many days, or (None, None) if under the first tier."""
    found = (None, None)
    for min_days, weight, label in EMPTY_AGEING_TIERS:
        if days >= min_days:
            found = (weight, label)
    return found


def empties_state(session, today):
    """customer id -> empties still held (delivered minus collected), days held, overdue.
    Only customers holding at least one empty are listed."""
    rows = session.scalars(select(EmptiesLedger).order_by(EmptiesLedger.created_on, EmptiesLedger.id)).all()
    balance, since = {}, {}
    for r in rows:
        if r.created_on > today:
            continue
        b = balance.get(r.customer_id, 0) + r.delivered - r.collected
        balance[r.customer_id] = b
        if b <= 0:
            since[r.customer_id] = None
        elif since.get(r.customer_id) is None:
            since[r.customer_id] = r.created_on                      # the holding period starts here
    out = {}
    for cid, b in balance.items():
        if b > 0:
            days = (today - since[cid]).days
            weight, label = _tier(days)
            out[cid] = {"held": b, "days_holding": days, "overdue": weight is not None,
                        "bucket": label, "swap_weight": weight}
    return out


def empties_summary(session, today):
    state = empties_state(session, today)
    names = {c.id: c.name for c in session.scalars(select(Customer))}
    rows = [{"customer_id": cid, "name": names.get(cid, "?"), **v} for cid, v in state.items()]
    rows.sort(key=lambda r: (not r["overdue"], -r["days_holding"], r["customer_id"]))
    buckets = [{"label": "under %d" % EMPTY_OVERDUE_DAYS, "customers": 0, "empties": 0}] + [
        {"label": label, "customers": 0, "empties": 0} for _, _, label in EMPTY_AGEING_TIERS]
    for r in rows:
        b = next(x for x in buckets if x["label"] == (r["bucket"] or buckets[0]["label"]))
        b["customers"] += 1
        b["empties"] += r["held"]
    return {"total_held": sum(r["held"] for r in rows), "customers_holding": len(rows), "buckets": buckets,
            "customers_overdue": sum(r["overdue"] for r in rows), "overdue_after_days": EMPTY_OVERDUE_DAYS,
            "customers": rows}


def adjust_empties(session, events, actor, customer_id, delta, note, since=None):
    """Correct the count, for example to enter what a customer held before the system was used.
    delta > 0: the customer holds that many more empties; delta < 0: that many fewer.
    since = the date the customer started holding them (default today); it sets their age. Caller commits."""
    if session.get(Customer, customer_id) is None:
        raise LookupError("customer not found")
    if delta == 0:
        raise ValueError("delta must not be zero")
    if since is not None and since > date.today():
        raise ValueError("since must not be in the future")
    row = EmptiesLedger(customer_id=customer_id, delivered=max(delta, 0), collected=max(-delta, 0),
                        kind="adjustment", note=note, actor=actor, created_on=since or date.today())
    session.add(row)
    session.flush()
    row.event_id, _ = eventlog.append(events, actor, "empties.adjusted",
                                      {"customer_id": customer_id, "delta": delta, "note": note})
    return row


# ---------- the plan ----------
def _greedy_result(candidates, tm):
    """Last-resort plan when OR-Tools finds none: nearest neighbour. Same shape as plan()'s result."""
    m = len(candidates)
    if tm is None:
        nodes = [{"x": 0.0, "y": 0.0}] + candidates
        tm = [[travel_minutes(a, b) for b in nodes] for a in nodes]
    demand = {k: candidates[k - 1]["demand"] for k in range(1, m + 1)}
    routes = nearest_neighbour_routes(list(range(1, m + 1)), tm, demand)
    out = []
    for r in routes:
        here, minutes = 0, 0
        for k in r:
            minutes += tm[here][k] + SERVICE_MIN
            here = k
        out.append((r, minutes + (tm[here][0] if r else 0)))
    return out, {k for r in routes for k in r}



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
    customers = session.scalars(select(Customer).order_by(Customer.id)).all()
    deliveries = session.scalars(
        select(Delivery).where(Delivery.delivered_on <= today).order_by(Delivery.delivered_on)).all()
    urgent = {u["customer_id"] for u in open_urgent(session)}
    emp = empties_state(session, today)
    dates = {}
    for d in deliveries:
        dates.setdefault(d.customer_id, set()).add(d.delivered_on)

    rows, no_history = [], []
    for c in customers:
        ds = sorted(dates.get(c.id, []))
        swap = emp.get(c.id, NO_EMPTIES)["overdue"]               # holds empties 15+ days: a swap candidate
        if not ds and c.id not in urgent and not swap:
            no_history.append({"customer_id": c.id, "name": c.name})
            continue
        x, y = _xy_km(c.lat, c.lon)
        rows.append({
            "id": c.id, "name": c.name, "demand": c.demand, "x": x, "y": y, "lat": c.lat, "lon": c.lon,
            "intervals": [(b - a).days for a, b in zip(ds, ds[1:])],
            "days_since": (today - ds[-1]).days if ds else None,
            "n_deliveries": len(ds),
            "urgent": c.id in urgent,
            "swap": swap,
        })

    mu, sd = _pooled(rows)
    for r in rows:
        if r["days_since"] is None:                    # no delivery history: risk unknown
            if r["urgent"]:
                r["risk"], r["band"], r["window"] = 1.0, "Urgent", None
            else:                                      # only empties to collect
                r["risk"], r["band"], r["window"] = 0.0, "Swap", None
        else:
            r["risk"] = run_out_risk(r, mu, sd)
            r["band"] = band(r["risk"])
            r["window"] = [round(x, 1) for x in refill_window(r, mu, sd)]
        r["weight"] = max(r["risk"], emp.get(r["id"], NO_EMPTIES)["swap_weight"] or 0.0)   # what the planner sees

    candidates = [r for r in rows if r["urgent"] or r["swap"] or r["risk"] >= CANDIDATE_RISK]
    routes_out, visited, warnings, fallback = [], set(), [], None
    road = router is not None and router.mode == "road"
    if candidates:
        tm = km_matrix = None
        if road:
            m = router.matrix([(DEPOT_LAT, DEPOT_LON)] + [(r["lat"], r["lon"]) for r in candidates])
            tm, km_matrix = m["minutes"], m["km"]
            if m["far"]:
                warnings.append("%d place(s) are more than 1 km from the downloaded road map, "
                                "so their road times are approximate." % len(m["far"]))
        urgent_set = {r["id"] for r in candidates if r["urgent"]}

        def solve(vehicles):
            return plan(candidates, [r["weight"] for r in candidates], urgent_ids=urgent_set, seconds=seconds,
                        tm=tm, urgent_late_cost=LATE_COST_URGENT, critical_late_cost=LATE_COST_CRITICAL,
                        late_risks=[r["risk"] for r in candidates], n_vehicles=vehicles)

        def urgent_missed(res):
            if res is None:
                return True
            seen = {candidates[j - 1]["id"] for j in res[1]}
            return any(i not in seen for i in urgent_set)

        result = solve(None)
        if urgent_missed(result):                          # fallbacks: one more vehicle, then nearest neighbour
            retry = solve(N_VEHICLES + 1)
            if retry is not None and not urgent_missed(retry):
                result, fallback = retry, "extra_vehicle"
                warnings.append("The urgent requests did not fit in %d vehicles: a plan with %d vehicles is shown."
                                % (N_VEHICLES, N_VEHICLES + 1))
            elif result is None:
                result, fallback = _greedy_result(candidates, tm), "greedy"
                warnings.append("The solver found no plan: a simple nearest-neighbour plan is shown.")
        if result is not None and urgent_missed(result):
            seen = {candidates[j - 1]["id"] for j in result[1]}
            warnings.append("Urgent request(s) could not be served by the available vehicles: "
                            + ", ".join(r["name"] for r in candidates if r["urgent"] and r["id"] not in seen))
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
                               "urgent": candidates[k - 1]["urgent"],
                               "window_days": candidates[k - 1]["window"],
                               "empties_held": emp.get(candidates[k - 1]["id"], NO_EMPTIES)["held"],
                               "empties_days": emp.get(candidates[k - 1]["id"], NO_EMPTIES)["days_holding"],
                               "empties_bucket": emp.get(candidates[k - 1]["id"], NO_EMPTIES)["bucket"],
                               "swap": candidates[k - 1]["swap"]} for k in route]})
    skipped = [{"customer_id": r["id"], "name": r["name"], "risk": round(r["risk"], 3), "band": r["band"],
                "urgent": r["urgent"], "swap": r["swap"]} for r in candidates if r["id"] not in visited]
    ranked = sorted(rows, key=lambda r: (-r["urgent"], -r["risk"]))
    return {
        "date": today.isoformat(),
        "depot": {"lat": DEPOT_LAT, "lon": DEPOT_LON},
        "routing": "road" if road else "straight",
        "fallback": fallback,
        "warnings": warnings,
        "settings_note": "%s travel times; candidates are customers with risk >= %.2f, plus urgent requests and swap candidates (empties held %d+ days)"
                         % ("road" if road else "straight-line", CANDIDATE_RISK, EMPTY_OVERDUE_DAYS),
        "risk_table": [{"customer_id": r["id"], "name": r["name"], "risk": round(r["risk"], 3),
                        "band": r["band"], "urgent": r["urgent"], "days_since_delivery": r["days_since"],
                        "window_days": r["window"],
                        "empties_held": emp.get(r["id"], NO_EMPTIES)["held"],
                        "empties_overdue": emp.get(r["id"], NO_EMPTIES)["overdue"],
                        "empties_bucket": emp.get(r["id"], NO_EMPTIES)["bucket"],
                        "swap_candidate": r["swap"],
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
    emp = empties_state(session, day)
    owed = accounts.balances(session)
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
                  "balance": owed.get(c.id, 0),
                  "empties_held": emp.get(c.id, NO_EMPTIES)["held"],
                  "empties_days": emp.get(c.id, NO_EMPTIES)["days_holding"],
                  "empties_bucket": emp.get(c.id, NO_EMPTIES)["bucket"],
                  "swap": emp.get(c.id, NO_EMPTIES)["overdue"],
                  "band": s.band, "urgent": s.urgent, "status": s.status, "reason": s.reason}
                 for s, c in rows]
        out.append({"route_id": r.id, "day": r.day.isoformat(), "vehicle": r.vehicle, "minutes": r.minutes,
                    "driver": driver.username if driver else None, "stops": stops,
                    "manifest": {"stops": len(stops), "full_cylinders": sum(s["cylinders"] for s in stops),
                                 "empties_expected": sum(s["cylinders"] + s["empties_held"] for s in stops),
                                 "capacity": CAPACITY},
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


def complete_stop(session, events, user, stop_id, action, cylinders=None, reason=None, empties_collected=None,
                  serials_delivered=None, serials_collected=None, cash_received=None):
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
        d = record_delivery(session, events, user.username, cust.id, date.today(), cylinders or cust.demand,
                            empties_collected, serials_delivered, serials_collected)
        stop.status, stop.delivery_id = "delivered", d.id
        if cash_received:
            accounts.record_payment(session, events, user.username, cust.id, cash_received, note="paid at delivery")
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
