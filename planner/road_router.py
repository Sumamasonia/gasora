"""Road routing for the API: travel times, distances and road paths between real places.

Places (latitude, longitude) are snapped to the nearest node of the saved OpenStreetMap graph.
Times and distances between nodes are computed with Dijkstra and kept in a cache file, so a
place is computed only once. Adding a new place costs two Dijkstra runs per measure
(one outward, one inward), not a full rebuild.

StraightRouter has the same interface for the case that no road graph is available.
"""
import hashlib
import json
import os
import threading

import networkx as nx
import osmnx as ox

from planner import road_matrix as rm

FAR_M = 1000          # a place more than this far from the map is reported as "far"


class StraightRouter:
    mode = "straight"

    def matrix(self, points):
        return None                                   # the planner then uses straight-line times

    def path(self, a, b):
        return [list(a), list(b)]


class RoadRouter:
    mode = "road"

    def __init__(self, graph_path=rm.GRAPH_FILE, cache_path=os.path.join("data", "road_cache.json")):
        self.graph_path = graph_path
        self.cache_path = cache_path
        self._lock = threading.RLock()
        self._rev = None
        self._snap_cache = {}          # (lat, lon) -> (node, metres from the map)
        self._t, self._d = {}, {}      # (a, b) -> seconds, metres
        self._known = set()
        self._legs = {}
        self._load_cache()

    # ----- graph and cache -----
    def graph(self):
        return rm.load_graph(self.graph_path)

    def _signature(self):
        st = os.stat(self.graph_path)
        text = f"{st.st_size}-{int(st.st_mtime)}-{sorted(rm.SPEEDS_KMH.items())}-{rm.DEFAULT_SPEED_KMH}"
        return hashlib.md5(text.encode()).hexdigest()[:12]

    def _load_cache(self):
        if not self.cache_path or not os.path.exists(self.cache_path) or not os.path.exists(self.graph_path):
            return
        try:
            with open(self.cache_path) as f:
                data = json.load(f)
            if data.get("sig") != self._signature():
                return                                 # the map or the speed table changed
            for k, (t, d) in data["pairs"].items():
                a, b = k.split("|")
                self._t[(int(a), int(b))], self._d[(int(a), int(b))] = t, d
            self._known = set(data["nodes"])
        except Exception:
            self._t, self._d, self._known = {}, {}, set()

    def _save_cache(self):
        if not self.cache_path:
            return
        os.makedirs(os.path.dirname(self.cache_path) or ".", exist_ok=True)
        data = {"sig": self._signature(), "nodes": sorted(self._known),
                "pairs": {f"{a}|{b}": [self._t[(a, b)], self._d[(a, b)]] for (a, b) in self._t}}
        tmp = self.cache_path + ".tmp"
        with open(tmp, "w") as f:
            json.dump(data, f)
        os.replace(tmp, self.cache_path)

    # ----- snapping -----
    def _snap(self, points):
        todo = [p for p in dict.fromkeys(points) if p not in self._snap_cache]
        if todo:
            nodes, dist = ox.distance.nearest_nodes(
                self.graph(), X=[p[1] for p in todo], Y=[p[0] for p in todo], return_dist=True)
            for p, n, d in zip(todo, nodes, dist):
                self._snap_cache[p] = (int(n), float(d))
        return [self._snap_cache[p] for p in points]

    # ----- times and distances -----
    def _ensure(self, nodes):
        new = [n for n in dict.fromkeys(nodes) if n not in self._known]
        if not new:
            return
        G = self.graph()
        targets = self._known | set(new)
        for s in new:                                              # from s to everything known
            t = nx.single_source_dijkstra_path_length(G, s, weight="travel_time")
            d = nx.single_source_dijkstra_path_length(G, s, weight="length")
            for b in targets:
                self._t[(s, b)], self._d[(s, b)] = t[b], d[b]
        if self._known:                                            # from everything known to s
            if self._rev is None:
                self._rev = G.reverse(copy=False)
            for s in new:
                t = nx.single_source_dijkstra_path_length(self._rev, s, weight="travel_time")
                d = nx.single_source_dijkstra_path_length(self._rev, s, weight="length")
                for a in self._known:
                    self._t[(a, s)], self._d[(a, s)] = t[a], d[a]
        self._known |= set(new)
        self._save_cache()

    def matrix(self, points):
        """points[0] is the depot. Returns minutes (int), km, and the indices of places far from the map."""
        with self._lock:
            snapped = self._snap(points)
            nodes = [n for n, _ in snapped]
            self._ensure(nodes)
            n = len(points)
            minutes = [[int(round(self._t[(nodes[i], nodes[j])] / 60)) for j in range(n)] for i in range(n)]
            km = [[self._d[(nodes[i], nodes[j])] / 1000 for j in range(n)] for i in range(n)]
            far = [i for i, (_, dist) in enumerate(snapped) if dist > FAR_M]
        return {"minutes": minutes, "km": km, "far": far}

    # ----- road paths for the map -----
    def path(self, a, b):
        """Road path from place a to place b as a list of [lat, lon]."""
        with self._lock:
            (na, _), (nb, _) = self._snap([tuple(a), tuple(b)])
            if (na, nb) not in self._legs:
                G = self.graph()
                nodes = nx.shortest_path(G, na, nb, weight="travel_time") if na != nb else [na]
                self._legs[(na, nb)] = [[G.nodes[n]["y"], G.nodes[n]["x"]] for n in nodes]
            return [list(a)] + self._legs[(na, nb)] + [list(b)]
