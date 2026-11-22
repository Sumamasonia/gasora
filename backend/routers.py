"""The straight-line router, kept apart so that a server without the road-map packages (osmnx, geopandas) can start.
It behaves exactly like planner.road_router.StraightRouter; tests check that the two agree."""


class StraightRouter:
    mode = "straight"

    def matrix(self, points):
        return None                                   # the planner then uses straight-line times

    def path(self, a, b):
        return [list(a), list(b)]
