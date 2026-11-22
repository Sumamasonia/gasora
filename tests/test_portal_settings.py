from datetime import date, timedelta

import pytest

from backend import portal, runtime
from tests.test_dispatch import add_customer, add_driver, client, headers  # noqa: F401  (fixtures and helpers)


def make(client, h, name, role, customer_id=None):
    body = {"username": name, "password": "password-123", "role": role}
    if customer_id is not None:
        body["customer_id"] = customer_id
    r = client.post("/users", json=body, headers=h)
    assert r.status_code == 201, r.text
    return headers(client, name, "password-123")


def deliver(client, h, cid, cylinders=1, days_ago=0):
    d = (date.today() - timedelta(days=days_ago)).isoformat()
    assert client.post("/deliveries", json={"customer_id": cid, "cylinders": cylinders, "delivered_on": d}, headers=h).status_code == 201


# ---------- settings ----------
def test_settings_defaults_save_and_validation(client):
    h = headers(client)
    s = client.get("/settings", headers=h).json()
    assert s["currency"] == "Rs" and s["overdue_days"] == 15 and s["low_stock_threshold"] == 10
    r = client.put("/settings", json={"currency": "PKR", "overdue_days": 20, "depot_lat": 31.5, "depot_lon": 73.1}, headers=h)
    assert r.status_code == 200 and r.json()["currency"] == "PKR" and r.json()["depot_lat"] == 31.5
    assert client.get("/settings/public", headers=h).json() == {"currency": "PKR"}
    for bad in ({"currency": ""}, {"currency": "TOOLONGCUR"}, {"overdue_days": 0}, {"overdue_days": 99},
                {"depot_lat": 95.0, "depot_lon": 73.0}, {"depot_lat": 31.0}):
        assert client.put("/settings", json=bad, headers=h).status_code == 422, bad
    assert client.get("/settings", headers=h).json()["currency"] == "PKR"            # bad requests changed nothing
    types = [e["event_type"] for e in client.get("/audit/events", headers=h).json()]
    assert "settings.changed" in types


def test_settings_are_owner_only_but_currency_is_public_to_any_login(client):
    h = headers(client)
    dh = add_driver(client, h, "dri")
    assert client.get("/settings", headers=dh).status_code == 403
    assert client.put("/settings", json={"currency": "X"}, headers=dh).status_code == 403
    assert client.get("/settings/public", headers=dh).status_code == 200
    assert client.get("/settings/public").status_code in (401, 403)


def test_settings_survive_a_restart(tmp_path):
    from fastapi.testclient import TestClient
    from backend import security
    from backend.app import create_app
    from backend.models import User
    args = (f"sqlite:///{tmp_path / 'a.db'}", str(tmp_path / 'e.db'), "test-secret-long-enough-for-hs256-signing-0123")
    app = create_app(*args, routing="straight")
    with app.state.SessionLocal() as s:
        s.add(User(username="boss", password_hash=security.hash_password("boss-password"), role="owner")); s.commit()
    c = TestClient(app)
    h = headers(c)
    c.put("/settings", json={"currency": "PKR", "overdue_days": 10}, headers=h)
    app.state.engine.dispose(); app.state.events.close()
    runtime.reset()
    app2 = create_app(*args, routing="straight")
    assert runtime.currency() == "PKR" and runtime.overdue_days() == 10


def test_overdue_days_sets_the_first_ageing_tier_and_labels():
    runtime.reset()
    assert [t[2] for t in runtime.ageing_tiers()] == ["15-29", "30-59", "60-89", "90+"]
    runtime._state["overdue_days"] = 7
    assert [(t[0], t[2]) for t in runtime.ageing_tiers()] == [(7, "7-29"), (30, "30-59"), (60, "60-89"), (90, "90+")]
    runtime._state["overdue_days"] = 45
    assert [(t[0], t[2]) for t in runtime.ageing_tiers()] == [(45, "45-59"), (60, "60-89"), (90, "90+")]
    runtime.reset()


def test_depot_and_overdue_reach_the_plan_and_empties_summary(client):
    h = headers(client)
    client.put("/settings", json={"depot_lat": 31.0, "depot_lon": 73.5, "overdue_days": 10}, headers=h)
    assert client.get("/plan/today?seconds=0.2", headers=h).json()["depot"] == {"lat": 31.0, "lon": 73.5}
    assert client.get("/empties", headers=h).json()["overdue_after_days"] == 10


def test_currency_appears_in_the_whatsapp_text(client):
    h = headers(client)
    cid = add_customer(client, h, "A")
    client.put("/settings/price", json={"unit_price": 3000}, headers=h)
    deliver(client, h, cid, 2)
    client.put("/settings", json={"currency": "PKR"}, headers=h)
    assert "PKR 6,000" in client.get("/invoices/1/share", headers=h).json()["text"]


# ---------- manager ----------
def test_manager_can_enter_sales_purchases_expenses_and_payments_but_not_set_prices_or_users(client):
    h = headers(client)
    cid = add_customer(client, h, "A")
    client.put("/settings/price", json={"unit_price": 3000}, headers=h)
    mh = make(client, h, "mgr", "manager")
    assert client.get("/customers", headers=mh).status_code == 200
    assert client.post("/deliveries", json={"customer_id": cid, "cylinders": 1}, headers=mh).status_code == 201
    assert client.post("/payments", json={"customer_id": cid, "amount": 1000}, headers=mh).status_code == 201
    assert client.post("/stock/purchase", json={"quantity": 5, "unit_cost": 2500}, headers=mh).status_code == 201
    assert client.post("/expenses", json={"category": "fuel", "amount": 500}, headers=mh).status_code == 201
    for url in ("/stock", "/expenses", "/receivables", f"/ledger/{cid}", "/settings/price"):
        assert client.get(url, headers=mh).status_code == 200, url
    assert [e["actor"] for e in client.get("/audit/events", headers=h).json() if e["event_type"] == "delivery.recorded"] == ["mgr"]
    for method, url, body in [("put", "/settings/price", {"unit_price": 1}), ("post", "/ledger/adjust", {"customer_id": cid, "amount": -5, "note": "x"}),
                              ("post", "/users", {"username": "zzz", "password": "password-123", "role": "owner"}),
                              ("post", "/stock/adjust", {"delta": 1, "note": "x"}), ("put", "/settings", {"currency": "X"}),
                              ("post", "/customers", {"name": "N", "lat": 1, "lon": 1})]:
        assert getattr(client, method)(url, json=body, headers=mh).status_code == 403, url
    for url in ("/reports/dashboard", "/export/ledger.csv", "/backup", "/staff/activity", "/notes", "/assistant", "/audit/events",
                "/settings", "/users", "/urgent"):
        assert client.get(url, headers=mh).status_code == 403, url


# ---------- customer accounts ----------
def test_customer_account_needs_a_real_unlinked_customer(client):
    h = headers(client)
    cid = add_customer(client, h, "A")
    body = {"username": "cust1", "password": "password-123", "role": "customer"}
    assert client.post("/users", json=body, headers=h).status_code == 422
    assert client.post("/users", json={**body, "customer_id": 999}, headers=h).status_code == 422
    assert client.post("/users", json={**body, "customer_id": cid}, headers=h).status_code == 201
    assert client.post("/users", json={**body, "username": "cust2", "customer_id": cid}, headers=h).status_code == 409
    assert client.post("/users", json={"username": "drv2", "password": "password-123", "role": "driver", "customer_id": cid}, headers=h).status_code == 422
    assert [u for u in client.get("/users", headers=h).json() if u["username"] == "cust1"][0]["customer_id"] == cid


def test_customer_sees_only_their_own_data(client):
    h = headers(client)
    a, b = add_customer(client, h, "Alpha"), add_customer(client, h, "Beta")
    client.put("/settings/price", json={"unit_price": 3000}, headers=h)
    for days in (60, 40, 20, 0):
        deliver(client, h, a, 1, days_ago=days)
    deliver(client, h, b, 3)
    client.post("/payments", json={"customer_id": a, "amount": 1000}, headers=h)
    client.post("/ledger/adjust", json={"customer_id": a, "amount": 50, "note": "internal: customer is difficult"}, headers=h)
    ah = make(client, h, "alpha", "customer", a)
    me = client.get("/me", headers=ah).json()
    assert me["name"] == "Alpha" and me["balance"] == 4 * 3000 - 1000 + 50
    assert me["last_delivery"] == date.today().isoformat() and "about every 20 days" in me["next_expected"].lower()
    kinds = {e["kind"] for e in me["entries"]}
    assert kinds == {"Bill", "Payment", "Adjustment"}
    assert "difficult" not in str(me) and "Beta" not in str(me) and "boss" not in str(me)      # no internal notes, no staff names
    bh = make(client, h, "beta", "customer", b)
    assert client.get("/me", headers=bh).json()["balance"] == 9000
    # a customer cannot use anything meant for staff
    for url in ("/customers", "/receivables", f"/ledger/{a}", "/stock", "/expenses", "/reports/dashboard", "/plan/today", "/urgent",
                "/deliveries", "/users", "/settings", "/backup", "/audit/events", "/requests", "/my-routes"):
        assert client.get(url, headers=ah).status_code == 403, url
    assert client.post("/deliveries", json={"customer_id": a}, headers=ah).status_code == 403
    assert client.post("/payments", json={"customer_id": a, "amount": 1}, headers=ah).status_code == 403
    assert client.get("/me", headers=h).status_code == 403                                     # staff have no /me


def test_customer_invoices_cannot_be_read_across_customers(client):
    h = headers(client)
    a, b = add_customer(client, h, "Alpha"), add_customer(client, h, "Beta")
    client.put("/settings/price", json={"unit_price": 3000}, headers=h)
    deliver(client, h, a); deliver(client, h, b)                       # invoices 1 (Alpha) and 2 (Beta)
    ah = make(client, h, "alpha", "customer", a)
    assert client.get("/me/invoices/2/pdf", headers=ah).status_code == 404
    assert client.get("/me/invoices/99/pdf", headers=ah).status_code == 404
    pytest.importorskip("reportlab")
    assert client.get("/me/invoices/1/pdf", headers=ah).content.startswith(b"%PDF")


def test_next_expected_needs_enough_history():
    d = [date(2026, 1, 1), date(2026, 1, 21)]
    assert portal.next_expected(d, date(2026, 2, 1)) == ("Not enough history yet", None)
    d = [date(2026, 1, 1), date(2026, 1, 21), date(2026, 2, 10)]
    text, due = portal.next_expected(d, date(2026, 2, 12))
    assert due == date(2026, 3, 2) and "20 days" in text


# ---------- requests ----------
def test_urgent_request_from_a_customer_reaches_the_planner_and_is_limited(client):
    h = headers(client)
    a = add_customer(client, h, "Alpha")
    ah = make(client, h, "alpha", "customer", a)
    r = client.post("/me/requests", json={"urgent": True, "note": "stove out of gas"}, headers=ah)
    assert r.status_code == 201 and r.json()["kind"] == "urgent"
    assert [u["customer_id"] for u in client.get("/urgent", headers=h).json()] == [a]
    assert client.get("/urgent", headers=h).json()[0]["created_by"] == "alpha"
    assert client.post("/me/requests", json={"urgent": True}, headers=ah).status_code == 429       # one open urgent at a time
    assert [x["kind"] for x in client.get("/me", headers=ah).json()["open_requests"]] == ["Urgent"]


def test_normal_requests_are_listed_for_the_owner_and_limited(client):
    h = headers(client)
    a = add_customer(client, h, "Alpha")
    ah = make(client, h, "alpha", "customer", a)
    assert client.post("/me/requests", json={"urgent": False, "note": "two cylinders please"}, headers=ah).status_code == 201
    assert client.post("/me/requests", json={}, headers=ah).status_code == 201
    assert client.post("/me/requests", json={}, headers=ah).status_code == 429                    # limit of 2 open
    assert client.post("/me/requests", json={"note": "x" * 201}, headers=ah).status_code == 422
    reqs = client.get("/requests", headers=h).json()
    assert len(reqs) == 2 and reqs[0]["name"] == "Alpha" and reqs[0]["note"] == "two cylinders please"
    out = client.post(f"/requests/{reqs[0]['request_id']}/done", json={"make_urgent": True}, headers=h).json()
    assert len(out) == 1
    assert [u["customer_id"] for u in client.get("/urgent", headers=h).json()] == [a]            # converted to an urgent request
    assert client.post("/requests/999/done", json={}, headers=h).status_code == 404
    assert client.post(f"/requests/{reqs[0]['request_id']}/done", json={}, headers=h).status_code == 404   # already closed
    types = [e["event_type"] for e in client.get("/audit/events", headers=h).json()]
    assert "request.created" in types and "request.closed" in types


def test_request_events_hold_ids_only(client):
    h = headers(client)
    a = add_customer(client, h, "Alpha")
    ah = make(client, h, "alpha", "customer", a)
    client.post("/me/requests", json={"note": "my private note"}, headers=ah)
    assert "my private note" not in str(client.get("/audit/events", headers=h).json())


def test_old_database_gets_the_customer_column(tmp_path):
    import sqlite3
    from sqlalchemy import text
    from backend.app import create_app
    db = tmp_path / "old.db"
    con = sqlite3.connect(db)
    con.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, username VARCHAR(50) UNIQUE, password_hash VARCHAR(300), role VARCHAR(20), active BOOLEAN NOT NULL DEFAULT 1)")
    con.commit(); con.close()
    app = create_app(f"sqlite:///{db}", ":memory:", "test-secret-long-enough-for-hs256-signing-0123", routing="straight")
    with app.state.SessionLocal() as s:
        assert s.execute(text("SELECT COUNT(*) FROM users WHERE customer_id IS NULL")).scalar() == 0
