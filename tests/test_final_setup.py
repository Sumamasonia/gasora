import config
from evaluation import checkpoint
from evaluation.harness import run_policy
from evaluation.world import build_static


def never_deliver(static, state, day):
    return []


def test_warmup_is_not_counted():
    static = build_static(1, 30)
    # Nobody is ever served. Without a warm-up, run-outs happen inside the counted days.
    cold = run_policy(static, never_deliver, days=40, warmup=0)
    # With a long warm-up every customer has already run out, so no new run-outs are counted,
    # but every customer is still without gas on every counted day.
    warm = run_policy(static, never_deliver, days=10, warmup=80)
    assert cold["runouts_per_100cm"] > 0
    assert warm["runouts_per_100cm"] == 0
    assert warm["days_out"] == 30 * 10


def test_checkpoint_name_changes_when_a_setting_changes(monkeypatch):
    a = checkpoint.fingerprint(days=60)
    monkeypatch.setattr(config, "SHIFT_MIN", config.SHIFT_MIN + 60)
    assert checkpoint.fingerprint(days=60) != a


def test_checkpoint_saves_and_reloads(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    ck = checkpoint.Checkpoint("demo", days=5)
    ck.add({"seed": 2, "x": 1})
    ck.add({"seed": 1, "x": 2})
    again = checkpoint.Checkpoint("demo", days=5)
    assert again.done() == {1, 2}
    assert [r["seed"] for r in again.ordered()] == [1, 2]
    assert checkpoint.Checkpoint("demo", days=6).done() == set()          # other settings: nothing reused
