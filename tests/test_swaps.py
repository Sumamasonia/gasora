from datetime import date, timedelta

from tests.test_dispatch import add_driver, client, headers, history  # noqa: F401  (fixtures and helpers)
from tests.test_empties import new_customer


def hold(client, h, cid, n, days_ago):
    since = (date.today() - timedelta(days=days_ago)).isoformat()
    r = client.post("/empties/adjust", json={"customer_id": cid, "delta": n, "since": since}, headers=h)
    assert r.status_code == 201, r.text


def recent_delivery(client, h, cid):
    d = (date.today() - timedelta(days=1)).isoformat()
    client.post("/deliveries", json={"customer_id": cid, "delivered_on": d}, headers=h)


def test_ageing_buckets(client):
    h = headers(client)
    for name, days in (("a", 5), ("b", 20), ("c", 40), ("d", 70), ("e", 120)):
        hold(client, h, new_customer(client, h, name), 1, days)
    s = client.get("/empties", headers=h).json()
    counts = {b["label"]: b["customers"] for b in s["buckets"]}
    assert counts == {"under 15": 1, "15-29": 1, "30-59": 1, "60-89": 1, "90+": 1}
    assert s["customers_overdue"] == 4


def test_since_cannot_be_in_the_future(client):
    h = headers(client)
    cid = new_customer(client, h, "x")
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    assert client.post("/empties/adjust", json={"customer_id": cid, "delta": 1, "since": tomorrow}, headers=h).status_code == 422


def test_overdue_empties_make_the_customer_a_swap_candidate(client):
    h = headers(client)
    old = new_customer(client, h, "Holds 40 days", lat=31.42, lon=73.08)
    young = new_customer(client, h, "Holds 5 days", lat=31.43, lon=73.09)
    no_history = new_customer(client, h, "Only empties", lat=31.44, lon=73.10)
    for cid in (old, young):
        recent_delivery(client, h, cid)                         # low run-out risk: not a candidate by risk
    hold(client, h, old, 2, 40)
    hold(client, h, young, 2, 5)
    hold(client, h, no_history, 1, 20)

    plan = client.get("/plan/today?seconds=0.3", headers=h).json()
    stops = {s["customer_id"]: s for r in plan["routes"] for s in r["stops"]}
    assert old in stops and stops[old]["swap"] and stops[old]["empties_bucket"] == "30-59"
    assert no_history in stops and stops[no_history]["swap"] and stops[no_history]["empties_bucket"] == "15-29"
    assert young not in stops                                   # held under 15 days: not forced into the plan
    row = {r["customer_id"]: r for r in plan["risk_table"]}
    assert row[no_history]["band"] == "Swap" and row[old]["swap_candidate"] is True
    assert plan["no_delivery_history"] == []


def test_swap_stop_for_the_driver_and_clearing_it(client):
    h = headers(client)
    ali = add_driver(client, h, "ali")
    cid = new_customer(client, h, "Swap me")
    recent_delivery(client, h, cid)
    hold(client, h, cid, 2, 40)
    routes = client.post("/plan/publish", json={"seconds": 0.3}, headers=h).json()
    for rt in routes:
        client.patch(f"/routes/{rt['route_id']}/assign", json={"username": "ali"}, headers=h)
    stop = [s for rt in client.get("/my-routes", headers=ali).json() for s in rt["stops"] if s["customer_id"] == cid][0]
    assert stop["swap"] and stop["empties_held"] == 2 and stop["empties_days"] == 40
    assert client.post(f"/route-stops/{stop['stop_id']}/deliver", json={"empties_collected": 3}, headers=ali).status_code == 200
    summary = client.get("/empties", headers=h).json()
    assert summary["customers_holding"] == 0                    # delivered 1, collected 3, held 2: cleared
    plan = client.get("/plan/today?seconds=0.3", headers=h).json()
    assert cid not in [s["customer_id"] for r in plan["routes"] for s in r["stops"]]
