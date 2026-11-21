"""Backup and restore (SQLite).

A backup is one zip file with a consistent copy of the main database and of the event log, and a manifest with the
SHA-256 of each file, the number of events and the newest event hash. The copies are taken with SQLite's own backup
call, so they are consistent while the server is running.

Restoring is an offline command (python -m backend.manage restore FILE): it checks the hashes, checks the event chain,
and keeps the current files under a new name instead of overwriting them. Keep backups, and the newest hash, on
another device: a backup on the same disk does not survive the disk failing.
"""
import hashlib
import io
import json
import os
import shutil
import sqlite3
import tempfile
import zipfile
from datetime import datetime, timezone

from backend import eventlog

FORMAT = 1
DB_NAME, EVENTS_NAME = "gasora.db", "gasora_events.db"
TABLES_NEEDED = {"users", "customers", "deliveries", "ledger_entries", "settings"}


def _sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def _copy(src_conn, dst_path):
    dst = sqlite3.connect(dst_path)
    try:
        src_conn.backup(dst)
    finally:
        dst.close()


def make_backup(engine, events_conn, now=None):
    """Return (zip bytes, manifest) for the running system."""
    now = now or datetime.now(timezone.utc)
    with tempfile.TemporaryDirectory() as tmp:
        db_path, ev_path = os.path.join(tmp, DB_NAME), os.path.join(tmp, EVENTS_NAME)
        raw = engine.raw_connection()
        try:
            _copy(raw.driver_connection, db_path)
        finally:
            raw.close()
        with eventlog._LOCK:
            _copy(events_conn, ev_path)
        ev = sqlite3.connect(ev_path)
        try:
            ok, message = eventlog.verify(ev)
            count = ev.execute("SELECT COUNT(*) FROM events").fetchone()[0]
            head = eventlog.head(ev)
        finally:
            ev.close()
        manifest = {"format": FORMAT, "created": now.isoformat(), "files": {DB_NAME: _sha(db_path), EVENTS_NAME: _sha(ev_path)},
                    "events": count, "event_head": head, "event_chain_ok": ok, "event_chain_message": message}
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            z.write(db_path, DB_NAME)
            z.write(ev_path, EVENTS_NAME)
            z.writestr("manifest.json", json.dumps(manifest, indent=2))
        return buf.getvalue(), manifest


def restore_backup(zip_path, db_path, events_path, force=False, now=None):
    """Check the backup and put its two files in place. Raises ValueError with the reason if anything is wrong.
    Existing files are renamed to <name>.before-restore-<time>, never deleted."""
    now = now or datetime.now(timezone.utc)
    targets = [db_path, events_path]
    if not force and any(os.path.exists(t) for t in targets):
        raise ValueError("the database files already exist; use --force to restore over them (they are kept under a new name)")
    try:
        z = zipfile.ZipFile(zip_path)
    except (zipfile.BadZipFile, FileNotFoundError, OSError) as e:
        raise ValueError(f"cannot open the backup file: {e}")
    with z, tempfile.TemporaryDirectory() as tmp:
        names = set(z.namelist())
        if names != {DB_NAME, EVENTS_NAME, "manifest.json"}:
            raise ValueError("this is not a Gasora backup (unexpected files inside)")
        try:
            manifest = json.loads(z.read("manifest.json"))
        except ValueError:
            raise ValueError("the manifest is damaged")
        if manifest.get("format") != FORMAT:
            raise ValueError("this backup has a format this version does not know")
        for name in (DB_NAME, EVENTS_NAME):                     # extract by fixed name only (no path from the zip)
            with z.open(name) as src, open(os.path.join(tmp, name), "wb") as dst:
                shutil.copyfileobj(src, dst)
            if _sha(os.path.join(tmp, name)) != manifest["files"].get(name):
                raise ValueError(f"{name} does not match its checksum: the backup is damaged or was changed")
        ev = sqlite3.connect(os.path.join(tmp, EVENTS_NAME))
        try:
            ok, message = eventlog.verify(ev, anchor=manifest.get("event_head"))
        finally:
            ev.close()
        if not ok:
            raise ValueError("the event log in the backup fails its check: " + message)
        db = sqlite3.connect(os.path.join(tmp, DB_NAME))
        try:
            if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise ValueError("the database in the backup is damaged")
            have = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        finally:
            db.close()
        if not TABLES_NEEDED <= have:
            raise ValueError("the database in the backup is missing tables: " + ", ".join(sorted(TABLES_NEEDED - have)))
        stamp = now.strftime("%Y%m%d-%H%M%S")
        moved = []                                               # (original, kept name)
        try:
            for target in targets:
                if os.path.exists(target):
                    kept_name = f"{target}.before-restore-{stamp}"
                    os.replace(target, kept_name)
                    moved.append((target, kept_name))
        except OSError:                                          # on Windows: a file the running server still holds open
            for original, kept_name in moved:
                os.replace(kept_name, original)
            raise ValueError("a database file is in use. Stop the server (and anything else that uses it), then try again. Nothing was changed.")
        kept = [k for _, k in moved]
        for target in targets:
            os.makedirs(os.path.dirname(target) or ".", exist_ok=True)
        shutil.copyfile(os.path.join(tmp, DB_NAME), db_path)
        shutil.copyfile(os.path.join(tmp, EVENTS_NAME), events_path)
    return {"events": manifest["events"], "created": manifest["created"], "kept": kept, "message": message}
