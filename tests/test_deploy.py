import os
import subprocess
import sys
import zipfile

import pytest

from backend import backup, security
from tests.test_dispatch import add_customer, add_driver, client, headers  # noqa: F401  (fixtures and helpers)

STRONG = "x" * 20 + "-test-secret-for-production-0123456789"


# ---------- login limiter ----------
def test_limiter_blocks_after_five_failures_and_clears_on_success():
    t = [0.0]
    lim = security.LoginLimiter(clock=lambda: t[0])
    for _ in range(4):
        lim.fail("1.1.1.1", "Boss")
    assert not lim.blocked("1.1.1.1", "boss")
    lim.fail("1.1.1.1", "boss")
    assert lim.blocked("1.1.1.1", "BOSS")                       # names are not case sensitive for counting
    assert not lim.blocked("1.1.1.1", "other") and not lim.blocked("2.2.2.2", "boss")
    t[0] = 601
    assert not lim.blocked("1.1.1.1", "boss")                   # the window passed
    for _ in range(3):
        lim.fail("1.1.1.1", "boss")
    lim.clear("1.1.1.1", "boss")
    assert not lim.blocked("1.1.1.1", "boss")


def test_limiter_caps_one_address_trying_many_names():
    lim = security.LoginLimiter(max_per_address=10)
    for i in range(10):
        lim.fail("9.9.9.9", f"user{i}")
    assert lim.blocked("9.9.9.9", "brand-new-name") and not lim.blocked("8.8.8.8", "brand-new-name")


def test_login_is_locked_after_repeated_wrong_passwords(client):
    for _ in range(5):
        assert client.post("/auth/login", json={"username": "boss", "password": "wrong-password"}).status_code == 401
    r = client.post("/auth/login", json={"username": "boss", "password": "boss-password"})
    assert r.status_code == 429 and "ten minutes" in r.json()["detail"]      # even the right password waits


def test_a_good_login_resets_the_count(client):
    for _ in range(4):
        client.post("/auth/login", json={"username": "boss", "password": "nope-nope"})
    assert client.post("/auth/login", json={"username": "boss", "password": "boss-password"}).status_code == 200
    for _ in range(4):
        client.post("/auth/login", json={"username": "boss", "password": "nope-nope"})
    assert client.post("/auth/login", json={"username": "boss", "password": "boss-password"}).status_code == 200


# ---------- passwords ----------
def test_change_own_password_ends_old_sessions(client):
    h = headers(client)
    new = client.post("/auth/password", json={"old_password": "boss-password", "new_password": "a-new-password"}, headers=h)
    assert new.status_code == 200
    assert client.get("/users", headers=h).status_code == 401                          # the old token is dead
    nh = {"Authorization": "Bearer " + new.json()["access_token"]}
    assert client.get("/users", headers=nh).status_code == 200                         # the new one works
    assert client.post("/auth/login", json={"username": "boss", "password": "boss-password"}).status_code == 401
    assert client.post("/auth/login", json={"username": "boss", "password": "a-new-password"}).status_code == 200
    log = str(client.get("/audit/events", headers=nh).json())
    assert "password.changed" in log and "a-new-password" not in log and "boss-password" not in log


def test_change_password_rules(client):
    h = headers(client)
    assert client.post("/auth/password", json={"old_password": "wrong", "new_password": "a-new-password"}, headers=h).status_code == 401
    assert client.post("/auth/password", json={"old_password": "boss-password", "new_password": "short"}, headers=h).status_code == 422
    assert client.post("/auth/password", json={"old_password": "boss-password", "new_password": "boss-password"}, headers=h).status_code == 422
    assert client.post("/auth/password", json={"old_password": "x", "new_password": "a-new-password"}).status_code in (401, 403)


def test_wrong_old_passwords_are_counted_by_the_limiter(client):
    h = headers(client)
    for _ in range(5):
        client.post("/auth/password", json={"old_password": "guess-guess", "new_password": "a-new-password"}, headers=h)
    assert client.post("/auth/password", json={"old_password": "boss-password", "new_password": "a-new-password"}, headers=h).status_code == 429


def test_owner_can_reset_a_password_and_it_ends_that_users_sessions(client):
    h = headers(client)
    dh = add_driver(client, h, "dri")
    uid = [u for u in client.get("/users", headers=h).json() if u["username"] == "dri"][0]["id"]
    assert client.post(f"/users/{uid}/password", json={"new_password": "reset-password-1"}, headers=dh).status_code == 403
    assert client.post(f"/users/{uid}/password", json={"new_password": "short"}, headers=h).status_code == 422
    assert client.post("/users/999/password", json={"new_password": "reset-password-1"}, headers=h).status_code == 404
    assert client.post(f"/users/{uid}/password", json={"new_password": "reset-password-1"}, headers=h).status_code == 200
    assert client.get("/my-routes", headers=dh).status_code == 401
    assert client.post("/auth/login", json={"username": "dri", "password": "reset-password-1"}).status_code == 200
    assert "reset-password-1" not in str(client.get("/audit/events", headers=h).json())


# ---------- scheduled backups ----------
def test_scheduled_backups_are_written_and_old_ones_deleted(client, tmp_path):
    from datetime import datetime, timedelta, timezone
    h = headers(client)
    add_customer(client, h, "A")
    d = tmp_path / "bk"
    start = datetime(2026, 1, 1, 3, 0, tzinfo=timezone.utc)
    paths = [backup.write_scheduled(client.app.state.engine, client.app.state.events, str(d), keep=3, now=start + timedelta(days=i))
             for i in range(5)]
    left = sorted(os.listdir(d))
    assert len(left) == 3 and left[-1] == os.path.basename(paths[-1]) and not any(n.endswith(".part") for n in left)
    assert zipfile.ZipFile(paths[-1]).testzip() is None


# ---------- production entry point ----------
def env(tmp_path, **extra):
    dist = tmp_path / "dist"
    dist.mkdir(exist_ok=True)
    (dist / "index.html").write_text("<!doctype html><title>Gasora</title><div id=root></div>")
    base = {"GASORA_ENV": "production", "GASORA_SECRET": STRONG, "GASORA_DB_URL": f"sqlite:///{tmp_path / 'g.db'}",
            "GASORA_EVENTS_PATH": str(tmp_path / "e.db"), "GASORA_DIST": str(dist), "GASORA_BACKUP_HOURS": "0",
            "GASORA_ADMIN_USER": "boss", "GASORA_ADMIN_PASSWORD": "first-password-1"}
    base.update(extra)
    return base


def test_production_refuses_a_weak_or_default_secret(tmp_path):
    from backend import serve, settings
    for bad in ("short", settings.DEFAULT_SECRET):
        with pytest.raises(SystemExit):
            serve.build(env(tmp_path, GASORA_SECRET=bad))


def test_production_app_serves_web_and_api_with_safe_headers(tmp_path):
    from fastapi.testclient import TestClient
    from backend import serve
    root = serve.build(env(tmp_path))
    with TestClient(root) as c:
        page = c.get("/")
        assert page.status_code == 200 and "Gasora" in page.text
        for k in ("X-Content-Type-Options", "X-Frame-Options", "Content-Security-Policy", "Referrer-Policy"):
            assert k in page.headers, k
        assert "Strict-Transport-Security" not in page.headers                    # plain http in this test
        api = c.get("/api/health")
        assert api.status_code == 200 and api.json() == {"status": "ok"} and api.headers["cache-control"] == "no-store"
        assert c.get("/api/docs").status_code == 404 and c.get("/api/openapi.json").status_code == 404 and c.get("/docs").status_code == 404
        r = c.post("/api/auth/login", json={"username": "boss", "password": "first-password-1"})
        assert r.status_code == 200 and r.json()["role"] == "owner"
        https = c.get("/api/health", headers={"x-forwarded-proto": "https"}, follow_redirects=False)
        assert https.status_code == 200


def test_https_requests_get_hsts(tmp_path):
    from fastapi.testclient import TestClient
    from backend import serve
    with TestClient(serve.build(env(tmp_path)), base_url="https://testserver") as c:
        assert "max-age" in c.get("/").headers["Strict-Transport-Security"]


def test_first_owner_is_created_once_only(tmp_path):
    from fastapi.testclient import TestClient
    from backend import serve
    e = env(tmp_path)
    serve.build(e)
    serve.build({**e, "GASORA_ADMIN_USER": "intruder", "GASORA_ADMIN_PASSWORD": "another-password"})     # restart with other values
    with TestClient(serve.build(e)) as c:
        assert c.post("/api/auth/login", json={"username": "boss", "password": "first-password-1"}).status_code == 200
        assert c.post("/api/auth/login", json={"username": "intruder", "password": "another-password"}).status_code == 401


def test_bootstrap_rejects_a_short_password(tmp_path):
    from backend import serve
    with pytest.raises(SystemExit):
        serve.build(env(tmp_path, GASORA_ADMIN_PASSWORD="short"))


def test_development_mode_keeps_the_docs_and_allows_the_default_secret(tmp_path):
    from fastapi.testclient import TestClient
    from backend import serve
    e = env(tmp_path, GASORA_ENV="development")
    e.pop("GASORA_SECRET")
    root = serve.build(e)
    assert root.state.api.openapi_url == "/openapi.json"


def test_the_server_starts_without_the_road_map_packages():
    code = "import sys; sys.modules['osmnx'] = None; sys.modules['geopandas'] = None; import backend.serve, backend.manage"
    r = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, cwd=os.path.dirname(os.path.dirname(__file__)))
    assert r.returncode == 0, r.stderr[-500:]


def test_the_two_straight_routers_agree():
    pytest.importorskip("osmnx")
    from backend.routers import StraightRouter as A
    from planner.road_router import StraightRouter as B
    a, b, pts = A(), B(), [(31.4, 73.0), (31.5, 73.1)]
    assert (a.mode, a.matrix(pts), a.path(*pts)) == (b.mode, b.matrix(pts), b.path(*pts))
