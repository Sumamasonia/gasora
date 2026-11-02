"""Greedy nearest-neighbour routing (used by P1 and by the ablation).

Node 0 is the depot. Customers are numbered 1..n (same numbers as the matrix).
Vehicles are filled one after the other: each goes to the nearest customer that still fits
(capacity and shift length, including the way back to the depot).
"""
from config import N_VEHICLES, CAPACITY, SHIFT_MIN, SERVICE_MIN


def nearest_neighbour_routes(candidates, tm, demand):
    """candidates: list of customer numbers to visit. tm: minutes matrix.
    demand: dict customer number -> cylinders. Returns a list of routes (lists of numbers)."""
    left = sorted(candidates)
    routes = []
    for _ in range(N_VEHICLES):
        route, load, clock, here = [], 0, 0, 0
        while left:
            best = None
            for c in left:
                if load + demand[c] > CAPACITY:
                    continue
                finish = clock + tm[here][c] + SERVICE_MIN + tm[c][0]
                if finish > SHIFT_MIN:
                    continue
                if best is None or tm[here][c] < tm[here][best]:
                    best = c
            if best is None:
                break
            clock += tm[here][best] + SERVICE_MIN
            load += demand[best]
            route.append(best)
            left.remove(best)
            here = best
        routes.append(route)
    return routes
