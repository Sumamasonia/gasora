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



def test_customer_creation_defaults(client):
    h = headers(client)
    r = client.post("/customers", json={"name": "Alice", "lat": 31.42, "lon": 73.08}, headers=h)
    assert r.status_code == 201
    data = r.json()
    assert data["name"] == "Alice"
    assert data["customer_type"] == "domestic"
    assert data["cylinder_type"] == "11.8 kg"
    assert data["is_active"] is True
    assert "created_at" in data


def test_get_customer_by_id(client):
    h_owner = headers(client)
    client.post("/users", json={"username": "driver_bob", "password": "driver-password-1", "role": "driver"}, headers=h_owner)
    h_driver = headers(client, "driver_bob", "driver-password-1")

    cid = add_customer(client, h_owner, name="Bob Cust")

    # No token -> 401
    assert client.get(f"/customers/{cid}").status_code == 401

    # Unknown id -> 404
    assert client.get("/customers/9999", headers=h_owner).status_code == 404
    assert client.get("/customers/9999", headers=h_driver).status_code == 404

    # Owner gets 200
    r_owner = client.get(f"/customers/{cid}", headers=h_owner)
    assert r_owner.status_code == 200
    assert r_owner.json()["id"] == cid
    assert r_owner.json()["name"] == "Bob Cust"
    assert r_owner.json()["is_active"] is True

    # Driver gets 200
    r_driver = client.get(f"/customers/{cid}", headers=h_driver)
    assert r_driver.status_code == 200
    assert r_driver.json()["id"] == cid


def test_put_customer(client):
    h_owner = headers(client)
    client.post("/users", json={"username": "driver_carl", "password": "driver-password-1", "role": "driver"}, headers=h_owner)
    h_driver = headers(client, "driver_carl", "driver-password-1")

    cid = add_customer(client, h_owner, name="Carl Cust", lat=31.45, lon=73.12, demand=2)

    # Driver gets 403
    assert client.put(f"/customers/{cid}", json={"phone": "03001234567"}, headers=h_driver).status_code == 403

    # Invalid customer_type gives 422 (including legacy home, shop, restaurant)
    assert client.put(f"/customers/{cid}", json={"customer_type": "factory"}, headers=h_owner).status_code == 422
    assert client.put(f"/customers/{cid}", json={"customer_type": "home"}, headers=h_owner).status_code == 422
    assert client.put(f"/customers/{cid}", json={"customer_type": "restaurant"}, headers=h_owner).status_code == 422

    # Owner changes phone and customer_type
    r = client.put(f"/customers/{cid}", json={"phone": "03009999999", "customer_type": "commercial"}, headers=h_owner)
    assert r.status_code == 200
    updated = r.json()
    assert updated["phone"] == "03009999999"
    assert updated["customer_type"] == "commercial"
    # other fields stay unchanged
    assert updated["name"] == "Carl Cust"
    assert updated["lat"] == 31.45
    assert updated["lon"] == 73.12
    assert updated["demand"] == 2
    assert updated["cylinder_type"] == "11.8 kg"
    assert updated["is_active"] is True

    # Check via GET
    r_get = client.get(f"/customers/{cid}", headers=h_owner).json()
    assert r_get["phone"] == "03009999999"
    assert r_get["customer_type"] == "commercial"
    assert r_get["demand"] == 2


def test_delete_customer_soft_delete(client):
    h_owner = headers(client)
    client.post("/users", json={"username": "driver_dan", "password": "driver-password-1", "role": "driver"}, headers=h_owner)
    h_driver = headers(client, "driver_dan", "driver-password-1")

    cid = add_customer(client, h_owner, name="Dan Cust")

    # Driver gets 403
    assert client.delete(f"/customers/{cid}", headers=h_driver).status_code == 403

    # Owner gets 200
    r = client.delete(f"/customers/{cid}", headers=h_owner)
    assert r.status_code == 200
    assert r.json()["is_active"] is False

    # The row still exists (GET by id works and shows is_active false)
    r_get = client.get(f"/customers/{cid}", headers=h_owner)
    assert r_get.status_code == 200
    assert r_get.json()["is_active"] is False

    # Default list returns all customers (including inactive)
    r_list = client.get("/customers", headers=h_owner).json()
    assert cid in [c["id"] for c in r_list]
    inactive_cust = next(c for c in r_list if c["id"] == cid)
    assert inactive_cust["is_active"] is False

    # active_only=true hides it
    r_list_active = client.get("/customers?active_only=true", headers=h_owner).json()
    assert cid not in [c["id"] for c in r_list_active]

    # Deleting twice does not fail
    r2 = client.delete(f"/customers/{cid}", headers=h_owner)
    assert r2.status_code == 200
    assert r2.json()["is_active"] is False


def test_plan_excludes_inactive_customer(client):
    h = headers(client)
    active_cid = add_customer(client, h, "Active Customer", 31.43, 73.09)
    inactive_cid = add_customer(client, h, "Inactive Customer", 31.42, 73.08)

    put_history(client, h, active_cid, [100, 80, 60, 40, 20])
    put_history(client, h, inactive_cid, [100, 80, 60, 40, 20])

    # Deactivate inactive_cid
    client.delete(f"/customers/{inactive_cid}", headers=h)

    r = client.get("/plan/today?seconds=0.3", headers=h)
    assert r.status_code == 200
    plan = r.json()

    risk_cids = [row["customer_id"] for row in plan["risk_table"]]
    no_hist_cids = [x["customer_id"] for x in plan["no_delivery_history"]]
    visited_cids = [s["customer_id"] for rt in plan["routes"] for s in rt["stops"]]

    assert active_cid in risk_cids
    assert inactive_cid not in risk_cids
    assert inactive_cid not in no_hist_cids
    assert inactive_cid not in visited_cids


def test_auth_me(client):
    # No token -> 401
    assert client.get("/auth/me").status_code == 401
    assert client.get("/auth/me", headers={"Authorization": "Bearer badtoken"}).status_code == 401

    # Logged in owner
    h_owner = headers(client)
    r_owner = client.get("/auth/me", headers=h_owner)
    assert r_owner.status_code == 200
    data_owner = r_owner.json()
    assert data_owner["username"] == "boss"
    assert data_owner["role"] == "owner"
    assert "password_hash" not in data_owner
    assert "id" in data_owner

    # Logged in driver
    client.post("/users", json={"username": "driver_eva", "password": "driver-password-1", "role": "driver"}, headers=h_owner)
    h_driver = headers(client, "driver_eva", "driver-password-1")
    r_driver = client.get("/auth/me", headers=h_driver)
    assert r_driver.status_code == 200
    data_driver = r_driver.json()
    assert data_driver["username"] == "driver_eva"
    assert data_driver["role"] == "driver"
    assert "password_hash" not in data_driver


def test_eventlog_put_and_delete(client):
    import json
    h = headers(client)
    cid = add_customer(client, h, name="Event Cust")
    client.put(f"/customers/{cid}", json={"phone": "03001112233"}, headers=h)
    client.delete(f"/customers/{cid}", headers=h)

    # Verify audit chain
    r_audit = client.get("/audit/verify", headers=h).json()
    assert r_audit["ok"] is True

    # Verify the events exist in sqlite events table
    ev = client.app.state.events
    rows = ev.execute("SELECT event_type, payload FROM events ORDER BY id").fetchall()
    event_types = [row[0] for row in rows]
    assert "customer.created" in event_types
    assert "customer.updated" in event_types
    assert "customer.deactivated" in event_types

    # Check payload
    updated_ev = next(json.loads(row[1]) for row in rows if row[0] == "customer.updated")
    assert updated_ev["customer_id"] == cid
    assert "phone" in updated_ev["changed_fields"]

    deactivated_ev = next(json.loads(row[1]) for row in rows if row[0] == "customer.deactivated")
    assert deactivated_ev["customer_id"] == cid
