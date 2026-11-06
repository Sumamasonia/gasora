from datetime import date, timedelta

import pytest

from backend.models import EmptiesLedger
from tests.test_dispatch import add_driver, client, headers, history  # noqa: F401  (fixtures and helpers)


def new_customer(client, h, name, demand=1, lat=31.42, lon=73.08):
    r = client.post("/customers", json={"name": name, "lat": lat, "lon": lon, "demand": demand}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def held(client, h):
    return {c["customer_id"]: c for c in client.get("/empties", headers=h).json()["customers"]}


def test_plain_swap_leaves_nothing_outstanding(client):
    h = headers(client)
    cid = new_customer(client, h, "Swap", demand=2)
    assert client.post("/deliveries", json={"customer_id": cid, "cylinders": 2}, headers=h).status_code == 201
    assert held(client, h) == {}                              # 2 delivered, 2 collected by default


def test_collecting_fewer_empties_is_remembered(client):
    h = headers(client)
    cid = new_customer(client, h, "Keeps one", demand=2)
    client.post("/deliveries", json={"customer_id": cid, "cylinders": 2, "empties_collected": 1}, headers=h)
    entry = held(client, h)[cid]
    assert entry["held"] == 1 and entry["days_holding"] == 0 and entry["overdue"] is False
    client.post("/deliveries", json={"customer_id": cid, "cylinders": 2, "empties_collected": 3}, headers=h)
    assert held(client, h) == {}                              # the next visit collected the missing one


def test_adjustment_overdue_and_validation(client):
    h = headers(client)
    cid = new_customer(client, h, "Opening balance")
    assert client.post("/empties/adjust", json={"customer_id": cid, "delta": 3, "note": "opening"}, headers=h).status_code == 201
    assert held(client, h)[cid]["held"] == 3
    assert client.post("/empties/adjust", json={"customer_id": cid, "delta": 0}, headers=h).status_code == 422
    assert client.post("/empties/adjust", json={"customer_id": 999, "delta": 1}, headers=h).status_code == 404
    assert client.post("/deliveries", json={"customer_id": cid, "empties_collected": -1}, headers=h).status_code == 422

    old = new_customer(client, h, "Long overdue")
    with client.app.state.SessionLocal() as s:               # an old entry, to test the ageing
        s.add(EmptiesLedger(customer_id=old, delivered=2, collected=0, kind="adjustment", actor="test",
                            created_on=date.today() - timedelta(days=20)))
        s.commit()
    summary = client.get("/empties", headers=h).json()
    assert summary["customers"][0]["customer_id"] == old      # overdue customers come first
    assert summary["customers"][0]["overdue"] and summary["customers"][0]["days_holding"] == 20
    assert summary["customers_overdue"] == 1 and summary["total_held"] == 5


def test_only_the_owner_sees_the_summary(client):
    h = headers(client)
    ali = add_driver(client, h, "ali")
    assert client.get("/empties", headers=ali).status_code == 403
    assert client.post("/empties/adjust", json={"customer_id": 1, "delta": 1}, headers=ali).status_code == 403


def test_driver_flow_records_empties_and_shows_them(client):
    h = headers(client)
    ali = add_driver(client, h, "ali")
    cid = new_customer(client, h, "Due soon", demand=2)
    history(client, h, cid, [100, 80, 60, 40, 20])            # due now
    client.post("/empties/adjust", json={"customer_id": cid, "delta": 1, "note": "from before"}, headers=h)

    routes = client.post("/plan/publish", json={"seconds": 0.3}, headers=h).json()
    for rt in routes:
        client.patch(f"/routes/{rt['route_id']}/assign", json={"username": "ali"}, headers=h)
    stops = [s for rt in client.get("/my-routes", headers=ali).json() for s in rt["stops"]]
    stop = [s for s in stops if s["customer_id"] == cid][0]
    assert stop["empties_held"] == 1                          # the driver is told about it

    plan = client.get("/plan/today?seconds=0.3", headers=h).json()
    row = [r for r in plan["risk_table"] if r["customer_id"] == cid][0]
    assert row["empties_held"] == 1 and row["empties_overdue"] is False

    done = client.post(f"/route-stops/{stop['stop_id']}/deliver", json={"empties_collected": 3}, headers=ali)
    assert done.status_code == 200
    assert held(client, h) == {}                              # delivered 2, collected 3, held was 1: now 0


def test_empties_events_are_in_the_audit_chain(client):
    h = headers(client)
    cid = new_customer(client, h, "Audit")
    client.post("/deliveries", json={"customer_id": cid, "empties_collected": 0}, headers=h)
    client.post("/empties/adjust", json={"customer_id": cid, "delta": -1}, headers=h)
    audit = client.get("/audit/verify", headers=h).json()
    assert audit["ok"], audit
    types = [r[0] for r in client.app.state.events.execute("SELECT event_type FROM events").fetchall()]
    assert "empties.recorded" in types and "empties.adjusted" in types


def test_empties_report_reads_the_final_csv(tmp_path, capsys):
    from evaluation import empties_report
    path = tmp_path / "r.csv"
    rows = ["policy,seed,runouts_per_100cm,days_out"]
    for seed in (1, 2, 3):
        rows += [f"P2 average-days + OR-Tools,{seed},60,{120 + seed}", f"P3 Gasora,{seed},20,{30 + seed}"]
    path.write_text("\n".join(rows))
    empties_report.main(str(path), 60)
    out = capsys.readouterr().out
    assert "P3 Gasora" in out and "-1.50" in out              # (31..33 - 121..123) / 60 = -1.5 on average
