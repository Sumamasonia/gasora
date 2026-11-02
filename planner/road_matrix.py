"""Road-time matrix from the saved OpenStreetMap graph (data/faisalabad.graphml).

Travel times use our own speed table (placeholders, city traffic), not OSM maxspeed tags,
because maxspeed is often missing or too high for city roads.
"""
import math
import os

import networkx as nx
import osmnx as ox

GRAPH_FILE = os.path.join("data", "faisalabad.graphml")
CENTER = (31.4181, 73.0776)       # (lat, lon), same point used by download_map.py

# km/h by road type: PLACEHOLDERS, to be checked and tuned later
SPEEDS_KMH = {
    "motorway": 60, "trunk": 40, "primary": 30, "secondary": 25,
    "tertiary": 22, "unclassified": 18, "residential": 15,
    "living_street": 8, "service": 10,
}
DEFAULT_SPEED_KMH = 18


def _speed(highway):
    if isinstance(highway, (list, tuple)):
        highway = highway[0]
    highway = str(highway).replace("_link", "")
    return SPEEDS_KMH.get(highway, DEFAULT_SPEED_KMH)


def load_graph(path=GRAPH_FILE):
    G = ox.load_graphml(path)
    G = ox.truncate.largest_component(G, strongly=True)   # every node can reach every node
    for _, _, d in G.edges(data=True):
        d["length"] = float(d["length"])
        d["travel_time"] = d["length"] / (_speed(d.get("highway")) * 1000 / 3600)  # seconds
    return G


def nearest_node(G, lat, lon):
    return int(ox.distance.nearest_nodes(G, X=lon, Y=lat))


def sample_nodes(G, n, rng):
    """n different random nodes of the map, used as customer places."""
    nodes = sorted(G.nodes)
    pick = rng.choice(len(nodes), size=n, replace=False)
    return [nodes[i] for i in pick]


def node_xy_km(G, node, origin_node):
    """Position of a node in km, relative to the origin node (for the straight-line fallback)."""
    lat0, lon0 = G.nodes[origin_node]["y"], G.nodes[origin_node]["x"]
    lat, lon = G.nodes[node]["y"], G.nodes[node]["x"]
    x = (lon - lon0) * 111.32 * math.cos(math.radians(lat0))
    y = (lat - lat0) * 110.57
    return x, y


def road_matrices(G, node_list):
    """node_list[0] is the depot. Returns (minutes, km) as lists of lists."""
    n = len(node_list)
    minutes = [[0] * n for _ in range(n)]
    km = [[0.0] * n for _ in range(n)]
    for i, src in enumerate(node_list):
        t = nx.single_source_dijkstra_path_length(G, src, weight="travel_time")
        d = nx.single_source_dijkstra_path_length(G, src, weight="length")
        for j, dst in enumerate(node_list):
            minutes[i][j] = int(round(t[dst] / 60))
            km[i][j] = d[dst] / 1000
    return minutes, km
