import pytest
from fastapi.testclient import TestClient

from backend import security
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
    return client.post("/auth/login", json={"username": username, "password": password})


def headers(client, username="boss", password="boss-password"):
    token = login(client, username, password).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def add_customer(client, h, name="Test Customer", lat=31.42, lon=73.08, demand=1):
    r = client.post("/customers", json={"name": name, "lat": lat, "lon": lon, "demand": demand}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def create_driver(client, h, username="driver1", password="driver-pass-123"):
    r = client.post("/users", json={"username": username, "password": password, "role": "driver"}, headers=h)
    assert r.status_code == 201, r.text
    return headers(client, username, password)


def test_register_cylinder(client):
    h_owner = headers(client)

    # 1. Unauthenticated -> 401
    assert client.post("/cylinders", json={"serial_no": "CYL-001"}).status_code == 401

    # 2. Driver cannot register -> 403
    h_driver = create_driver(client, h_owner)
    assert client.post("/cylinders", json={"serial_no": "CYL-001"}, headers=h_driver).status_code == 403

    # 3. Owner registers -> 201, state Empty, default cylinder_type & owner
    r = client.post("/cylinders", json={"serial_no": "CYL-001"}, headers=h_owner)
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["id"] is not None
    assert data["serial_no"] == "CYL-001"
    assert data["cylinder_type"] == "11.8 kg"
    assert data["state"] == "Empty"
    assert data["owner"] == "Company"
    assert data["customer_id"] is None
    assert "created_at" in data

    # 4. Duplicate serial_no -> 409
    r_dup = client.post("/cylinders", json={"serial_no": "CYL-001"}, headers=h_owner)
    assert r_dup.status_code == 409

    # 5. Register with custom type and owner
    r_cust = client.post("/cylinders", json={
        "serial_no": "CYL-CUST-001",
        "cylinder_type": "45.4 kg",
        "owner": "Customer"
    }, headers=h_owner)
    assert r_cust.status_code == 201
    assert r_cust.json()["owner"] == "Customer"
    assert r_cust.json()["cylinder_type"] == "45.4 kg"


def test_cylinder_lifecycle(client):
    h_owner = headers(client)
    cid = add_customer(client, h_owner, name="Ayesha")

    # Register
    r = client.post("/cylinders", json={"serial_no": "CYL-LIFE"}, headers=h_owner)
    assert r.status_code == 201
    cyl_id = r.json()["id"]
    assert r.json()["state"] == "Empty"
    assert r.json()["customer_id"] is None

    # Empty -> Filled
    r_fill = client.post(f"/cylinders/{cyl_id}/transition", json={"to_state": "Filled"}, headers=h_owner)
    assert r_fill.status_code == 200, r_fill.text
    assert r_fill.json()["state"] == "Filled"
    assert r_fill.json()["customer_id"] is None

    # Filled -> Delivered (with customer_id)
    r_deliv = client.post(f"/cylinders/{cyl_id}/transition", json={
        "to_state": "Delivered",
        "customer_id": cid,
        "note": "Delivered in morning"
    }, headers=h_owner)
    assert r_deliv.status_code == 200, r_deliv.text
    assert r_deliv.json()["state"] == "Delivered"
    assert r_deliv.json()["customer_id"] == cid

    # Delivered -> Recovered (clears customer_id)
    r_recov = client.post(f"/cylinders/{cyl_id}/transition", json={
        "to_state": "Recovered",
        "note": "Empty collected"
    }, headers=h_owner)
    assert r_recov.status_code == 200, r_recov.text
    assert r_recov.json()["state"] == "Recovered"
    assert r_recov.json()["customer_id"] is None

    # Recovered -> Filled
    r_fill2 = client.post(f"/cylinders/{cyl_id}/transition", json={"to_state": "Filled"}, headers=h_owner)
    assert r_fill2.status_code == 200, r_fill2.text
    assert r_fill2.json()["state"] == "Filled"
    assert r_fill2.json()["customer_id"] is None

    # Verify history (5 transactions, oldest first)
    r_hist = client.get(f"/cylinders/{cyl_id}/history", headers=h_owner)
    assert r_hist.status_code == 200, r_hist.text
    txns = r_hist.json()
    assert len(txns) == 5

    assert txns[0]["txn_type"] == "register"
    assert txns[0]["from_state"] is None
    assert txns[0]["to_state"] == "Empty"
    assert txns[0]["actor"] == "boss"
    assert txns[0]["event_id"] is not None

    assert txns[1]["txn_type"] == "transition"
    assert txns[1]["from_state"] == "Empty"
    assert txns[1]["to_state"] == "Filled"
    assert txns[1]["actor"] == "boss"

    assert txns[2]["txn_type"] == "transition"
    assert txns[2]["from_state"] == "Filled"
    assert txns[2]["to_state"] == "Delivered"
    assert txns[2]["customer_id"] == cid
    assert txns[2]["note"] == "Delivered in morning"

    assert txns[3]["txn_type"] == "transition"
    assert txns[3]["from_state"] == "Delivered"
    assert txns[3]["to_state"] == "Recovered"
    assert txns[3]["customer_id"] == cid  # recorded in transaction row
    assert txns[3]["note"] == "Empty collected"

    assert txns[4]["txn_type"] == "transition"
    assert txns[4]["from_state"] == "Recovered"
    assert txns[4]["to_state"] == "Filled"


def test_invalid_transitions(client):
    h_owner = headers(client)
    cid = add_customer(client, h_owner, name="Bilal")

    r = client.post("/cylinders", json={"serial_no": "CYL-INVALID"}, headers=h_owner)
    cyl_id = r.json()["id"]

    # Empty -> Delivered (409)
    assert client.post(f"/cylinders/{cyl_id}/transition", json={
        "to_state": "Delivered", "customer_id": cid
    }, headers=h_owner).status_code == 409

    # Empty -> Recovered (409)
    assert client.post(f"/cylinders/{cyl_id}/transition", json={
        "to_state": "Recovered"
    }, headers=h_owner).status_code == 409

    # Empty -> Filled (valid)
    assert client.post(f"/cylinders/{cyl_id}/transition", json={
        "to_state": "Filled"
    }, headers=h_owner).status_code == 200

    # Filled -> Recovered (409)
    assert client.post(f"/cylinders/{cyl_id}/transition", json={
        "to_state": "Recovered"
    }, headers=h_owner).status_code == 409

    # Filled -> Empty (409)
    assert client.post(f"/cylinders/{cyl_id}/transition", json={
        "to_state": "Empty"
    }, headers=h_owner).status_code == 409

    # Delivered without customer_id (409)
    assert client.post(f"/cylinders/{cyl_id}/transition", json={
        "to_state": "Delivered"
    }, headers=h_owner).status_code == 409

    # Delivered with unknown customer (404)
    assert client.post(f"/cylinders/{cyl_id}/transition", json={
        "to_state": "Delivered", "customer_id": 99999
    }, headers=h_owner).status_code == 404

    # Unknown cylinder id (404)
    assert client.post("/cylinders/99999/transition", json={
        "to_state": "Filled"
    }, headers=h_owner).status_code == 404
    assert client.get("/cylinders/99999", headers=h_owner).status_code == 404
    assert client.get("/cylinders/99999/history", headers=h_owner).status_code == 404


def test_driver_permissions(client):
    h_owner = headers(client)
    h_driver = create_driver(client, h_owner, username="tariq")
    cid = add_customer(client, h_owner, name="Driver Customer")

    r_cyl = client.post("/cylinders", json={"serial_no": "CYL-DRIVER"}, headers=h_owner)
    cyl_id = r_cyl.json()["id"]

    # Driver CAN read cylinders list
    r_list = client.get("/cylinders", headers=h_driver)
    assert r_list.status_code == 200
    assert any(c["id"] == cyl_id for c in r_list.json())

    # Driver CAN get cylinder by id
    r_get = client.get(f"/cylinders/{cyl_id}", headers=h_driver)
    assert r_get.status_code == 200
    assert r_get.json()["serial_no"] == "CYL-DRIVER"

    # Driver CAN perform transition Empty -> Filled
    r_t1 = client.post(f"/cylinders/{cyl_id}/transition", json={"to_state": "Filled"}, headers=h_driver)
    assert r_t1.status_code == 200

    # Driver CAN perform transition Filled -> Delivered
    r_t2 = client.post(f"/cylinders/{cyl_id}/transition", json={
        "to_state": "Delivered", "customer_id": cid
    }, headers=h_driver)
    assert r_t2.status_code == 200
    assert r_t2.json()["customer_id"] == cid

    # Driver CAN view history and actor is recorded as 'tariq'
    r_hist = client.get(f"/cylinders/{cyl_id}/history", headers=h_driver)
    assert r_hist.status_code == 200
    txns = r_hist.json()
    assert txns[-1]["actor"] == "tariq"
    assert txns[-1]["to_state"] == "Delivered"

    # Driver CANNOT view summary (owner only)
    assert client.get("/cylinders/summary", headers=h_driver).status_code == 403


def test_cylinder_summary_and_filters(client):
    h_owner = headers(client)
    c_a = add_customer(client, h_owner, name="Cust A")
    c_b = add_customer(client, h_owner, name="Cust B")

    # Cylinder 1: Empty (Company)
    c1 = client.post("/cylinders", json={"serial_no": "S-01"}, headers=h_owner).json()["id"]

    # Cylinder 2: Delivered to A (Company)
    c2 = client.post("/cylinders", json={"serial_no": "S-02"}, headers=h_owner).json()["id"]
    client.post(f"/cylinders/{c2}/transition", json={"to_state": "Filled"}, headers=h_owner)
    client.post(f"/cylinders/{c2}/transition", json={"to_state": "Delivered", "customer_id": c_a}, headers=h_owner)

    # Cylinder 3: Delivered to A (Company)
    c3 = client.post("/cylinders", json={"serial_no": "S-03"}, headers=h_owner).json()["id"]
    client.post(f"/cylinders/{c3}/transition", json={"to_state": "Filled"}, headers=h_owner)
    client.post(f"/cylinders/{c3}/transition", json={"to_state": "Delivered", "customer_id": c_a}, headers=h_owner)

    # Cylinder 4: Delivered to B (Customer owned)
    c4 = client.post("/cylinders", json={"serial_no": "S-04", "owner": "Customer"}, headers=h_owner).json()["id"]
    client.post(f"/cylinders/{c4}/transition", json={"to_state": "Filled"}, headers=h_owner)
    client.post(f"/cylinders/{c4}/transition", json={"to_state": "Delivered", "customer_id": c_b}, headers=h_owner)

    # Summary
    r_sum = client.get("/cylinders/summary", headers=h_owner)
    assert r_sum.status_code == 200, r_sum.text
    summary = r_sum.json()

    # Check by_state includes all four states with correct counts
    assert summary["by_state"] == {
        "Empty": 1,
        "Filled": 0,
        "Delivered": 3,
        "Recovered": 0,
    }

    # Check by_owner
    assert summary["by_owner"]["Company"] == 3
    assert summary["by_owner"]["Customer"] == 1

    # Check held_by_customers
    held = {item["customer_id"]: item for item in summary["held_by_customers"]}
    assert held[c_a]["cylinders"] == 2
    assert held[c_a]["name"] == "Cust A"
    assert held[c_b]["cylinders"] == 1
    assert held[c_b]["name"] == "Cust B"

    # Test filters on GET /cylinders
    # Filter by state
    r_empty = client.get("/cylinders?state=Empty", headers=h_owner).json()
    assert len(r_empty) == 1 and r_empty[0]["id"] == c1

    r_deliv = client.get("/cylinders?state=Delivered", headers=h_owner).json()
    assert len(r_deliv) == 3

    # Filter by owner
    r_cust_owner = client.get("/cylinders?owner=Customer", headers=h_owner).json()
    assert len(r_cust_owner) == 1 and r_cust_owner[0]["id"] == c4

    # Filter by customer_id
    r_cust_a = client.get(f"/cylinders?customer_id={c_a}", headers=h_owner).json()
    assert len(r_cust_a) == 2


def test_event_log_and_audit(client):
    h_owner = headers(client)
    cid = add_customer(client, h_owner, name="Audit Cust")

    r_reg = client.post("/cylinders", json={"serial_no": "CYL-AUDIT"}, headers=h_owner)
    cyl_id = r_reg.json()["id"]

    client.post(f"/cylinders/{cyl_id}/transition", json={"to_state": "Filled"}, headers=h_owner)
    client.post(f"/cylinders/{cyl_id}/transition", json={
        "to_state": "Delivered", "customer_id": cid
    }, headers=h_owner)

    # Check audit verification
    r_audit = client.get("/audit/verify", headers=h_owner)
    assert r_audit.status_code == 200, r_audit.text
    audit = r_audit.json()
    assert audit["ok"] is True

    # Verify event types in app events database
    events = client.app.state.events
    types = [row[0] for row in events.execute("SELECT event_type FROM events ORDER BY id ASC").fetchall()]
    assert "cylinder.registered" in types
    assert "cylinder.transition" in types

