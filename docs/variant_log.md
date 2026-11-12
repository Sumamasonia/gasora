# Variant log

Rules (protocol section 9): at most 12 combinations may be tried on seeds 1 to 10 and checked on seeds 11 to 20.
Every combination is written here with the seeds used and the result, whether or not it is kept.
Only seeds 1 to 10 (development) have been used so far. Seeds 11 to 20 and 21 to 40 have not been run in the
new information model.

Used so far: **3 of 12** (variant 4 is planned, not yet run).

Not counted: the development checks on seeds 1 and 2 (`info_check`, gap-only information, `M = 4`) made before this
log existed. They are described in protocol section 2.

Common settings for all entries: 200 customers, road distances, 30 warm-up and 60 counted days, 2 vehicles,
information model with `p_call` = 1.0 (protocol section 4.1), censored fit on, command
`python -m evaluation.study --stage dev`. Results are means over seeds, or paired differences "G minus other arm"
with a 95% bootstrap interval (negative means Gasora is cheaper).

## Summary table

`evaluation/freeze.py` counts the numbered rows of this table (at most 12), so every variant gets one row here.
Variant 4 gets its row when it has been run.

| No. | Date | Variant (censored fit, memory M, spread floor, early pull) | Seeds | Primary result (G minus R0 and R1, km and vehicle hours at 15 run-outs) | Kept |
|---|---|---|---|---|---|
| 1 | up to 2026-11-11 | fit on, M = 4, floor 1, no pull, grid v1.1 | 1 to 10 | not evaluable: level 15 reached on 0 of 10 seeds | no |
| 2 | up to 2026-11-11 | fit on, M = 6, floor 1, no pull, grid v1.1 | 1 to 10 | not evaluable: level 15 reached on 0 of 10 seeds | no |
| 3 | up to 2026-11-11 | fit on, M = all, floor 1, no pull, grid v1.1 | 1 to 10 | not evaluable: level 15 reached on 2 of 10 seeds | carried forward |

## Variant 1: memory length M = 4

- Settings: `fit_m` = 4, `fit_floor` = 1.0, `early_pull` = off. Seeds 1 to 10. Cut-off grid of protocol v1.1.
- Reaching level 15 / 25 / 40 (seeds out of 10 where the curve of G reaches the level): 0 / 0 / 10.
- Lowest cut-off (0.03): 30.4 run-outs per 100 customer-months.
- Primary comparison: **not evaluable** (level 15 not covered). Level 25: not covered.
- Level 40: kilometres G minus R0 -302.9 [-627.2, -3.4], hours -104.3 [-212.4, 0.3]; kilometres G minus R1
  +108.3 [86.0, 130.1], hours +16.2 [13.4, 18.9].
- Prediction quality (G at cut-off 0.1): forecast error 4.06 days; Brier 0.0393 against reference 0.0411 (skill
  0.042); refill window coverage 52.7%.
- Decision: **not kept**. Most predictions fall back to pooled values because none of the last 4 records is exact.
  Worse than `M = all` on every prediction measure.

## Variant 2: memory length M = 6

- Settings: `fit_m` = 6, `fit_floor` = 1.0, `early_pull` = off. Seeds 1 to 10. Cut-off grid of protocol v1.1.
- Reaching level 15 / 25 / 40: 0 / 5 / 10.
- Lowest cut-off (0.03): 24.9 run-outs per 100 customer-months.
- Primary comparison: **not evaluable**. Level 25: 5 of 10 seeds, below the 80% needed, so not covered.
- Level 40: kilometres G minus R0 -405.0 [-765.9, -72.1], hours -110.3 [-214.2, -8.9]; kilometres G minus R1
  +47.5 [16.9, 75.9], hours +8.1 [5.3, 10.8].
- Prediction quality (G at cut-off 0.1): forecast error 3.65 days; Brier 0.0360 against 0.0383 (skill 0.059);
  refill window coverage 58.5%.
- Decision: **not kept**. Better than `M = 4`, worse than `M = all` on every prediction measure.

## Variant 3: memory length M = all

- Settings: `fit_m` = all records (`--fit-m 0`), `fit_floor` = 1.0, `early_pull` = off. Seeds 1 to 10. Cut-off grid
  of protocol v1.1.
- Reaching level 15 / 25 / 40: 2 / 10 / 10.
- Lowest cut-off (0.03): 16.6 run-outs per 100 customer-months.
- Primary comparison: **not evaluable** (level 15 covered on 2 of 10 seeds, below the 80% needed).
- Level 25: kilometres G minus R0 -1064.7 [-1273.2, -827.6], hours -288.3 [-373.8, -196.2]; kilometres G minus R1
  -254.1 [-288.5, -215.7], hours -18.9 [-21.2, -16.4].
- Level 40: kilometres G minus R0 -312.0 [-596.4, -92.8], hours -86.5 [-191.9, -13.3]; kilometres G minus R1
  -10.4 [-33.7, 11.2], hours -2.3 [-3.5, -0.8].
- Prediction quality (G at cut-off 0.1): forecast error 3.04 days; Brier 0.0352 against 0.0381 (skill 0.078);
  refill window coverage 72.4%. For comparison, R1 (average of exact records) has a forecast error of 2.84 days,
  so the fit of G is **not** a better forecaster than that simple average in this simulator.
- Decision: **carried forward as variant 4**, chosen on secondary measures because the primary measure could not
  be computed (protocol section 9.1). It is not "kept" yet: it must pass the check on seeds 11 to 20.

Note on code version: variants 1 to 3 were run with the code before the backend and fingerprint changes
(`gasora_must_backend.zip`). Development rows are never combined with rows from other code (protocol section 11).

## Variant 4: memory length M = all, extended cut-off grid (planned)

- Settings: `fit_m` = all, `fit_floor` = 1.0, `early_pull` = off. Cut-off grid of protocol v1.2 (0.01, 0.02, 0.03,
  0.05, 0.10, 0.15, 0.20, 0.30) for G and A. Seeds 1 to 10.
- Status: **not yet run**.
- Result: to be filled in after the run (coverage at levels 15 / 25 / 40 / 10, primary comparison with intervals,
  number of seeds where a curve crosses a level more than once, prediction quality).
- Decision: to be filled in. If level 15 is still not covered on more than 2 of 10 seeds, see the condition in
  protocol section 5 (version 1.3).

## Entries after variant 4

(none yet)
