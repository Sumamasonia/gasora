# Evaluation protocol, version 1

Written: 2026-11-07. Status: **not yet frozen** (the freeze happens in step 5 of section 12).

This document fixes how the delivery policies will be compared, before the confirmation runs are made. Commit it
before any new evaluation run, so the commit date shows it was written in advance. Later changes go in the change log
at the end, and sections 4 to 9 cannot change after the freeze.

## 1. Purpose and limits

**Question.** For a simulated LPG agency, how do the policies compare on cost (kilometres and vehicle hours) at the
same service level (run-outs per 100 customer-months)?

**What this evaluation can show:** how the methods behave in a simulator, when their data is limited to what a real
delivery record could contain.

**What it cannot show:** real-world savings. There is no real customer data, and the simulator's customer behaviour
is an assumption. Nothing in the report may say "saves"; it says "in simulation, we measure".

## 2. What was seen before this protocol

Exploratory runs on seeds 1 to 20 were made before this protocol, with a simulator that gave every policy each
cylinder's true lifetime ("clean information"). They showed:

- OR-Tools uses about 13% fewer kilometres than nearest neighbour for the same customers.
- At equal numbers of deliveries, Gasora's run-out advantage over a tuned average-days rule is small, and Gasora has
  about 12% fewer kilometres at the highest workload.
- Gasora does not outperform the rule on irregular customers.

The primary comparison below (cost at a fixed service level) was chosen **after** seeing these results. This is why
seeds 21 to 40 are reserved for confirmation. The clean-information results stay in the report as the
"clean information" arm and are labelled exploratory.

## 3. Simulation setting (fixed)

| Item | Value |
|---|---|
| Customers | 200, placed on nodes of the Faisalabad road network, 60% steady and 40% irregular |
| Vehicles | 2, capacity 40 cylinders, shift 480 minutes, service 10 minutes per stop |
| Distances | road travel times with the speed table in `planner/road_matrix.py` |
| Days | 30 warm-up days (not counted) and 60 counted days |
| Solver | OR-Tools, 0.5 seconds per daily plan, skip penalty 300 |
| Early delivery | more than 5 days of gas left |
| Seeds | see section 8 |

All values come from `config.py`, `backend/settings.py` and `evaluation/`. They are assumptions. They do not change
after the freeze. The values and the code version are stored with every result.

## 4. Information model (new)

Policies see only what a delivery record could contain:

- each delivery date,
- a **tick** by the driver at each swap: was the returned cylinder empty (yes or no),
- the **date the customer called** when they ran out (known to the day).

They do not see the true cylinder lifetime. Each delivery therefore gives one observation:

| Situation | Observation |
|---|---|
| Customer ran out and called; tick = yes | complete: lifetime = call date minus previous delivery date |
| Delivered before the cylinder was empty; tick = no | censored: lifetime is at least the gap since the previous delivery |
| Tick = yes but no call recorded | the gap is an upper bound; arms treat it as in section 5 |

**Cold start.** When a customer has fewer than 3 usable observations, every policy uses the same pooled estimate
(the average of the per-customer estimates over customers with at least 2 usable observations, computed with that
arm's own observations).

## 5. Policies and arms

| Id | Selection | Information used | Routing |
|---|---|---|---|
| P1 | Reactive (customers who ran out) | none | nearest neighbour |
| R0 | Average-days rule, alert `lead` days before the average | the average of **all gaps** between deliveries (the original rule) | OR-Tools |
| R1 | Same rule | average of the **complete** observations only | OR-Tools |
| R2 | Same rule | the **censored fit** used by Gasora (fitted mean, rule alert) | OR-Tools |
| G | Gasora: risk-weighted skip penalties, risk cut-off `c` | the **censored fit** | OR-Tools |
| A | Ablation: Gasora selection | the censored fit | nearest neighbour |

R2 isolates the effect of Gasora's selection and routing from the effect of better estimation: if Gasora wins
against R2, the gain is not only due to the tick.

**Censored fit (Gasora v2).** A normal distribution fitted by maximum likelihood to the customer's most recent `M`
observations, with complete observations contributing the density and censored ones the survival probability.
Spread floor 1 day. Pooled estimate on cold start. Defaults: `M = 4`, floor 1 day, no early-arrival pull.

**Grids (fixed).** Rule alert leads: 2, 4, 6, 8, 10, 12 days (R0, R1 and R2). Gasora risk cut-offs: 0.03, 0.05, 0.10,
0.15, 0.20, 0.30. Before the freeze, leads may be extended (14, 16) if a reported level is not covered (section 6).

## 6. Primary and secondary comparisons

Each policy with a grid produces, for each seed, a curve of (run-outs, cost). "Cost at level L" means the cost read
by straight-line interpolation between the two settings that bracket L on that seed's curve. A level is **covered**
for a policy and seed if it has settings with run-outs above and below L. Seeds where a policy does not cover L are
dropped and counted. If more than 20% of seeds are dropped, the level is reported as **not covered** and no
comparison is made.

**Primary service level:** 15 run-outs per 100 customer-months.
**Secondary levels:** 25 and 40.

**Primary comparison:** Gasora (G) against R2 at level 15, on two measures:
(a) total kilometres, (b) total vehicle hours.

**Decision rule, fixed now.** The primary result is "supported" if the paired 95% bootstrap interval of
(G minus R2) excludes zero in Gasora's favour for **both** measures on seeds 21 to 40. If only one measure passes it
is "partly supported" and both are shown. If neither passes it is "not supported", and the report says so.

**Secondary comparisons (descriptive, with intervals, no claims beyond the evidence):** G against R0 and against R1
at level 15; all comparisons at levels 25 and 40; G against A (the effect of routing); comparison at equal numbers
of deliveries; results by customer type.

## 7. Measures

1. Run-outs per 100 customer-months.
2. Total kilometres over the counted days.
3. **Vehicle hours** = (driving minutes + service minutes) divided by 60, summed over vehicles and counted days.
4. Deliveries, early deliveries, vehicles used per day, customer-days without gas.
5. Forecast error: mean absolute error (days) of the predicted cylinder lifetime at the start of a cycle.
6. Calibration of the 48-hour risk: Brier score, with a reference (the constant base-rate forecast), and a
   calibration table with 10 bins. Refill window coverage (10% to 90% window, nominal 80%).
7. Results by customer type (steady and irregular): run-outs, deliveries, early deliveries. Kilometres are not split,
   because a route serves both types.

Intervals: paired differences per seed, 95% percentile bootstrap, 2,000 resamples, as in `evaluation/harness.py`.

## 8. Seeds

| Seeds | Use |
|---|---|
| 1 to 10 | development: tuning is allowed here only |
| 11 to 20 | check: a candidate whose primary difference has the opposite sign here is rejected |
| 21 to 40 | **confirmation, run once** after the freeze |
| 41 to 50 | spare: used only to repeat a confirmation run with a documented technical failure |

Before the freeze, the team confirms that nobody has run seeds 21 to 40 on any machine. After the freeze, results on
seeds 21 to 40 are produced once. A repeat is allowed only after a documented technical failure, and both runs are
reported.

## 9. Allowed variants (fixed list and cap)

Only these changes may be tried during development, on seeds 1 to 10 and checked on 11 to 20:

1. censored fit on or off (the original gap-only fit as a comparison),
2. memory length `M` in {3, 4, 6, all},
3. spread floor in {1, 2} days,
4. early-arrival pull on or off,
5. candidate threshold for the risk (the cut-off grid in section 5 is the curve, not a tuning choice).

At most **12 combinations** may be tried in total. Each one is written in `docs/variant_log.md` with the seeds used
and the result, whether or not it is kept. The kept variant is chosen by the primary measure on seeds 1 to 10, and
must pass the check on seeds 11 to 20.

## 10. Robustness and extra arms (run on seeds 21 to 40 after the freeze, labelled secondary)

| Arm | Change |
|---|---|
| Clean information | policies receive true lifetimes (the earlier setting) |
| Wrong ticks | the tick is wrong in 10% of deliveries |
| Missing ticks | the tick is missing in 20% of deliveries; those observations are unusable for R1, R2, G and counted as plain gaps for R0 |
| Skewed durations | lifetimes follow a lognormal distribution with the same mean and spread as the base setting |
| Oracle bound | Gasora given each customer's true mean and spread, a ceiling for any predictor in this simulator |
| Empties | the empties study (customers return each old cylinder with probability 0.8, ageing tiers 15, 30, 60 and 90 days) |

## 11. Reproducibility

- Every result row stores the git commit hash, the settings and the machine description (processor, Python and package
  versions). Rows made with different code are never combined.
- The solver stops on a timer, so plans can differ slightly between runs and machines. One seed is run twice at the
  freeze, and the difference is reported.
- A freeze file (`docs/freeze.json`) stores the commit hash. The harness refuses to run seeds above 20 unless the
  current commit matches it. This makes early runs visible; it cannot make them impossible.

## 12. Order of work

1. Write and commit this protocol (this document). Tag it `protocol-v1`.
2. Build: the information model, the tick and call date, the censored fit, arms R0 to R2, vehicle hours, the
   cost-curve analysis with a coverage table, the seed guard, and the result metadata.
3. Add the robustness arms and the extra measures (Brier score, calibration, oracle bound).
4. Run seeds 1 to 10 and tune within section 9. Check on seeds 11 to 20.
5. Freeze: record the commit in `docs/freeze.json`, tag `eval-freeze-v1`, repeat one seed twice.
6. Run seeds 21 to 40 once: the main comparison, the robustness arms, the empties study.
7. Report everything, including results that do not favour Gasora. List any departure from this protocol in
   `docs/deviations.md`.

## 13. Approvals and real data

- The tick (a yes or no field at each swap) and the call date are a design change to the delivery record. They need
  sign-off before the driver page is changed.
- A small sample of real delivery history (30 to 50 anonymised customers) will be requested. If obtained, it is used
  only to compare forecast errors, never for tuning and never to claim savings.

## 14. Limits this protocol does not remove

Simulated customers, a predictor whose assumptions match the simulator in the base arm, assumed shift and vehicle
numbers, road speeds without traffic, placeholder penalties and ageing weights, and a timer-based solver.

## Change log

- v1 (2026-11-07): first version.
