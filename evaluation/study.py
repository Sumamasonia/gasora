"""The study of the main arm (docs/PROTOCOL.md sections 4 to 9, 11).

Stages and seeds:  dev 1-10 (tuning),  check 11-20,  confirm 21-40 (once, after the freeze),  spare 41-50.
Arms:  R0 (rule, all gaps), R1 (rule, exact records), R2 (rule, censored fit, supplementary),
       G (Gasora, censored fit), A (Gasora selection, nearest neighbour), P1 (reactive, reference).

Run:  python -m evaluation.study --stage dev [--fit-m 6 --floor 1 --early-pull]
In the confirm and spare stages the variant comes from docs/freeze.json and the flags are ignored.
Results are saved after every seed; run the same command again to continue.
"""
import argparse
import csv
import os

from evaluation import guard, policies
from evaluation.arms import make_rule
from evaluation.checkpoint import Checkpoint
from evaluation.curves import extras_report, report
from evaluation.harness import InfoModel, run_policy
from evaluation.meta import run_metadata
from evaluation.world import build_static
from predictor import risk

LEADS = [2, 4, 6, 8, 10, 12]
CUTOFFS = [0.03, 0.05, 0.10, 0.15, 0.20, 0.30]
REFERENCE_LEAD = 6          # prediction quality is reported at these settings
REFERENCE_CUTOFF = 0.10


def apply_variant(variant):
    """Set the allowed variants (protocol section 9). fit_m None means all records."""
    from backend.settings import LATE_COST_CRITICAL
    risk.FIT_M = variant.get("fit_m")
    risk.FIT_FLOOR = variant.get("fit_floor", 1.0)
    policies.POLICY_LATE_COST = LATE_COST_CRITICAL if variant.get("early_pull") else 0


def run_seed(static, days, warmup):
    arms = {"R0": {}, "R1": {}, "R2": {}, "G": {}, "A": {}}
    for lead in LEADS:
        arms["R0"][str(lead)] = run_policy(static, make_rule(lead), days, warmup, info=InfoModel("gaps"),
                                           forecast="gaps" if lead == REFERENCE_LEAD else None)
        arms["R1"][str(lead)] = run_policy(static, make_rule(lead), days, warmup, info=InfoModel("complete"),
                                           forecast="complete" if lead == REFERENCE_LEAD else None)
        arms["R2"][str(lead)] = run_policy(static, make_rule(lead, use_fit=True), days, warmup, info=InfoModel("censored"))
    old = policies.CANDIDATE_RISK
    try:
        for c in CUTOFFS:
            policies.CANDIDATE_RISK = c
            ref = c == REFERENCE_CUTOFF                       # prediction quality is measured at one setting
            arms["G"][str(c)] = run_policy(static, policies.p3_gasora, days, warmup, info=InfoModel("censored"),
                                           track_risk=ref, forecast="fit" if ref else None)
            arms["A"][str(c)] = run_policy(static, policies.ablation_prediction_nn, days, warmup, info=InfoModel("censored"))
    finally:
        policies.CANDIDATE_RISK = old
    p1 = run_policy(static, policies.p1_reactive_nn, days, warmup, info=InfoModel("censored"))
    return arms, p1


def main(stage, source="road", n=200, days=60, warmup=30, variant=None, seeds=None):
    seeds = list(seeds) if seeds is not None else list(guard.STAGES[stage])
    freeze = guard.check_seeds(seeds)
    if stage in ("confirm", "spare"):
        variant = freeze["variant"]                      # the frozen variant; flags are ignored
    variant = variant or {"fit_m": 4, "fit_floor": 1.0, "early_pull": False}
    apply_variant(variant)
    print(f"Stage {stage}, seeds {seeds[0]} to {seeds[-1]}, {n} customers, {source} distances, {warmup} warm-up + "
          f"{days} counted days. Variant: {variant}")

    ck = Checkpoint(f"study_{stage}_{source}", days=days, warmup=warmup, n=n, variant=sorted(variant.items(), key=str))
    if ck.done():
        print(f"continuing: seeds {sorted(ck.done())} are already done")
    for s in seeds:
        if s in ck.done():
            continue
        arms, p1 = run_seed(build_static(s, n, source), days, warmup)
        ck.add({"seed": s, "arms": arms, "P1": p1, "meta": run_metadata(variant), "stage": stage})
        print(f"seed {s} done", flush=True)

    recs = [r for r in ck.ordered() if r["seed"] in seeds]
    report(recs, ["R0", "R1", "R2", "G", "A"])
    extras_report(recs)
    p1_mean = {k: sum(r["P1"][k] for r in recs) / len(recs) for k in ("runouts_per_100cm", "total_km", "vehicle_hours")}
    print("\nP1 reactive (reference): " + ", ".join(f"{k} {v:.1f}" for k, v in p1_mean.items()))

    os.makedirs("data", exist_ok=True)
    path = os.path.join("data", f"study_{stage}_{source}_points.csv")
    keys = ["runouts_per_100cm", "deliveries", "early", "total_km", "vehicle_hours", "vehicles_used_per_day",
            "days_out", "info_censored_share", "info_gap_over_true"]
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["seed", "arm", "setting", "stage", "code_hash", "commit"] + keys)
        for r in recs:
            rows = [(arm, s, m) for arm, d in r["arms"].items() for s, m in d.items()] + [("P1", "", r["P1"])]
            for arm, s, m in rows:
                w.writerow([r["seed"], arm, s, r["stage"], r["meta"]["code_hash"], r["meta"]["commit"]]
                           + [round(m.get(k, float("nan")), 4) for k in keys])
    print(f"Saved {path}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", choices=list(guard.STAGES), required=True)
    ap.add_argument("--source", choices=["straight", "road"], default="road")
    ap.add_argument("--n", type=int, default=200)
    ap.add_argument("--fit-m", type=int, default=4, help="records used by the censored fit; 0 = all")
    ap.add_argument("--floor", type=float, default=1.0)
    ap.add_argument("--early-pull", action="store_true")
    a = ap.parse_args()
    main(a.stage, a.source, a.n, variant={"fit_m": a.fit_m or None, "fit_floor": a.floor, "early_pull": a.early_pull})
