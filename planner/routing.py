"""Planner: OR-Tools routing. Every customer is an optional stop.
Skip penalty = risk x emergency cost. Urgent requests get a very high penalty.
"""
import math
from ortools.constraint_solver import pywrapcp, routing_enums_pb2

from config import (N_VEHICLES, CAPACITY, SHIFT_MIN, SERVICE_MIN, SPEED_KMH,
                    EMERGENCY_COST, URGENT_PENALTY, SOLVER_SECONDS)


def travel_minutes(a, b):
    km = math.hypot(a["x"] - b["x"], a["y"] - b["y"])
    return int(round(km / SPEED_KMH * 60))


def plan(customers, risks, urgent_ids=()):
    """Returns (routes, visited) or None. routes = list of (stop list, minutes)."""
    depot = {"id": 0, "x": 0.0, "y": 0.0, "demand": 0}
    nodes = [depot] + customers
    n = len(nodes)
    tm = [[travel_minutes(nodes[i], nodes[j]) for j in range(n)] for i in range(n)]

    manager = pywrapcp.RoutingIndexManager(n, N_VEHICLES, 0)
    routing = pywrapcp.RoutingModel(manager)

    def time_cb(i, j):
        a, b = manager.IndexToNode(i), manager.IndexToNode(j)
        return tm[a][b] + (SERVICE_MIN if a != 0 else 0)
    t_idx = routing.RegisterTransitCallback(time_cb)
    routing.SetArcCostEvaluatorOfAllVehicles(t_idx)
    routing.AddDimension(t_idx, 0, SHIFT_MIN, True, "Time")

    def demand_cb(i):
        return nodes[manager.IndexToNode(i)]["demand"]
    d_idx = routing.RegisterUnaryTransitCallback(demand_cb)
    routing.AddDimensionWithVehicleCapacity(d_idx, 0, [CAPACITY] * N_VEHICLES, True, "Load")

    for k, c in enumerate(customers, start=1):
        if c["id"] in urgent_ids:
            penalty = URGENT_PENALTY
        else:
            penalty = int(1 + risks[k - 1] * EMERGENCY_COST)
        routing.AddDisjunction([manager.NodeToIndex(k)], penalty)

    params = pywrapcp.DefaultRoutingSearchParameters()
    params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    params.time_limit.seconds = SOLVER_SECONDS

    sol = routing.SolveWithParameters(params)
    if sol is None:
        return None
    routes, visited = [], set()
    for v in range(N_VEHICLES):
        idx, route, mins = routing.Start(v), [], 0
        while not routing.IsEnd(idx):
            node = manager.IndexToNode(idx)
            if node != 0:
                route.append(node)
                visited.add(node)
            nxt = sol.Value(routing.NextVar(idx))
            mins += time_cb(idx, nxt)
            idx = nxt
        routes.append((route, mins))
    return routes, visited
