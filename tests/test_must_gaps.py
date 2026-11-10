from datetime import date, timedelta

import pytest

from backend import manage, services
from evaluation import meta
from tests.test_dispatch import add_driver, client, headers, history  # noqa: F401  (fixtures and helpers)
from tests.test_empties import new_customer


# ---------- planner fallbacks ----------
def urgent_customers(client, h, n, demand=10):
    ids = []
    for i in range(n):
        cid = new_customer(client, h, f"Urgent {i}", demand=demand, lat=31.41 + 0.004 * i, lon=73.07 + 0.004 * i)
        client.post("/urgent", json={"customer_id": cid}, headers=h)
        ids.append(cid)
    return ids


def test_an_extra_vehicle_is_used_when_urgent_requests_do_not_fit(client):
    h = headers(client)
    ids = urgent_customers(client, h, 9)                  # 9 x 10 cylinders > 2 vehicles x 40
    plan = client.get("/plan/today?seconds=0.5", headers=h).json()
    assert plan["fallback"] == "extra_vehicle" and len(plan["routes"]) == 3
    assert {s["customer_id"] for r in plan["routes"] for s in r["stops"]} == set(ids)
    assert any("extra" in w.lower() or "did not fit" in w for w in plan["warnings"])


def test_no_fallback_when_everything_fits(client):
    h = headers(client)
    urgent_customers(client, h, 3, demand=2)
    plan = client.get("/plan/today?seconds=0.3", headers=h).json()
    assert plan["fallback"] is None and len(plan["routes"]) == 2


def test_the_greedy_plan_serves_everyone_who_fits():
    cands = [{"x": 1.0 * i, "y": 0.5 * i, "demand": 2} for i in range(1, 7)]
    routes, visited = services._greedy_result(cands, None)
    assert visited == {1, 2, 3, 4, 5, 6}
    assert all(minutes > 0 for r, minutes in routes if r)


# ---------- serial numbers move cylinders automatically ----------
def filled_cylinders(client, h, *serials):
    ids = []
    for s in serials:
        cid = client.post("/cylinders", json={"serial_no": s}, headers=h).json()["id"]
        assert client.post(f"/cylinders/{cid}/transition", json={"to_state": "Filled"}, headers=h).status_code == 200
        ids.append(cid)
    return ids


def state(client, h, cid):
    return client.get(f"/cylinders/{cid}", headers=h).json()


def test_delivery_with_serials_moves_the_cylinders_and_a_later_visit_recovers_them(client):
    h = headers(client)
    cust = new_customer(client, h, "Holder", demand=2)
    a, b = filled_cylinders(client, h, "CYL-A", "CYL-B")
    r = client.post("/deliveries", json={"customer_id": cust, "cylinders": 2, "empties_collected": 0,
                                         "serials_delivered": ["cyl-a", " CYL-B "]}, headers=h)
    assert r.status_code == 201, r.text
    assert state(client, h, a)["state"] == "Delivered" and state(client, h, a)["customer_id"] == cust
    r = client.post("/deliveries", json={"customer_id": cust, "cylinders": 1, "empties_collected": 2,
                                         "serials_collected": ["CYL-A", "CYL-B"]}, headers=h)
    assert r.status_code == 201, r.text
    assert state(client, h, a)["state"] == "Recovered" and state(client, h, a)["customer_id"] is None
    assert client.get("/audit/verify", headers=h).json()["ok"]


def test_bad_serials_stop_the_whole_delivery(client):
    h = headers(client)
    cust = new_customer(client, h, "Strict", demand=2)
    a, = filled_cylinders(client, h, "CYL-ONLY")
    body = {"customer_id": cust, "cylinders": 2}
    assert client.post("/deliveries", json={**body, "serials_delivered": ["CYL-ONLY"]}, headers=h).status_code == 409   # one of two
    assert client.post("/deliveries", json={**body, "serials_delivered": ["CYL-ONLY", "CYL-ONLY"]}, headers=h).status_code == 409
    assert client.post("/deliveries", json={**body, "serials_delivered": ["CYL-ONLY", "NOPE"]}, headers=h).status_code == 404
    assert client.get("/deliveries", headers=h).json() == []           # nothing was saved
    assert state(client, h, a)["state"] == "Filled"
    other = new_customer(client, h, "Other")
    client.post("/deliveries", json={"customer_id": other, "cylinders": 1, "serials_delivered": ["CYL-ONLY"]}, headers=h)
    wrong_holder = client.post("/deliveries", json={"customer_id": cust, "cylinders": 1, "empties_collected": 1,
                                                    "serials_collected": ["CYL-ONLY"]}, headers=h)
    assert wrong_holder.status_code == 409                              # held by another customer


def test_driver_stop_with_serials(client):
    h = headers(client)
    ali = add_driver(client, h, "ali")
    cid = new_customer(client, h, "Due", demand=1)
    history(client, h, cid, [100, 80, 60, 40, 20])
    cyl, = filled_cylinders(client, h, "CYL-ROUTE")
    for rt in client.post("/plan/publish", json={"seconds": 0.3}, headers=h).json():
        client.patch(f"/routes/{rt['route_id']}/assign", json={"username": "ali"}, headers=h)
    stop = [s for rt in client.get("/my-routes", headers=ali).json() for s in rt["stops"] if s["customer_id"] == cid][0]
    done = client.post(f"/route-stops/{stop['stop_id']}/deliver",
                       json={"serials_delivered": ["CYL-ROUTE"]}, headers=ali)
    assert done.status_code == 200, done.text
    assert state(client, h, cyl)["state"] == "Delivered"


# ---------- manifest ----------
def test_route_manifest_counts_cylinders_and_empties(client):
    h = headers(client)
    ali = add_driver(client, h, "ali")
    a = new_customer(client, h, "A", demand=2, lat=31.42, lon=73.08)
    b = new_customer(client, h, "B", demand=3, lat=31.43, lon=73.09)
    for cid in (a, b):
        history(client, h, cid, [100, 80, 60, 40, 20])
    client.post("/empties/adjust", json={"customer_id": b, "delta": 1}, headers=h)
    routes = client.post("/plan/publish", json={"seconds": 0.3}, headers=h).json()
    full = sum(r["manifest"]["full_cylinders"] for r in routes)
    empties = sum(r["manifest"]["empties_expected"] for r in routes)
    assert full == 5 and empties == 6                                  # 2 + 3 delivered; the same back, plus 1 held
    assert all(r["manifest"]["capacity"] == 40 for r in routes)


# ---------- customers, audit ----------
def test_owner_can_edit_a_customer_and_only_field_names_are_logged(client):
    h = headers(client)
    ali = add_driver(client, h, "ali")
    cid = new_customer(client, h, "Old name")
    body = {"name": "New name", "lat": 31.45, "lon": 73.10, "phone": "0300-1234567", "address": "Main Road", "demand": 2}
    r = client.put(f"/customers/{cid}", json=body, headers=h)
    assert r.status_code == 200 and r.json()["name"] == "New name" and r.json()["demand"] == 2
    assert client.put(f"/customers/{cid}", json=body, headers=ali).status_code == 403
    assert client.put("/customers/999", json=body, headers=h).status_code == 404
    latest = client.get("/audit/events?limit=1", headers=h).json()[0]
    assert latest["event_type"] == "customer.updated" and "0300" not in str(latest)
    assert set(latest["payload"]["changed"]) == {"name", "lat", "lon", "phone", "address", "demand"}


def test_audit_events_are_newest_first_and_owner_only(client):
    h = headers(client)
    ali = add_driver(client, h, "ali")
    new_customer(client, h, "One")
    new_customer(client, h, "Two")
    events = client.get("/audit/events?limit=3", headers=h).json()
    assert len(events) == 3 and events[0]["id"] > events[1]["id"] and len(events[0]["hash"]) == 12
    assert client.get("/audit/events", headers=ali).status_code == 403


def test_the_tamper_demo_shows_detection(capsys):
    manage.tamper_demo()
    out = capsys.readouterr().out
    assert "chain OK (5 events)" in out and "content does not match its hash" in out and "stored anchor" in out


# ---------- the evaluation fingerprint ----------
def test_the_fingerprint_follows_the_evaluation_code_but_not_the_web_application(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    for d in ("evaluation", "planner", "backend"):
        (tmp_path / d).mkdir()
    (tmp_path / "evaluation" / "a.py").write_text("x = 1\n")
    (tmp_path / "backend" / "settings.py").write_text("LATE = 1\n")
    (tmp_path / "backend" / "services.py").write_text("y = 1\n")
    first = meta.code_hash()
    (tmp_path / "backend" / "services.py").write_text("y = 2\n")            # the web application: ignored
    assert meta.code_hash() == first
    (tmp_path / "backend" / "settings.py").write_text("LATE = 2\n")          # settings the evaluation uses: counted
    assert meta.code_hash() != first
    second = meta.code_hash()
    (tmp_path / "planner" / "routing.py").write_text("z = 1\n")
    assert meta.code_hash() != second
