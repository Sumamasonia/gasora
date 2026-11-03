"""Settings. Values can be changed with environment variables (PowerShell: $env:NAME = "value")."""
import os

DB_URL = os.environ.get("GASORA_DB_URL", "sqlite:///data/gasora.db")
EVENTS_PATH = os.environ.get("GASORA_EVENTS_PATH", "data/gasora_events.db")
DEFAULT_SECRET = "dev-secret-change-me-before-real-use-0123456789"
SECRET = os.environ.get("GASORA_SECRET", DEFAULT_SECRET)   # signs login tokens: set your own
TOKEN_MINUTES = 8 * 60

# Depot position (placeholder: central Faisalabad; the agency's real address comes later)
DEPOT_LAT = 31.4181
DEPOT_LON = 73.0776

# Pull urgent and Critical customers towards the start of their route (extra cost per minute of
# arrival time). PLACEHOLDERS: a higher number means earlier arrival but longer routes.
LATE_COST_URGENT = 5
LATE_COST_CRITICAL = 1

# Routing: "auto" uses road times when the saved road graph exists, otherwise straight-line.
# Set GASORA_ROUTING to "road" or "straight" to force one.
ROUTING = os.environ.get("GASORA_ROUTING", "auto")
ROAD_GRAPH = os.path.join("data", "faisalabad.graphml")
ROAD_CACHE = os.path.join("data", "road_cache.json")
