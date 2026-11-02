"""Road-map check: customers on real Faisalabad roads, road-time matrix, OR-Tools plan.

Needs data/faisalabad.graphml (made by planner/download_map.py).
Run from the project folder:  python -m evaluation.map_check
"""
import time

import numpy as np

from config import SEED, N_CUSTOMERS, SPEED_KMH
from simulator.generator import make_customers
from predictor.risk import pooled_values, run_out_risk, band
from planner.routing import plan
from planner import road_matrix as rm


def main():
    t0 = time.time()
    rng = np.random.default_rng(SEED)

    print("Loading map...")
    G = rm.load_graph()
    depot = rm.nearest_node(G, *rm.CENTER)
    places = rm.sample_nodes(G, N_CUSTOMERS, rng)
    node_list = [depot] + places
    positions = [rm.node_xy_km(G, p, depot) for p in places]

    print("Building road-time matrix (can take a minute)...")
    minutes, km = rm.road_matrices(G, node_list)
    print(f"Matrix done in {time.time() - t0:.0f} s")

    # road time against straight-line time, for the same pairs
    ratios = []
    for i in range(1, len(node_list)):
        xi, yi = positions[i - 1]
        straight_min = (xi ** 2 + yi ** 2) ** 0.5 / SPEED_KMH * 60
        if straight_min >= 2:
            ratios.append(minutes[0][i] / straight_min)
    print(f"Depot -> customer: road time / straight-line time, median {np.median(ratios):.2f}")
    print(f"Road distance depot -> customers: median {np.median([km[0][i] for i in range(1, len(node_list))]):.1f} km")

    customers = make_customers(N_CUSTOMERS, rng, positions=positions)
    pooled_mu, pooled_sd = pooled_values(customers)
    risks = [run_out_risk(c, pooled_mu, pooled_sd) for c in customers]
    bands = [band(r) for r in risks]
    print("\n=== Predictor ===")
    for b in ("Normal", "High", "Critical"):
        print(f"{b:9s}: {bands.count(b)} customers")

    result = plan(customers, risks, urgent_ids={7}, tm=minutes)
    if result is None:
        print("No solution found")
        return
    routes, visited = result
    print("\n=== Plan on road times ===")
    for v, (route, mins) in enumerate(routes, start=1):
        dist = 0.0
        prev = 0
        for stop in route:
            dist += km[prev][stop]
            prev = stop
        dist += km[prev][0]
        print(f"Vehicle {v}: {len(route)} stops, about {mins} min, {dist:.1f} km -> {route}")
    skipped = [k for k in range(1, N_CUSTOMERS + 1) if k not in visited]
    print(f"\nVisited: {len(visited)}   Skipped: {len(skipped)}")
    print(f"Average risk of visited customers: {np.mean([risks[k-1] for k in visited]):.2f}")
    if skipped:
        print(f"Average risk of skipped customers: {np.mean([risks[k-1] for k in skipped]):.2f}")
    print(f"Urgent customer 7 visited: {7 in visited}")
    print(f"Critical customers skipped: {[k for k in skipped if bands[k-1] == 'Critical']}")


if __name__ == "__main__":
    main()
