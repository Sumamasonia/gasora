"""Shared settings for Gasora. All values are placeholders and will be tuned later."""

SEED = 1
N_CUSTOMERS = 50

# Vehicles and shift
N_VEHICLES = 2
CAPACITY = 40            # cylinders per vehicle
SHIFT_MIN = 480          # minutes per vehicle (8 hours; assumption, to be confirmed)
SERVICE_MIN = 10         # minutes at each customer
SPEED_KMH = 30           # straight-line speed (OSMnx road times come later)

# Planner penalties
EMERGENCY_COST = 300     # skip penalty for a customer with risk 1.0
URGENT_PENALTY = 100000  # very high penalty for urgent requests
SOLVER_SECONDS = 10

# Risk bands
CRITICAL_AT = 0.7
HIGH_AT = 0.3
