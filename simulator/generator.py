"""Simulator: makes fake customers with delivery history.
Two hidden usage patterns: steady, and irregular (rate changes after 3 deliveries).
"""
import numpy as np


def make_customers(n, rng):
    customers = []
    for i in range(1, n + 1):
        x, y = rng.uniform(-8, 8, size=2)          # km from the depot
        pattern = "steady" if rng.random() < 0.6 else "irregular"
        base = rng.uniform(15, 30)                 # usual days between refills
        intervals = []
        for k in range(6):                         # 6 past deliveries
            if pattern == "steady":
                iv = rng.normal(base, 1.5)
            else:
                rate = 1.0 if k < 3 else 0.7
                iv = rng.normal(base * rate, 5.0)
            intervals.append(max(5.0, iv))
        customers.append({
            "id": i, "x": x, "y": y, "pattern": pattern,
            "intervals": intervals,
            "days_since": rng.uniform(0, base * 1.1),
            "demand": int(rng.integers(1, 3)),
        })
    return customers
