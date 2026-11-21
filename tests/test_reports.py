import json
import sqlite3
import zipfile
from datetime import date, timedelta
from io import BytesIO

import pytest

from backend import backup, eventlog
from tests.test_dispatch import add_customer, add_driver, client, headers  # noqa: F401  (fixtures and helpers)


def deliver(client, h, cid, cylinders=1, days_ago=0):
    d = (date.today() - timedelta(days=days_ago)).isoformat()
    r = client.post("/deliveries", json={"customer_id": cid, "cylinders": cylinders, "delivered_on": d}, headers=h)
    assert r.status_code == 201, r.text


def test_dashboard_adds_up(client):
    h = headers(client)
    a, b = add_customer(client, h, "A"), add_customer(client, h, "B")
    client.put("/settings/price", json={"unit_price": 3000}, headers=h)
    client.post("/stock/purchase", json={"quantity": 20, "unit_cost": 2500}, headers=h)
    deliver(client, h, a, 2)
    deliver(client, h, b, 1, days_ago=3)
    deliver(client, h, a, 1, days_ago=40)                      # outside the 30-day window
    client.post("/payments", json={"customer_id": a, "amount": 2000}, headers=h)
    client.post("/expenses", json={"category": "fuel", "amount": 700}, headers=h)
    d = client.get("/reports/dashboard", headers=h).json()
    assert d["customers"] == 2 and d["price_set"] is True
    assert d["today"] == {"deliveries": 1, "cylinders": 2}
    assert d["last_7_days"] == {"deliveries": 2, "cylinders": 3}
    assert d["last_30_days"] == {"deliveries": 2, "cylinders": 3}
    assert sum(x["cylinders"] for x in d["series"]) == 3 and len(d["series"]) == 14
    m = d["money_30_days"]
    assert m["billed"] == 3000 * 3 and m["collected"] == 2000 and m["expenses"] == 700
    assert m["stock_purchases"] == 20 * 2500 and m["recorded_cash_net"] == 2000 - 700 - 50000
    assert d["receivables"]["total_owed"] == 3000 * 4 - 2000 and d["receivables"]["customers_owing"] == 2
    assert d["stock"]["tracking"] is True and d["stock"]["on_hand"] == 20 - 2 - 1 - 1


def test_dashboard_on_an_empty_system(client):
    h = headers(client)
    d = client.get("/reports/dashboard", headers=h).json()
    assert d["customers"] == 0 and d["today"]["deliveries"] == 0 and d["receivables"]["total_owed"] == 0
    assert d["money_30_days"]["recorded_cash_net"] == 0 and d["price_set"] is False


def test_csv_exports_and_formula_safety(client):
    h = headers(client)
    cid = add_customer(client, h, "=HYPERLINK(\"http://x\")")
    client.put("/settings/price", json={"unit_price": 3000}, headers=h)
    deliver(client, h, cid, 2)
    client.post("/expenses", json={"category": "fuel", "amount": -100, "note": "correction"}, headers=h)
    r = client.get("/export/deliveries.csv", headers=h)
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]
    text = r.content.decode("utf-8")
    assert text.startswith("﻿") and "'=HYPERLINK" in text and ",=HYPERLINK" not in text
    assert r.text.count("\n") == 2                                       # header and one delivery
    inv = client.get("/export/invoices.csv", headers=h).text
    assert "INV-000001" in inv and ",6000," in inv
    ex = client.get("/export/expenses.csv", headers=h).text
    assert ",-100," in ex                                                # numbers are not altered
    for kind in ("customers", "ledger", "stock"):
        assert client.get(f"/export/{kind}.csv", headers=h).status_code == 200
    assert client.get("/export/users.csv", headers=h).status_code == 422
    future = (date.today() + timedelta(days=1)).isoformat()
    assert client.get(f"/export/deliveries.csv?start={future}", headers=h).text.strip("﻿\r\n").count("\n") == 0


def test_only_the_owner_can_use_reports_exports_and_backup(client):
    h = headers(client)
    d = add_driver(client, h, "dri")
    for url in ("/reports/dashboard", "/reports/receivables.pdf", "/export/ledger.csv", "/backup"):
        assert client.get(url, headers=d).status_code == 403
        assert client.get(url).status_code in (401, 403)


def test_ageing_pdf(client):
    pytest.importorskip("reportlab")
    h = headers(client)
    cid = add_customer(client, h, "Owes money")
    client.put("/settings/price", json={"unit_price": 3000}, headers=h)
    deliver(client, h, cid, 1, days_ago=45)
    r = client.get("/reports/receivables.pdf", headers=h)
    assert r.status_code == 200 and r.content.startswith(b"%PDF")


def test_ageing_pdf_with_many_customers_uses_more_pages(client):
    pytest.importorskip("reportlab")
    h = headers(client)
    client.put("/settings/price", json={"unit_price": 100}, headers=h)
    for i in range(70):
        deliver(client, h, add_customer(client, h, f"Customer {i}"))
    r = client.get("/reports/receivables.pdf", headers=h)
    assert r.status_code == 200 and r.content.count(b"/Type /Page\n") + r.content.count(b"/Type /Page ") >= 2


# ---------- backup ----------
@pytest.fixture()
def file_client(tmp_path):
    from fastapi.testclient import TestClient
    from backend import security
    from backend.app import create_app
    from backend.models import User
    db, ev = tmp_path / "live.db", tmp_path / "live_events.db"
    app = create_app(f"sqlite:///{db}", str(ev), "test-secret-long-enough-for-hs256-signing-0123", routing="straight")
    with app.state.SessionLocal() as s:
        s.add(User(username="boss", password_hash=security.hash_password("boss-password"), role="owner"))
        s.commit()
    return TestClient(app), db, ev


def test_backup_download_is_consistent_and_restores(file_client, tmp_path):
    c, db, ev = file_client
    h = headers(c)
    cid = add_customer(c, h, "Keep me")
    c.put("/settings/price", json={"unit_price": 3000}, headers=h)
    deliver(c, h, cid, 2)
    r = c.get("/backup", headers=h)
    assert r.status_code == 200 and r.headers["content-type"] == "application/zip"
    assert r.headers["x-backup-chain-ok"] == "true"
    zf = zipfile.ZipFile(BytesIO(r.content))
    manifest = json.loads(zf.read("manifest.json"))
    assert set(zf.namelist()) == {"gasora.db", "gasora_events.db", "manifest.json"}
    assert manifest["event_chain_ok"] is True and manifest["events"] >= 4
    assert "backup.created" in [e["event_type"] for e in eventlog.recent(c.app.state.events, 3)]   # the backup is logged
    # change the live data afterwards, then restore the backup into new paths
    cid2 = add_customer(c, h, "Added later")
    zpath = tmp_path / "b.zip"
    zpath.write_bytes(r.content)
    out_db, out_ev = tmp_path / "new" / "r.db", tmp_path / "new" / "r_events.db"
    res = backup.restore_backup(str(zpath), str(out_db), str(out_ev))
    assert res["events"] == manifest["events"] and res["kept"] == []
    con = sqlite3.connect(out_db)
    names = [x[0] for x in con.execute("SELECT name FROM customers")]
    assert names == ["Keep me"]                                         # state at the time of the backup
    assert con.execute("SELECT total FROM invoices").fetchone()[0] == 6000
    assert eventlog.verify(sqlite3.connect(out_ev))[0] is True
    assert cid2 not in [x[0] for x in con.execute("SELECT id FROM customers")]


def test_restore_refuses_bad_backups_and_keeps_existing_files(file_client, tmp_path):
    c, db, ev = file_client
    h = headers(c)
    add_customer(c, h, "X")
    data = c.get("/backup", headers=h).content
    good = tmp_path / "good.zip"
    good.write_bytes(data)
    # existing files need --force, and are kept under a new name
    with pytest.raises(ValueError, match="already exist"):
        backup.restore_backup(str(good), str(db), str(ev))
    c.app.state.engine.dispose()                                  # restoring needs the server stopped: release the files
    c.app.state.events.close()                                    # (Windows will not rename a file that is still open)
    res = backup.restore_backup(str(good), str(db), str(ev), force=True)
    import os
    assert len(res["kept"]) == 2 and all(os.path.exists(k) for k in res["kept"])
    # a changed file is caught by the checksum
    z = zipfile.ZipFile(good)
    parts = {n: z.read(n) for n in z.namelist()}
    parts["gasora.db"] = parts["gasora.db"] + b"x"
    bad = tmp_path / "bad.zip"
    with zipfile.ZipFile(bad, "w") as out:
        for n, b in parts.items():
            out.writestr(n, b)
    with pytest.raises(ValueError, match="checksum"):
        backup.restore_backup(str(bad), str(tmp_path / "a.db"), str(tmp_path / "a_e.db"))
    # a backup whose event log was rewritten (and the manifest fixed to match) fails the chain check
    tdir = tmp_path / "t"
    tdir.mkdir()
    (tdir / "e.db").write_bytes(parts["gasora_events.db"])
    con = sqlite3.connect(tdir / "e.db")
    con.execute("DROP TRIGGER events_no_update")
    con.execute("UPDATE events SET actor = 'someone else' WHERE id = 1")
    con.commit()
    con.close()
    parts["gasora_events.db"] = (tdir / "e.db").read_bytes()
    parts["gasora.db"] = z.read("gasora.db")
    import hashlib
    m = json.loads(parts["manifest.json"])
    m["files"] = {"gasora.db": hashlib.sha256(parts["gasora.db"]).hexdigest(),
                  "gasora_events.db": hashlib.sha256(parts["gasora_events.db"]).hexdigest()}
    parts["manifest.json"] = json.dumps(m).encode()
    forged = tmp_path / "forged.zip"
    with zipfile.ZipFile(forged, "w") as out:
        for n, b in parts.items():
            out.writestr(n, b)
    with pytest.raises(ValueError, match="event log"):
        backup.restore_backup(str(forged), str(tmp_path / "f.db"), str(tmp_path / "f_e.db"))
    # not a backup at all
    junk = tmp_path / "junk.zip"
    junk.write_bytes(b"hello")
    with pytest.raises(ValueError, match="cannot open"):
        backup.restore_backup(str(junk), str(tmp_path / "j.db"), str(tmp_path / "j_e.db"))


def test_backup_of_an_in_memory_system_works(client):
    h = headers(client)
    add_customer(client, h, "A")
    r = client.get("/backup", headers=h)
    assert r.status_code == 200 and r.headers["x-backup-chain-ok"] == "true"
