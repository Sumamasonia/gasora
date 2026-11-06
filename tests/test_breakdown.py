import pytest

from evaluation.harness import PATTERNS, run_policy
from evaluation.policies import p1_reactive_nn
from evaluation.world import build_static


def test_split_by_type_adds_up_to_the_totals():
    static = build_static(3, 40)
    m = run_policy(static, p1_reactive_nn, days=25, warmup=10)
    assert sum(m[f"deliveries_{p}"] for p in PATTERNS) == m["deliveries"]
    assert sum(m[f"early_{p}"] for p in PATTERNS) == m["early"]
    assert sum(m[f"days_out_{p}"] for p in PATTERNS) == m["days_out"]
    assert sum(m[f"n_{p}"] for p in PATTERNS) == 40
    # run-out rates are per customer-month of their own type, so rebuild the counts and compare
    total = sum(m[f"runouts_per_100cm_{p}"] * m[f"n_{p}"] * 25 / 30 / 100 for p in PATTERNS)
    assert total == pytest.approx(m["runouts_per_100cm"] * 40 * 25 / 30 / 100)


def test_both_types_exist_in_the_simulation():
    static = build_static(1, 100)
    m = run_policy(static, p1_reactive_nn, days=5, warmup=0)
    assert m["n_steady"] > 20 and m["n_irregular"] > 20
