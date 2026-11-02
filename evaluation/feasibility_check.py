"""Gasora feasibility check: simulator -> predictor -> planner on 50 fake customers.

Run from the project folder:  python -m evaluation.feasibility_check
"""
import numpy as np

from config import SEED, N_CUSTOMERS
from simulator.generator import make_customers
from predictor.baseline import baseline_alert
from predictor.risk import pooled_values, run_out_risk, band
from planner.routing import plan


def main():
    rng = np.random.default_rng(SEED)
    customers = make_customers(N_CUSTOMERS, rng)
    pooled_mu, pooled_sd = pooled_values(customers)
    risks = [run_out_risk(c, pooled_mu, pooled_sd) for c in customers]
    bands = [band(r) for r in risks]

    print("=== Predictor ===")
    for b in ("Normal", "High", "Critical"):
        print(f"{b:9s}: {bands.count(b)} customers")
    print(f"Old rule would alert: {sum(baseline_alert(c) for c in customers)} customers")

    urgent = {7}   # test: customer 7 is an urgent request
    result = plan(customers, risks, urgent_ids=urgent)
    if result is None:
        print("No solution found")
        return
    routes, visited = result

    print("\n=== Plan ===")
    for v, (route, mins) in enumerate(routes, start=1):
        print(f"Vehicle {v}: {len(route)} stops, about {mins} min -> {route}")
    skipped = [k for k in range(1, N_CUSTOMERS + 1) if k not in visited]
    print(f"\nVisited: {len(visited)}   Skipped: {len(skipped)}")
    print(f"Average risk of visited customers: {np.mean([risks[k-1] for k in visited]):.2f}")
    if skipped:
        print(f"Average risk of skipped customers: {np.mean([risks[k-1] for k in skipped]):.2f}")
    print(f"Urgent customer 7 visited: {7 in visited}")
    print(f"Critical customers skipped: {[k for k in skipped if bands[k-1] == 'Critical']}")


if __name__ == "__main__":
    main()
