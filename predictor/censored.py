"""Normal fit to cylinder lifetimes when some records are only bounds.

Record kinds (the second item of each record):
  0 (or False)  exact: the customer called when they ran out
  1 (or True)   at least this long: a planned delivery before the cylinder was empty (right-censored)
  2             at most this long: the driver found it empty but no call had been made (left-censored)

Averaging bounds as if they were exact lifetimes gives biased estimates. The fit uses the density for exact
records, the survival probability for "at least" records and the cumulative probability for "at most" records.
"""
import numpy as np
from scipy.optimize import minimize
from scipy.stats import norm


def censored_normal_fit(obs, sd_floor=1.0, sd_cap=15.0):
    """obs: list of (value, kind). Returns (mean, sd), or None when there is no exact record
    (nothing to anchor the fit)."""
    x = np.array([v for v, k in obs if k == 0], dtype=float)
    y = np.array([v for v, k in obs if k == 1], dtype=float)
    z = np.array([v for v, k in obs if k == 2], dtype=float)
    if len(x) == 0:
        return None
    if len(y) == 0 and len(z) == 0:
        sd = float(x.std(ddof=1)) if len(x) > 1 else sd_floor
        return float(x.mean()), max(sd_floor, sd)

    def nll(p):
        mu, sd = p
        return -(norm.logpdf(x, mu, sd).sum() + norm.logsf(y, mu, sd).sum() + norm.logcdf(z, mu, sd).sum())

    everything = np.concatenate([x, y, z])
    start = [float(np.concatenate([x, y]).mean()), max(sd_floor, float(x.std(ddof=1)) if len(x) > 1 else 2.0)]
    bounds = [(0.3 * float(everything.min()), 2.5 * float(everything.max())), (sd_floor, sd_cap)]
    res = minimize(nll, start, bounds=bounds, method="L-BFGS-B")
    if not res.success or not np.all(np.isfinite(res.x)):
        sd = float(x.std(ddof=1)) if len(x) > 1 else sd_floor
        return float(x.mean()), max(sd_floor, sd)                 # fall back to the exact records
    return float(res.x[0]), float(res.x[1])
