"""Passwords (scrypt from Python's standard library) and login tokens (JWT)."""
import hashlib
import hmac
import os
import time
from datetime import datetime, timedelta, timezone

import jwt

_N, _R, _P = 2 ** 14, 8, 1


def hash_password(password):
    salt = os.urandom(16)
    h = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=_N, r=_R, p=_P)
    return f"scrypt${salt.hex()}${h.hex()}"


def verify_password(password, stored):
    try:
        _, salt_hex, hash_hex = stored.split("$")
        h = hashlib.scrypt(password.encode("utf-8"), salt=bytes.fromhex(salt_hex), n=_N, r=_R, p=_P)
        return hmac.compare_digest(h.hex(), hash_hex)
    except Exception:
        return False


DUMMY_HASH = hash_password("not-a-real-password")      # used so a wrong username takes the same time


def password_version(password_hash):
    """Short fingerprint of the stored password. Tokens carry it, so changing a password ends all older logins."""
    return hashlib.sha256(password_hash.encode()).hexdigest()[:16]


def create_token(user_id, role, secret, minutes=8 * 60, pv=None):
    exp = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    claims = {"sub": str(user_id), "role": role, "exp": exp}
    if pv is not None:
        claims["pv"] = pv
    return jwt.encode(claims, secret, algorithm="HS256")


def decode_token(token, secret):
    return jwt.decode(token, secret, algorithms=["HS256"])


class LoginLimiter:
    """Counts failed logins in memory (one server process). After `max_failures` failures within `window` seconds for the
    same address and username, or `max_per_address` for one address, further attempts are refused until the window passes.
    A successful login clears the count for that address and username."""

    def __init__(self, max_failures=5, window=600, max_per_address=30, clock=time.monotonic):
        self.max_failures, self.window, self.max_per_address, self.clock = max_failures, window, max_per_address, clock
        self._fails = {}

    def _recent(self, key):
        now = self.clock()
        kept = [t for t in self._fails.get(key, []) if now - t < self.window]
        if kept:
            self._fails[key] = kept
        else:
            self._fails.pop(key, None)
        return kept

    def blocked(self, address, username):
        return (len(self._recent((address, username.lower()))) >= self.max_failures
                or len(self._recent((address, None))) >= self.max_per_address)

    def fail(self, address, username):
        if len(self._fails) > 10000:                       # bound the memory a flood of random names could use
            self._fails.pop(next(iter(self._fails)))
        now = self.clock()
        for key in ((address, username.lower()), (address, None)):
            self._fails.setdefault(key, []).append(now)

    def clear(self, address, username):
        self._fails.pop((address, username.lower()), None)
