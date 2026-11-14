"""Pilot: can Gasora reach the primary level (15 run-outs per 100 customer-months) if the scale of its skip penalty
is raised?  (docs/PROTOCOL.md v1.3, section 9: skip penalty scale s, penalty = int(1 + risk x s).)

Runs ONLY Gasora (G), for the whole cut-off grid, on the first N development seeds, for each scale. Section 9.2 reads
the run-outs at cut-off 0.01 on the first three seeds; the scale 300 repeats variant 4 and shows the run-to-run noise. The rule arms are
not run: they do not use the scale, so their curves are read from the saved development points
(data/study_dev_road_points.csv, written by `python -m evaluation.study --stage dev`).
This is exploratory and uses development seeds only. Every scale tried here counts as one of the 12 variants and
must be written in docs/variant_log.md. The formal result comes from the full study run with the chosen scale.

Run:  python -m evaluation.pilot_penalty            (protocol section 9.2: scales 300 600 1200 2400, seeds 1 to 3)
Results are saved after every seed; run the same command again to continue.
"""
import argparse
import csv
import os
from collections import defaultdict

import numpy as np

from evaluation import guard, policies
from evaluation.checkpoint import Checkpoint
from evaluation.curves import cost_at_level, n_crossings
from evaluation.harness import InfoModel, bootstrap_ci, run_policy
from evaluation.study import CUTOFFS, apply_variant
from evaluation.world import build_static

LEVEL = 15
KEYS = ("total_km", "vehicle_hours")


def reference_points(path):
    """seed -> arm -> list of points in grid order, for R0 and R1, from the development CSV."""
    out = defaultdict(lambda: defaultdict(list))
    with open(path, encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            if r["arm"] in ("R0", "R1"):
                out[int(r["seed"])][r["arm"]].append((float(r["setting"]), {
                    "runouts_per_100cm": float(r["runouts_per_100cm"]),
                    "total_km": float(r["total_km"]), "vehicle_hours": float(r["vehicle_hours"])}))
    return {s: {a: [p for _, p in sorted(v)] for a, v in arms.items()} for s, arms in out.items()}


def main(scales, n_seeds, source="road", n=200, days=60, warmup=30, ref_path=os.path.join("data", "study_dev_road_points.csv")):
    seeds = list(range(1, n_seeds + 1))
    guard.check_seeds(seeds)                                     # development seeds only
    ref = reference_points(ref_path) if os.path.exists(ref_path) else {}
    summary, qualifies = {}, {}
    for scale in scales:
        variant = {"fit_m": None, "fit_floor": 1.0, "early_pull": False, "skip_penalty": scale}
        apply_variant(variant)
        print(f"\n=== skip penalty scale {scale}: G only, {len(seeds)} dev seeds, grid {CUTOFFS}")
        ck = Checkpoint(f"pilot_penalty_{source}", days=days, warmup=warmup, n=n, variant=sorted(variant.items(), key=str))
        for s in seeds:
            if s in ck.done():
                continue
            static = build_static(s, n, source)
            old = policies.CANDIDATE_RISK
            try:
                g = {}
                for c in CUTOFFS:
                    policies.CANDIDATE_RISK = c
                    g[str(c)] = run_policy(static, policies.p3_gasora, days, warmup, info=InfoModel("censored"))
            finally:
                policies.CANDIDATE_RISK = old
            ck.add({"seed": s, "G": g})
            print(f"seed {s} done", flush=True)
        recs = [r for r in ck.ordered() if r["seed"] in seeds]
        pts = {r["seed"]: [r["G"][str(c)] for c in CUTOFFS] for r in recs}
        print(f"\nMean curve of G (run-outs / kilometres / vehicle hours / deliveries):")
        print("  " + "   ".join(f"{c}: {np.mean([pts[s][i]['runouts_per_100cm'] for s in pts]):.1f} / "
                                f"{np.mean([pts[s][i]['total_km'] for s in pts]):.0f} / "
                                f"{np.mean([pts[s][i]['vehicle_hours'] for s in pts]):.0f} / "
                                f"{np.mean([pts[s][i]['deliveries'] for s in pts]):.0f}" for i, c in enumerate(CUTOFFS)))
        floors = {s: min(p["runouts_per_100cm"] for p in pts[s]) for s in pts}
        print("Lowest run-outs reached by G per seed: " + ", ".join(f"{s}: {v:.1f}" for s, v in floors.items()))
        covered = [s for s in pts if cost_at_level(pts[s], LEVEL, "total_km") is not None]
        print(f"Level {LEVEL} reached by G on {len(covered)} of {len(pts)} seeds "
              f"(80% needed: {'yes' if len(covered) >= 0.8 * len(pts) else 'NO'}); "
              f"seeds where G crosses it more than once: {sum(n_crossings(pts[s], LEVEL) > 1 for s in pts)}")
        summary[scale] = (len(covered), len(pts))
        at_001 = {s: pts[s][CUTOFFS.index(0.01)]["runouts_per_100cm"] for s in pts}
        print("Run-outs of G at cut-off 0.01 per seed: " + ", ".join(f"{s}: {v:.1f}" for s, v in at_001.items()))
        qualifies[scale] = all(v < LEVEL for v in at_001.values())
        print(f"Rule of section 9.2 (fewer than {LEVEL} at cut-off 0.01 on every pilot seed): {'MET' if qualifies[scale] else 'not met'}")
        for other in ("R0", "R1"):
            for key in KEYS:
                d = []
                for s in covered:
                    r = cost_at_level(ref.get(s, {}).get(other, []), LEVEL, key)
                    g = cost_at_level(pts[s], LEVEL, key)
                    if r is not None:
                        d.append(g - r)
                if len(d) < 2:
                    print(f"  G minus {other} {key}: not enough seeds")
                    continue
                lo, hi = bootstrap_ci(d)
                print(f"  G minus {other} {key} at level {LEVEL}: {np.mean(d):+.1f} [{lo:+.1f}, {hi:+.1f}] over {len(d)} seeds")
    print("\nSummary (seeds where G reaches the primary level): "
          + ", ".join(f"scale {s}: {a} of {b}" for s, (a, b) in summary.items()))
    first = next((s for s in scales if qualifies.get(s)), None)
    print(f"Section 9.2: the smallest scale that meets the rule is {first if first is not None else 'none (level 15 stays not covered)'}"
          f" (scales in the order given; pass them in increasing order and use --seeds 3).")
    print("Exploratory: development seeds only, rule arms read from the earlier development run. "
          "Write each scale tried in docs/variant_log.md.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--scales", type=int, nargs="+", default=[300, 600, 1200, 2400])
    ap.add_argument("--seeds", type=int, default=3, help="use the first N development seeds (1 to 10)")
    ap.add_argument("--source", choices=["straight", "road"], default="road")
    ap.add_argument("--n", type=int, default=200)
    a = ap.parse_args()
    main(a.scales, min(a.seeds, 10), a.source, a.n)
