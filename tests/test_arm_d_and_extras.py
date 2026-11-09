import numpy as np
import pytest

from evaluation import arms, policies, secondary, study
from evaluation.harness import InfoModel, run_policy
from evaluation.policies import is_called, p1_reactive_nn
from evaluation.world import build_static
from planner.greedy import nearest_neighbour_routes


def spy_policy(inner, store):
    def policy(static, state, day):
        store["state"] = state
        return inner(static, state, day)
    return policy


def deliver_after(days_since_min):
    """Delivers to every customer once this many days have passed since their last delivery."""
    def policy(static, state, day):
        ids = [c["id"] for c in state if c["days_since"] >= days_since_min]
        return nearest_neighbour_routes(ids, static.minutes, {c["id"]: c["demand"] for c in state})
    return policy


def kinds(state):
    out = {0: 0, 1: 0, 2: 0}
    for c in state:
        for _, k in c["_obs"][6:]:                           # skip the 6 starting records
            out[k] += 1
    return out


def test_customers_who_do_not_call_wait_longer_under_the_reactive_policy():
    s = build_static(1, 60)
    always = run_policy(s, p1_reactive_nn, days=40, warmup=10, info=InfoModel("gaps"))
    seventy = run_policy(s, p1_reactive_nn, days=40, warmup=10, info=InfoModel("gaps", p_call=0.7))
    assert seventy["days_out"] > always["days_out"]          # P1 only serves customers who called


def test_a_driver_who_finds_an_empty_cylinder_without_a_call_makes_an_at_most_record():
    s = build_static(1, 60)
    store = {}
    run_policy(s, spy_policy(deliver_after(40), store), days=60, warmup=0,
               info=InfoModel("censored", p_call=0.5, call_hazard=0.0))        # nobody calls late: many empty finds
    k = kinds(store["state"])
    assert k[2] > 0 and k[0] > 0                              # at-most records, and exact records from calls


def test_wrong_ticks_flip_the_kind_and_missing_ticks_drop_the_record():
    s = build_static(1, 60)
    right, wrong = {}, {}
    run_policy(s, spy_policy(deliver_after(8), right), days=40, warmup=0, info=InfoModel("censored", p_call=0.7))
    run_policy(s, spy_policy(deliver_after(8), wrong), days=40, warmup=0,
               info=InfoModel("censored", p_call=0.7, tick_error=1.0))          # the tick is always wrong
    kr, kw = kinds(right["state"]), kinds(wrong["state"])
    assert kr[1] > 0 and kr[2] > 0
    assert (kw[0], kw[1], kw[2]) == (kr[0], kr[2], kr[1])    # 'at least' and 'at most' swap places; exact ones stay
    missing = {}
    run_policy(s, spy_policy(deliver_after(8), missing), days=40, warmup=0,
               info=InfoModel("censored", p_call=0.7, tick_missing=1.0))
    km = kinds(missing["state"])
    assert km[1] == 0 and km[2] == 0 and km[0] == kr[0]       # only the exact records (from calls) remain
    assert len(missing["state"][0]["gaps"]) > 6               # the plain gaps are still recorded


def test_the_main_arm_is_unchanged_by_the_call_model():
    s = build_static(2, 40)
    a = run_policy(s, p1_reactive_nn, days=30, warmup=10, info=InfoModel("censored"))
    b = run_policy(s, p1_reactive_nn, days=30, warmup=10)               # clean information, P1 ignores history
    for k in ("runouts_per_100cm", "deliveries", "total_km", "days_out"):
        assert a[k] == b[k]


def test_called_customers_are_who_the_policies_see():
    assert is_called({"out": True}) is True and is_called({"out": True, "called": False}) is False


def test_tracking_gives_brier_calibration_window_and_forecast_error(monkeypatch):
    monkeypatch.setattr(policies, "PLAN_SECONDS", 0.05)
    s = build_static(1, 40)
    m = run_policy(s, policies.p3_gasora, days=10, warmup=5, info=InfoModel("censored"),
                   track_risk=True, forecast="fit")
    assert 0 <= m["brier"] <= 1 and 0 <= m["window_coverage"] <= 1 and m["forecast_mae"] >= 0
    assert sum(b[0] for b in m["calibration"]) > 0
    g = run_policy(s, p1_reactive_nn, days=10, warmup=5, info=InfoModel("gaps"), forecast="gaps")
    assert g["forecast_mae"] >= 0


def test_the_oracle_policy_runs_and_uses_the_truth(monkeypatch):
    monkeypatch.setattr(policies, "PLAN_SECONDS", 0.05)
    s = build_static(1, 30)
    m = run_policy(s, arms.oracle_gasora, days=5, warmup=3)
    assert m["deliveries"] > 0


def test_lognormal_lifetimes_keep_the_mean_and_are_skewed():
    normal = build_static(1, 40)
    skewed = build_static(1, 40, durations="lognormal")
    assert skewed.duration_kind == "lognormal"
    a = np.concatenate(normal.durations)
    b = np.concatenate(skewed.durations)
    assert abs(b.mean() - a.mean()) / a.mean() < 0.05
    third = lambda ds: np.mean([((d - d.mean()) ** 3).mean() for d in ds])   # skew within each customer
    assert third(skewed.durations) > 0 > third(normal.durations) - 5          # positive for skewed, near zero for normal
    assert abs(third(normal.durations)) < third(skewed.durations)


def test_arm_d_and_the_other_secondary_arms_run_end_to_end(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(policies, "PLAN_SECONDS", 0.05)
    monkeypatch.setattr(secondary, "D_LEADS", [4, 8])
    monkeypatch.setattr(secondary, "D_CUTOFFS", [0.1, 0.3])
    monkeypatch.setattr(study, "LEADS", [4, 8])
    monkeypatch.setattr(study, "CUTOFFS", [0.1, 0.3])
    for arm in ("D", "clean", "skewed"):
        secondary.main(arm, "dev", source="straight", n=30, days=3, warmup=2, seeds=[1])
        assert (tmp_path / "data" / f"secondary_{arm}_dev_straight_points.csv").exists()
    capsys.readouterr()
    with pytest.raises(SystemExit):                            # the oracle needs the main study results first
        secondary.main("oracle", "dev", source="straight", n=30, days=3, warmup=2, seeds=[1])
    study.main("dev", source="straight", n=30, days=3, warmup=2, seeds=[1])
    secondary.main("oracle", "dev", source="straight", n=30, days=3, warmup=2, seeds=[1])
    assert "Oracle bound" in capsys.readouterr().out
