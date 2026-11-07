"""Calibration check for the refill window.

For every simulated cylinder, we make a prediction on each day of its life (this is what the daily
planner sees), using only the history before that cylinder, and check whether the true remaining days
fall inside the predicted window. If the model fits, about 80% should fall inside the 10%-90% window.

Run:  python -m evaluation.window_check --seeds 20 --n 100
"""
import argparse
from collections import defaultdict

import numpy as np

from evaluation.world import build_static
from predictor.risk import _fit, pooled_values, refill_window

N_CYLINDERS = 6          # cylinders checked per customer (after the 6 starting intervals)


def main(n_seeds, n):
    hit = defaultdict(list)           # group -> list of 1/0
    width = defaultdict(list)
    err_g, err_r = defaultdict(list), defaultdict(list)    # forecast error of the cylinder duration, in days
    for seed in range(1, n_seeds + 1):
        static = build_static(seed, n)
        pm, ps = pooled_values(static.customers)
        for c, dur in zip(static.customers, static.durations):
            for k in range(N_CYLINDERS):
                history = list(c["intervals"]) + [float(x) for x in dur[:k]]
                true_len = float(dur[k])
                mu_g, _ = _fit({"intervals": history, "days_since": 0.0}, pm, ps)   # Gasora: recent intervals
                mu_r = float(np.mean(history))                                       # old rule: average of all
                for g in ("all", c["pattern"]):
                    err_g[g].append(abs(mu_g - true_len))
                    err_r[g].append(abs(mu_r - true_len))
                for day in range(int(true_len)):                      # one prediction per day
                    cust = {"intervals": history, "days_since": float(day)}
                    lo, hi = refill_window(cust, pm, ps)
                    remaining = true_len - day
                    phase = "first third" if day < true_len / 3 else "middle third" if day < 2 * true_len / 3 else "last third"
                    ok = 1 if lo <= remaining <= hi else 0
                    for g in ("all", c["pattern"], phase):
                        hit[g].append(ok)
                        width[g].append(hi - lo)
    print(f"Refill window (10% to 90%), {n_seeds} seeds, {n} customers, simulated data")
    print(f"{'group':14s}{'predictions':>12s}{'inside window':>16s}{'average width (days)':>24s}")
    for g in ("all", "steady", "irregular", "first third", "middle third", "last third"):
        print(f"{g:14s}{len(hit[g]):12d}{100 * np.mean(hit[g]):15.1f}%{np.mean(width[g]):24.1f}")
    print("If the model fitted perfectly, 'inside window' would be about 80%.")
    print("\nForecast error of the cylinder duration at the start of a cycle (mean absolute error, days)")
    print(f"{'group':14s}{'Gasora (recent 4)':>20s}{'average-days rule':>20s}")
    for g in ("all", "steady", "irregular"):
        print(f"{g:14s}{np.mean(err_g[g]):20.2f}{np.mean(err_r[g]):20.2f}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=20)
    ap.add_argument("--n", type=int, default=100)
    a = ap.parse_args()
    main(a.seeds, a.n)
