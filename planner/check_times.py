"""Compare our road times with a map service.

Usage:  python -m planner.check_times LAT1 LON1 LAT2 LON2
Example: python -m planner.check_times 31.4181 73.0776 31.4500 73.1200

Prints our road time and distance between two places, in both directions. Look up the same trip in a
map application (at a normal time of day) and compare. If our times are far off, change SPEEDS_KMH in
planner/road_matrix.py.
"""
import sys

from planner.road_router import RoadRouter


def main(argv):
    if len(argv) != 4:
        print(__doc__)
        return
    a, b = (float(argv[0]), float(argv[1])), (float(argv[2]), float(argv[3]))
    router = RoadRouter(cache_path=None)              # nothing is saved
    m = router.matrix([a, b])
    print(f"A -> B: {m['minutes'][0][1]} min, {m['km'][0][1]:.1f} km (by road)")
    print(f"B -> A: {m['minutes'][1][0]} min, {m['km'][1][0]:.1f} km (by road)")
    if m["far"]:
        print("Warning: a place is more than 1 km from the downloaded road map.")


if __name__ == "__main__":
    main(sys.argv[1:])
