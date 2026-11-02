"""Hash-chained, append-only event log.

Every event stores the hash of the event before it, so changing or deleting an old event
breaks the chain and verify() reports it. SQLite triggers also block UPDATE and DELETE,
so normal code cannot change the log by mistake.

Limits (to state honestly in the report):
  * Someone with full access to the database file can drop the triggers and rewrite the
    WHOLE chain from some point on. The chain alone cannot detect that. Keeping a copy of the
    latest hash somewhere else (an anchor) is what catches it.
  * Removing the newest events cannot be detected from the chain alone either (same reason).
"""
import hashlib
import json
import sqlite3
from datetime import datetime, timezone

GENESIS = "0" * 64

SCHEMA = """
CREATE TABLE IF NOT EXISTS events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          TEXT NOT NULL,
    actor       TEXT NOT NULL,
    event_type  TEXT NOT NULL,
    payload     TEXT NOT NULL,
    prev_hash   TEXT NOT NULL,
    hash        TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events
BEGIN SELECT RAISE(ABORT, 'event log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events
BEGIN SELECT RAISE(ABORT, 'event log is append-only'); END;
"""


def connect(path=":memory:"):
    conn = sqlite3.connect(path, isolation_level=None)   # we control transactions ourselves
    conn.executescript(SCHEMA)
    return conn


def _canonical(payload):
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _hash(prev_hash, ts, actor, event_type, payload_text):
    text = "\n".join([prev_hash, ts, actor, event_type, payload_text])
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def append(conn, actor, event_type, payload, ts=None):
    """Add one event and return (id, hash)."""
    ts = ts or datetime.now(timezone.utc).isoformat()
    payload_text = _canonical(payload)
    conn.execute("BEGIN IMMEDIATE")                       # one writer at a time
    try:
        row = conn.execute("SELECT hash FROM events ORDER BY id DESC LIMIT 1").fetchone()
        prev_hash = row[0] if row else GENESIS
        h = _hash(prev_hash, ts, actor, event_type, payload_text)
        cur = conn.execute(
            "INSERT INTO events (ts, actor, event_type, payload, prev_hash, hash) VALUES (?,?,?,?,?,?)",
            (ts, actor, event_type, payload_text, prev_hash, h))
        conn.execute("COMMIT")
        return cur.lastrowid, h
    except Exception:
        conn.execute("ROLLBACK")
        raise


def head(conn):
    """Latest hash. Store a copy outside the database from time to time (the anchor)."""
    row = conn.execute("SELECT hash FROM events ORDER BY id DESC LIMIT 1").fetchone()
    return row[0] if row else GENESIS


def verify(conn, anchor=None):
    """Check the whole chain. Returns (ok, message).
    If anchor is given, the newest hash must equal it (this catches removed newest events)."""
    prev = GENESIS
    last_id = 0
    for id_, ts, actor, etype, payload, prev_hash, h in conn.execute(
            "SELECT id, ts, actor, event_type, payload, prev_hash, hash FROM events ORDER BY id"):
        if id_ != last_id + 1:
            return False, f"event number {last_id + 1} is missing (found {id_})"
        if prev_hash != prev:
            return False, f"event {id_}: link to the previous event is broken"
        if _hash(prev_hash, ts, actor, etype, payload) != h:
            return False, f"event {id_}: content does not match its hash"
        prev, last_id = h, id_
    if anchor is not None and prev != anchor:
        return False, "newest hash does not match the stored anchor (events removed or rewritten)"
    return True, f"chain OK ({last_id} events)"
