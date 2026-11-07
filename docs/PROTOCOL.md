# Evaluation protocol, version 1.1

Version 1 was written on 2026-11-07. Version 1.1 amends it before any confirmation run (see the change log).
Status: **not yet frozen** (the freeze happens in step 6 of section 12).

This document fixes how the delivery policies will be compared, before the confirmation runs are made. Commit it
before any new evaluation run, so the commit date shows it was written in advance. Later changes go in the change
log at the end, and sections 4 to 9 cannot change after the freeze.

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

Development checks of the new information model were run on seeds 1 and 2 before version 1.1 (`info_check`). They
showed that deliveries made before a customer runs out make recorded gaps too short, that a Gasora using gaps only
delivers almost every day, and that with the memory length `M = 4` most predictions fell back to pooled values.

The primary comparison below (cost at a fixed service level) was chosen **after** seeing the exploratory results.
This is why seeds 21 to 40 are reserved for confirmation. The clean-information results stay in the report as the
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

## 4. Information model

### 4.1 Main arm (`p_call` = 1.0)

Every customer who runs out calls on the day they run out. A swap therefore gives one of two records:

| Situation | Record |
|---|---|
| The customer called before the delivery | **exact**: lifetime = day of the call (to the day) minus the previous delivery day |
| No call before the delivery (a planned delivery) | **at least this long**: lifetime is at least the gap since the previous delivery (right-censored) |

No tick is needed. The history from before the system existed (the first 6 intervals of each customer) counts as
exact records.

**Cold start.** When a customer has fewer than 3 records, every policy uses the same pooled estimate (the average of
the per-customer estimates over customers with at least 2 records, computed with that arm's own records).

### 4.2 Arm D (`p_call` = 0.7, with the tick): see section 10.

## 5. Policies and arms

| Id | Selection | Information used | Routing | Role |
|---|---|---|---|---|
| P1 | Reactive (customers who called) | none | nearest neighbour | reference |
| R0 | Average-days rule, alert `lead` days before the average | the average of **all gaps** between deliveries (the original rule) | OR-Tools | rule arm |
| R1 | Same rule | the average of the **exact** records only | OR-Tools | rule arm |
| G | Gasora: risk-weighted skip penalties, risk cut-off `c` | the **censored fit** | OR-Tools | method |
| A | Gasora selection | the censored fit | nearest neighbour | ablation |
| R2 | Same rule | the censored fit used by G | OR-Tools | supplementary arm |

R2 is reported to show how much of any gain comes from better estimation and how much from Gasora's selection and
routing. It is **not part of the pass rule** in section 6.

**Censored fit.** A normal distribution fitted by maximum likelihood to the customer's most recent `M` records:
exact records contribute the density, "at least this long" records the survival probability. Spread floor 1 day.
Pooled estimate on cold start. Defaults: `M = 4`, floor 1 day, no early-arrival pull. **G and R2 always use the same
fit settings.**

**Grids (fixed).** Rule alert leads: 2, 4, 6, 8, 10, 12 days (R0, R1 and R2). Gasora risk cut-offs: 0.03, 0.05, 0.10,
0.15, 0.20, 0.30. Before the freeze, leads may be extended (14, 16) if a reported level is not covered (section 6).

## 6. Primary and secondary comparisons

Each policy with a grid produces, for each seed, a curve of (run-outs, cost). "Cost at level L" means the cost read
by straight-line interpolation between the two settings that bracket L on that seed's curve. A level is **covered**
for a policy and seed if it has settings with run-outs above and below L. Seeds where a policy does not cover L are
dropped and counted. If more than 20% of seeds are dropped, the level is reported as **not covered** and no
comparison is made.

**Primary service level:** 15 run-outs per 100 customer-months.
**Secondary levels:** 25 and 40, and 10 only if the curves of G and of both rule arms (R0 and R1) cover it.

**Primary comparison:** Gasora (G) against each of the rule arms R0 and R1 separately, at level 15, on two measures:
(a) total kilometres, (b) total vehicle hours.

**Decision rule, fixed now.** For each rule arm separately, on seeds 21 to 40:

- **supported**: the paired 95% bootstrap interval of (G minus the rule arm) is below zero for **both** measures;
- **partly supported**: below zero for one measure only; both are shown;
- **not supported**: below zero for neither.

The overall grade of the primary claim is the weaker of the two grades (against R0 and against R1).

**Secondary comparisons (descriptive, with intervals, no claims beyond the evidence):** G against R2; all
comparisons at levels 25, 40 and 10; G against A (the effect of routing); comparison at equal numbers of deliveries;
results by customer type. P1 is shown for reference.

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

1. censored fit on or off (the gap-only fit as a comparison),
2. memory length `M` in {3, 4, 6, all},
3. spread floor in {1, 2} days,
4. early-arrival pull on or off,
5. candidate threshold for the risk (the cut-off grid in section 5 is the curve, not a tuning choice).

At most **12 combinations** may be tried in total. Each one is written in `docs/variant_log.md` with the seeds used
and the result, whether or not it is kept. The kept variant is chosen by the primary measure on seeds 1 to 10, and
must pass the check on seeds 11 to 20.

## 10. Arm D and other secondary arms (run on seeds 21 to 40 after the freeze, labelled secondary)

**Arm D (more realistic calling).** A customer who runs out calls on the same day with probability `p_call` = 0.7
(a placeholder). A customer who does not call calls later with probability 0.3 per day (a placeholder), and the system
records the call date as the run-out date. The driver ticks at each swap whether the returned cylinder was empty.

| Situation | Record |
|---|---|
| Called before the delivery | exact (as in the main arm, the call date may be later than the true run-out) |
| No call, tick = not empty | at least this long (right-censored) |
| No call, tick = empty | **at most this long**: the lifetime is at most the gap (left-censored) |

In arm D the reactive policy P1 serves customers who have called. The **wrong-tick** arm (the tick is wrong in 10% of
swaps) and the **missing-tick** arm (the tick is missing in 20% of swaps; those records are unusable for R1 and for the
fit, and count as plain gaps for R0) run **only in arm D**. Arm D and the tick can be dropped if time runs short,
without changing the main result.

| Other arm | Change |
|---|---|
| Clean information | policies receive true lifetimes (the earlier setting) |
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

1. Write and commit this protocol. Tag it `protocol-v1.1`.
2. Build the main arm: the information model, the censored fit, the arms R0, R1, R2, G, A and P1, vehicle hours, the
   cost-curve analysis with a coverage table, the seed guard, and the result metadata.
3. Build arm D and the extra measures (Brier score, calibration, oracle bound, skewed durations). Arm D is built after
   the main arm works.
4. Run seeds 1 to 10 and tune within section 9. Check on seeds 11 to 20.
5. Repeat the freeze checks: no uncommitted changes, `docs/variant_log.md` complete.
6. Freeze: record the commit in `docs/freeze.json`, tag `eval-freeze-v1`, repeat one seed twice.
7. Run seeds 21 to 40 once: the main comparison, the secondary arms, the empties study.
8. Report everything, including results that do not favour Gasora. List any departure from this protocol in
   `docs/deviations.md`.

## 13. Approvals and real data

- The main claim needs no change to what drivers record: the call date is already stored with urgent requests.
- The tick (a yes or no field at each swap) is a design change needed only for arm D. It needs sign-off before the
  driver page is changed, and it is dropped if arm D is dropped.
- A small sample of real delivery history (30 to 50 anonymised customers) will be requested. If obtained, it is used
  only to compare forecast errors, never for tuning and never to claim savings.

## 14. Limits this protocol does not remove

Simulated customers, a predictor whose assumptions match the simulator in the base arm, assumed shift and vehicle
numbers, road speeds without traffic, placeholder penalties, calling probabilities and ageing weights, and a
timer-based solver.

## Change log

- v1 (2026-11-07): first version.
- v1.1: main arm uses exact and "at least this long" records with `p_call` = 1.0, no tick needed; arm D (`p_call` = 0.7,
  tick, third record type, realistic P1, wrong and missing ticks) added as a secondary arm that can be dropped;
  primary comparison is now Gasora against R0 and R1 (the weaker grade counts), and R2 is a supplementary arm; level 10
  added as conditional; the development checks on seeds 1 and 2 are recorded in section 2.
