"""Day-by-day evaluation loop.

Each day: the policy plans routes, deliveries happen, then customers who ran out during
the day are flagged. Measures:
  run-outs per 100 customer-months, km per delivery, early deliveries,
  customer-days without gas.
Not yet included: empties outstanding.

Run:  python -m evaluation.harness --seeds 5 --days 30 --n 100
"""
import numpy as np

from evaluation.world import build_static, new_state
from evaluation.policies import POLICIES

EARLY_DAYS = 5     # delivered with more than this many days of gas left = early (placeholder)


def route_km(route, km):
    dist, here = 0.0, 0
    for stop in route:
        dist += km[here][stop]
        here = stop
    return dist + km[here][0]


def run_policy(static, policy, days, warmup=0):
    """Simulate warmup + days days. Only the last `days` days are counted: the warm-up lets the
    simulation forget its arbitrary starting state (customers start in the middle of a cylinder)."""
    state = new_state(static)
    by_id = {c["id"]: c for c in state}
    runouts = deliveries = early = days_out = 0
    total_km = 0.0
    for d in range(warmup + days):
        if d == warmup:                                   # start counting here
            runouts = deliveries = early = days_out = 0
            total_km = 0.0
        for c in state:
            c["days_since"] = d - c["last_delivery"]
        routes = policy(static, state, d)
        for route in routes:
            if not route:
                continue
            total_km += route_km(route, static.km)
            for cid in route:
                c = by_id[cid]
                if not c["out"] and c["runout_day"] - d > EARLY_DAYS:
                    early += 1
                dur = static.durations[cid - 1]
                c["intervals"].append(float(dur[c["cyl"] % len(dur)]))   # driver records it
                c["cyl"] += 1
                c["out"] = False
                c["last_delivery"] = d
                c["runout_day"] = d + dur[c["cyl"] % len(dur)]
                deliveries += 1
        for c in state:                                   # end of day
            if not c["out"] and c["runout_day"] < d + 1:
                c["out"] = True
                runouts += 1
            if c["out"]:
                days_out += 1
    customer_months = static.n * days / 30
    return {
        "runouts_per_100cm": 100 * runouts / customer_months,
        "km_per_delivery": total_km / deliveries if deliveries else float("nan"),
        "early": early,
        "days_out": days_out,
        "deliveries": deliveries,
        "total_km": total_km,
    }


def bootstrap_ci(diffs, n_boot=2000, seed=0):
    """95% bootstrap interval for the mean of paired differences."""
    rng = np.random.default_rng(seed)
    diffs = np.asarray(diffs, dtype=float)
    means = [rng.choice(diffs, size=len(diffs), replace=True).mean() for _ in range(n_boot)]
    return float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))


def main(n_seeds=5, days=30, n=100, source="straight", warmup=0):
    seeds = list(range(1, n_seeds + 1))
    print(f"{n_seeds} seeds, {days} days, {n} customers, distances: {source}")
    results = {name: [] for name in POLICIES}
    for s in seeds:
        static = build_static(s, n, source)
        for name, policy in POLICIES.items():
            results[name].append(run_policy(static, policy, days, warmup))
        print(f"seed {s} done", flush=True)

    keys = ["runouts_per_100cm", "km_per_delivery", "early", "days_out", "deliveries", "total_km"]
    print("\nMean over seeds")
    print(f"{'policy':34s}" + "".join(f"{k:>18s}" for k in keys))
    for name, rows in results.items():
        print(f"{name:34s}" + "".join(f"{np.mean([r[k] for r in rows]):18.1f}" for k in keys))

    print("\nPaired differences (policy minus P1 reactive), mean and 95% bootstrap interval")
    base = results["P1 reactive + NN"]
    for name, rows in results.items():
        if name.startswith("P1"):
            continue
        for k in ("runouts_per_100cm", "km_per_delivery", "total_km"):
            d = [r[k] - b[k] for r, b in zip(rows, base)]
            lo, hi = bootstrap_ci(d)
            print(f"{name:34s} {k:20s} {np.mean(d):8.1f}  [{lo:.1f}, {hi:.1f}]")

    print("\nGasora against the average-days rule (P3 minus P2)")
    for k in ("runouts_per_100cm", "km_per_delivery", "total_km"):
        d = [a[k] - b[k] for a, b in zip(results["P3 Gasora"], results["P2 average-days + OR-Tools"])]
        lo, hi = bootstrap_ci(d)
        print(f"{k:20s} {np.mean(d):8.1f}  [{lo:.1f}, {hi:.1f}]")


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=5)
    ap.add_argument("--days", type=int, default=30)
    ap.add_argument("--n", type=int, default=100)
    ap.add_argument("--source", choices=["straight", "road"], default="straight")
    ap.add_argument("--warmup", type=int, default=0)
    a = ap.parse_args()
    main(a.seeds, a.days, a.n, a.source, a.warmup)
