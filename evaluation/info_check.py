"""Development check of the information model (not a confirmation run).

Runs one setting of each arm on development seeds and prints what the policies were told and what happened.
Use seeds 1 to 10 only (docs/PROTOCOL.md section 8).

Run:  python -m evaluation.info_check --seeds 2
"""
import argparse

import numpy as np

from evaluation import policies
from evaluation.arms import make_rule
from evaluation.harness import InfoModel, run_policy
from evaluation.world import build_static

COLUMNS = ["runouts_per_100cm", "deliveries", "total_km", "vehicle_hours", "early", "info_censored_share",
           "info_gap_over_true", "info_fallback_share"]


def main(n_seeds, days, warmup, n, source, lead, cutoff):
    rows = {
        f"Clean information, Gasora {cutoff}": (None, "g"),
        f"Gasora {cutoff}, gaps only": (InfoModel("gaps"), "g"),
        f"Gasora {cutoff}, censored fit": (InfoModel("censored"), "g"),
        f"R0 rule lead {lead}, all gaps": (InfoModel("gaps"), "r0"),
        f"R1 rule lead {lead}, complete only": (InfoModel("complete"), "r1"),
        f"R2 rule lead {lead}, censored fit": (InfoModel("censored"), "r2"),
    }
    results = {name: [] for name in rows}
    old = policies.CANDIDATE_RISK
    try:
        policies.CANDIDATE_RISK = cutoff
        for s in range(1, n_seeds + 1):
            static = build_static(s, n, source)
            for name, (info, kind) in rows.items():
                fn = {"g": policies.p3_gasora, "r0": make_rule(lead), "r1": make_rule(lead),
                      "r2": make_rule(lead, use_fit=True)}[kind]
                results[name].append(run_policy(static, fn, days, warmup, info=info))
            print(f"seed {s} done", flush=True)
    finally:
        policies.CANDIDATE_RISK = old
    print(f"\nDevelopment check, {n_seeds} seeds, {days} counted days after {warmup} warm-up, {n} customers ({source})")
    print(f"{'arm':38s}" + "".join(f"{c.replace('info_', ''):>19s}" for c in COLUMNS))
    for name, rs in results.items():
        vals = [float(np.nanmean([r.get(c, float("nan")) for r in rs])) if any(c in r for r in rs) else float("nan")
                for c in COLUMNS]
        print(f"{name:38s}" + "".join(f"{v:19.2f}" for v in vals))
    print("\nfallback_share: share of customers whose latest prediction used the pooled values because no complete record"
          " was among the recent ones.")
    print("censored_share: share of swap records that are only lower bounds. gap_over_true: recorded gap divided by"
          " the true lifetime (1.0 = unbiased; below 1 = gaps are too short because of early deliveries).")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=2)
    ap.add_argument("--days", type=int, default=60)
    ap.add_argument("--warmup", type=int, default=30)
    ap.add_argument("--n", type=int, default=100)
    ap.add_argument("--source", choices=["straight", "road"], default="straight")
    ap.add_argument("--lead", type=int, default=6)
    ap.add_argument("--cutoff", type=float, default=0.10)
    a = ap.parse_args()
    main(a.seeds, a.days, a.warmup, a.n, a.source, a.lead, a.cutoff)
