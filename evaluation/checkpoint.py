"""Save results after every seed, so a long run can continue after an interruption.

The file name contains a fingerprint of the settings and of the code. If a setting or the code changes,
the old checkpoint is not used, so results made with different code are never combined.
"""
import hashlib
import json
import os

import config
from evaluation import policies
from evaluation.meta import code_hash


def fingerprint(**extra):
    items = [config.SHIFT_MIN, config.N_VEHICLES, config.CAPACITY, config.SERVICE_MIN, config.SPEED_KMH,
             config.EMERGENCY_COST, config.URGENT_PENALTY, policies.PLAN_SECONDS, code_hash(), sorted(extra.items())]
    return hashlib.md5(repr(items).encode()).hexdigest()[:10]


class Checkpoint:
    def __init__(self, name, **params):
        os.makedirs("data", exist_ok=True)
        self.path = os.path.join("data", f"ckpt_{name}_{fingerprint(**params)}.json")
        self.records = []
        if os.path.exists(self.path):
            with open(self.path) as f:
                self.records = json.load(f)

    def done(self):
        return {r["seed"] for r in self.records}

    def add(self, record):
        self.records.append(record)
        tmp = self.path + ".tmp"
        with open(tmp, "w") as f:
            json.dump(self.records, f)
        os.replace(tmp, self.path)

    def ordered(self):
        return sorted(self.records, key=lambda r: r["seed"])
