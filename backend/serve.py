"""Production entry point: one process that serves the API under /api and the built web app.

Run (the Dockerfile does this):  uvicorn backend.serve:build --factory --host 0.0.0.0 --port 8080 --workers 1 --proxy-headers
Keep it to ONE worker: the database is SQLite, and the login limiter and the settings are held in the process.

Settings come from environment variables:
  GASORA_ENV               "production" (the default here) refuses to start with a weak secret
  GASORA_SECRET            signs login tokens; 32+ random characters (required in production)
  GASORA_DB_URL            e.g. sqlite:////data/gasora.db         (put the files on a persistent disk)
  GASORA_EVENTS_PATH       e.g. /data/gasora_events.db
  GASORA_ADMIN_USER / GASORA_ADMIN_PASSWORD   creates the first owner when the database has no users yet; then remove both
  GASORA_BACKUP_DIR        where daily backups go (default /data/backups); GASORA_BACKUP_KEEP = how many to keep (default 14)
  GASORA_BACKUP_HOURS      hours between backups (default 24); 0 turns scheduled backups off
  GASORA_DIST              folder with the built web app (default frontend/dist)
  GASORA_ROUTING           straight (default here) or road (needs osmnx and the road map file)
  GASORA_GEMINI_KEY        optional, turns on the assistant
"""
import logging
import os
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from backend import backup, eventlog, security
from backend.app import create_app
from backend.models import User
from backend import settings

log = logging.getLogger("gasora.serve")

CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
       "img-src 'self' data: https://tile.openstreetmap.org; connect-src 'self'; "
       "frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": CSP,
}


def check_production(secret):
    if secret == settings.DEFAULT_SECRET or len(secret) < 32:
        raise SystemExit("GASORA_SECRET must be set to 32 or more random characters before running in production. "
                         "PowerShell: python -c \"import secrets; print(secrets.token_urlsafe(48))\"")


def bootstrap_owner(app, username, password):
    """Create the first owner from the environment, only while the database has no users."""
    if not username or not password:
        return False
    if len(username) < 3 or len(password) < 8:
        raise SystemExit("GASORA_ADMIN_USER needs 3+ characters and GASORA_ADMIN_PASSWORD 8+ characters.")
    with app.state.SessionLocal() as s:
        if s.scalar(select(User).limit(1)) is not None:
            return False
        u = User(username=username, password_hash=security.hash_password(password), role="owner")
        s.add(u)
        s.flush()
        eventlog.append(app.state.events, "system", "user.created",
                        {"user_id": u.id, "username": username, "role": "owner", "customer_id": None})
        s.commit()
    log.warning("Created the first owner account %r from the environment. Remove GASORA_ADMIN_PASSWORD now.", username)
    return True


def _backup_loop(api, directory, keep, hours, stop):
    if stop.wait(90):                                       # first backup shortly after start-up, then on schedule
        return
    while True:
        try:
            path = backup.write_scheduled(api.state.engine, api.state.events, directory, keep)
            log.info("Backup written: %s", path)
        except Exception:                                   # a failed backup must never stop the server
            log.exception("Scheduled backup failed")
        if stop.wait(hours * 3600):
            return


def build(environ=None):
    env = os.environ if environ is None else environ
    production = env.get("GASORA_ENV", "production") == "production"
    secret = env.get("GASORA_SECRET", settings.SECRET)
    if production:
        check_production(secret)
    api = create_app(db_url=env.get("GASORA_DB_URL"), events_path=env.get("GASORA_EVENTS_PATH"), secret=secret,
                     routing=env.get("GASORA_ROUTING", "straight"), expose_docs=not production)
    bootstrap_owner(api, env.get("GASORA_ADMIN_USER", ""), env.get("GASORA_ADMIN_PASSWORD", ""))

    stop = threading.Event()
    hours = float(env.get("GASORA_BACKUP_HOURS", "24"))

    @asynccontextmanager
    async def lifespan(_app):
        thread = None
        if hours > 0:
            thread = threading.Thread(target=_backup_loop, daemon=True, name="gasora-backup", args=(
                api, env.get("GASORA_BACKUP_DIR", "/data/backups"), int(env.get("GASORA_BACKUP_KEEP", "14")), hours, stop))
            thread.start()
        yield
        stop.set()

    root = FastAPI(title="Gasora", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)

    @root.middleware("http")
    async def secure_headers(request, call_next):
        response = await call_next(request)
        for k, v in HEADERS.items():
            response.headers.setdefault(k, v)
        if request.url.scheme == "https":
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000")
        if request.url.path.startswith("/api"):
            response.headers["Cache-Control"] = "no-store"          # money and customer data are never cached
        return response

    root.mount("/api", api)
    dist = env.get("GASORA_DIST", os.path.join("frontend", "dist"))
    if os.path.isdir(dist):
        root.mount("/", StaticFiles(directory=dist, html=True), name="web")
    else:
        log.warning("The built web app was not found at %s; only the API is served.", dist)
    root.state.api = api
    return root
