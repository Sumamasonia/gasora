import pytest

from predictor.risk import refill_window, run_out_risk


def cust(intervals, days_since):
    return {"intervals": intervals, "days_since": days_since}


def test_window_matches_the_normal_model():
    # mean 20, spread 2, 10 days in: remaining time is about 20 +- 1.28*2 minus 10
    lo, hi = refill_window(cust([20, 22, 18, 20, 22, 18], 10), 20, 4)
    assert lo == pytest.approx(10 - 2.56 / 2 * 1 + 0.0, abs=2.0)
    assert 0 < lo < hi


def test_window_is_wider_for_irregular_customers():
    steady = refill_window(cust([20, 20.5, 19.5, 20, 20.2, 19.8], 10), 20, 4)
    irregular = refill_window(cust([20, 28, 12, 22, 14, 26], 10), 20, 4)
    assert (irregular[1] - irregular[0]) > 2 * (steady[1] - steady[0])


def test_window_shrinks_to_zero_when_far_past_the_usual_time():
    assert refill_window(cust([20, 21, 19, 20], 60), 20, 4) == (0.0, 0.0)


def test_window_and_risk_agree():
    # if the earliest likely day is beyond 2 days, the 48-hour risk must be small (below 10%)
    c = cust([20, 22, 18, 20, 22, 18], 5)
    lo, _ = refill_window(c, 20, 4)
    assert lo > 2 and run_out_risk(c, 20, 4) < 0.1
