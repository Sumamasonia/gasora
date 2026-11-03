"""Small admin commands (run from the project folder).

  python -m backend.manage create-owner NAME      ask for a password, make an owner account
  python -m backend.manage seed-demo              fill an empty database with fake customers
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


def create_owner(app, username, password):
    with app.state.SessionLocal() as s:
        if s.scalar(select(User).where(User.username == username)):
            print("User exists already:", username)
            return
        u = User(username=username, password_hash=security.hash_password(password), role="owner")
        s.add(u)
        s.flush()
        eventlog.append(app.state.events, "system", "user.created",
                        {"user_id": u.id, "username": username, "role": "owner"})
        s.commit()
        print("Owner created:", username)


def seed_demo(app, n=60, seed=1):
    with app.state.SessionLocal() as s:
        if s.scalar(select(Customer).limit(1)):
            print("Database already has customers. Nothing done.")
            return
    create_owner(app, *DEMO_OWNER)
    rng = np.random.default_rng(seed)
    today = date.today()
    with app.state.SessionLocal() as s:
        for c in make_customers(n, rng):
            lat = DEPOT_LAT + c["y"] / 110.57
            lon = DEPOT_LON + c["x"] / (111.32 * np.cos(np.radians(DEPOT_LAT)))
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
    print("Login for the demo: owner /", DEMO_OWNER[1])


if __name__ == "__main__":
    app = create_app()
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "create-owner" and len(sys.argv) == 3:
        create_owner(app, sys.argv[2], getpass("Password (min 8 characters): "))
    elif cmd == "seed-demo":
        seed_demo(app)
    else:
        print(__doc__)
