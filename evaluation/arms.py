"""Policy arms for the comparison with limited information (docs/PROTOCOL.md section 5).

R0, R1 and R2 are the average-days rule with different information; the information itself is chosen by
the InfoModel arm of the simulation:
  R0  info arm "gaps":      average of all gaps between deliveries (the original rule)
  R1  info arm "complete":  average of the complete records only
  R2  info arm "censored":  the censored fit used by Gasora (use_fit=True)
Gasora (G) is policies.p3_gasora with info arm "censored".
"""
from scipy.stats import norm

from evaluation import policies
from evaluation.policies import is_called
from predictor.risk import _fit, pooled_values


def make_rule(lead, use_fit=False):
    """Alert a customer when days since delivery >= expected lifetime - lead days. Customers who ran out
    and called are always included. All candidates get the same skip penalty."""
    def policy(static, state, day):
        called = {c["id"] for c in state if is_called(c)}
        pm, ps = pooled_values(state) if use_fit else (None, None)
        candidates = []
        for c in state:
            avg = _fit(c, pm, ps)[0] if use_fit else sum(c["intervals"]) / len(c["intervals"])
            if is_called(c) or c["days_since"] >= avg - lead:
                candidates.append(c)
        return policies._ortools_routes(static, candidates, {c["id"]: 1.0 for c in candidates}, called)
    return policy


def oracle_gasora(static, state, day):
    """Gasora given each customer's TRUE lifetime distribution (normal, as the simulator draws it): a ceiling
    for any predictor of this kind in this simulator. Not a method we could run on real data."""
    risk = {}
    for c, truth in zip(state, static.customers):
        mu, sd = (truth["base"], 1.5) if truth["pattern"] == "steady" else (truth["base"] * 0.7, 5.0)
        t = c["days_since"]
        survive = 1 - norm.cdf(t, mu, sd)
        risk[c["id"]] = 1.0 if survive < 1e-6 else float(
            min(1.0, max(0.0, (norm.cdf(t + 2, mu, sd) - norm.cdf(t, mu, sd)) / survive)))
    called = {c["id"] for c in state if is_called(c)}
    candidates = [c for c in state if is_called(c) or risk[c["id"]] >= policies.CANDIDATE_RISK]
    return policies._ortools_routes(static, candidates, risk, called, late_cost=policies.POLICY_LATE_COST,
                                    skip_penalty=policies.SKIP_PENALTY)
