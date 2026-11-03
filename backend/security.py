"""Passwords (scrypt from Python's standard library) and login tokens (JWT)."""
import hashlib
import hmac
import os
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


def create_token(user_id, role, secret, minutes=8 * 60):
    exp = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    return jwt.encode({"sub": str(user_id), "role": role, "exp": exp}, secret, algorithm="HS256")


def decode_token(token, secret):
    return jwt.decode(token, secret, algorithms=["HS256"])
