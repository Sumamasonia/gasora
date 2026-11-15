from datetime import date, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DatabaseError

from tests.test_dispatch import add_customer, add_driver, client, headers, history  # noqa: F401  (fixtures and helpers)


def deliver(client, h, cid, cylinders=1, days_ago=0):
    d = (date.today() - timedelta(days=days_ago)).isoformat()
    r = client.post("/deliveries", json={"customer_id": cid, "cylinders": cylinders, "delivered_on": d}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def test_nothing_is_billed_until_a_price_is_set(client):
    h = headers(client)
    cid = add_customer(client, h, "A")
    assert client.get("/settings/price", headers=h).json() == {"unit_price": None}
    deliver(client, h, cid)
    assert client.get(f"/ledger/{cid}", headers=h).json()["entries"] == []
    assert client.get("/receivables", headers=h).json()["customers_owing"] == 0


def test_a_delivery_is_billed_at_the_current_price_and_shows_in_the_ledger(client):
    h = headers(client)
    cid = add_customer(client, h, "A")
    assert client.put("/settings/price", json={"unit_price": 3000}, headers=h).status_code == 200
    assert client.put("/settings/price", json={"unit_price": 0}, headers=h).status_code == 422
    deliver(client, h, cid, cylinders=2)
    led = client.get(f"/ledger/{cid}", headers=h).json()
    assert led["balance"] == 6000
    e = led["entries"][0]
    assert e["kind"] == "invoice" and e["amount"] == 6000 and e["invoice_number"] == "INV-000001"
    client.put("/settings/price", json={"unit_price": 3500}, headers=h)
    deliver(client, h, cid)                                      # the new price applies to new deliveries only
    assert client.get(f"/ledger/{cid}", headers=h).json()["balance"] == 6000 + 3500


def test_payments_and_first_in_first_out_ageing(client):
    h = headers(client)
    cid = add_customer(client, h, "A")
    client.put("/settings/price", json={"unit_price": 1000}, headers=h)
    deliver(client, h, cid, days_ago=50)
    deliver(client, h, cid, days_ago=5)
    rec = client.get("/receivables", headers=h).json()
    assert rec["total_owed"] == 2000 and rec["customers"][0]["days"] == 50
    assert rec["buckets"][1]["label"] == "31-60" and rec["buckets"][1]["amount"] == 2000   # 50 days old
    r = client.post("/payments", json={"customer_id": cid, "amount": 1000, "note": "cash"}, headers=h)
    assert r.status_code == 201 and r.json() == {"balance": 1000}
    rec = client.get("/receivables", headers=h).json()
    assert rec["total_owed"] == 1000 and rec["customers"][0]["days"] == 5     # the oldest debt was settled first
    client.post("/payments", json={"customer_id": cid, "amount": 1000}, headers=h)
    rec = client.get("/receivables", headers=h).json()
    assert rec["customers_owing"] == 0
    assert client.post("/payments", json={"customer_id": cid, "amount": 0}, headers=h).status_code == 422
    assert client.post("/payments", json={"customer_id": 999, "amount": 5}, headers=h).status_code == 404


def test_adjustments_need_a_note_and_an_owner(client):
    h = headers(client)
    ali = add_driver(client, h, "ali")
    cid = add_customer(client, h, "A")
    client.put("/settings/price", json={"unit_price": 1000}, headers=h)
    deliver(client, h, cid)
    assert client.post("/ledger/adjust", json={"customer_id": cid, "amount": -200, "note": "damaged cylinder"}, headers=ali).status_code == 403
    assert client.post("/ledger/adjust", json={"customer_id": cid, "amount": -200, "note": " "}, headers=h).status_code == 422
    assert client.post("/ledger/adjust", json={"customer_id": cid, "amount": 0, "note": "x"}, headers=h).status_code == 422
    r = client.post("/ledger/adjust", json={"customer_id": cid, "amount": -200, "note": "discount, agreed"}, headers=h)
    assert r.status_code == 201 and r.json()["balance"] == 800
    assert r.json()["entries"][-1]["kind"] == "adjustment"


def test_the_ledger_and_invoices_cannot_be_edited_or_deleted(client):
    h = headers(client)
    cid = add_customer(client, h, "A")
    client.put("/settings/price", json={"unit_price": 1000}, headers=h)
    deliver(client, h, cid)
    with client.app.state.SessionLocal() as s:
        for sql in ("UPDATE ledger_entries SET amount = 1", "DELETE FROM ledger_entries",
                    "UPDATE invoices SET total = 1", "DELETE FROM invoices"):
            with pytest.raises(DatabaseError):
                s.execute(text(sql))
            s.rollback()
    assert client.get(f"/ledger/{cid}", headers=h).json()["balance"] == 1000


def test_drivers_see_the_balance_and_can_take_cash_at_the_door(client):
    h = headers(client)
    ali = add_driver(client, h, "ali")
    cid = add_customer(client, h, "Due")
    history(client, h, cid, [100, 80, 60, 40, 20])
    client.put("/settings/price", json={"unit_price": 1000}, headers=h)
    deliver(client, h, cid, days_ago=30)                               # an old unpaid bill
    routes = client.post("/plan/publish", json={"seconds": 0.3}, headers=h).json()
    client.patch(f"/routes/{routes[0]['route_id']}/assign", json={"username": "ali"}, headers=h)
    stop = client.get("/my-routes", headers=ali).json()[0]["stops"][0]
    assert stop["balance"] == 1000
    r = client.post(f"/route-stops/{stop['stop_id']}/deliver", json={"cash_received": 1500}, headers=ali)
    assert r.status_code == 200, r.text
    led = client.get(f"/ledger/{cid}", headers=h).json()
    assert [e["kind"] for e in led["entries"]] == ["invoice", "invoice", "payment"]
    assert led["balance"] == 1000 + 1000 - 1500
    assert client.get("/audit/verify", headers=h).json()["ok"]


def test_driver_cannot_set_the_price_or_read_ledgers(client):
    h = headers(client)
    ali = add_driver(client, h, "ali")
    assert client.put("/settings/price", json={"unit_price": 10}, headers=ali).status_code == 403
    assert client.get("/settings/price", headers=ali).status_code == 200
    assert client.get("/ledger/1", headers=ali).status_code == 403
    assert client.get("/receivables", headers=ali).status_code == 403
    assert client.get("/invoices/1/pdf", headers=ali).status_code == 403


def test_invoice_pdf(client):
    pytest.importorskip("reportlab")
    h = headers(client)
    cid = add_customer(client, h, "Pdf Customer")
    client.put("/settings/price", json={"unit_price": 3000}, headers=h)
    deliver(client, h, cid, cylinders=2)
    r = client.get("/invoices/1/pdf", headers=h)
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf" and r.content.startswith(b"%PDF")
    assert client.get("/invoices/99/pdf", headers=h).status_code == 404


def test_the_event_log_records_money_without_personal_details(client):
    h = headers(client)
    cid = add_customer(client, h, "Secret Name")
    client.put("/settings/price", json={"unit_price": 1000}, headers=h)
    deliver(client, h, cid)
    client.post("/payments", json={"customer_id": cid, "amount": 400, "note": "private note"}, headers=h)
    events = client.get("/audit/events?limit=50", headers=h).json()
    kinds = {e["event_type"] for e in events}
    assert {"price.set", "invoice.created", "payment.recorded"} <= kinds
    money = [e for e in events if e["event_type"] in ("price.set", "invoice.created", "payment.recorded")]
    assert "Secret Name" not in str(money) and "private note" not in str(money)     # ids and amounts only
    assert client.get("/audit/verify", headers=h).json()["ok"]
