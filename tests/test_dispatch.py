from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from backend import security
from backend.app import create_app
from backend.models import User

SECRET = "test-secret-long-enough-for-hs256-signing-0123"


@pytest.fixture()
def client():
    app = create_app("sqlite://", ":memory:", SECRET)
    with app.state.SessionLocal() as s:
        s.add(User(username="boss", password_hash=security.hash_password("boss-password"), role="owner"))
        s.commit()
    return TestClient(app)


def headers(client, username="boss", password="boss-password"):
    r = client.post("/auth/login", json={"username": username, "password": password})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def add_driver(client, h, name):
    r = client.post("/users", json={"username": name, "password": "driver-pass-1", "role": "driver"}, headers=h)
    assert r.status_code == 201
    return headers(client, name, "driver-pass-1")


def add_customer(client, h, name, lat=31.42, lon=73.08):
    r = client.post("/customers", json={"name": name, "lat": lat, "lon": lon, "address": "Street 1", "phone": "0300"}, headers=h)
    return r.json()["id"]


def history(client, h, cid, days_ago):
    for n in days_ago:
        d = (date.today() - timedelta(days=n)).isoformat()
        client.post("/deliveries", json={"customer_id": cid, "delivered_on": d}, headers=h)


def test_urgent_customer_without_history_is_planned_and_closed(client):
    h = headers(client)
    cid = add_customer(client, h, "New customer")
    assert client.post("/urgent", json={"customer_id": cid, "note": "ran out"}, headers=h).status_code == 201
    assert client.post("/urgent", json={"customer_id": 999}, headers=h).status_code == 404
    plan = client.get("/plan/today?seconds=0.3", headers=h).json()
    row = [r for r in plan["risk_table"] if r["customer_id"] == cid][0]
    assert row["urgent"] and row["band"] == "Urgent"
    assert plan["no_delivery_history"] == []
    visited = [s["customer_id"] for rt in plan["routes"] for s in rt["stops"]]
    assert cid in visited
    client.post("/deliveries", json={"customer_id": cid}, headers=h)
    assert client.get("/urgent", headers=h).json() == []


def test_publish_assign_and_driver_flow(client):
    h = headers(client)
    ali = add_driver(client, h, "ali")
    omar = add_driver(client, h, "omar")
    ids = [add_customer(client, h, f"Due {i}", 31.40 + i * 0.01, 73.05 + i * 0.01) for i in range(3)]
    for cid in ids:
        history(client, h, cid, [100, 80, 60, 40, 20])            # due now

    r = client.post("/plan/publish", json={"seconds": 0.3}, headers=h)
    assert r.status_code == 201, r.text
    routes = r.json()
    assert sum(x["total"] for x in routes) >= 3
    for rt in routes:
        assert client.patch(f"/routes/{rt['route_id']}/assign", json={"username": "ali"}, headers=h).status_code == 200
    assert client.patch(f"/routes/{routes[0]['route_id']}/assign", json={"username": "nobody"}, headers=h).status_code == 404

    mine = client.get("/my-routes", headers=ali).json()
    assert client.get("/my-routes", headers=omar).json() == []
    stops = [s for rt in mine for s in rt["stops"]]
    assert len(stops) >= 3

    assert client.post(f"/route-stops/{stops[0]['stop_id']}/deliver", json={}, headers=omar).status_code == 403
    assert client.post(f"/route-stops/{stops[0]['stop_id']}/deliver", json={}, headers=ali).status_code == 200
    assert client.post(f"/route-stops/{stops[0]['stop_id']}/deliver", json={}, headers=ali).status_code == 409
    assert client.post(f"/route-stops/{stops[1]['stop_id']}/skip", json={"reason": "customer away"}, headers=ali).status_code == 200
    assert client.post(f"/route-stops/{stops[2]['stop_id']}/skip", json={"reason": ""}, headers=ali).status_code == 422

    view = client.get("/routes", headers=h).json()
    assert sum(x["delivered"] for x in view) == 1 and sum(x["skipped"] for x in view) == 1
    assert client.post("/plan/publish", json={"seconds": 0.3}, headers=h).status_code == 409   # in progress

    audit = client.get("/audit/verify", headers=h).json()
    assert audit["ok"], audit


def test_republish_before_work_starts_replaces_routes(client):
    h = headers(client)
    cid = add_customer(client, h, "Due")
    history(client, h, cid, [100, 80, 60, 40, 20])
    first = client.post("/plan/publish", json={"seconds": 0.3}, headers=h)
    second = client.post("/plan/publish", json={"seconds": 0.3}, headers=h)
    assert first.status_code == 201 and second.status_code == 201
    assert len(client.get("/routes", headers=h).json()) == len(second.json())


def test_driver_cannot_publish_or_assign(client):
    h = headers(client)
    ali = add_driver(client, h, "ali")
    assert client.post("/plan/publish", json={}, headers=ali).status_code == 403
    assert client.patch("/routes/1/assign", json={"username": "ali"}, headers=ali).status_code == 403
    assert client.post("/urgent", json={"customer_id": 1}, headers=ali).status_code == 403
