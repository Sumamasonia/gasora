"""The fake agency used for evaluation.

Static part (same for every policy of one seed): places, road matrices, and the hidden
cylinder durations of every customer. Because the durations are drawn per customer in
advance, the k-th cylinder of a customer lasts the same in every policy. That is what makes
the comparison paired.

Dynamic part (new for every policy run): who has gas, delivery history, run-out flags.

Assumption (placeholder): when a driver swaps a cylinder, the system records how long that
cylinder really lasted (the driver estimates it from the remaining gas).
"""
from dataclasses import dataclass, replace
import hashlib
import os
import pickle

import numpy as np

from config import N_CUSTOMERS
from simulator.generator import make_customers
from planner.routing import travel_minutes

N_DRAWS = 60              # hidden durations drawn per customer (days are far fewer)


@dataclass
class Static:
    seed: int
    n: int
    customers: list       # template dicts from the simulator
    minutes: list         # (n+1) x (n+1), index 0 = depot
    km: list
    durations: list       # durations[c-1] = array of hidden cylinder durations of customer c
    source: str
    duration_kind: str = "normal"       # "normal" or "lognormal" (same mean and spread)


def _durations(seed, c, kind="normal"):
    rng = np.random.default_rng([seed, c["id"]])
    mean, sd = (c["base"], 1.5) if c["pattern"] == "steady" else (c["base"] * 0.7, 5.0)   # irregular: after the rate change
    if kind == "lognormal":                              # skewed, with the same mean and spread
        sigma2 = np.log(1 + sd ** 2 / mean ** 2)
        d = rng.lognormal(np.log(mean) - sigma2 / 2, np.sqrt(sigma2), N_DRAWS)
    else:
        d = rng.normal(mean, sd, N_DRAWS)
    return np.maximum(5.0, d)


def _road_cache_file(seed, n):
    """Road matrices take a while, so they are saved. The name changes if the map or the speeds change."""
    from planner import road_matrix as rm
    if not os.path.isdir("data") or not os.path.exists(rm.GRAPH_FILE):
        return None
    st = os.stat(rm.GRAPH_FILE)
    sig = hashlib.md5(f"{st.st_size}-{int(st.st_mtime)}-{sorted(rm.SPEEDS_KMH.items())}-{rm.DEFAULT_SPEED_KMH}".encode()).hexdigest()[:10]
    return os.path.join("data", f"static_road_s{seed}_n{n}_{sig}.pkl")


def build_static(seed, n=N_CUSTOMERS, source="straight", durations="normal"):
    """durations="lognormal": the same agency (places, matrices, history) with skewed cylinder lifetimes."""
    static = _build_cached(seed, n, source)
    if durations == "normal":
        return static
    return replace(static, duration_kind=durations,
                   durations=[_durations(seed, c, durations) for c in static.customers])


def _build_cached(seed, n, source):
    if source == "road":
        cache = _road_cache_file(seed, n)
        if cache and os.path.exists(cache):
            with open(cache, "rb") as f:
                return pickle.load(f)
        static = _build_static(seed, n, source)
        if cache:
            with open(cache, "wb") as f:
                pickle.dump(static, f)
        return static
    return _build_static(seed, n, source)


def _build_static(seed, n, source):
    rng = np.random.default_rng(seed)
    if source == "road":
        from planner import road_matrix as rm
        G = rm.load_graph()
        depot = rm.nearest_node(G, *rm.CENTER)
        places = rm.sample_nodes(G, n, rng)
        positions = [rm.node_xy_km(G, p, depot) for p in places]
        customers = make_customers(n, rng, positions=positions)
        minutes, km = rm.road_matrices(G, [depot] + places)
    else:
        customers = make_customers(n, rng)
        nodes = [{"x": 0.0, "y": 0.0}] + customers
        minutes = [[travel_minutes(a, b) for b in nodes] for a in nodes]
        km = [[((a["x"] - b["x"]) ** 2 + (a["y"] - b["y"]) ** 2) ** 0.5 for b in nodes] for a in nodes]
    durations = [_durations(seed, c) for c in customers]
    return Static(seed, n, customers, minutes, km, durations, source)


def new_state(static):
    """Fresh customers for one policy run. Day 0 is the first simulated day."""
    state = []
    for c, dur in zip(static.customers, static.durations):
        days_since = c["days_since"]
        state.append({
            "id": c["id"], "demand": c["demand"],
            "intervals": list(c["intervals"]),          # what the system has seen so far
            "days_since": days_since,
            "last_delivery": -days_since,
            "cyl": 0,                                    # index of the current cylinder
            "runout_day": -days_since + max(dur[0], days_since + 0.5),
            "out": False,
        })
    return state
