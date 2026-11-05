"""Download the Faisalabad road network once and save it to data/faisalabad.graphml.

The public Overpass servers are often busy, so this script retries
with waiting time and tries more than one server.

Run from the project folder:  python -m planner.download_map
"""
import os
import time

import osmnx as ox
ox.settings.cache_folder = os.path.join("data", "osm_cache")

CENTER = (31.4181, 73.0776)   # near central Faisalabad (check on a map)
RADIUS_M = 6000               # start small; a bigger area makes the server busier
OUT_FILE = os.path.join("data", "faisalabad.graphml")

SERVERS = [
    "https://overpass-api.de/api",
    "https://overpass.kumi.systems/api",   # public mirror (not verified from my side)
]
TRIES_PER_SERVER = 4


def main():
    os.makedirs("data", exist_ok=True)
    for server in SERVERS:
        ox.settings.overpass_url = server
        wait = 10
        for attempt in range(1, TRIES_PER_SERVER + 1):
            try:
                print(f"{server}  try {attempt}...")
                G = ox.graph_from_point(CENTER, dist=RADIUS_M, network_type="drive")
                ox.save_graphml(G, OUT_FILE)
                print(f"Saved {OUT_FILE}: {len(G.nodes)} nodes, {len(G.edges)} edges")
                return
            except Exception as e:
                print("  failed:", str(e).splitlines()[0][:120])
                time.sleep(wait)
                wait *= 2          # wait longer each time
    print("All tries failed. Try again later (evening or early morning often works).")


if __name__ == "__main__":
    main()