import json
import sqlite3
from datetime import date

import pytest
from sqlalchemy import text

from backend import assistant
from tests.test_dispatch import add_customer, add_driver, client, headers  # noqa: F401  (fixtures and helpers)


# ---------- staff ----------
def make(client, h, name, role):
    r = client.post("/users", json={"username": name, "password": "password-123", "role": role}, headers=h)
    assert r.status_code == 201, r.text
    return headers(client, name, "password-123"), r.json()["id"]


def test_inactive_users_cannot_sign_in_or_use_an_old_token(client):
    h = headers(client)
    dh, did = make(client, h, "driver1", "driver")
    assert client.get("/my-routes", headers=dh).status_code == 200
    r = client.patch(f"/users/{did}", json={"active": False}, headers=h)
    assert r.status_code == 200 and r.json()["active"] is False
    assert client.get("/my-routes", headers=dh).status_code == 401            # the old token stops working at once
    assert client.post("/auth/login", json={"username": "driver1", "password": "password-123"}).status_code == 401
    client.patch(f"/users/{did}", json={"active": True}, headers=h)
    assert client.post("/auth/login", json={"username": "driver1", "password": "password-123"}).status_code == 200
    types = [e["event_type"] for e in client.get("/audit/events", headers=h).json()]
    assert "user.deactivated" in types and "user.activated" in types


def test_cannot_deactivate_yourself_or_the_last_owner(client):
    h = headers(client)
    me = [u for u in client.get("/users", headers=h).json() if u["username"] == "boss"][0]["id"]
    assert client.patch(f"/users/{me}", json={"active": False}, headers=h).status_code == 422
    h2, id2 = make(client, h, "second", "owner")
    assert client.patch(f"/users/{me}", json={"active": False}, headers=h2).status_code == 200   # allowed: another owner stays active
    assert client.patch(f"/users/{id2}", json={"active": False}, headers=h2).status_code in (401, 422)
    assert client.patch("/users/999", json={"active": True}, headers=h).status_code in (401, 404)


def test_activity_counts_events_per_person(client):
    h = headers(client)
    dh, _ = make(client, h, "driver1", "driver")
    cid = add_customer(client, h, "A")
    client.post("/deliveries", json={"customer_id": cid}, headers=h)
    a = client.get("/staff/activity", headers=h).json()
    boss = [s for s in a["staff"] if s["username"] == "boss"][0]
    assert boss["events"] >= 3 and boss["last_event"] and boss["top_types"]
    assert [s for s in a["staff"] if s["username"] == "driver1"][0]["events"] == 0
    assert client.get("/staff/activity", headers=dh).status_code == 403


def test_old_database_gets_the_new_column(tmp_path):
    from backend.app import create_app
    db = tmp_path / "old.db"
    con = sqlite3.connect(db)
    con.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, username VARCHAR(50) UNIQUE, password_hash VARCHAR(300), role VARCHAR(20))")
    con.execute("INSERT INTO users (username, password_hash, role) VALUES ('old', 'x', 'owner')")
    con.commit(); con.close()
    app = create_app(f"sqlite:///{db}", ":memory:", "test-secret-long-enough-for-hs256-signing-0123", routing="straight")
    with app.state.SessionLocal() as s:
        assert s.execute(text("SELECT active FROM users")).scalar() == 1


# ---------- CEO ----------
def test_ceo_sees_the_summary_and_nothing_else(client):
    h = headers(client)
    ch, _ = make(client, h, "ceo1", "ceo")
    assert client.get("/reports/dashboard", headers=ch).status_code == 200
    for method, url in [("get", "/customers"), ("get", "/receivables"), ("get", "/export/ledger.csv"), ("get", "/backup"),
                        ("get", "/stock"), ("get", "/users"), ("get", "/notes"), ("get", "/assistant"),
                        ("post", "/payments"), ("post", "/deliveries"), ("post", "/expenses")]:
        assert getattr(client, method)(url, headers=ch).status_code == 403, url


# ---------- notes ----------
def test_notes_add_list_delete_and_owner_only(client):
    h = headers(client)
    dh = add_driver(client, h, "dri")
    r = client.post("/notes", json={"text": "Van 2 needs tyres", "label": "repair"}, headers=h)
    assert r.status_code == 201 and r.json()["day"] == date.today().isoformat()
    assert client.post("/notes", json={"text": "   "}, headers=h).status_code == 422
    assert client.post("/notes", json={"text": "x" * 501}, headers=h).status_code == 422
    assert [n["text"] for n in client.get("/notes", headers=h).json()] == ["Van 2 needs tyres"]
    assert client.get("/notes", headers=dh).status_code == 403
    assert client.delete(f"/notes/{r.json()['id']}", headers=h).status_code == 204
    assert client.delete("/notes/999", headers=h).status_code == 404
    assert client.get("/notes", headers=h).json() == []


# ---------- WhatsApp ----------
def test_whatsapp_numbers_and_share_link(client):
    from backend.accounts import whatsapp_number
    assert whatsapp_number("0300-1234567") == "923001234567"
    assert whatsapp_number("+92 300 1234567") == "923001234567"
    assert whatsapp_number("0092 300 1234567") == "923001234567"
    assert whatsapp_number("123") is None and whatsapp_number(None) is None
    h = headers(client)
    r = client.post("/customers", json={"name": "A", "lat": 31.4, "lon": 73.0, "phone": "0300 1234567"}, headers=h)
    cid = r.json()["id"]
    client.put("/settings/price", json={"unit_price": 3000}, headers=h)
    client.post("/deliveries", json={"customer_id": cid, "cylinders": 2}, headers=h)
    s = client.get("/invoices/1/share", headers=h).json()
    assert s["url"].startswith("https://wa.me/923001234567?text=") and s["has_number"] is True
    assert "INV-000001" in s["text"] and "Rs 6,000" in s["text"]
    assert "\n" not in s["url"] and "%0A" in s["url"]
    assert client.get("/invoices/99/share", headers=h).status_code == 404


def test_share_without_a_phone_number_still_gives_a_link(client):
    h = headers(client)
    cid = add_customer(client, h, "B")
    client.put("/settings/price", json={"unit_price": 100}, headers=h)
    client.post("/deliveries", json={"customer_id": cid}, headers=h)
    s = client.get("/invoices/1/share", headers=h).json()
    assert s["has_number"] is False and s["url"].startswith("https://wa.me/?text=")


# ---------- assistant ----------
def test_assistant_is_off_without_a_key(client, monkeypatch):
    monkeypatch.delenv("GASORA_GEMINI_KEY", raising=False)
    h = headers(client)
    assert client.get("/assistant", headers=h).json()["configured"] is False
    assert client.post("/assistant", json={"question": "How are sales?"}, headers=h).status_code == 501


def test_assistant_sees_totals_only_and_never_names(client, monkeypatch):
    monkeypatch.setenv("GASORA_GEMINI_KEY", "fake-key")
    h = headers(client)
    r = client.post("/customers", json={"name": "Secret Name", "lat": 31.4, "lon": 73.0, "phone": "03001234567",
                                        "address": "12 Hidden Street"}, headers=h)
    client.put("/settings/price", json={"unit_price": 3000}, headers=h)
    client.post("/deliveries", json={"customer_id": r.json()["id"], "cylinders": 2}, headers=h)
    seen = {}

    def fake(url, key, body):
        seen.update(url=url, key=key, body=body)
        return {"candidates": [{"content": {"parts": [{"text": " You billed Rs 6,000. "}]}}]}
    with client.app.state.SessionLocal() as s:
        assert assistant.ask(s, date.today(), "How much did I bill?", transport=fake) == "You billed Rs 6,000."
    payload = json.dumps(seen["body"])
    assert "6000" in payload and "How much did I bill?" in payload
    for secret in ("Secret Name", "03001234567", "Hidden Street"):
        assert secret not in payload
    assert seen["key"] == "fake-key" and "key=" not in seen["url"]            # the key goes in a header, not the address


def test_assistant_errors_are_clean(client, monkeypatch):
    monkeypatch.setenv("GASORA_GEMINI_KEY", "fake-key")
    h = headers(client)
    dh = add_driver(client, h, "dri")
    assert client.post("/assistant", json={"question": "hi"}, headers=dh).status_code == 403
    assert client.post("/assistant", json={"question": ""}, headers=h).status_code == 422
    assert client.post("/assistant", json={"question": "x" * 501}, headers=h).status_code == 422
    with client.app.state.SessionLocal() as s:
        with pytest.raises(ConnectionError):
            assistant.ask(s, date.today(), "q", transport=lambda *a: {"unexpected": 1})
        def boom(*a):
            raise OSError("down")
        with pytest.raises(ConnectionError):
            assistant.ask(s, date.today(), "q", transport=boom)
    monkeypatch.setattr(assistant, "_post", lambda *a: {"candidates": [{"content": {"parts": [{"text": "ok"}]}}]})
    r = client.post("/assistant", json={"question": "my secret question"}, headers=h)
    assert r.status_code == 200 and r.json()["answer"] == "ok"
    ev = client.get("/audit/events?limit=5", headers=h).json()
    assert "assistant.asked" in [e["event_type"] for e in ev]
    assert "my secret question" not in json.dumps(ev)                          # the log keeps the length only
