"""Sensitivity run: how do the two placeholder settings of Gasora change the result?

  1. CANDIDATE_RISK: only customers with at least this risk are considered
  2. EMERGENCY_COST: skip penalty for a customer with risk 1.0

Same seeds and same fake agencies for every setting (paired). P2 is shown as a reference.

Run:  python -m evaluation.sensitivity --seeds 3 --days 30 --n 100
"""
import argparse
import csv
import os

import numpy as np

from evaluation import policies
from evaluation.harness import run_policy
from evaluation.world import build_static
from planner import routing

KEYS = ["runouts_per_100cm", "early", "deliveries", "total_km", "km_per_delivery"]

# (label, candidate risk, emergency cost)
SETTINGS = [
    ("cut-off 0.05, cost 300", 0.05, 300),
    ("cut-off 0.10, cost 300", 0.10, 300),
    ("cut-off 0.20, cost 300", 0.20, 300),
    ("cut-off 0.30, cost 300", 0.30, 300),
    ("cut-off 0.10, cost 100", 0.10, 100),
    ("cut-off 0.10, cost 1000", 0.10, 1000),
]


def main(n_seeds, days, n, source="straight"):
    seeds = list(range(1, n_seeds + 1))
    rows = {"P2 average-days + OR-Tools (reference)": []}
    cutoffs = sorted({cut for _, cut, _ in SETTINGS})
    for label, _, _ in SETTINGS:
        rows["P3 " + label] = []
    for cut in cutoffs:                                   # the ablation does not use the cost
        rows[f"NN-ablation cut-off {cut:.2f}"] = []

    old_risk, old_cost = policies.CANDIDATE_RISK, routing.EMERGENCY_COST
    try:
        for s in seeds:
            static = build_static(s, n, source)
            rows["P2 average-days + OR-Tools (reference)"].append(
                run_policy(static, policies.p2_average_ortools, days))
            for label, cut, cost in SETTINGS:
                policies.CANDIDATE_RISK, routing.EMERGENCY_COST = cut, cost
                rows["P3 " + label].append(run_policy(static, policies.p3_gasora, days))
            for cut in cutoffs:
                policies.CANDIDATE_RISK = cut
                rows[f"NN-ablation cut-off {cut:.2f}"].append(
                    run_policy(static, policies.ablation_prediction_nn, days))
            print(f"seed {s} done", flush=True)
    finally:
        policies.CANDIDATE_RISK, routing.EMERGENCY_COST = old_risk, old_cost

    print(f"\nMean over {n_seeds} seeds, {days} days, {n} customers ({source} distances)")
    print(f"{'setting':44s}" + "".join(f"{k:>19s}" for k in KEYS))
    for name, rs in rows.items():
        print(f"{name:44s}" + "".join(f"{np.mean([r[k] for r in rs]):19.1f}" for k in KEYS))

    if os.path.isdir("data"):
        with open(os.path.join("data", "sensitivity.csv"), "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["setting", "seed"] + KEYS)
            for name, rs in rows.items():
                for s, r in zip(seeds, rs):
                    w.writerow([name, s] + [round(r[k], 3) for k in KEYS])
        print("\nSaved data/sensitivity.csv")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=3)
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--n", type=int, default=100)
    ap.add_argument("--source", choices=["straight", "road"], default="straight")
    a = ap.parse_args()
    main(a.seeds, a.days, a.n, a.source)
