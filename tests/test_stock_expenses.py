from datetime import date, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.exc import DatabaseError

from tests.test_dispatch import add_customer, add_driver, client, headers  # noqa: F401  (fixtures and helpers)


def deliver(client, h, cid, cylinders=1):
    r = client.post("/deliveries", json={"customer_id": cid, "cylinders": cylinders}, headers=h)
    assert r.status_code == 201, r.text


def test_stock_is_not_tracked_until_the_first_entry(client):
    h = headers(client)
    cid = add_customer(client, h, "A")
    deliver(client, h, cid, 2)
    s = client.get("/stock", headers=h).json()
    assert s["tracking"] is False and s["on_hand"] == 0 and s["movements"] == [] and not s["low"] and not s["negative"]


def test_purchases_sales_and_adjustments_move_the_stock(client):
    h = headers(client)
    cid = add_customer(client, h, "A")
    r = client.post("/stock/purchase", json={"quantity": 50, "unit_cost": 2500, "supplier": "Plant"}, headers=h)
    assert r.status_code == 201 and r.json()["on_hand"] == 50 and r.json()["tracking"] is True
    deliver(client, h, cid, 2)
    assert client.get("/stock", headers=h).json()["on_hand"] == 48            # the sale was written automatically
    r = client.post("/stock/adjust", json={"quantity": -3, "note": "two damaged, one lost"}, headers=h)
    assert r.json()["on_hand"] == 45
    kinds = [m["kind"] for m in r.json()["movements"]]
    assert kinds == ["adjustment", "sale", "purchase"]                       # newest first
    assert r.json()["purchase_cost_last_30_days"] == 50 * 2500 and r.json()["bought_last_30_days"] == 50


def test_validation_and_low_stock_warning(client):
    h = headers(client)
    assert client.post("/stock/purchase", json={"quantity": 0, "unit_cost": 5}, headers=h).status_code == 422
    assert client.post("/stock/adjust", json={"quantity": 0, "note": "x"}, headers=h).status_code == 422
    assert client.post("/stock/adjust", json={"quantity": 5, "note": " "}, headers=h).status_code == 422
    client.post("/stock/adjust", json={"quantity": 12, "note": "opening stock"}, headers=h)
    assert client.get("/stock", headers=h).json()["low"] is False             # 12 is above the default threshold of 10
    s = client.put("/settings/low-stock", json={"threshold": 12}, headers=h).json()
    assert s["threshold"] == 12 and s["low"] is True
    cid = add_customer(client, h, "A")
    deliver(client, h, cid, 10)
    deliver(client, h, cid, 5)
    s = client.get("/stock", headers=h).json()
    assert s["on_hand"] == -3 and s["negative"] is True                       # selling more than recorded is shown, not hidden


def test_movements_and_expenses_cannot_be_edited_or_deleted(client):
    h = headers(client)
    client.post("/stock/purchase", json={"quantity": 5, "unit_cost": 100}, headers=h)
    client.post("/expenses", json={"category": "fuel", "amount": 500}, headers=h)
    with client.app.state.SessionLocal() as s:
        for sql in ("UPDATE stock_movements SET quantity = 1", "DELETE FROM stock_movements",
                    "UPDATE expenses SET amount = 1", "DELETE FROM expenses"):
            with pytest.raises(DatabaseError):
                s.execute(text(sql))
            s.rollback()
    assert client.get("/stock", headers=h).json()["on_hand"] == 5
    assert client.get("/expenses", headers=h).json()["total"] == 500


def test_expenses_totals_filters_and_corrections(client):
    h = headers(client)
    today = date.today()
    old = (today - timedelta(days=40)).isoformat()
    assert client.post("/expenses", json={"category": "fuel", "amount": 4000, "note": "van 1"}, headers=h).status_code == 201
    client.post("/expenses", json={"category": "salary", "amount": 30000}, headers=h)
    client.post("/expenses", json={"category": "fuel", "amount": 1000, "day": old}, headers=h)
    assert client.post("/expenses", json={"category": "snacks", "amount": 10}, headers=h).status_code == 422
    assert client.post("/expenses", json={"category": "fuel", "amount": 0}, headers=h).status_code == 422
    assert client.post("/expenses", json={"category": "fuel", "amount": -500}, headers=h).status_code == 422   # needs a note
    r = client.post("/expenses", json={"category": "fuel", "amount": -500, "note": "entered twice by mistake"}, headers=h)
    assert r.status_code == 201
    everything = client.get("/expenses", headers=h).json()
    assert everything["by_category"]["fuel"] == 4000 + 1000 - 500 and everything["total"] == 4000 + 1000 - 500 + 30000
    recent = client.get(f"/expenses?start={(today - timedelta(days=30)).isoformat()}", headers=h).json()
    assert recent["by_category"]["fuel"] == 4000 - 500 and recent["total"] == 33500


def test_drivers_cannot_use_stock_or_expenses_and_the_log_stays_valid(client):
    h = headers(client)
    ali = add_driver(client, h, "ali")
    for method, path, body in (("get", "/stock", None), ("post", "/stock/purchase", {"quantity": 1, "unit_cost": 1}),
                               ("post", "/stock/adjust", {"quantity": 1, "note": "x"}),
                               ("put", "/settings/low-stock", {"threshold": 1}),
                               ("get", "/expenses", None), ("post", "/expenses", {"category": "fuel", "amount": 5})):
        r = getattr(client, method)(path, headers=ali, **({"json": body} if body else {}))
        assert r.status_code == 403, (path, r.status_code)
    client.post("/stock/purchase", json={"quantity": 5, "unit_cost": 100, "note": "private"}, headers=h)
    client.post("/expenses", json={"category": "fuel", "amount": 5, "note": "private"}, headers=h)
    events = client.get("/audit/events?limit=20", headers=h).json()
    money = [e for e in events if e["event_type"] in ("stock.purchased", "expense.added")]
    assert len(money) == 2 and "private" not in str(money)
    assert client.get("/audit/verify", headers=h).json()["ok"]
