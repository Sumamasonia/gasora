import pytest

import config
from evaluation import empties_study, policies
from evaluation.harness import EmptiesModel, run_policy
from evaluation.policies import p1_reactive_nn
from evaluation.world import build_static


def test_without_the_model_there_are_no_empties_keys_but_vehicles_are_counted():
    m = run_policy(build_static(1, 40), p1_reactive_nn, days=20, warmup=5)
    assert "empties_per_day" not in m
    assert 0 <= m["vehicles_used_per_day"] <= config.N_VEHICLES


def test_everything_handed_back_means_no_empties():
    m = run_policy(build_static(1, 40), p1_reactive_nn, days=40, warmup=10, empties=EmptiesModel(1.0))
    assert m["empties_per_day"] == 0 and m["aged_customers_per_day"] == 0


def test_nothing_handed_back_means_empties_pile_up_and_age():
    m = run_policy(build_static(1, 40), p1_reactive_nn, days=60, warmup=30, empties=EmptiesModel(0.0))
    assert m["empties_per_day"] > 0 and m["aged_customers_per_day"] > 0


def test_the_empties_model_is_repeatable():
    s = build_static(2, 40)
    a = run_policy(s, p1_reactive_nn, days=30, warmup=10, empties=EmptiesModel(0.8))
    b = run_policy(s, p1_reactive_nn, days=30, warmup=10, empties=EmptiesModel(0.8))
    assert a["empties_per_day"] == b["empties_per_day"] and a["deliveries"] == b["deliveries"]


@pytest.mark.parametrize("age,expected", [(10, None), (20, 0.3), (45, 0.5), (75, 0.7), (120, 0.9)])
def test_swap_weight_follows_the_ageing_tiers(age, expected):
    c = {"held": 1, "held_since": 0}
    assert empties_study.swap_weight(c, age) == expected
    assert empties_study.swap_weight({"held": 0, "held_since": None}, age) is None


def test_the_study_runs_end_to_end(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(policies, "PLAN_SECONDS", 0.1)
    empties_study.main(n_seeds=1, days=4, warmup=3, n=30, source="straight", p_return=0.8)
    out = capsys.readouterr().out
    assert "Swap candidates" in out and "Saved data" in out
    assert (tmp_path / "data" / "empties_study_straight.csv").exists()
