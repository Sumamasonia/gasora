"""Facts stored with every result: which code, which settings, which machine.

code_hash() fingerprints the code the evaluation depends on (not the git history, and not the web application),
so results made with different code are never combined, even when the changes are not committed yet.
"""
import hashlib
import os
import platform
import subprocess
import sys
from datetime import datetime, timezone

import config

CODE_DIRS = ["evaluation", "planner", "predictor", "simulator"]
CODE_FILES = ["config.py", "backend/settings.py"]      # the web application itself does not change evaluation results


def code_hash():
    h = hashlib.md5()
    files = [f for f in CODE_FILES if os.path.exists(f)]
    for d in CODE_DIRS:
        for root, dirs, names in os.walk(d):
            dirs[:] = sorted(x for x in dirs if x != "__pycache__")
            files += [os.path.join(root, n).replace("\\", "/") for n in sorted(names) if n.endswith(".py")]
    for path in sorted(files):
        h.update(path.encode())
        with open(path, "rb") as f:
            h.update(f.read().replace(b"\r\n", b"\n"))             # the same hash with Windows or Unix line endings
    return h.hexdigest()[:12]


def git_state():
    """(commit, has_uncommitted_changes) or (None, None) when git is not available."""
    try:
        commit = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
        dirty = bool(subprocess.run(["git", "status", "--porcelain", "--untracked-files=no"],
                                    capture_output=True, text=True, check=True).stdout.strip())
        return commit, dirty
    except Exception:
        return None, None


def _version(name):
    try:
        return __import__(name).__version__
    except Exception:
        return "unknown"


def run_metadata(variant=None):
    from evaluation import policies
    from evaluation.harness import EARLY_DAYS
    commit, dirty = git_state()
    return {
        "commit": commit, "uncommitted_changes": dirty, "code_hash": code_hash(),
        "time": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "python": sys.version.split()[0], "platform": platform.platform(), "processor": platform.processor(),
        "packages": {p: _version(p) for p in ("numpy", "scipy", "ortools", "networkx", "osmnx")},
        "settings": {"vehicles": config.N_VEHICLES, "capacity": config.CAPACITY, "shift_min": config.SHIFT_MIN,
                     "service_min": config.SERVICE_MIN, "skip_penalty": config.EMERGENCY_COST, "gasora_skip_penalty": policies.SKIP_PENALTY or config.EMERGENCY_COST,
                     "plan_seconds": policies.PLAN_SECONDS, "early_days": EARLY_DAYS},
        "variant": variant or {},
    }
