"""Small admin commands (run from the project folder).

  python -m backend.manage create-owner NAME      ask for a password, make an owner account
  python -m backend.manage create-driver NAME     ask for a password, make a driver account
  python -m backend.manage seed-demo              fill an empty database with fake customers
  python -m backend.manage warm-roads             compute road times for all customers (once)
  python -m backend.manage tamper-demo            show how the event log detects changes (for demonstrations)
"""
import sys
from datetime import date, timedelta
from getpass import getpass

import numpy as np
from sqlalchemy import select

from backend import eventlog, security
from backend.app import create_app
from backend.models import Customer, User
from backend.services import record_delivery
from backend.settings import DEPOT_LAT, DEPOT_LON
from simulator.generator import make_customers

DEMO_OWNER = ("owner", "owner-demo-123")
DEMO_DRIVER = ("driver1", "driver-demo-123")


def create_user(app, username, password, role):
    with app.state.SessionLocal() as s:
        if s.scalar(select(User).where(User.username == username)):
            print("User exists already:", username)
            return
        u = User(username=username, password_hash=security.hash_password(password), role=role)
        s.add(u)
        s.flush()
        eventlog.append(app.state.events, "system", "user.created",
                        {"user_id": u.id, "username": username, "role": role})
        s.commit()
        print(f"{role.capitalize()} created:", username)


def seed_demo(app, n=60, seed=1):
    with app.state.SessionLocal() as s:
        if s.scalar(select(Customer).limit(1)):
            print("Database already has customers. Nothing done.")
            return
    create_user(app, *DEMO_OWNER, "owner")
    create_user(app, *DEMO_DRIVER, "driver")
    rng = np.random.default_rng(seed)
    today = date.today()
    with app.state.SessionLocal() as s:
        for c in make_customers(n, rng):
            x, y = c["x"] * 0.5, c["y"] * 0.5              # keep customers inside the downloaded 6 km road map
            lat = DEPOT_LAT + y / 110.57
            lon = DEPOT_LON + x / (111.32 * np.cos(np.radians(DEPOT_LAT)))
            row = Customer(name=f"Customer {c['id']:03d}", lat=float(lat), lon=float(lon), demand=c["demand"])
            s.add(row)
            s.flush()
            last = today - timedelta(days=int(round(c["days_since"])))
            dates = [last]                                     # build the history backwards
            for iv in reversed(c["intervals"]):
                dates.append(dates[-1] - timedelta(days=max(1, int(round(iv)))))
            for d in reversed(dates):
                record_delivery(s, app.state.events, "seed", row.id, d, row.demand)
        s.commit()
    print(f"Added {n} fake customers with delivery history.")
    print("Demo logins: owner /", DEMO_OWNER[1], "  driver1 /", DEMO_DRIVER[1])


def tamper_demo():
    """A live demonstration of the event log's tamper detection on a throw-away in-memory log."""
    def fresh():
        conn = eventlog.connect(":memory:")
        for i, (who, what) in enumerate([("owner", "customer.created"), ("driver1", "delivery.recorded"),
                                         ("driver1", "empties.recorded"), ("owner", "route.assigned"),
                                         ("driver1", "delivery.recorded")], start=1):
            eventlog.append(conn, who, what, {"step": i, "cylinders": i}, ts=f"2026-01-0{i}T10:00:00+00:00")
        return conn

    print("A. Changing an old event")
    conn = fresh()
    print("  1. Five events were written. Check:", eventlog.verify(conn)[1])
    try:
        conn.execute("UPDATE events SET actor = 'someone' WHERE id = 2")
    except Exception as e:
        print("  2. Normal code cannot change an event:", e)
    conn.execute("DROP TRIGGER events_no_update")
    conn.execute("UPDATE events SET payload = '{\"cylinders\":99,\"step\":3}' WHERE id = 3")
    print("  3. Someone with database access removes the guard and changes event 3.")
    print("  4. Check:", eventlog.verify(conn)[1])

    print("B. Removing the newest event")
    conn = fresh()
    anchor = eventlog.head(conn)                      # a copy of the newest hash, kept somewhere else
    conn.execute("DROP TRIGGER events_no_delete")
    conn.execute("DELETE FROM events WHERE id = 5")
    print("  1. The newest event is removed. The chain alone still passes:", eventlog.verify(conn)[1])
    print("  2. With the stored copy of the newest hash:", eventlog.verify(conn, anchor=anchor)[1])
    print("The log is tamper-evident, not tamper-proof: keep the newest hash somewhere else.")


def warm_roads(app):
    import time
    from backend.models import Customer
    router = app.state.router
    if router.mode != "road":
        print("Road routing is not active (no road graph found). Run: python -m planner.download_map")
        return
    with app.state.SessionLocal() as s:
        pts = [(DEPOT_LAT, DEPOT_LON)] + [(c.lat, c.lon) for c in s.scalars(select(Customer))]
    t0 = time.time()
    m = router.matrix(pts)
    print(f"Road times ready for {len(pts) - 1} customers in {time.time() - t0:.0f} s.")
    if m["far"]:
        print(f"{len(m['far'])} place(s) are more than 1 km from the road map.")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    app = create_app() if cmd != "tamper-demo" else None
    if cmd in ("create-owner", "create-driver") and len(sys.argv) == 3:
        create_user(app, sys.argv[2], getpass("Password (min 8 characters): "), cmd.split("-")[1])
    elif cmd == "seed-demo":
        seed_demo(app)
    elif cmd == "warm-roads":
        warm_roads(app)
    elif cmd == "tamper-demo":
        tamper_demo()
    else:
        print(__doc__)
