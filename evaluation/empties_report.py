"""Empties outstanding per day, from the saved final results (no new simulation needed).

In the simulation every customer holds exactly one cylinder at a time. A customer who has run out holds an
empty until a delivery swaps it, so the empties waiting at customers on a day equal the customers without gas
that day. 'Empties outstanding per day' is therefore days_out divided by the number of counted days.
(A richer model, with spare empties or delayed returns, would need real data.)

Run:  python -m evaluation.empties_report [--file data/final_road_results.csv] [--days 60]
"""
import argparse
import csv
from collections import defaultdict

import numpy as np

from evaluation.harness import bootstrap_ci

REFERENCE = "P2 average-days + OR-Tools"


def main(path, days):
    per = defaultdict(dict)                                   # policy -> seed -> empties per day
    with open(path) as f:
        for row in csv.DictReader(f):
            per[row["policy"]][int(row["seed"])] = float(row["days_out"]) / days
    if REFERENCE not in per:
        raise SystemExit(f"{REFERENCE!r} not found in {path}")
    seeds = sorted(per[REFERENCE])
    print(f"Empties outstanding per day (customers holding an empty at the end of a day), {len(seeds)} seeds")
    print(f"{'policy':44s}{'mean':>8s}   difference from the old rule [95% interval]")
    for name, by_seed in per.items():
        vals = [by_seed[s] for s in seeds]
        if name == REFERENCE:
            print(f"{name:44s}{np.mean(vals):8.2f}")
            continue
        diff = [by_seed[s] - per[REFERENCE][s] for s in seeds]
        lo, hi = bootstrap_ci(diff)
        print(f"{name:44s}{np.mean(vals):8.2f}   {np.mean(diff):7.2f}  [{lo:.2f}, {hi:.2f}]")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default="data/final_road_results.csv")
    ap.add_argument("--days", type=int, default=60)
    a = ap.parse_args()
    main(a.file, a.days)
