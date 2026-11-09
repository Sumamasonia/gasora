"""Empties study: do ageing alerts and swap candidates reduce empties outstanding, and at what cost?

Customers do not always hand back the old cylinder (probability p_return per cylinder and visit, a
placeholder). Unreturned empties age. We compare, on the same simulated agencies:

  Old rule (lead 2)              average-days rule + OR-Tools, empties collected only incidentally
  Gasora, no swaps               risk cut-off 0.10, empties collected only incidentally
  Gasora + swap candidates       the same, plus customers holding empties 15+ days become candidates,
                                 with the ageing weights from backend/settings.py

A swap is a normal stop: no extra trip. This study is separate from the final results.

Run:  python -m evaluation.empties_study --source road
Results are saved after every seed; run the same command again to continue.
"""
import argparse
import csv
import os

import numpy as np

from backend.settings import EMPTY_AGEING_TIERS
from evaluation import policies
from evaluation.policies import is_called
from evaluation.checkpoint import Checkpoint
from evaluation.harness import AGE_TIERS, EmptiesModel, bootstrap_ci, run_policy
from evaluation.world import build_static

CUTOFF = 0.10
ROWS = ["Old rule (lead 2), no swaps", "Gasora 0.10, no swaps", "Gasora 0.10 + swap candidates"]


def swap_weight(c, day):
    """Skip-penalty weight for a customer who holds empties, by how long; None if under the first tier."""
    if c.get("held", 0) <= 0 or c.get("held_since") is None:
        return None
    age = day - c["held_since"]
    found = None
    for min_days, weight, _ in EMPTY_AGEING_TIERS:
        if age >= min_days:
            found = weight
    return found


def gasora_with_swaps(static, state, day):
    risk = policies._risks(state)
    called = {c["id"] for c in state if is_called(c)}
    candidates, weights = [], {}
    for c in state:
        sw = swap_weight(c, day)
        if is_called(c) or risk[c["id"]] >= policies.CANDIDATE_RISK or sw is not None:
            candidates.append(c)
            weights[c["id"]] = max(risk[c["id"]], sw or 0.0)
    return policies._ortools_routes(static, candidates, weights, called)


def run_row(static, name, days, warmup, model):
    old = policies.CANDIDATE_RISK
    try:
        policies.CANDIDATE_RISK = CUTOFF
        fn = {ROWS[0]: policies.p2_average_ortools, ROWS[1]: policies.p3_gasora, ROWS[2]: gasora_with_swaps}[name]
        return run_policy(static, fn, days, warmup, model)
    finally:
        policies.CANDIDATE_RISK = old


def main(n_seeds, days, warmup, n, source, p_return):
    model = EmptiesModel(p_return)
    print(f"Settings: seeds {n_seeds}, counted days {days}, warm-up {warmup}, customers {n}, distances {source}")
    print(f"  customers hand back each old cylinder with probability {p_return} (placeholder); "
          f"ageing tiers {[(d, w) for d, w, _ in EMPTY_AGEING_TIERS]}")
    ck = Checkpoint(f"empties_{source}", days=days, warmup=warmup, n=n, p_return=p_return)
    if ck.done():
        print(f"continuing: seeds {sorted(ck.done())} are already done")
    for s in range(1, n_seeds + 1):
        if s in ck.done():
            continue
        static = build_static(s, n, source)
        ck.add({"seed": s, "rows": {name: run_row(static, name, days, warmup, model) for name in ROWS}})
        print(f"seed {s} done", flush=True)

    recs = ck.ordered()
    get = lambda name, k: np.array([r["rows"][name][k] for r in recs], dtype=float)
    labels = [label for _, label in AGE_TIERS]

    print(f"\nService and cost, mean over {len(recs)} seeds")
    cols = ["runouts_per_100cm", "deliveries", "total_km", "vehicles_used_per_day"]
    print(f"{'policy':32s}" + "".join(f"{c:>23s}" for c in cols))
    for name in ROWS:
        print(f"{name:32s}" + "".join(f"{get(name, c).mean():23.1f}" for c in cols))

    print("\nEmpties held by customers, mean over seeds (customers per day in each ageing tier)")
    cols2 = ["empties_per_day", "aged_customers_per_day"] + [f"aged_{l}_per_day" for l in labels]
    print(f"{'policy':32s}" + "".join(f"{c.replace('_per_day', '').replace('aged_', 'age '):>20s}" for c in cols2))
    for name in ROWS:
        print(f"{name:32s}" + "".join(f"{get(name, c).mean():20.2f}" for c in cols2))

    def diffs(title, a, b, keys):
        print(f"\n{title}")
        for k in keys:
            d = get(a, k) - get(b, k)
            lo, hi = bootstrap_ci(d)
            print(f"  {k:26s} {d.mean():9.2f}  [{lo:.2f}, {hi:.2f}]")

    keys = ["empties_per_day", "aged_customers_per_day", "deliveries", "total_km", "runouts_per_100cm",
            "vehicles_used_per_day"]
    diffs("Swap candidates: (Gasora + swaps) minus (Gasora, no swaps), 95% bootstrap interval", ROWS[2], ROWS[1], keys)
    diffs("Gasora without swaps minus the old rule", ROWS[1], ROWS[0], keys)

    path = os.path.join("data", f"empties_study_{source}.csv")
    allkeys = sorted(recs[0]["rows"][ROWS[0]].keys())
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["policy", "seed"] + allkeys)
        for r in recs:
            for name in ROWS:
                w.writerow([name, r["seed"]] + [round(r["rows"][name][k], 3) for k in allkeys])
    print(f"\nSaved {path}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=20)
    ap.add_argument("--days", type=int, default=90)
    ap.add_argument("--warmup", type=int, default=60)
    ap.add_argument("--n", type=int, default=200)
    ap.add_argument("--source", choices=["straight", "road"], default="road")
    ap.add_argument("--p-return", type=float, default=0.8)
    a = ap.parse_args()
    main(a.seeds, a.days, a.warmup, a.n, a.source, a.p_return)
