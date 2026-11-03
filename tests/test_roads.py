import json
import random
from datetime import date, timedelta

import networkx as nx
import osmnx as ox
import pytest
from fastapi.testclient import TestClient

from backend import security
from backend.app import create_app
from backend.models import User
from planner import road_matrix as rm
from planner.road_router import RoadRouter

N = 60
LAT0, LON0, STEP = 31.39, 73.05, 0.0007       # a small grid that covers the default depot


@pytest.fixture(scope="module")
def graph_file(tmp_path_factory):
    random.seed(0)
    G = nx.MultiDiGraph(crs="EPSG:4326")
    nid = lambda i, j: i * N + j
    for i in range(N):
        for j in range(N):
            G.add_node(nid(i, j), y=LAT0 + i * STEP, x=LON0 + j * STEP)
    for i in range(N):
        for j in range(N):
            for di, dj in ((0, 1), (1, 0)):
                if i + di < N and j + dj < N:
                    hw = random.choice(["residential", "primary", "tertiary"])
                    for u, v in ((nid(i, j), nid(i + di, j + dj)), (nid(i + di, j + dj), nid(i, j))):
                        G.add_edge(u, v, length=77.0, highway=hw)
    path = tmp_path_factory.mktemp("map") / "graph.graphml"
    ox.save_graphml(G, path)
    return str(path)


def pt(i, j):
    return (LAT0 + i * STEP, LON0 + j * STEP)


def test_matrix_basics(graph_file):
    r = RoadRouter(graph_file, cache_path=None)
    m = r.matrix([pt(5, 5), pt(5, 15), pt(30, 30)])
    assert m["minutes"][0][0] == 0
    assert m["minutes"][0][1] > 0 and m["km"][0][1] == pytest.approx(0.77, rel=0.01)   # 10 edges of 77 m
    assert m["km"][0][2] > m["km"][0][1]
    assert m["far"] == []


def test_far_place_is_reported(graph_file):
    r = RoadRouter(graph_file, cache_path=None)
    m = r.matrix([pt(5, 5), (LAT0 + 1.0, LON0 + 1.0)])
    assert m["far"] == [1]


def test_adding_a_place_later_gives_the_same_numbers(graph_file):
    pts = [pt(5, 5), pt(10, 40), pt(40, 10), pt(50, 50)]
    full = RoadRouter(graph_file, cache_path=None).matrix(pts)
    step = RoadRouter(graph_file, cache_path=None)
    step.matrix(pts[:2])
    step.matrix(pts[:3])
    inc = step.matrix(pts)
    assert inc["minutes"] == full["minutes"]
    flat = lambda m: [x for row in m for x in row]
    assert flat(inc["km"]) == pytest.approx(flat(full["km"]))


def test_cache_is_saved_and_reused(graph_file, tmp_path, monkeypatch):
    cache = str(tmp_path / "cache.json")
    pts = [pt(5, 5), pt(20, 20), pt(40, 10)]
    first = RoadRouter(graph_file, cache).matrix(pts)
    assert json.load(open(cache))["pairs"]
    second = RoadRouter(graph_file, cache)
    monkeypatch.setattr(nx, "single_source_dijkstra_path_length",
                        lambda *a, **k: (_ for _ in ()).throw(AssertionError("should not recompute")))
    assert second.matrix(pts)["minutes"] == first["minutes"]


def test_path_follows_the_map(graph_file):
    r = RoadRouter(graph_file, cache_path=None)
    a, b = pt(5, 5), pt(5, 15)
    line = r.path(a, b)
    assert line[0] == list(a) and line[-1] == list(b) and len(line) >= 10


@pytest.fixture()
def road_client(graph_file, tmp_path):
    app = create_app("sqlite://", ":memory:", "test-secret-long-enough-for-hs256-signing-0123",
                     routing="road", graph_path=graph_file, cache_path=str(tmp_path / "c.json"))
    with app.state.SessionLocal() as s:
        s.add(User(username="boss", password_hash=security.hash_password("boss-password"), role="owner"))
        s.commit()
    return TestClient(app)


def test_api_plan_uses_road_times_and_gives_paths(road_client):
    c = road_client
    tok = c.post("/auth/login", json={"username": "boss", "password": "boss-password"}).json()["access_token"]
    h = {"Authorization": f"Bearer {tok}"}
    ids = []
    for k in range(4):
        lat, lon = pt(20 + 6 * k, 30 + 4 * k)
        cid = c.post("/customers", json={"name": f"C{k}", "lat": lat, "lon": lon}, headers=h).json()["id"]
        ids.append(cid)
        for n in [100, 80, 60, 40, 20]:
            d = (date.today() - timedelta(days=n)).isoformat()
            c.post("/deliveries", json={"customer_id": cid, "delivered_on": d}, headers=h)
    plan = c.get("/plan/today?seconds=0.3", headers=h).json()
    assert plan["routing"] == "road" and plan["warnings"] == []
    stops = [s for r in plan["routes"] for s in r["stops"]]
    assert len(stops) >= 3 and all(r["km"] is not None for r in plan["routes"] if r["stops"])
    seq = [[s["customer_id"] for s in r["stops"]] for r in plan["routes"] if r["stops"]]
    paths = c.post("/paths", json={"routes": seq}, headers=h).json()["paths"]
    assert len(paths) == len(seq) and all(len(p) > len(s) + 2 for p, s in zip(paths, seq))
