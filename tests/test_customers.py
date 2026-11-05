import json
from datetime import date, timedelta
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text

from backend import security
from backend.app import create_app
from backend.models import Customer, Delivery, Route, RouteStop, UrgentRequest, User


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


def add_customer(client, h, name="Test Cust", lat=31.42, lon=73.08, demand=1, phone="03001234567", address="Main St"):
    r = client.post("/customers", json={
        "name": name, "lat": lat, "lon": lon, "demand": demand, "phone": phone, "address": address
    }, headers=h)
    assert r.status_code == 201, r.text
    return r.json()["id"]


# FIX 1 tests
def test_customer_update_rejects_nulls(client):
    h = headers(client)
    cid = add_customer(client, h, name="Original Name", demand=2, lat=31.40, lon=73.10)

    # Reject nulls on the 7 forbidden fields
    forbidden_null_fields = [
        "name", "demand", "lat", "lon", "is_active", "customer_type", "cylinder_type"
    ]
    for field in forbidden_null_fields:
        r = client.put(f"/customers/{cid}", json={field: None}, headers=h)
        assert r.status_code == 422, f"Expected 422 for null {field}, got {r.status_code}: {r.text}"
        # verify customer is unchanged
        cust = client.get(f"/customers/{cid}", headers=h).json()
        assert cust["name"] == "Original Name"
        assert cust["demand"] == 2
        assert cust["lat"] == 31.40
        assert cust["lon"] == 73.10
        assert cust["is_active"] is True
        assert cust["customer_type"] == "domestic"
        assert cust["cylinder_type"] == "11.8 kg"

    # phone and address CAN be set to null
    r_phone = client.put(f"/customers/{cid}", json={"phone": None}, headers=h)
    assert r_phone.status_code == 200
    assert r_phone.json()["phone"] is None

    r_addr = client.put(f"/customers/{cid}", json={"address": None}, headers=h)
    assert r_addr.status_code == 200
    assert r_addr.json()["address"] is None

    # Omitted fields stay unchanged
    r_omit = client.put(f"/customers/{cid}", json={"demand": 3}, headers=h)
    assert r_omit.status_code == 200
    res = r_omit.json()
    assert res["demand"] == 3
    assert res["name"] == "Original Name"
    assert res["phone"] is None
    assert res["address"] is None


# FIX 2 test
def test_schema_upgrade_on_old_database(tmp_path):
    db_file = tmp_path / "legacy.db"
    events_file = tmp_path / "legacy_events.db"
    db_url = f"sqlite:///{db_file}"

    # 1. Create table using raw SQL without the new columns
    raw_engine = create_engine(db_url)
    with raw_engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE customers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(100) NOT NULL,
                phone VARCHAR(30),
                address VARCHAR(200),
                lat FLOAT NOT NULL,
                lon FLOAT NOT NULL,
                demand INTEGER NOT NULL
            )
        """))
        conn.execute(text("""
            INSERT INTO customers (name, phone, address, lat, lon, demand)
            VALUES ('Legacy Shop', '03001111111', 'Old Market', 31.41, 73.09, 2)
        """))
    raw_engine.dispose()

    # 2. Start create_app on it
    app = create_app(db_url=db_url, events_path=str(events_file), secret="test-secret-long-enough-for-hs256-signing-0123", routing="straight")
    with app.state.SessionLocal() as s:
        s.add(User(username="boss", password_hash=security.hash_password("boss-password"), role="owner"))
        s.commit()
    c = TestClient(app)
    h = headers(c)

    # 3. Old row returned with defaults
    r = c.get("/customers/1", headers=h)
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "Legacy Shop"
    assert data["customer_type"] == "domestic"
    assert data["cylinder_type"] == "11.8 kg"
    assert data["is_active"] is True
    assert data["created_at"] is not None

    # 4. New customer can be created and updated
    r_new = c.post("/customers", json={"name": "Fresh Co", "lat": 31.42, "lon": 73.08}, headers=h)
    assert r_new.status_code == 201
    new_id = r_new.json()["id"]
    r_up = c.put(f"/customers/{new_id}", json={"customer_type": "commercial"}, headers=h)
    assert r_up.status_code == 200
    assert r_up.json()["customer_type"] == "commercial"

    # 5. Starting a second time changes nothing
    app2 = create_app(db_url=db_url, events_path=str(events_file), secret="test-secret-long-enough-for-hs256-signing-0123", routing="straight")
    c2 = TestClient(app2)
    h2 = headers(c2)
    r2 = c2.get("/customers/1", headers=h2)
    assert r2.status_code == 200
    assert r2.json()["name"] == "Legacy Shop"
    assert r2.json()["customer_type"] == "domestic"


# FIX 3 tests
def test_inactive_customer_rejected_in_deliveries_and_urgent(client):
    h = headers(client)
    cid = add_customer(client, h, name="Inactive Cust")
    client.delete(f"/customers/{cid}", headers=h)

    events_before = client.app.state.events.execute("SELECT COUNT(*) FROM events").fetchone()[0]

    # POST /deliveries -> 409
    r_del = client.post("/deliveries", json={"customer_id": cid, "cylinders": 1}, headers=h)
    assert r_del.status_code == 409
    assert "customer is inactive" in r_del.text
    # No row written
    with client.app.state.SessionLocal() as s:
        assert s.scalar(select(Delivery).where(Delivery.customer_id == cid)) is None

    # POST /urgent -> 409
    r_urg = client.post("/urgent", json={"customer_id": cid, "note": "Needs gas"}, headers=h)
    assert r_urg.status_code == 409
    assert "customer is inactive" in r_urg.text
    # No row written
    with client.app.state.SessionLocal() as s:
        assert s.scalar(select(UrgentRequest).where(UrgentRequest.customer_id == cid)) is None

    # Stop completion path -> 409
    # Setup a route and stop for today
    with client.app.state.SessionLocal() as s:
        user = s.scalar(select(User).where(User.username == "boss"))
        route = Route(day=date.today(), vehicle=1, minutes=30, driver_id=user.id)
        s.add(route)
        s.flush()
        stop = RouteStop(route_id=route.id, seq=1, customer_id=cid, risk=0.9, band="High", status="pending")
        s.add(stop)
        s.commit()
        stop_id = stop.id

    r_stop = client.post(f"/route-stops/{stop_id}/deliver", json={}, headers=h)
    assert r_stop.status_code == 409
    assert "customer is inactive" in r_stop.text

    # Stop is still pending
    with client.app.state.SessionLocal() as s:
        st = s.get(RouteStop, stop_id)
        assert st.status == "pending"
        assert st.delivery_id is None

    # No new events written across any of these failed attempts
    events_after = client.app.state.events.execute("SELECT COUNT(*) FROM events").fetchone()[0]
    assert events_after == events_before

    # Unknown customer returns 404
    assert client.post("/deliveries", json={"customer_id": 99999}, headers=h).status_code == 404
    assert client.post("/urgent", json={"customer_id": 99999, "note": "Unknown"}, headers=h).status_code == 404


def test_open_urgent_filters_inactive_customers(client):
    h = headers(client)
    cid = add_customer(client, h, name="Urgent Cust")

    # Create urgent request
    r_urg = client.post("/urgent", json={"customer_id": cid, "note": "Urgent LPG"}, headers=h)
    assert r_urg.status_code == 201

    # Shows in open_urgent
    r_list = client.get("/urgent", headers=h).json()
    assert any(u["customer_id"] == cid for u in r_list)

    # Deactivate customer
    client.delete(f"/customers/{cid}", headers=h)

    # Does NOT show in open_urgent now
    r_list2 = client.get("/urgent", headers=h).json()
    assert not any(u["customer_id"] == cid for u in r_list2)

    # Reactivate customer (PUT is_active: True)
    r_reactivate = client.put(f"/customers/{cid}", json={"is_active": True}, headers=h)
    assert r_reactivate.status_code == 200
    assert r_reactivate.json()["is_active"] is True

    # Shows in open_urgent again!
    r_list3 = client.get("/urgent", headers=h).json()
    assert any(u["customer_id"] == cid for u in r_list3)


# FIX 4 tests
def test_repeated_delete_and_put_event_rules(client):
    h = headers(client)
    cid = add_customer(client, h, name="Event Rules Cust")

    # Count customer.deactivated events
    def count_events(event_type):
        ev = client.app.state.events
        return ev.execute("SELECT COUNT(*) FROM events WHERE event_type = ?", (event_type,)).fetchone()[0]

    # First delete: should log 1 customer.deactivated event
    r1 = client.delete(f"/customers/{cid}", headers=h)
    assert r1.status_code == 200
    assert count_events("customer.deactivated") == 1

    # Second delete: should return 200 but NOT log a second customer.deactivated event
    r2 = client.delete(f"/customers/{cid}", headers=h)
    assert r2.status_code == 200
    assert count_events("customer.deactivated") == 1

    # Reactivate to test PUT
    client.put(f"/customers/{cid}", json={"is_active": True}, headers=h)
    before_updated = count_events("customer.updated")

    # PUT with no change (same name): should NOT write customer.updated event
    r_no_change = client.put(f"/customers/{cid}", json={"name": "Event Rules Cust"}, headers=h)
    assert r_no_change.status_code == 200
    assert count_events("customer.updated") == before_updated

    # PUT with empty body: should NOT write customer.updated event
    r_empty = client.put(f"/customers/{cid}", json={}, headers=h)
    assert r_empty.status_code == 200
    assert count_events("customer.updated") == before_updated

    # PUT with actual change: SHOULD write customer.updated event
    r_change = client.put(f"/customers/{cid}", json={"name": "New Changed Name"}, headers=h)
    assert r_change.status_code == 200
    assert count_events("customer.updated") == before_updated + 1


# FIX 5 tests
def test_customer_type_proposal_values(client):
    h = headers(client)

    # Allowed values on POST: domestic, commercial
    r_dom = client.post("/customers", json={"name": "Dom Cust", "lat": 31.4, "lon": 73.1, "customer_type": "domestic"}, headers=h)
    assert r_dom.status_code == 201
    assert r_dom.json()["customer_type"] == "domestic"

    r_com = client.post("/customers", json={"name": "Com Cust", "lat": 31.4, "lon": 73.1, "customer_type": "commercial"}, headers=h)
    assert r_com.status_code == 201
    assert r_com.json()["customer_type"] == "commercial"

    # Default is domestic
    r_def = client.post("/customers", json={"name": "Def Cust", "lat": 31.4, "lon": 73.1}, headers=h)
    assert r_def.status_code == 201
    assert r_def.json()["customer_type"] == "domestic"

    # Legacy values (home, shop, restaurant) give 422
    for legacy_val in ["home", "shop", "restaurant"]:
        r_fail = client.post("/customers", json={"name": "Fail Cust", "lat": 31.4, "lon": 73.1, "customer_type": legacy_val}, headers=h)
        assert r_fail.status_code == 422

        r_put_fail = client.put(f"/customers/{r_dom.json()['id']}", json={"customer_type": legacy_val}, headers=h)
        assert r_put_fail.status_code == 422
