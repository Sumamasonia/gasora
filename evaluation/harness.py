"""Day-by-day evaluation loop.

Each day: the policy plans routes, deliveries happen, then customers who ran out during
the day are flagged. Measures:
  run-outs per 100 customer-months, km per delivery, early deliveries,
  customer-days without gas.
Not yet included: empties outstanding.

Run:  python -m evaluation.harness --seeds 5 --days 30 --n 100
"""
from dataclasses import dataclass

import numpy as np

from backend.settings import EMPTY_AGEING_TIERS

from evaluation.world import build_static, new_state
from evaluation.policies import POLICIES

PATTERNS = ("steady", "irregular")     # hidden usage patterns of the simulated customers
AGE_TIERS = [(days, label) for days, _, label in EMPTY_AGEING_TIERS]
EARLY_DAYS = 5     # delivered with more than this many days of gas left = early (placeholder)


def route_km(route, km):
    dist, here = 0.0, 0
    for stop in route:
        dist += km[here][stop]
        here = stop
    return dist + km[here][0]


@dataclass
class EmptiesModel:
    """Optional model of empty cylinders that customers do not hand back.
    At every visit, each old cylinder (the ones just used and any empties held from before) is handed back
    with probability p_return, independently. Those not handed back stay at the customer and age.
    p_return is a PLACEHOLDER: we have no data on how often customers keep empties."""
    p_return: float = 0.8


def _tier_index(age_days):
    found = None
    for i, (min_days, _) in enumerate(AGE_TIERS):
        if age_days >= min_days:
            found = i
    return found


def run_policy(static, policy, days, warmup=0, empties=None):
    """Simulate warmup + days days. Only the last `days` days are counted: the warm-up lets the
    simulation forget its arbitrary starting state (customers start in the middle of a cylinder)."""
    state = new_state(static)
    by_id = {c["id"]: c for c in state}
    pattern = {c["id"]: c["pattern"] for c in static.customers}
    fresh = lambda: {p: {"runouts": 0, "deliveries": 0, "early": 0, "days_out": 0} for p in PATTERNS}
    by_p = fresh()                                        # the same counts, split by customer type
    runouts = deliveries = early = days_out = 0
    total_km = 0.0
    vehicle_days = 0
    held_days = 0                                          # empties held, summed over counted days
    bucket_days = [0] * len(AGE_TIERS)                     # customer-days in each ageing tier
    if empties is not None:
        rng_back = {c["id"]: np.random.default_rng([static.seed, c["id"], 99]) for c in state}
        for c in state:
            c["held"], c["held_since"] = 0, None           # empties held by the customer, and since when
    for d in range(warmup + days):
        if d == warmup:                                   # start counting here
            runouts = deliveries = early = days_out = 0
            total_km = 0.0
            vehicle_days = held_days = 0
            bucket_days = [0] * len(AGE_TIERS)
            by_p = fresh()
        for c in state:
            c["days_since"] = d - c["last_delivery"]
        routes = policy(static, state, d)
        for route in routes:
            if not route:
                continue
            vehicle_days += 1
            total_km += route_km(route, static.km)
            for cid in route:
                c = by_id[cid]
                if not c["out"] and c["runout_day"] - d > EARLY_DAYS:
                    early += 1
                    by_p[pattern[cid]]["early"] += 1
                dur = static.durations[cid - 1]
                c["intervals"].append(float(dur[c["cyl"] % len(dur)]))   # driver records it
                c["cyl"] += 1
                c["out"] = False
                c["last_delivery"] = d
                c["runout_day"] = d + dur[c["cyl"] % len(dur)]
                deliveries += 1
                by_p[pattern[cid]]["deliveries"] += 1
                if empties is not None:                   # old cylinders come back with probability p_return
                    n_old = c["demand"] + c["held"]
                    back = int((rng_back[cid].random(n_old) < empties.p_return).sum())
                    kept = n_old - back
                    if kept == 0:
                        c["held_since"] = None
                    elif c["held"] == 0:
                        c["held_since"] = d
                    c["held"] = kept
        for c in state:                                   # end of day
            if not c["out"] and c["runout_day"] < d + 1:
                c["out"] = True
                runouts += 1
                by_p[pattern[c["id"]]]["runouts"] += 1
            if c["out"]:
                days_out += 1
                by_p[pattern[c["id"]]]["days_out"] += 1
            if empties is not None and c["held"] > 0:
                held_days += c["held"]
                i = _tier_index(d - c["held_since"])
                if i is not None:
                    bucket_days[i] += 1
    customer_months = static.n * days / 30
    result = {
        "runouts_per_100cm": 100 * runouts / customer_months,
        "km_per_delivery": total_km / deliveries if deliveries else float("nan"),
        "early": early,
        "days_out": days_out,
        "deliveries": deliveries,
        "total_km": total_km,
        "vehicles_used_per_day": vehicle_days / days,
    }
    if empties is not None:
        result["empties_per_day"] = held_days / days
        result["aged_customers_per_day"] = sum(bucket_days) / days
        for (_, label), n_days in zip(AGE_TIERS, bucket_days):
            result[f"aged_{label}_per_day"] = n_days / days
    for p in PATTERNS:                                    # km cannot be split: a route serves both types
        n_p = sum(1 for v in pattern.values() if v == p)
        result[f"n_{p}"] = n_p
        result[f"runouts_per_100cm_{p}"] = 100 * by_p[p]["runouts"] / (n_p * days / 30) if n_p else float("nan")
        result[f"deliveries_{p}"] = by_p[p]["deliveries"]
        result[f"early_{p}"] = by_p[p]["early"]
        result[f"days_out_{p}"] = by_p[p]["days_out"]
    return result


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
