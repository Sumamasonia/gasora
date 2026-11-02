import sqlite3
import pytest

from backend import eventlog as el


def make_log(n=5):
    conn = el.connect()
    for i in range(1, n + 1):
        el.append(conn, "driver1", "delivery", {"customer": i, "cylinders": 1}, ts=f"2026-01-0{i}T10:00:00+00:00")
    return conn


def test_clean_chain_is_ok():
    ok, msg = el.verify(make_log())
    assert ok, msg


def test_update_and_delete_are_blocked():
    conn = make_log()
    with pytest.raises(sqlite3.DatabaseError):
        conn.execute("UPDATE events SET actor='x' WHERE id=2")
    with pytest.raises(sqlite3.DatabaseError):
        conn.execute("DELETE FROM events WHERE id=2")
    assert el.verify(conn)[0]


def test_tamper_with_content_is_detected():
    conn = make_log()
    conn.execute("DROP TRIGGER events_no_update")          # attacker with database access
    conn.execute("UPDATE events SET payload='{\"customer\":99,\"cylinders\":50}' WHERE id=3")
    ok, msg = el.verify(conn)
    assert not ok and "event 3" in msg


def test_deleted_event_is_detected():
    conn = make_log()
    conn.execute("DROP TRIGGER events_no_delete")
    conn.execute("DELETE FROM events WHERE id=2")
    ok, msg = el.verify(conn)
    assert not ok and "missing" in msg


def test_attacker_who_fixes_one_hash_is_still_detected():
    conn = make_log()
    conn.execute("DROP TRIGGER events_no_update")
    new_payload = el._canonical({"customer": 99, "cylinders": 50})
    row = conn.execute("SELECT ts, actor, event_type, prev_hash FROM events WHERE id=3").fetchone()
    new_hash = el._hash(row[3], row[0], row[1], row[2], new_payload)
    conn.execute("UPDATE events SET payload=?, hash=? WHERE id=3", (new_payload, new_hash))
    ok, msg = el.verify(conn)
    assert not ok and "event 4" in msg                      # the next link breaks


def test_removed_newest_event_needs_the_anchor():
    conn = make_log()
    anchor = el.head(conn)
    conn.execute("DROP TRIGGER events_no_delete")
    conn.execute("DELETE FROM events WHERE id=5")
    assert el.verify(conn)[0]                               # chain alone cannot see it
    ok, msg = el.verify(conn, anchor=anchor)                # the anchor can
    assert not ok and "anchor" in msg
