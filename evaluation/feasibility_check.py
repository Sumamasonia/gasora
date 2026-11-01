"""
“Gasora feasibility check”

Checks three things on 50 fake customers:
  1. A simple simulator makes delivery history (steady and irregular customers).
  2. A simple predictor gives each customer a 48-hour run-out risk.
  3. OR-Tools builds routes where every customer is an optional stop,
     and the skip penalty is risk x emergency cost.

Run:  python evaluation/feasibility_check.py
"""
import math
import numpy as np
from scipy.stats import norm
from ortools.constraint_solver import pywrapcp, routing_enums_pb2

# ---------- settings (placeholders, we will tune them later) ----------
SEED = 1
N_CUSTOMERS = 50
N_VEHICLES = 2
CAPACITY = 40            # cylinders per vehicle
SHIFT_MIN = 240          # minutes per vehicle (short on purpose, so some skipping must happen)
SERVICE_MIN = 10         # minutes at each customer
SPEED_KMH = 30           # straight-line speed (week 1 only; OSMnx comes in week 2)
EMERGENCY_COST = 300     # penalty units for skipping a customer with risk 1.0
URGENT_PENALTY = 100000  # very high penalty for urgent requests
SOLVER_SECONDS = 10

rng = np.random.default_rng(SEED)


# ---------- 1. simulator ----------
def make_customers():
    customers = []
    for i in range(1, N_CUSTOMERS + 1):
        x, y = rng.uniform(-8, 8, size=2)          # km from the depot
        pattern = "steady" if rng.random() < 0.6 else "irregular"
        base = rng.uniform(15, 30)                 # usual days between refills
        intervals = []
        for k in range(6):                         # 6 past deliveries
            if pattern == "steady":
                iv = rng.normal(base, 1.5)
            else:
                rate = 1.0 if k < 3 else 0.7       # usage rate changes after 3 deliveries
                iv = rng.normal(base * rate, 5.0)
            intervals.append(max(5.0, iv))
        customers.append({
            "id": i, "x": x, "y": y, "pattern": pattern,
            "intervals": intervals,
            "days_since": rng.uniform(0, base * 1.1),   # days since last delivery
            "demand": int(rng.integers(1, 3)),          # 1 or 2 cylinders
        })
    return customers


# ---------- 2. predictor ----------
def baseline_rule(c):
    """Old rule: average days, alert 2 days before."""
    avg = float(np.mean(c["intervals"]))
    return (c["days_since"] >= avg - 2)


def run_out_risk(c, pooled_mu, pooled_sd):
    """Chance of running out in the next 48 hours, given still not empty now."""
    iv = c["intervals"]
    if len(iv) >= 3:
        mu = float(np.mean(iv[-4:]))               # recent intervals count more
        sd = max(1.0, float(np.std(iv, ddof=1)))
    else:
        mu, sd = pooled_mu, pooled_sd              # few deliveries: borrow from similar customers
    t = c["days_since"]
    survive = 1 - norm.cdf(t, mu, sd)
    if survive < 1e-6:
        return 1.0
    p = (norm.cdf(t + 2, mu, sd) - norm.cdf(t, mu, sd)) / survive
    return float(min(1.0, max(0.0, p)))


def band(risk):
    return "Critical" if risk >= 0.7 else "High" if risk >= 0.3 else "Normal"


# ---------- 3. planner ----------
def travel_minutes(a, b):
    km = math.hypot(a["x"] - b["x"], a["y"] - b["y"])
    return int(round(km / SPEED_KMH * 60))


def plan(customers, risks, urgent_ids=()):
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

    # every customer is an optional stop: skip penalty = risk x emergency cost
    for k, c in enumerate(customers, start=1):
        penalty = URGENT_PENALTY if c["id"] in urgent_ids else int(1 + risks[k - 1] * EMERGENCY_COST)
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


# ---------- run ----------
def main():
    customers = make_customers()
    pooled_mu = float(np.mean([np.mean(c["intervals"]) for c in customers]))
    pooled_sd = float(np.mean([np.std(c["intervals"], ddof=1) for c in customers]))
    risks = [run_out_risk(c, pooled_mu, pooled_sd) for c in customers]

    print("=== Predictor ===")
    bands = [band(r) for r in risks]
    for b in ("Normal", "High", "Critical"):
        print(f"{b:9s}: {bands.count(b)} customers")
    base_alert = sum(baseline_rule(c) for c in customers)
    print(f"Old rule would alert: {base_alert} customers")

    # make customer 7 an urgent request, to test the very high penalty
    urgent = {7}
    result = plan(customers, risks, urgent_ids=urgent)
    if result is None:
        print("No solution found")
        return
    routes, visited = result

    print("\n=== Plan ===")
    for v, (route, mins) in enumerate(routes, start=1):
        print(f"Vehicle {v}: {len(route)} stops, about {mins} min -> {route}")
    skipped = [k for k in range(1, N_CUSTOMERS + 1) if k not in visited]
    vis_risk = [risks[k - 1] for k in visited]
    skp_risk = [risks[k - 1] for k in skipped]
    print(f"\nVisited: {len(visited)}   Skipped: {len(skipped)}")
    print(f"Average risk of visited customers: {np.mean(vis_risk):.2f}")
    if skp_risk:
        print(f"Average risk of skipped customers: {np.mean(skp_risk):.2f}")
    print(f"Urgent customer 7 visited: {7 in visited}")
    crit_skipped = [k for k in skipped if bands[k - 1] == "Critical"]
    print(f"Critical customers skipped: {crit_skipped}")


if __name__ == "__main__":
    main()