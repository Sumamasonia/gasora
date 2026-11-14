"""Protocol v1.3: the scale of Gasora's skip penalty is a variant of Gasora only."""
from types import SimpleNamespace

from evaluation import arms, policies, study
from planner.routing import plan


def test_a_low_risk_customer_is_skipped_at_the_default_scale_and_visited_at_a_high_scale():
    far = [{"id": 1, "x": 20.0, "y": 0.0, "demand": 1}]              # a long way out: visiting costs far more than 10 minutes
    _, visited_default = plan(far, [0.03], seconds=0.3)                # penalty int(1 + 0.03 x 300) = 10
    _, visited_high = plan(far, [0.03], seconds=0.3, emergency_cost=100000)
    assert visited_default == set() and visited_high == {1}


def test_the_scale_reaches_gasora_and_not_the_rule_arms(monkeypatch):
    seen = []

    def fake_plan(candidates, risks, **kw):
        seen.append(kw.get("emergency_cost", "not passed"))
        return [], set()

    monkeypatch.setattr(policies, "plan", fake_plan)
    static = SimpleNamespace(minutes=[[0, 5, 5], [5, 0, 5], [5, 5, 0]])
    state = [{"id": i, "demand": 1, "out": True, "intervals": [10, 10, 10], "days_since": 12} for i in (1, 2)]
    monkeypatch.setattr(policies, "_risks", lambda s: {c["id"]: 0.5 for c in s})
    try:
        study.apply_variant({"fit_m": None, "fit_floor": 1.0, "early_pull": False, "skip_penalty": 900})
        assert policies.SKIP_PENALTY == 900
        policies.p3_gasora(static, state, 0)
        arms.make_rule(4)(static, state, 0)
        assert seen == [900, None]                                   # Gasora: 900, the rule arm: planner default
        study.apply_variant({"fit_m": None, "fit_floor": 1.0, "early_pull": False})
        assert policies.SKIP_PENALTY is None                         # no flag: the default scale
    finally:
        policies.SKIP_PENALTY = None
