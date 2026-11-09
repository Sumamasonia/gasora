"""Seed stages and the freeze check (docs/PROTOCOL.md sections 8 and 11).

Seeds above 20 are reserved for the confirmation run. They are refused unless docs/freeze.json exists and
its code fingerprint matches the current code. This makes an early run visible; it cannot make it impossible.
"""
import json
import os

from evaluation.meta import code_hash

FREEZE_FILE = os.path.join("docs", "freeze.json")
STAGES = {"dev": range(1, 11), "check": range(11, 21), "confirm": range(21, 41), "spare": range(41, 51)}
DEVELOPMENT_MAX = 20


def load_freeze(path=FREEZE_FILE):
    if not os.path.exists(path):
        return None
    with open(path) as f:
        return json.load(f)


def check_seeds(seeds, path=FREEZE_FILE):
    """Stop (SystemExit) if reserved seeds are requested before the freeze. Returns the freeze data or None."""
    if max(seeds) <= DEVELOPMENT_MAX:
        return None
    freeze = load_freeze(path)
    if freeze is None:
        raise SystemExit("Seeds above 20 are reserved for the confirmation run. "
                         "Freeze first (python -m evaluation.freeze) and commit docs/freeze.json.")
    if freeze.get("code_hash") != code_hash():
        raise SystemExit("The code has changed since the freeze (code fingerprint differs). "
                         "Restore the frozen code, or record a deviation and freeze again.")
    return freeze
