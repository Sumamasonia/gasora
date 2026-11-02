"""Baseline: the old rule. Average days between deliveries, alert 2 days before."""
import numpy as np


def baseline_alert(customer):
    avg = float(np.mean(customer["intervals"]))
    return customer["days_since"] >= avg - 2
