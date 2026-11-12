"""Secondary arms (docs/PROTOCOL.md section 10). All of them are labelled secondary in the report.

  D        more realistic calling: customers call with probability 0.7 on the day they run out, otherwise later;
           the driver's tick, a third record type, and Gasora with a wrong tick (10%) and a missing tick (20%).
           The rules R0 and R1 do not use the tick, so one curve of each serves as the comparison.
  skewed   the main arm with lognormal lifetimes (same mean and spread): the predictor's normal model is wrong.
  clean    the old setting: every swap records the true lifetime.
  oracle   Gasora given each customer's true parameters, added to the saved main-arm results of the same stage.

Run:  python -m evaluation.secondary --arm D --stage dev
In the confirm and spare stages the freeze file is required and the variant comes from it.
"""
import argparse
import csv
import os

from evaluation import guard, policies, study
from evaluation.arms import make_rule, oracle_gasora
from evaluation.checkpoint import Checkpoint
from evaluation.curves import comparison_table, extras_report, report
from evaluation.harness import InfoModel, run_policy
from evaluation.meta import run_metadata
from evaluation.world import build_static

D_LEADS = [4, 6, 8, 10]
D_CUTOFFS = [0.05, 0.10, 0.15, 0.20]
CALL = dict(p_call=0.7, call_hazard=0.3)


def run_d(static, days, warmup):
    arms = {"R0": {}, "R1": {}, "G": {}, "Gw": {}, "Gm": {}}
    for lead in D_LEADS:
        arms["R0"][str(lead)] = run_policy(static, make_rule(lead), days, warmup, info=InfoModel("gaps", **CALL))
        arms["R1"][str(lead)] = run_policy(static, make_rule(lead), days, warmup, info=InfoModel("complete", **CALL))
    old = policies.CANDIDATE_RISK
    try:
        for c in D_CUTOFFS:
            policies.CANDIDATE_RISK = c
            for name, kw in (("G", {}), ("Gw", {"tick_error": 0.10}), ("Gm", {"tick_missing": 0.20})):
                arms[name][str(c)] = run_policy(static, policies.p3_gasora, days, warmup,
                                                info=InfoModel("censored", **CALL, **kw))
    finally:
        policies.CANDIDATE_RISK = old
    p1 = run_policy(static, policies.p1_reactive_nn, days, warmup, info=InfoModel("censored", **CALL))
    return arms, p1


def run_clean(static, days, warmup):
    arms = {"R": {}, "G": {}}
    for lead in study.LEADS:
        arms["R"][str(lead)] = run_policy(static, make_rule(lead), days, warmup)
    old = policies.CANDIDATE_RISK
    try:
        for c in study.CUTOFFS:
            policies.CANDIDATE_RISK = c
            arms["G"][str(c)] = run_policy(static, policies.p3_gasora, days, warmup)
    finally:
        policies.CANDIDATE_RISK = old
    return arms, run_policy(static, policies.p1_reactive_nn, days, warmup)


def run_oracle(static, days, warmup):
    arms = {"O": {}}
    old = policies.CANDIDATE_RISK
    try:
        for c in study.CUTOFFS:
            policies.CANDIDATE_RISK = c
            arms["O"][str(c)] = run_policy(static, oracle_gasora, days, warmup)
    finally:
        policies.CANDIDATE_RISK = old
    return arms, None


def main(arm, stage, source="road", n=200, days=60, warmup=30, variant=None, seeds=None):
    seeds = list(seeds) if seeds is not None else list(guard.STAGES[stage])
    freeze = guard.check_seeds(seeds)
    if stage in ("confirm", "spare"):
        variant = freeze["variant"]
    variant = variant or {"fit_m": None, "fit_floor": 1.0, "early_pull": False}
    study.apply_variant(variant)
    print(f"Secondary arm {arm}, stage {stage}, seeds {seeds[0]} to {seeds[-1]}, {n} customers, {source}. Variant: {variant}")
    key = sorted(variant.items(), key=str)
    ck = Checkpoint(f"secondary_{arm}_{stage}_{source}", days=days, warmup=warmup, n=n, variant=key)
    base = None
    if arm == "oracle":                                  # added to the saved results of the main arm
        base = {r["seed"]: r for r in Checkpoint(f"study_{stage}_{source}", days=days, warmup=warmup, n=n,
                                                 variant=key).ordered()}
        missing = [s for s in seeds if s not in base]
        if missing:
            raise SystemExit(f"Run the main study for this stage first (python -m evaluation.study --stage {stage}); "
                             f"seeds without results: {missing}")
    for s in seeds:
        if s in ck.done():
            continue
        static = build_static(s, n, source, durations="lognormal" if arm == "skewed" else "normal")
        runner = {"D": run_d, "clean": run_clean, "oracle": run_oracle, "skewed": study.run_seed}[arm]
        arms, p1 = runner(static, days, warmup)
        ck.add({"seed": s, "arms": arms, "P1": p1, "meta": run_metadata(variant), "stage": stage})
        print(f"seed {s} done", flush=True)

    recs = [r for r in ck.ordered() if r["seed"] in seeds]
    if arm == "D":
        comparison_table(recs, ["G", "Gw", "Gm"], ["R0", "R1"],
                         "Arm D: Gasora (G), with 10% wrong ticks (Gw) and 20% missing ticks (Gm), against the rules")
        comparison_table(recs, ["Gw", "Gm"], ["G"], "Arm D: effect of tick errors on Gasora")
    elif arm == "clean":
        comparison_table(recs, ["G"], ["R"], "Clean information: Gasora against the average-days rule")
    elif arm == "skewed":
        report(recs, ["R0", "R1", "R2", "G", "A"])
        extras_report(recs)
    else:
        merged = [{**base[r["seed"]], "arms": {**base[r["seed"]]["arms"], **r["arms"]}} for r in recs]
        comparison_table(merged, ["O"], ["G", "R0", "R1"],
                         "Oracle bound (true customer parameters) against the methods that cannot know them")

    os.makedirs("data", exist_ok=True)
    path = os.path.join("data", f"secondary_{arm}_{stage}_{source}_points.csv")
    keys = ["runouts_per_100cm", "deliveries", "total_km", "vehicle_hours", "early", "days_out"]
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["seed", "arm", "setting", "stage", "code_hash"] + keys)
        for r in recs:
            for a, d in r["arms"].items():
                for s, m in d.items():
                    w.writerow([r["seed"], a, s, r["stage"], r["meta"]["code_hash"]] + [round(m[k], 4) for k in keys])
    print(f"Saved {path}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--arm", choices=["D", "skewed", "clean", "oracle"], required=True)
    ap.add_argument("--stage", choices=list(guard.STAGES), required=True)
    ap.add_argument("--source", choices=["straight", "road"], default="road")
    ap.add_argument("--n", type=int, default=200)
    ap.add_argument("--fit-m", type=int, default=0, help="0 = all records (default)")
    ap.add_argument("--floor", type=float, default=1.0)
    ap.add_argument("--early-pull", action="store_true")
    a = ap.parse_args()
    main(a.arm, a.stage, a.source, a.n,
         variant={"fit_m": a.fit_m or None, "fit_floor": a.floor, "early_pull": a.early_pull})
