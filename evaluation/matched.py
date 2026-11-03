"""Matched-workload comparison: is Gasora's prediction better than the average-days rule
when both make about the same number of deliveries?

Both methods have a setting that decides how many customers they visit:
  P2  (average-days rule): alert when days since delivery >= average - LEAD days
  P2s (stronger rule):     same alert, but the skip penalty grows with how overdue the
                           customer is (days since delivery / average, at most 1)
  P3  (Gasora):            consider customers with risk >= CUT-OFF
We run several settings of each. For every seed, a rule gives a curve (deliveries, run-outs).
We read that curve at the number of deliveries P3 made, and compare run-outs and total km.

Run:  python -m evaluation.matched --seeds 10 --days 30 --n 100 [--source road]
"""
import argparse
import csv
import os

import numpy as np

from evaluation import policies
from evaluation.harness import run_policy, bootstrap_ci
from evaluation.world import build_static

LEADS = [0, 2, 4, 6, 7, 8, 9, 10]               # days before the average (P2)
STRONG_LEADS = [2, 4, 6, 8, 10]                 # P2s
CUTOFFS = [0.05, 0.10, 0.15, 0.20, 0.30, 0.40]  # risk cut-off (P3)


def make_rule(lead, strong=False):
    def policy(static, state, day):
        called = {c["id"] for c in state if c["out"]}
        cand, weight = [], {}
        for c in state:
            avg = sum(c["intervals"]) / len(c["intervals"])
            if c["out"] or c["days_since"] >= avg - lead:
                cand.append(c)
                weight[c["id"]] = min(1.0, c["days_since"] / avg) if strong else 1.0
        return policies._ortools_routes(static, cand, weight, called)
    return policy


def read_curve(points, x):
    """points = list of (deliveries, value). Linear reading at x, or None if outside the range."""
    pts = sorted(points)
    xs = [p[0] for p in pts]
    if x < xs[0] or x > xs[-1]:
        return None
    return float(np.interp(x, xs, [p[1] for p in pts]))


def compare(res, ref, leads, seeds):
    print(f"\nP3 minus {ref} at the same number of deliveries ({ref} curve read per seed)")
    print(f"{'P3 setting':14s}{'seeds':>6s}  {'run-outs/100cm: diff [95% interval]':40s}{'total km: diff [95% interval]'}")
    for c in CUTOFFS:
        d_run, d_km = [], []
        for i in range(len(seeds)):
            x = res["P3"][c][i]["deliveries"]
            run = read_curve([(res[ref][l][i]["deliveries"], res[ref][l][i]["runouts_per_100cm"]) for l in leads], x)
            km = read_curve([(res[ref][l][i]["deliveries"], res[ref][l][i]["total_km"]) for l in leads], x)
            if run is None:
                continue            # P3 made more or fewer deliveries than any setting of the rule
            d_run.append(res["P3"][c][i]["runouts_per_100cm"] - run)
            d_km.append(res["P3"][c][i]["total_km"] - km)
        if not d_run:
            print(f"cut-off {c:<6.2f}{0:>6d}  outside the {ref} range")
            continue
        lo, hi = bootstrap_ci(d_run)
        lo2, hi2 = bootstrap_ci(d_km)
        print(f"cut-off {c:<6.2f}{len(d_run):>6d}  {np.mean(d_run):8.1f}  [{lo:6.1f}, {hi:6.1f}]"
              f"{'':14s}{np.mean(d_km):8.1f}  [{lo2:7.1f}, {hi2:7.1f}]")


def main(n_seeds, days, n, source="straight"):
    seeds = list(range(1, n_seeds + 1))
    res = {"P2": {l: [] for l in LEADS}, "P2s": {l: [] for l in STRONG_LEADS},
           "P3": {c: [] for c in CUTOFFS}}
    old = policies.CANDIDATE_RISK
    try:
        for s in seeds:
            static = build_static(s, n, source)
            for l in LEADS:
                res["P2"][l].append(run_policy(static, make_rule(l), days))
            for l in STRONG_LEADS:
                res["P2s"][l].append(run_policy(static, make_rule(l, strong=True), days))
            for c in CUTOFFS:
                policies.CANDIDATE_RISK = c
                res["P3"][c].append(run_policy(static, policies.p3_gasora, days))
            print(f"seed {s} done", flush=True)
    finally:
        policies.CANDIDATE_RISK = old

    print(f"\nMean over {n_seeds} seeds, {days} days, {n} customers ({source} distances)")
    print(f"{'setting':22s}{'deliveries':>12s}{'run-outs/100cm':>16s}{'early':>8s}{'total km':>10s}")
    for name, par, label in (("P2", LEADS, "lead {} d"), ("P2s", STRONG_LEADS, "lead {} d"),
                             ("P3", CUTOFFS, "cut-off {:.2f}")):
        for p in par:
            rs = res[name][p]
            print(f"{name + ' ' + label.format(p):22s}"
                  f"{np.mean([r['deliveries'] for r in rs]):12.1f}"
                  f"{np.mean([r['runouts_per_100cm'] for r in rs]):16.1f}"
                  f"{np.mean([r['early'] for r in rs]):8.1f}"
                  f"{np.mean([r['total_km'] for r in rs]):10.1f}")

    compare(res, "P2", LEADS, seeds)
    compare(res, "P2s", STRONG_LEADS, seeds)
    print("\nA negative run-out difference means Gasora has fewer run-outs than the rule for the same deliveries.")

    if os.path.isdir("data"):
        with open(os.path.join("data", "matched.csv"), "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["policy", "setting", "seed", "deliveries", "runouts_per_100cm", "early", "total_km"])
            for name in res:
                for p, rs in res[name].items():
                    for s, r in zip(seeds, rs):
                        w.writerow([name, p, s, r["deliveries"], round(r["runouts_per_100cm"], 2),
                                    r["early"], round(r["total_km"], 1)])
        print("Saved data/matched.csv")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=3)
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--n", type=int, default=100)
    ap.add_argument("--source", choices=["straight", "road"], default="straight")
    a = ap.parse_args()
    main(a.seeds, a.days, a.n, a.source)
