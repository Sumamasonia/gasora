from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from backend import eventlog, security
from backend.app import create_app
from backend.models import User


@pytest.fixture()
def client():
    app = create_app("sqlite://", ":memory:", "test-secret-long-enough-for-hs256-signing-0123", routing="straight")
    with app.state.SessionLocal() as s:
        s.add(User(username="boss", password_hash=security.hash_password("boss-password"), role="owner"))
        s.commit()
    return TestClient(app)


def login(client, username, password):
    r = client.post("/auth/login", json={"username": username, "password": password})
    return r


def headers(client, username="boss", password="boss-password"):
    token = login(client, username, password).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def add_customer(client, h, name="C", lat=31.42, lon=73.08, demand=1):
    r = client.post("/customers", json={"name": name, "lat": lat, "lon": lon, "demand": demand}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def test_login(client):
    assert login(client, "boss", "wrong").status_code == 401
    assert login(client, "nobody", "x").status_code == 401
    r = login(client, "boss", "boss-password")
    assert r.status_code == 200 and r.json()["role"] == "owner"


def test_needs_login(client):
    assert client.get("/customers").status_code == 401
    assert client.get("/customers", headers={"Authorization": "Bearer junk"}).status_code == 401


def test_driver_rights(client):
    h = headers(client)
    r = client.post("/users", json={"username": "ali", "password": "driver-pass-1", "role": "driver"}, headers=h)
    assert r.status_code == 201
    cid = add_customer(client, h)
    hd = headers(client, "ali", "driver-pass-1")
    assert client.post("/customers", json={"name": "X", "lat": 31.4, "lon": 73.0}, headers=hd).status_code == 403
    assert client.get("/plan/today", headers=hd).status_code == 403
    assert client.post("/deliveries", json={"customer_id": cid}, headers=hd).status_code == 201
    assert client.get("/customers", headers=hd).status_code == 200


def test_delivery_checks(client):
    h = headers(client)
    cid = add_customer(client, h)
    future = (date.today() + timedelta(days=1)).isoformat()
    assert client.post("/deliveries", json={"customer_id": cid, "delivered_on": future}, headers=h).status_code == 400
    assert client.post("/deliveries", json={"customer_id": 999}, headers=h).status_code == 404
    assert client.post("/deliveries", json={"customer_id": cid, "cylinders": 0}, headers=h).status_code == 422


def test_audit_chain_and_tamper(client):
    h = headers(client)
    cid = add_customer(client, h)
    client.post("/deliveries", json={"customer_id": cid}, headers=h)
    r = client.get("/audit/verify", headers=h).json()
    assert r["ok"] and r["events"] == 2                    # customer.created + delivery.recorded
    ev = client.app.state.events
    ev.execute("DROP TRIGGER events_no_update")             # attacker with database access
    ev.execute("UPDATE events SET actor='someone-else' WHERE id=2")
    r = client.get("/audit/verify", headers=h).json()
    assert not r["ok"] and "event 2" in r["message"]


def put_history(client, h, cid, days_ago):
    for n in days_ago:
        d = (date.today() - timedelta(days=n)).isoformat()
        assert client.post("/deliveries", json={"customer_id": cid, "delivered_on": d}, headers=h).status_code == 201


def test_plan(client):
    h = headers(client)
    due = add_customer(client, h, "Due soon", 31.43, 73.09)
    fresh = add_customer(client, h, "Just filled", 31.41, 73.07)
    nohist = add_customer(client, h, "New customer", 31.44, 73.10)
    put_history(client, h, due, [100, 80, 60, 40, 20])      # refills every 20 days, 20 days ago: due now
    put_history(client, h, fresh, [90, 70, 50, 30, 10, 1])  # refilled yesterday
    r = client.get("/plan/today?seconds=0.3", headers=h)
    assert r.status_code == 200, r.text
    plan = r.json()
    assert "lat" in plan["depot"] and "lon" in plan["depot"]
    table = {row["customer_id"]: row for row in plan["risk_table"]}
    assert table[due]["band"] in ("High", "Critical")
    assert table[fresh]["band"] == "Normal"
    assert [x["customer_id"] for x in plan["no_delivery_history"]] == [nohist]
    visited = [s["customer_id"] for rt in plan["routes"] for s in rt["stops"]]
    assert due in visited and fresh not in visited
