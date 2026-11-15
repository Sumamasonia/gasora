"""Cost at a fixed service level (docs/PROTOCOL.md section 6).

Each policy with a grid of settings gives, for every seed, a curve of (run-outs per 100 customer-months, cost).
Section 6.1 (protocol v1.2): the settings are taken in grid order; every pair of neighbouring settings whose
run-outs lie on opposite sides of L gives one crossing, by straight-line interpolation (a single setting with
exactly L run-outs is a crossing of its own). With several crossings the lowest cost is used, for every arm and
every measure. A level is covered for a policy and seed only if the curve crosses L at least once.
"""
import numpy as np

from evaluation.harness import bootstrap_ci

PRIMARY_LEVEL = 15
LEVELS = [15, 25, 40, 10]                    # level 10 only if G and both rule arms cover it
MEASURES = {"total_km": "kilometres", "vehicle_hours": "vehicle hours"}
RULE_ARMS = ["R0", "R1"]                     # the primary comparison
COVER_AT_LEAST = 0.8                         # share of seeds that must cover a level


def crossings(points, level, key, choose_by=None):
    """All crossings of `level` (protocol section 6.1) as (value of choose_by, value of key) pairs.

    points: metric dicts of one policy and seed, one per setting, in grid order. choose_by defaults to key; it
    only matters for descriptive measures (run-outs by customer type), which are read at the crossing that has
    the lowest kilometres.
    """
    choose_by = choose_by or key
    out = [(p[choose_by], p[key]) for p in points if p["runouts_per_100cm"] == level]
    for a, b in zip(points, points[1:]):
        r0, r1 = a["runouts_per_100cm"], b["runouts_per_100cm"]
        if (r0 - level) * (r1 - level) < 0:
            t = (level - r0) / (r1 - r0)
            out.append((a[choose_by] + (b[choose_by] - a[choose_by]) * t, a[key] + (b[key] - a[key]) * t))
    return out


def cost_at_level(points, level, key, choose_by=None):
    """Cost at the level read as in protocol section 6.1 (lowest cost over the crossings). None if not covered."""
    found = crossings(points, level, key, choose_by)
    return min(found)[1] if found else None


def n_crossings(points, level):
    return len(crossings(points, level, "total_km"))


def grid_order(setting):
    try:
        return (0, float(setting))
    except ValueError:
        return (1, 0.0)


def arm_points(rec, arm):
    """The points of an arm in grid order (leads or cut-offs, from the first to the last), as section 6.1 needs."""
    d = rec["arms"][arm]
    keys = sorted(d, key=grid_order) if all(grid_order(k)[0] == 0 for k in d) else list(d)
    return [d[k] for k in keys]


def coverage(recs, arm, level):
    return sum(cost_at_level(arm_points(r, arm), level, "total_km") is not None for r in recs), len(recs)


def differences(recs, arm, other, level, key):
    """Per seed: cost of `arm` minus cost of `other` at the level; seeds not covered by either are left out."""
    out = []
    for r in recs:
        a = cost_at_level(arm_points(r, arm), level, key)
        b = cost_at_level(arm_points(r, other), level, key)
        if a is not None and b is not None:
            out.append(a - b)
    return out


def interval(diffs):
    lo, hi = bootstrap_ci(diffs)
    return float(np.mean(diffs)), lo, hi


def grade(recs, other, level=PRIMARY_LEVEL):
    """'supported', 'partly supported', 'not supported' or 'not covered' for G against `other` (protocol section 6)."""
    below = 0
    for key in MEASURES:
        d = differences(recs, "G", other, level, key)
        if len(d) < COVER_AT_LEAST * len(recs):
            return "not covered"
        below += interval(d)[2] < 0
    return {2: "supported", 1: "partly supported", 0: "not supported"}[below]


def overall_grade(recs):
    grades = [grade(recs, x) for x in RULE_ARMS]
    if "not covered" in grades:
        return "not covered"
    order = ["not supported", "partly supported", "supported"]
    return min(grades, key=order.index)


def level_is_reported(recs, level):
    if level != 10:
        return True
    return all(coverage(recs, a, level)[0] >= COVER_AT_LEAST * len(recs) for a in ["G"] + RULE_ARMS)


def report(recs, arms_present):
    n = len(recs)
    print(f"\nCoverage: seeds (of {n}) whose curve reaches each level (run-outs per 100 customer-months)")
    print(f"{'arm':6s}" + "".join(f"{lv:>8d}" for lv in LEVELS))
    for arm in arms_present:
        print(f"{arm:6s}" + "".join(f"{coverage(recs, arm, lv)[0]:8d}" for lv in LEVELS))

    print(f"\nSeeds (of {n}) whose curve crosses a level more than once (the lowest cost is used, protocol section 6.1)")
    print(f"{'arm':6s}" + "".join(f"{lv:>8d}" for lv in LEVELS))
    for arm in arms_present:
        print(f"{arm:6s}" + "".join(
            f"{sum(n_crossings(arm_points(r, arm), lv) > 1 for r in recs):8d}" for lv in LEVELS))

    print("\nMean curve points over seeds (run-outs, kilometres, vehicle hours)")
    for arm in arms_present:
        settings = list(recs[0]["arms"][arm].keys())
        cells = []
        for s in settings:
            m = [r["arms"][arm][s] for r in recs]
            cells.append(f"{s}: {np.mean([x['runouts_per_100cm'] for x in m]):.1f} / "
                         f"{np.mean([x['total_km'] for x in m]):.0f} / {np.mean([x['vehicle_hours'] for x in m]):.0f}")
        print(f"  {arm:3s} " + "   ".join(cells))

    def table(title, others):
        print(f"\n{title}  (G minus the other arm; negative = Gasora is cheaper; 95% bootstrap interval over seeds)")
        print(f"{'level':>6s}  {'vs':4s}{'measure':16s}{'seeds':>6s}{'mean':>10s}{'interval':>24s}")
        for lv in LEVELS:
            if not level_is_reported(recs, lv):
                print(f"{lv:6d}  not reported: the curves of G, R0 and R1 do not all reach this level")
                continue
            for other in others:
                for key, label in MEASURES.items():
                    d = differences(recs, "G", other, lv, key)
                    if len(d) < COVER_AT_LEAST * n:
                        print(f"{lv:6d}  {other:4s}{label:16s}{len(d):6d}   not covered")
                        continue
                    m, lo, hi = interval(d)
                    print(f"{lv:6d}  {other:4s}{label:16s}{len(d):6d}{m:10.1f}   [{lo:9.1f}, {hi:9.1f}]")

    table("PRIMARY comparison (level 15) and the secondary levels, against the rule arms", RULE_ARMS)
    if "R2" in arms_present:
        table("Supplementary: against R2 (the rule with the same censored fit)", ["R2"])
    if "A" in arms_present:
        table("Effect of routing: against A (the same selection with nearest neighbour)", ["A"])

    print("\nPrimary grade at level 15 (protocol section 6):")
    for x in RULE_ARMS:
        print(f"  Gasora against {x}: {grade(recs, x)}")
    print(f"  Overall (the weaker of the two): {overall_grade(recs)}")
    print("\nThese seeds are labelled by the stage they were run in. Only the confirmation stage (seeds 21 to 40) counts.")


def comparison_table(recs, g_arms, others, title, levels=(15, 25, 40)):
    """Cost of each arm in g_arms minus each arm in others at the levels, with 95% bootstrap intervals."""
    n = len(recs)
    print(f"\n{title}  (negative = the first arm is cheaper; 95% bootstrap interval over seeds)")
    print(f"{'level':>6s}  {'arm':5s}{'minus':>6s}  {'measure':15s}{'seeds':>6s}{'mean':>10s}{'interval':>24s}")
    for lv in levels:
        for g in g_arms:
            for other in others:
                for key, label in MEASURES.items():
                    d = differences(recs, g, other, lv, key)
                    if len(d) < COVER_AT_LEAST * n:
                        print(f"{lv:6d}  {g:5s}{other:>6s}  {label:15s}{len(d):6d}   not covered")
                        continue
                    m, lo, hi = interval(d)
                    print(f"{lv:6d}  {g:5s}{other:>6s}  {label:15s}{len(d):6d}{m:10.1f}   [{lo:9.1f}, {hi:9.1f}]")


def extras_report(recs):
    """Prediction quality and results by customer type (protocol section 7, items 5 to 7)."""
    def pick(arm, setting):
        return [r["arms"][arm][setting] for r in recs if setting in r["arms"].get(arm, {})]

    g, r0, r1 = pick("G", "0.1"), pick("R0", "6"), pick("R1", "6")
    if g and "brier" in g[0]:
        print("\nPrediction quality (G at cut-off 0.1; rules at lead 6; mean over seeds)")
        mae = lambda ms: np.nanmean([m.get("forecast_mae", np.nan) for m in ms]) if ms else float("nan")
        print(f"  Forecast error of the cylinder lifetime (days): Gasora fit {mae(g):.2f}, "
              f"R0 average of gaps {mae(r0):.2f}, R1 average of exact records {mae(r1):.2f}")
        print(f"  48-hour risk: Brier score {np.mean([m['brier'] for m in g]):.4f}, reference (constant base rate) "
              f"{np.mean([m['brier_ref'] for m in g]):.4f}, skill {np.nanmean([m['brier_skill'] for m in g]):.3f}")
        print(f"  Refill window (10% to 90%) contains the true run-out day: {100 * np.mean([m['window_coverage'] for m in g]):.1f}% "
              f"(nominal 80%)")
        print("  Calibration of the 48-hour risk (all seeds): predicted band, customer-days, mean predicted, observed")
        for b in range(10):
            n = sum(m["calibration"][b][0] for m in g)
            if n:
                p = sum(m["calibration"][b][0] * m["calibration"][b][1] for m in g if m["calibration"][b][0]) / n
                y = sum(m["calibration"][b][0] * m["calibration"][b][2] for m in g if m["calibration"][b][0]) / n
                print(f"    {b / 10:.1f}-{(b + 1) / 10:.1f}  {int(n):9d}  {p:8.3f}  {y:8.3f}")

    print("\nBy customer type, read at the primary level (15 run-outs per 100 customer-months overall)")
    print(f"{'arm':4s}{'type':11s}{'run-outs/100cm':>16s}{'deliveries':>12s}{'early':>8s}")
    for arm in ["G"] + RULE_ARMS:
        for t in ("steady", "irregular"):
            vals = []
            for key in (f"runouts_per_100cm_{t}", f"deliveries_{t}", f"early_{t}"):
                v = [cost_at_level(arm_points(r, arm), PRIMARY_LEVEL, key, choose_by="total_km") for r in recs]
                v = [x for x in v if x is not None]
                vals.append(np.mean(v) if v else float("nan"))
            print(f"{arm:4s}{t:11s}{vals[0]:16.1f}{vals[1]:12.1f}{vals[2]:8.1f}")
