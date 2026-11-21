"""Staff management: switch accounts on and off, and see what each person has done (from the event log)."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from backend import eventlog
from backend.models import User

ROLES = ["owner", "driver", "ceo"]


def set_active(session, events, actor, user_id, active):
    user = session.get(User, user_id)
    if user is None:
        raise LookupError("user not found")
    if user.username == actor and not active:
        raise ValueError("you cannot deactivate your own account")
    if user.active == active:
        return user
    if not active and user.role == "owner":
        others = [u for u in session.scalars(select(User).where(User.role == "owner", User.active.is_(True))) if u.id != user.id]
        if not others:
            raise ValueError("at least one owner account must stay active")
    user.active = active
    eventlog.append(events, actor, "user.activated" if active else "user.deactivated", {"user_id": user.id})
    return user


def activity(session, events, days=30, now=None):
    """Per account: events written in the last `days` days, the newest event time, and a count by event type."""
    now = now or datetime.now(timezone.utc)
    since = (now - timedelta(days=days)).isoformat()
    with eventlog._LOCK:
        rows = events.execute("SELECT actor, event_type, COUNT(*), MAX(ts) FROM events WHERE ts >= ? GROUP BY actor, event_type",
                              (since,)).fetchall()
    per = {}
    for actor, etype, n, last in rows:
        d = per.setdefault(actor, {"events": 0, "last": None, "by_type": {}})
        d["events"] += n
        d["by_type"][etype] = n
        d["last"] = max(d["last"] or "", last)
    out = []
    for u in session.scalars(select(User).order_by(User.id)):
        d = per.get(u.username, {"events": 0, "last": None, "by_type": {}})
        out.append({"user_id": u.id, "username": u.username, "role": u.role, "active": u.active, "events": d["events"],
                    "last_event": d["last"], "top_types": sorted(d["by_type"].items(), key=lambda kv: -kv[1])[:4]})
    return {"days": days, "staff": out}
