"""Freeze the method before the confirmation run.

Writes docs/freeze.json with the code fingerprint and the chosen variant. Commit it, then tag the commit:
  git tag -a eval-freeze-v1 -m "Method frozen before the confirmation run"

Run:  python -m evaluation.freeze --fit-m 6 --floor 1 [--early-pull]    (fit-m 0 means "all records")
"""
import argparse
import json
import os
import re
from datetime import datetime, timezone

from evaluation.guard import FREEZE_FILE
from evaluation.meta import code_hash, git_state, run_metadata

VARIANT_LOG = os.path.join("docs", "variant_log.md")
MAX_VARIANTS = 12


def logged_variants(path=VARIANT_LOG):
    if not os.path.exists(path):
        return 0
    with open(path, encoding="utf-8") as f:
        return sum(1 for line in f if re.match(r"\|\s*\d+\s*\|", line))


def main(fit_m, floor, early_pull, skip_penalty=None):
    n = logged_variants()
    if n > MAX_VARIANTS:
        raise SystemExit(f"{n} variants are logged; the protocol allows {MAX_VARIANTS}.")
    if n == 0:
        print("Warning: docs/variant_log.md has no rows. Log every variant you tried before freezing.")
    commit, dirty = git_state()
    if dirty:
        raise SystemExit("There are uncommitted changes to tracked files. Commit them first, then freeze.")
    variant = {"fit_m": fit_m or None, "fit_floor": floor, "early_pull": early_pull}
    if skip_penalty is not None:
        variant["skip_penalty"] = skip_penalty
    data = {"created": datetime.now(timezone.utc).isoformat(timespec="seconds"), "code_hash": code_hash(),
            "commit_before_freeze": commit, "variants_logged": n, "variant": variant,
            "metadata": run_metadata(variant)}
    os.makedirs(os.path.dirname(FREEZE_FILE), exist_ok=True)
    with open(FREEZE_FILE, "w") as f:
        json.dump(data, f, indent=2)
    print(f"Wrote {FREEZE_FILE}. Variants logged: {n}. Variant: {variant}")
    print("Next: git add docs/freeze.json; git commit; git tag -a eval-freeze-v1 -m \"Method frozen\"; git push --tags")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--fit-m", type=int, default=0, help="records used by the censored fit; 0 = all (default)")
    ap.add_argument("--floor", type=float, default=1.0)
    ap.add_argument("--early-pull", action="store_true")
    ap.add_argument("--skip-penalty", type=int, default=None, help="skip penalty scale (protocol v1.3); default 300")
    a = ap.parse_args()
    main(a.fit_m, a.floor, a.early_pull, a.skip_penalty)
