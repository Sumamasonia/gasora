import json

import numpy as np
import pytest

from evaluation import checkpoint, curves, freeze, guard, meta, policies, study
from predictor import risk


def point(runouts, km, hours=None):
    return {"runouts_per_100cm": runouts, "total_km": km, "vehicle_hours": km / 20 if hours is None else hours}


def test_cost_is_read_between_the_two_settings_around_the_level():
    pts = [point(30, 100), point(10, 200), point(20, 150)]
    assert curves.cost_at_level(pts, 20, "total_km") == 150
    assert curves.cost_at_level(pts, 15, "total_km") == pytest.approx(175)
    assert curves.cost_at_level(pts, 5, "total_km") is None            # below the curve: not covered
    assert curves.cost_at_level(pts, 31, "total_km") is None           # above the curve: not covered


def test_a_curve_that_crosses_the_level_twice_is_read_at_the_lowest_cost():
    # the shape of R0 in the development runs: run-outs fall, then rise again (grid order: leads 6, 8, 10, 12)
    pts = [point(16.1, 4215), point(7.8, 5599), point(12.7, 4822), point(26.1, 4421)]
    first = 4215 + (5599 - 4215) * (16.1 - 15) / (16.1 - 7.8)
    second = 4822 + (4421 - 4822) * (15 - 12.7) / (26.1 - 12.7)
    assert curves.n_crossings(pts, 15) == 2
    assert curves.cost_at_level(pts, 15, "total_km") == pytest.approx(min(first, second))
    assert curves.cost_at_level(pts, 15, "total_km") == pytest.approx(first)
    assert curves.n_crossings(pts, 5) == 0 and curves.cost_at_level(pts, 5, "total_km") is None


def test_a_setting_exactly_at_the_level_is_one_crossing_with_its_own_cost():
    pts = [point(30, 100), point(15, 140), point(5, 300)]
    assert curves.n_crossings(pts, 15) == 1
    assert curves.cost_at_level(pts, 15, "total_km") == 140


def test_descriptive_measures_are_read_at_the_crossing_with_the_lowest_kilometres():
    a, b, c = point(20, 100), point(10, 300), point(20, 200)          # crosses 15 between a and b, and between b and c
    for p, v in zip((a, b, c), (1.0, 5.0, 9.0)):
        p["deliveries_steady"] = v
    assert curves.cost_at_level([a, b, c], 15, "deliveries_steady", choose_by="total_km") == pytest.approx(3.0)


def test_arm_points_follow_the_grid_order_not_the_order_of_the_file():
    rec = {"arms": {"G": {"0.1": point(30, 3), "0.01": point(10, 1), "0.02": point(20, 2)}}}
    assert [p["total_km"] for p in curves.arm_points(rec, "G")] == [1, 2, 3]
    rec = {"arms": {"R0": {"10": point(1, 10), "2": point(2, 2), "4": point(3, 4)}}}
    assert [p["total_km"] for p in curves.arm_points(rec, "R0")] == [2, 4, 10]


def test_the_gasora_grid_is_the_one_in_protocol_v1_2_and_the_default_fit_uses_all_records():
    assert study.CUTOFFS == [0.01, 0.02, 0.03, 0.05, 0.10, 0.15, 0.20, 0.30]
    assert study.LEADS == [2, 4, 6, 8, 10, 12]


def make_recs(n_seeds, g_shift_km, g_shift_hours, only_levels_above=0):
    """Rule arms R0 and R1 cost 3000 km and 150 hours at 15 run-outs; G is shifted by the given amounts."""
    rng = np.random.default_rng(0)
    recs = []
    for s in range(1, n_seeds + 1):
        noise = rng.normal(0, 5)
        def arm(km_shift, h_shift):
            return {"a": point(10 + only_levels_above, 3200 + noise + km_shift, 160 + h_shift),
                    "b": point(20 + only_levels_above, 2800 + noise + km_shift, 140 + h_shift)}
        recs.append({"seed": s, "arms": {"R0": arm(0, 0), "R1": arm(0, 0), "R2": arm(0, 0),
                                         "G": arm(g_shift_km, g_shift_hours), "A": arm(0, 0)}})
    return recs


def test_grade_follows_the_pass_rule():
    assert curves.overall_grade(make_recs(20, -100, -5)) == "supported"            # both measures lower
    assert curves.overall_grade(make_recs(20, -100, +5)) == "partly supported"     # kilometres only
    assert curves.overall_grade(make_recs(20, +100, +5)) == "not supported"        # neither
    # curves that do not reach the primary level 15 (they start at 40)
    assert curves.overall_grade(make_recs(20, -100, -5, only_levels_above=30)) == "not covered"


def test_level_10_is_reported_only_when_every_curve_reaches_it():
    assert curves.level_is_reported(make_recs(20, 0, 0), 10) is True
    assert curves.level_is_reported(make_recs(20, 0, 0, only_levels_above=5), 10) is False   # curves start at 15
    assert curves.level_is_reported(make_recs(20, 0, 0, only_levels_above=5), 15) is True


def test_reserved_seeds_are_refused_before_the_freeze(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    guard.check_seeds(range(1, 21), path=str(tmp_path / "f.json"))                 # development seeds: fine
    with pytest.raises(SystemExit):
        guard.check_seeds([21], path=str(tmp_path / "f.json"))
    (tmp_path / "f.json").write_text(json.dumps({"code_hash": "something-else"}))
    with pytest.raises(SystemExit):
        guard.check_seeds([21], path=str(tmp_path / "f.json"))                     # code differs from the freeze
    (tmp_path / "f.json").write_text(json.dumps({"code_hash": meta.code_hash(), "variant": {}}))
    assert guard.check_seeds([21], path=str(tmp_path / "f.json")) is not None      # matching freeze: allowed


def test_the_code_fingerprint_ignores_line_endings_and_follows_content(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "evaluation").mkdir()
    f = tmp_path / "evaluation" / "a.py"
    f.write_bytes(b"x = 1\ny = 2\n")
    first = meta.code_hash()
    f.write_bytes(b"x = 1\r\ny = 2\r\n")
    assert meta.code_hash() == first
    f.write_bytes(b"x = 1\ny = 3\n")
    assert meta.code_hash() != first


def test_a_checkpoint_made_with_other_code_is_not_reused(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(checkpoint, "code_hash", lambda: "aaaa")
    ck = checkpoint.Checkpoint("t", days=1)
    ck.add({"seed": 1})
    assert checkpoint.Checkpoint("t", days=1).done() == {1}
    monkeypatch.setattr(checkpoint, "code_hash", lambda: "bbbb")
    assert checkpoint.Checkpoint("t", days=1).done() == set()


def test_freeze_writes_the_file_and_lets_the_guard_through(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    (tmp_path / "docs").mkdir()
    (tmp_path / "docs" / "variant_log.md").write_text("| No. | x |\n|---|---|\n| 1 | a |\n| 2 | b |\n")
    assert freeze.logged_variants() == 2
    monkeypatch.setattr(freeze, "git_state", lambda: ("abc123", False))
    monkeypatch.setattr(freeze, "run_metadata", lambda v: {"variant": v})
    freeze.main(fit_m=0, floor=2.0, early_pull=True)
    data = json.loads((tmp_path / "docs" / "freeze.json").read_text())
    assert data["variant"] == {"fit_m": None, "fit_floor": 2.0, "early_pull": True}
    assert guard.check_seeds([21])["variant"]["fit_floor"] == 2.0
    monkeypatch.setattr(freeze, "git_state", lambda: ("abc123", True))
    with pytest.raises(SystemExit):
        freeze.main(fit_m=4, floor=1.0, early_pull=False)                           # uncommitted changes


def test_variants_are_applied_and_the_confirmation_stage_needs_the_freeze(monkeypatch):
    monkeypatch.setattr(risk, "FIT_M", 4)
    monkeypatch.setattr(risk, "FIT_FLOOR", 1.0)
    monkeypatch.setattr(policies, "POLICY_LATE_COST", 0)
    study.apply_variant({"fit_m": None, "fit_floor": 2.0, "early_pull": True})
    assert risk.FIT_M is None and risk.FIT_FLOOR == 2.0 and policies.POLICY_LATE_COST > 0
    monkeypatch.chdir("/")                                                          # no freeze file here
    with pytest.raises(SystemExit):
        study.main("confirm")


def test_the_study_runs_end_to_end_and_resumes(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(policies, "PLAN_SECONDS", 0.05)
    monkeypatch.setattr(study, "LEADS", [4, 8])
    monkeypatch.setattr(study, "CUTOFFS", [0.1, 0.3])
    study.main("dev", source="straight", n=30, days=3, warmup=2, seeds=[1, 2])
    out = capsys.readouterr().out
    assert "Primary grade at level 15" in out and "Saved data" in out
    assert (tmp_path / "data" / "study_dev_straight_points.csv").exists()
    study.main("dev", source="straight", n=30, days=3, warmup=2, seeds=[1, 2])
    assert "continuing" in capsys.readouterr().out


def test_the_skip_penalty_scale_is_a_recorded_gasora_setting_and_resets_to_the_default():
    import config
    from evaluation import meta, policies
    try:
        study.apply_variant({"fit_m": None, "fit_floor": 1.0, "early_pull": False, "skip_penalty": 1200})
        m = meta.run_metadata({"skip_penalty": 1200})["settings"]
        assert m["gasora_skip_penalty"] == 1200 and m["skip_penalty"] == config.EMERGENCY_COST == 300
        study.apply_variant({"fit_m": None, "fit_floor": 1.0, "early_pull": False})
        assert meta.run_metadata()["settings"]["gasora_skip_penalty"] == 300
    finally:
        policies.SKIP_PENALTY = None
