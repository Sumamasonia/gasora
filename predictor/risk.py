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


def run_out_risk(customer, pooled_mu, pooled_sd):
    """Chance of running out in the next 48 hours, given still not empty now."""
    iv = customer["intervals"]
    if len(iv) >= 3:
        mu = float(np.mean(iv[-4:]))               # recent intervals count more
        sd = max(1.0, float(np.std(iv, ddof=1)))
    else:
        mu, sd = pooled_mu, pooled_sd
    t = customer["days_since"]
    survive = 1 - norm.cdf(t, mu, sd)
    if survive < 1e-6:
        return 1.0
    p = (norm.cdf(t + 2, mu, sd) - norm.cdf(t, mu, sd)) / survive
    return float(min(1.0, max(0.0, p)))


def band(risk):
    if risk >= CRITICAL_AT:
        return "Critical"
    if risk >= HIGH_AT:
        return "High"
    return "Normal"
