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
