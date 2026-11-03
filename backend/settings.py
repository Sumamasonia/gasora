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
