"""Final comparison of the delivery policies.

Settings: road distances, 200 customers, a warm-up period that is not counted, 60 counted days,
20 paired seeds, 95% bootstrap intervals. Results are saved after every seed (use the same command
again to continue after an interruption).

Rows:
  P1            reactive + nearest neighbour
  P2            average-days rule (alert 2 days before) + OR-Tools   (the old rule)
  P3 (x3)       Gasora, risk cut-offs 0.05, 0.10 and 0.20
  Ablation      Gasora prediction (cut-off 0.10) + nearest neighbour

P3 at different cut-offs makes different numbers of deliveries. For a comparison at equal workload,
run evaluation.matched as well.

Run:  python -m evaluation.final --source road
"""
import argparse
import csv
import os

import numpy as np

import config
from evaluation import policies
from evaluation.checkpoint import Checkpoint
from evaluation.harness import EARLY_DAYS, bootstrap_ci, run_policy
from evaluation.world import build_static

PRIMARY_CUTOFF = 0.10          # fixed from the sensitivity study, before this run
ROWS = [
    ("P1 reactive + NN", "p1", None),
    ("P2 average-days + OR-Tools", "p2", None),
    ("P3 Gasora, cut-off 0.05", "p3", 0.05),
    ("P3 Gasora, cut-off 0.10", "p3", 0.10),
    ("P3 Gasora, cut-off 0.20", "p3", 0.20),
    ("Ablation: prediction + NN (cut-off 0.10)", "abl", 0.10),
]
MEASURES = ["runouts_per_100cm", "km_per_delivery", "total_km", "early", "days_out", "deliveries"]


def run_row(static, kind, cutoff, days, warmup):
    old = policies.CANDIDATE_RISK
    try:
        if cutoff is not None:
            policies.CANDIDATE_RISK = cutoff
        fn = {"p1": policies.p1_reactive_nn, "p2": policies.p2_average_ortools,
              "p3": policies.p3_gasora, "abl": policies.ablation_prediction_nn}[kind]
        return run_policy(static, fn, days, warmup)
    finally:
        policies.CANDIDATE_RISK = old


def main(n_seeds, days, warmup, n, source):
    print("Settings:")
    print(f"  seeds {n_seeds}, counted days {days}, warm-up days {warmup}, customers {n}, distances {source}")
    print(f"  vehicles {config.N_VEHICLES}, capacity {config.CAPACITY} cylinders, shift {config.SHIFT_MIN} min, "
          f"service {config.SERVICE_MIN} min, skip penalty {config.EMERGENCY_COST}")
    print(f"  solver time per daily plan {policies.PLAN_SECONDS} s, early delivery = more than {EARLY_DAYS} days of gas left")
    ck = Checkpoint(f"final_{source}", days=days, warmup=warmup, n=n)
    if ck.done():
        print(f"  continuing: seeds {sorted(ck.done())} are already done")

    for s in range(1, n_seeds + 1):
        if s in ck.done():
            continue
        static = build_static(s, n, source)
        rec = {"seed": s, "rows": {}}
        for name, kind, cutoff in ROWS:
            rec["rows"][name] = run_row(static, kind, cutoff, days, warmup)
        ck.add(rec)
        print(f"seed {s} done", flush=True)

    recs = ck.ordered()
    names = [r[0] for r in ROWS]
    get = lambda name, k: np.array([r["rows"][name][k] for r in recs], dtype=float)

    print(f"\nMean over {len(recs)} seeds")
    print(f"{'policy':44s}" + "".join(f"{k:>19s}" for k in MEASURES))
    for name in names:
        print(f"{name:44s}" + "".join(f"{get(name, k).mean():19.1f}" for k in MEASURES))

    def diff_table(title, a_names, b_name):
        print(f"\n{title}")
        for a in a_names:
            for k in ("runouts_per_100cm", "km_per_delivery", "total_km"):
                d = get(a, k) - get(b_name, k)
                lo, hi = bootstrap_ci(d)
                print(f"{a:44s} {k:19s} {d.mean():9.1f}  [{lo:.1f}, {hi:.1f}]")

    diff_table("Paired differences, policy minus P2 (the old rule). Negative run-outs = better.",
               [n_ for n_ in names if not n_.startswith("P2")], "P2 average-days + OR-Tools")
    diff_table("Effect of routing: Gasora (cut-off 0.10) minus the same prediction with nearest neighbour",
               ["P3 Gasora, cut-off 0.10"], "Ablation: prediction + NN (cut-off 0.10)")
    print("\nNote: policies with different cut-offs make different numbers of deliveries. "
          "A fair comparison with the old rule at equal workload is in evaluation.matched.")

    path = os.path.join("data", f"final_{source}_results.csv")
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["policy", "seed"] + MEASURES)
        for r in recs:
            for name in names:
                w.writerow([name, r["seed"]] + [round(r["rows"][name][k], 3) for k in MEASURES])
    print(f"Saved {path}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=20)
    ap.add_argument("--days", type=int, default=60)
    ap.add_argument("--warmup", type=int, default=30)
    ap.add_argument("--n", type=int, default=200)
    ap.add_argument("--source", choices=["straight", "road"], default="road")
    a = ap.parse_args()
    main(a.seeds, a.days, a.warmup, a.n, a.source)
