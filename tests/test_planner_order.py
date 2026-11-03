from planner.routing import plan


def line_customers():
    # customers on a line to the east of the depot; the farthest one (id 7) is urgent
    return [{"id": i, "x": 1.5 * i, "y": 0.0, "demand": 1} for i in range(1, 8)]


def first_stop_ids(routes, customers):
    return {customers[r[0] - 1]["id"] for r, _ in routes if r}


def test_urgent_customer_is_pulled_to_the_start():
    cs = line_customers()
    risks = [0.5] * 7
    routes, _ = plan(cs, risks, urgent_ids={7}, seconds=0.5, urgent_late_cost=5)
    assert 7 in first_stop_ids(routes, cs)


def test_default_has_no_pull_and_still_visits_urgent():
    cs = line_customers()
    routes, visited = plan(cs, [0.5] * 7, urgent_ids={7}, seconds=0.5)
    assert 7 in visited
