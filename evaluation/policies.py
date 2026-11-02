"""Delivery policies. Each policy gets (static, state, day) and returns a list of routes
(lists of customer numbers). It may only use what the system can know: delivery history,
days since the last delivery, and which customers have called because they are out of gas.

P1        reactive + nearest neighbour
P2        average-days rule + OR-Tools
P3        Gasora: risk-weighted + OR-Tools
Ablation  Gasora prediction + nearest neighbour (shows the effect of routing alone)
"""
from planner.greedy import nearest_neighbour_routes
from planner.routing import plan
from predictor.baseline import baseline_alert
from predictor.risk import pooled_values, run_out_risk

PLAN_SECONDS = 0.5      # solver time per daily plan (short, so many runs are possible)
CANDIDATE_RISK = 0.1    # P3 and ablation only consider customers with at least this risk


def _demand(state):
    return {c["id"]: c["demand"] for c in state}


def _ortools_routes(static, candidates, risk_by_id, called):
    """Plan the candidate customers with OR-Tools. Customers who called are urgent."""
    if not candidates:
        return []
    ids = [c["id"] for c in candidates]
    nodes = [0] + ids
    tm = [[static.minutes[a][b] for b in nodes] for a in nodes]
    result = plan(candidates, [risk_by_id[i] for i in ids], urgent_ids=called,
                  tm=tm, seconds=PLAN_SECONDS)
    if result is None:                                   # fallback: greedy planner
        return nearest_neighbour_routes(ids, static.minutes, {c["id"]: c["demand"] for c in candidates})
    routes, _ = result
    return [[ids[k - 1] for k in route] for route, _mins in routes]


def _risks(state):
    mu, sd = pooled_values(state)
    return {c["id"]: run_out_risk(c, mu, sd) for c in state}


def p1_reactive_nn(static, state, day):
    called = [c["id"] for c in state if c["out"]]
    return nearest_neighbour_routes(called, static.minutes, _demand(state))


def p2_average_ortools(static, state, day):
    called = {c["id"] for c in state if c["out"]}
    cand = [c for c in state if c["out"] or baseline_alert(c)]
    return _ortools_routes(static, cand, {c["id"]: 1.0 for c in cand}, called)


def _gasora_candidates(state, risk):
    return [c for c in state if c["out"] or risk[c["id"]] >= CANDIDATE_RISK]


def p3_gasora(static, state, day):
    risk = _risks(state)
    called = {c["id"] for c in state if c["out"]}
    return _ortools_routes(static, _gasora_candidates(state, risk), risk, called)


def ablation_prediction_nn(static, state, day):
    risk = _risks(state)
    cand = _gasora_candidates(state, risk)
    return nearest_neighbour_routes([c["id"] for c in cand], static.minutes, _demand(state))


POLICIES = {
    "P1 reactive + NN": p1_reactive_nn,
    "P2 average-days + OR-Tools": p2_average_ortools,
    "P3 Gasora": p3_gasora,
    "Ablation Gasora prediction + NN": ablation_prediction_nn,
}
