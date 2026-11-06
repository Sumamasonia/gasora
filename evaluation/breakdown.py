"""Breakdown by customer type: where does the predictor help?

Same simulated agencies as the final run. Run-outs, deliveries and early deliveries are split into
steady and irregular customers. Kilometres cannot be split (a route serves both types).

For each type we compare Gasora with the average-days rule at the same number of deliveries *for that
type*: the rule gives a curve (deliveries, run-outs) per seed, and we read it at Gasora's deliveries.

Primary comparison (fixed before the run): Gasora with cut-off 0.10 against the rule, run-outs,
for each type. The other cut-offs are shown as extra rows.

Run:  python -m evaluation.breakdown --source road
Results are saved after every seed; run the same command again to continue.
"""
import argparse
import csv
import os

import numpy as np

from evaluation import policies
from evaluation.checkpoint import Checkpoint
from evaluation.harness import PATTERNS, bootstrap_ci, run_policy
from evaluation.matched import make_rule, read_curve
from evaluation.world import build_static

LEADS = [2, 4, 6, 8, 10]
CUTOFFS = [0.05, 0.10, 0.20]
PRIMARY_CUTOFF = 0.10


def main(n_seeds, days, warmup, n, source):
    ck = Checkpoint(f"breakdown_{source}", days=days, warmup=warmup, n=n)
    if ck.done():
        print(f"continuing: seeds {sorted(ck.done())} are already done")
    old = policies.CANDIDATE_RISK
    try:
        for s in range(1, n_seeds + 1):
            if s in ck.done():
                continue
            static = build_static(s, n, source)
            rec = {"seed": s, "P2": {}, "P3": {}}
            for l in LEADS:
                rec["P2"][str(l)] = run_policy(static, make_rule(l), days, warmup)
            for c in CUTOFFS:
                policies.CANDIDATE_RISK = c
                rec["P3"][str(c)] = run_policy(static, policies.p3_gasora, days, warmup)
            ck.add(rec)
            print(f"seed {s} done", flush=True)
    finally:
        policies.CANDIDATE_RISK = old

    recs = ck.ordered()
    print(f"\nBreakdown over {len(recs)} seeds, {days} counted days after {warmup} warm-up days, "
          f"{n} customers ({source} distances)")
    for p in PATTERNS:
        print(f"  {p}: {np.mean([r['P2']['2'][f'n_{p}'] for r in recs]):.0f} customers per seed")

    for p in PATTERNS:
        print(f"\n=== {p} customers: mean over seeds ===")
        print(f"{'setting':20s}{'deliveries':>12s}{'run-outs/100cm':>16s}{'early':>8s}{'days without gas':>18s}")
        for name, group, keys in (("P2 lead {} d", "P2", LEADS), ("P3 cut-off {}", "P3", CUTOFFS)):
            for k in keys:
                rows = [r[group][str(k)] for r in recs]
                print(f"{name.format(f'{k:.2f}' if group == 'P3' else k):20s}"
                      f"{np.mean([x[f'deliveries_{p}'] for x in rows]):12.1f}"
                      f"{np.mean([x[f'runouts_per_100cm_{p}'] for x in rows]):16.1f}"
                      f"{np.mean([x[f'early_{p}'] for x in rows]):8.1f}"
                      f"{np.mean([x[f'days_out_{p}'] for x in rows]):18.1f}")

    print("\n=== Gasora minus the average-days rule, same number of deliveries for that type ===")
    print("(negative = fewer run-outs for Gasora; interval is a 95% bootstrap over seeds)")
    print(f"{'type':11s}{'P3 cut-off':>11s}{'seeds':>7s}   run-outs per 100 customer-months")
    for p in PATTERNS:
        for c in CUTOFFS:
            diffs = []
            for r in recs:
                curve = [(r["P2"][str(l)][f"deliveries_{p}"], r["P2"][str(l)][f"runouts_per_100cm_{p}"]) for l in LEADS]
                x = r["P3"][str(c)][f"deliveries_{p}"]
                y = read_curve(curve, x)
                if y is not None:                         # Gasora made more or fewer deliveries than any rule setting
                    diffs.append(r["P3"][str(c)][f"runouts_per_100cm_{p}"] - y)
            mark = "  <- primary" if c == PRIMARY_CUTOFF else ""
            if not diffs:
                print(f"{p:11s}{c:11.2f}{0:7d}   outside the rule's range{mark}")
                continue
            lo, hi = bootstrap_ci(diffs)
            print(f"{p:11s}{c:11.2f}{len(diffs):7d}   {np.mean(diffs):7.1f}  [{lo:6.1f}, {hi:6.1f}]{mark}")

    path = os.path.join("data", f"breakdown_{source}.csv")
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["policy", "setting", "seed", "type", "deliveries", "runouts_per_100cm", "early", "days_out"])
        for r in recs:
            for group in ("P2", "P3"):
                for k, m in r[group].items():
                    for p in PATTERNS:
                        w.writerow([group, k, r["seed"], p, m[f"deliveries_{p}"],
                                    round(m[f"runouts_per_100cm_{p}"], 2), m[f"early_{p}"], m[f"days_out_{p}"]])
    print(f"\nSaved {path}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=20)
    ap.add_argument("--days", type=int, default=60)
    ap.add_argument("--warmup", type=int, default=30)
    ap.add_argument("--n", type=int, default=200)
    ap.add_argument("--source", choices=["straight", "road"], default="road")
    a = ap.parse_args()
    main(a.seeds, a.days, a.warmup, a.n, a.source)
