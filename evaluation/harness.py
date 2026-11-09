"""Day-by-day evaluation loop.

Each day: the policy plans routes, deliveries happen, then customers who ran out during
the day are flagged. Measures:
  run-outs per 100 customer-months, km per delivery, early deliveries,
  customer-days without gas.
Not yet included: empties outstanding.

Run:  python -m evaluation.harness --seeds 5 --days 30 --n 100
"""
import math
from dataclasses import dataclass

import numpy as np

from config import SERVICE_MIN
from predictor.risk import _fit, pooled_values, refill_window, run_out_risk
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


def route_minutes(route, minutes):
    t, here = 0, 0
    for stop in route:
        t += minutes[here][stop]
        here = stop
    return t + minutes[here][0]


@dataclass
class InfoModel:
    """What the policies are told about past cylinders (docs/PROTOCOL.md section 4).
    Without it (info=None) every swap records the cylinder's true lifetime ("clean information").
    With it, a swap records only what a delivery record could hold:
      customer had called (ran out): the lifetime to the day of the call (complete record),
      customer had not called (not empty yet): the gap since the last delivery, a lower bound (censored).
    arm decides what the policy gets to see:
      "gaps"      the gap between every pair of deliveries (the original average-days rule)
      "complete"  only the complete records
      "censored"  complete and censored records, used with the censored fit
    p_call < 1 (arm D): a customer who runs out calls that day with probability p_call, otherwise later (each day
    with probability call_hazard); the call date is then recorded as the run-out date. A driver who finds an
    empty cylinder with no call makes an "at most this long" record. tick_error and tick_missing are the
    shares of swaps where the driver's tick is wrong or missing (they only matter when p_call < 1)."""
    arm: str = "censored"
    p_call: float = 1.0
    call_hazard: float = 0.3
    tick_error: float = 0.0
    tick_missing: float = 0.0


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


def run_policy(static, policy, days, warmup=0, empties=None, info=None, track_risk=False, forecast=None):
    """Simulate warmup + days days. Only the last `days` days are counted: the warm-up lets the
    simulation forget its arbitrary starting state (customers start in the middle of a cylinder).
    track_risk: measure the 48-hour risk (Brier score, calibration) and the refill window coverage with
    Gasora's predictor. forecast: 'fit', 'gaps' or 'complete' measures the error of the predicted lifetime
    of each new cylinder (needs info)."""
    state = new_state(static)
    by_id = {c["id"]: c for c in state}
    pattern = {c["id"]: c["pattern"] for c in static.customers}
    fresh = lambda: {p: {"runouts": 0, "deliveries": 0, "early": 0, "days_out": 0} for p in PATTERNS}
    by_p = fresh()                                        # the same counts, split by customer type
    runouts = deliveries = early = days_out = 0
    total_km = 0.0
    vehicle_days = 0
    drive_min = service_min = 0.0                          # for vehicle hours
    n_obs = n_cens = 0                                     # records made at swaps, and how many are censored
    sum_gap = sum_true = 0.0                               # recorded gap against the true lifetime
    held_days = 0                                          # empties held, summed over counted days
    bucket_days = [0] * len(AGE_TIERS)                     # customer-days in each ageing tier
    if empties is not None:
        rng_back = {c["id"]: np.random.default_rng([static.seed, c["id"], 99]) for c in state}
        for c in state:
            c["held"], c["held_since"] = 0, None           # empties held by the customer, and since when
    rng_call, rng_tick = {}, {}
    cal_n, cal_p, cal_y = np.zeros(10), np.zeros(10), np.zeros(10)
    brier_sum, win_hits, win_n, fc_err, fc_n = 0.0, 0, 0, 0.0, 0
    if info is not None:
        if info.p_call < 1.0:
            rng_call = {c["id"]: np.random.default_rng([static.seed, c["id"], 55]) for c in state}
        if info.tick_error > 0 or info.tick_missing > 0:
            rng_tick = {c["id"]: np.random.default_rng([static.seed, c["id"], 66]) for c in state}
        for c in state:
            c["called"], c["call_day"] = False, None
            start = list(c["intervals"])               # history from before the system: complete records
            c["gaps"], c["complete"], c["_obs"] = list(start), list(start), [(v, False) for v in start]
            c["intervals"] = c["gaps"] if info.arm == "gaps" else c["complete"]
            if info.arm == "censored":
                c["obs"] = c["_obs"]
    for d in range(warmup + days):
        if d == warmup:                                   # start counting here
            runouts = deliveries = early = days_out = 0
            total_km = 0.0
            vehicle_days = held_days = 0
            drive_min = service_min = 0.0
            n_obs = n_cens = 0
            sum_gap = sum_true = 0.0
            bucket_days = [0] * len(AGE_TIERS)
            by_p = fresh()
            cal_n, cal_p, cal_y = np.zeros(10), np.zeros(10), np.zeros(10)
            brier_sum, win_hits, win_n, fc_err, fc_n = 0.0, 0, 0, 0.0, 0
        for c in state:
            c["days_since"] = d - c["last_delivery"]
        if track_risk and d >= warmup:                    # predictions made today, judged by what really happens
            pm, ps = pooled_values(state)
            for c in state:
                if c["out"]:
                    continue
                p = run_out_risk(c, pm, ps)
                y = 1 if c["runout_day"] <= d + 2 else 0
                b = min(9, int(p * 10))
                cal_n[b] += 1
                cal_p[b] += p
                cal_y[b] += y
                brier_sum += (p - y) ** 2
                lo, hi = refill_window(c, pm, ps)
                win_n += 1
                win_hits += lo <= c["runout_day"] - d <= hi
        routes = policy(static, state, d)
        for route in routes:
            if not route:
                continue
            vehicle_days += 1
            total_km += route_km(route, static.km)
            drive_min += route_minutes(route, static.minutes)
            service_min += SERVICE_MIN * len(route)
            for cid in route:
                c = by_id[cid]
                if not c["out"] and c["runout_day"] - d > EARLY_DAYS:
                    early += 1
                    by_p[pattern[cid]]["early"] += 1
                dur = static.durations[cid - 1]
                true_life = float(dur[c["cyl"] % len(dur)])
                if info is None:
                    c["intervals"].append(true_life)          # clean information: the true lifetime is recorded
                else:
                    gap = d - c["last_delivery"]
                    if c["out"] and c["called"]:              # the customer called: an exact lifetime
                        if info.p_call >= 1.0:
                            value = max(0.5, math.floor(c["runout_day"]) + 0.5 - c["last_delivery"])
                        else:                                 # the call may come after the run-out
                            value = max(0.5, c["call_day"] + 0.5 - c["last_delivery"])
                        kind = 0
                    elif info.p_call >= 1.0:                  # a planned delivery with no call: at least this long
                        value, kind = gap, 1
                    else:                                     # no call: the driver's tick decides
                        tick_empty = c["out"]
                        if info.tick_error > 0 and rng_tick[cid].random() < info.tick_error:
                            tick_empty = not tick_empty
                        missing = info.tick_missing > 0 and rng_tick[cid].random() < info.tick_missing
                        value, kind = gap, (None if missing else (2 if tick_empty else 1))
                    c["gaps"].append(gap)
                    if kind == 0:
                        c["complete"].append(value)
                    if kind is not None:
                        c["_obs"].append((value, kind))
                    n_obs += 1
                    n_cens += kind != 0
                    sum_gap += gap
                    sum_true += true_life
                c["cyl"] += 1
                c["out"] = False
                if info is not None:
                    c["called"], c["call_day"] = False, None
                c["last_delivery"] = d
                c["runout_day"] = d + dur[c["cyl"] % len(dur)]
                if forecast and info is not None and d >= warmup:      # predicted against true lifetime of the new cylinder
                    if forecast == "fit":
                        pm, ps = pooled_values(state)
                        pred = _fit(c, pm, ps)[0]
                    elif forecast == "gaps":
                        pred = float(np.mean(c["gaps"]))
                    else:
                        pred = float(np.mean(c["complete"]))
                    fc_err += abs(pred - float(dur[c["cyl"] % len(dur)]))
                    fc_n += 1
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
            newly_out = False
            if not c["out"] and c["runout_day"] < d + 1:
                c["out"] = True
                newly_out = True
                runouts += 1
                by_p[pattern[c["id"]]]["runouts"] += 1
            if info is not None:                          # does the customer call?
                if newly_out:
                    if info.p_call >= 1.0 or rng_call[c["id"]].random() < info.p_call:
                        c["called"], c["call_day"] = True, d
                elif c["out"] and not c["called"] and rng_call[c["id"]].random() < info.call_hazard:
                    c["called"], c["call_day"] = True, d
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
        "vehicle_hours": (drive_min + service_min) / 60,
    }
    if info is not None:
        result["info_censored_share"] = n_cens / n_obs if n_obs else float("nan")
        result["info_gap_over_true"] = sum_gap / sum_true if sum_true else float("nan")
        if info.arm == "censored":                            # customers whose latest prediction used the pooled values
            result["info_fallback_share"] = float(np.mean([bool(c.get("_fallback", False)) for c in state]))
    if empties is not None:
        result["empties_per_day"] = held_days / days
        result["aged_customers_per_day"] = sum(bucket_days) / days
        for (_, label), n_days in zip(AGE_TIERS, bucket_days):
            result[f"aged_{label}_per_day"] = n_days / days
    if track_risk:
        total = cal_n.sum()
        base = cal_y.sum() / total if total else float("nan")
        result["brier"] = brier_sum / total if total else float("nan")
        result["brier_ref"] = base * (1 - base)
        result["brier_skill"] = 1 - result["brier"] / result["brier_ref"] if result["brier_ref"] > 0 else float("nan")
        result["calibration"] = [[float(cal_n[i]), float(cal_p[i] / cal_n[i]) if cal_n[i] else float("nan"),
                                  float(cal_y[i] / cal_n[i]) if cal_n[i] else float("nan")] for i in range(10)]
        result["window_coverage"] = win_hits / win_n if win_n else float("nan")
    if forecast:
        result["forecast_mae"] = fc_err / fc_n if fc_n else float("nan")
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
