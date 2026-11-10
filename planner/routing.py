"""Planner: OR-Tools routing. Every customer is an optional stop.
Skip penalty = risk x emergency cost. Urgent requests get a very high penalty.
"""
import math
from ortools.constraint_solver import pywrapcp, routing_enums_pb2

from config import (N_VEHICLES, CAPACITY, SHIFT_MIN, SERVICE_MIN, SPEED_KMH,
                    EMERGENCY_COST, URGENT_PENALTY, SOLVER_SECONDS, CRITICAL_AT)


def travel_minutes(a, b):
    km = math.hypot(a["x"] - b["x"], a["y"] - b["y"])
    return int(round(km / SPEED_KMH * 60))


def plan(customers, risks, urgent_ids=(), tm=None, seconds=None,
         urgent_late_cost=0, critical_late_cost=0, late_risks=None, n_vehicles=None):
    """Returns (routes, visited) or None. routes = list of (stop list, minutes).
    tm = ready road-time matrix in minutes (index 0 = depot). If None, straight-line is used.
    seconds = solver time limit (default from config).
    urgent_late_cost / critical_late_cost = extra cost per minute of arrival time at urgent or Critical
    customers. It pulls them towards the start of their route. 0 (default) = no pull.
    late_risks = the run-out risks used to decide who is Critical for that pull (default: risks).
    n_vehicles = number of vehicles (default from config); the API asks for one more when urgent requests do not fit."""
    depot = {"id": 0, "x": 0.0, "y": 0.0, "demand": 0}
    nodes = [depot] + customers
    n = len(nodes)
    if tm is None:
        tm = [[travel_minutes(nodes[i], nodes[j]) for j in range(n)] for i in range(n)]

    nv = n_vehicles or N_VEHICLES
    manager = pywrapcp.RoutingIndexManager(n, nv, 0)
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
    routing.AddDimensionWithVehicleCapacity(d_idx, 0, [CAPACITY] * nv, True, "Load")

    time_dim = routing.GetDimensionOrDie("Time")
    for k, c in enumerate(customers, start=1):
        if c["id"] in urgent_ids and urgent_late_cost > 0:
            time_dim.SetCumulVarSoftUpperBound(manager.NodeToIndex(k), 0, int(urgent_late_cost))
        elif (late_risks if late_risks is not None else risks)[k - 1] >= CRITICAL_AT and critical_late_cost > 0:
            time_dim.SetCumulVarSoftUpperBound(manager.NodeToIndex(k), 0, int(critical_late_cost))
        if c["id"] in urgent_ids:
            penalty = URGENT_PENALTY
        else:
            penalty = int(1 + risks[k - 1] * EMERGENCY_COST)
        routing.AddDisjunction([manager.NodeToIndex(k)], penalty)

    params = pywrapcp.DefaultRoutingSearchParameters()
    params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    params.time_limit.FromMilliseconds(int((seconds or SOLVER_SECONDS) * 1000))

    sol = routing.SolveWithParameters(params)
    if sol is None:
        return None
    routes, visited = [], set()
    for v in range(nv):
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
