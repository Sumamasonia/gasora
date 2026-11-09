import numpy as np
import pytest

from evaluation import arms, policies
from evaluation.harness import InfoModel, route_minutes, run_policy
from evaluation.policies import p1_reactive_nn
from evaluation.world import build_static
from planner.greedy import nearest_neighbour_routes
from predictor import risk
from predictor.censored import censored_normal_fit


def make_records(rng, n, mu=20.0, sd=3.0):
    """Lifetimes ~ N(mu, sd). A visit at a random time T either finds the cylinder empty (complete record)
    or earlier (only the gap T is known: a lower bound)."""
    life = rng.normal(mu, sd, n)
    visit = rng.uniform(14, 26, n)
    return [(float(x), False) if x <= t else (float(t), True) for x, t in zip(life, visit)]


def test_censored_fit_recovers_the_truth_where_the_plain_average_does_not():
    obs = make_records(np.random.default_rng(1), 4000)
    mu, sd = censored_normal_fit(obs)
    naive = float(np.mean([v for v, _ in obs]))
    assert abs(mu - 20.0) < 0.4 and abs(sd - 3.0) < 0.4
    assert naive < 18.5                                      # taking every record as complete is far too low


def test_fit_needs_a_complete_record():
    assert censored_normal_fit([(10.0, True), (12.0, True)]) is None
    assert censored_normal_fit([(10.0, False)])[1] == 1.0     # one record: the spread floor


def test_risk_code_uses_the_censored_fit_and_pooled_values_for_short_history():
    c = {"obs": [(20.0, False), (22.0, False), (18.0, False), (21.0, False)], "intervals": [20, 22, 18, 21],
         "days_since": 10.0}
    mu, sd = risk._fit(c, 25.0, 5.0)
    assert 19 < mu < 22
    assert risk._fit({"obs": [(20.0, False)], "intervals": [20], "days_since": 3.0}, 25.0, 5.0) == (25.0, 5.0)
    again = risk._fit(c, 25.0, 5.0)                           # served from the cache
    assert again == (mu, sd)


def test_the_information_model_does_not_change_the_simulated_world():
    s = build_static(2, 40)
    clean = run_policy(s, p1_reactive_nn, days=30, warmup=10)
    limited = run_policy(s, p1_reactive_nn, days=30, warmup=10, info=InfoModel("censored"))
    for k in ("runouts_per_100cm", "deliveries", "total_km", "early"):
        assert clean[k] == limited[k]                         # the reactive policy ignores history


def early_policy(static, state, day):
    """Delivers to customers 8 days after their last delivery: always before the cylinder is empty."""
    ids = [c["id"] for c in state if c["days_since"] >= 8]
    return nearest_neighbour_routes(ids, static.minutes, {c["id"]: c["demand"] for c in state})


def test_early_deliveries_make_censored_records_and_short_gaps():
    s = build_static(1, 60)
    m = run_policy(s, early_policy, days=40, warmup=20, info=InfoModel("gaps"))
    assert m["info_censored_share"] > 0.9                     # almost every swap came before the cylinder was empty
    assert m["info_gap_over_true"] < 0.7                      # so the recorded gaps are far too short


def test_reactive_deliveries_make_complete_records_and_long_gaps():
    m = run_policy(build_static(1, 60), p1_reactive_nn, days=40, warmup=20, info=InfoModel("gaps"))
    assert m["info_censored_share"] == 0
    assert m["info_gap_over_true"] >= 1.0                     # customers waited after running out


def test_vehicle_hours_are_driving_plus_service():
    s = build_static(3, 40)
    seen = []

    def spy(static, state, day):
        routes = p1_reactive_nn(static, state, day)
        seen.extend(routes)
        return routes

    m = run_policy(s, spy, days=20, warmup=0)
    import config
    expected = sum(route_minutes(r, s.minutes) + config.SERVICE_MIN * len(r) for r in seen if r) / 60
    assert m["vehicle_hours"] == pytest.approx(expected)


def test_rule_arms_run_with_each_kind_of_information(monkeypatch):
    monkeypatch.setattr(policies, "PLAN_SECONDS", 0.05)
    s = build_static(1, 30)
    for arm, fit in (("gaps", False), ("complete", False), ("censored", True)):
        m = run_policy(s, arms.make_rule(6, use_fit=fit), days=6, warmup=4, info=InfoModel(arm))
        assert m["deliveries"] > 0 and m["vehicle_hours"] > 0


def make_two_sided_records(rng, n, mu=20.0, sd=3.0):
    """Each cylinder is checked at a random time T. Found not empty: only 'at least T' is known (kind 1).
    Found empty with no call: only 'at most T' is known (kind 2). Found empty with a call: exact (kind 0)."""
    life = rng.normal(mu, sd, n)
    visit = rng.uniform(14, 26, n)
    called = rng.random(n) < 0.5
    out = []
    for x, t, c in zip(life, visit, called):
        if x > t:
            out.append((float(t), 1))
        elif c:
            out.append((float(x), 0))
        else:
            out.append((float(t), 2))
    return out


def test_fit_handles_all_three_record_kinds():
    obs = make_two_sided_records(np.random.default_rng(3), 6000)
    assert any(k == 2 for _, k in obs)
    mu, sd = censored_normal_fit(obs)
    assert abs(mu - 20.0) < 0.5 and abs(sd - 3.0) < 0.6
