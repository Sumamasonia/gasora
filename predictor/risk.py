"""Gasora predictor (version 1): 48-hour run-out risk and risk bands.
Uses each customer's own intervals. With fewer than 3 deliveries it uses pooled values.
"""
import numpy as np
from scipy.stats import norm

from config import CRITICAL_AT, HIGH_AT


def pooled_values(customers):
    mu = float(np.mean([np.mean(c["intervals"]) for c in customers]))
    sd = float(np.mean([np.std(c["intervals"], ddof=1) for c in customers]))
    return mu, sd


def _fit(customer, pooled_mu, pooled_sd):
    """Mean and spread of the customer's days between refills."""
    iv = customer["intervals"]
    if len(iv) >= 3:
        mu = float(np.mean(iv[-4:]))               # recent intervals count more
        sd = max(1.0, float(np.std(iv, ddof=1)))
        return mu, sd
    return pooled_mu, pooled_sd                    # few deliveries: borrow from similar customers


def run_out_risk(customer, pooled_mu, pooled_sd):
    """Chance of running out in the next 48 hours, given still not empty now."""
    mu, sd = _fit(customer, pooled_mu, pooled_sd)
    t = customer["days_since"]
    survive = 1 - norm.cdf(t, mu, sd)
    if survive < 1e-6:
        return 1.0
    p = (norm.cdf(t + 2, mu, sd) - norm.cdf(t, mu, sd)) / survive
    return float(min(1.0, max(0.0, p)))


def refill_window(customer, pooled_mu, pooled_sd, lo=0.1, hi=0.9):
    """Days from now until the cylinder is likely empty, as (earliest, latest).
    These are the lo and hi quantiles of the remaining time, given that it is not empty yet.
    With the defaults, about 80% of cylinders should run out inside the window if the model fits."""
    mu, sd = _fit(customer, pooled_mu, pooled_sd)
    t = customer["days_since"]
    f_t = norm.cdf(t, mu, sd)
    if 1 - f_t < 1e-6:
        return 0.0, 0.0                            # already past the usual time
    def q(p):
        return max(0.0, float(norm.ppf(f_t + p * (1 - f_t), mu, sd)) - t)
    return q(lo), q(hi)


def band(risk):
    if risk >= CRITICAL_AT:
        return "Critical"
    if risk >= HIGH_AT:
        return "High"
    return "Normal"
