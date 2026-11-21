# Variant log

Rules (protocol section 9): at most 12 combinations may be tried on seeds 1 to 10 and checked on seeds 11 to 20.
Every combination is written here with the seeds used and the result, whether or not it is kept.
Only seeds 1 to 10 (development) have been used so far. Seeds 11 to 20 and 21 to 40 have not been run in the
new information model.

Used so far: **7 of 12** (variants 5 to 7 are pilot scales of the skip penalty, protocol section 9.2).

Not counted: the development checks on seeds 1 and 2 (`info_check`, gap-only information, `M = 4`) made before this
log existed. They are described in protocol section 2.

Common settings for all entries: 200 customers, road distances, 30 warm-up and 60 counted days, 2 vehicles,
information model with `p_call` = 1.0 (protocol section 4.1), censored fit on, command
`python -m evaluation.study --stage dev`. Results are means over seeds, or paired differences "G minus other arm"
with a 95% bootstrap interval (negative means Gasora is cheaper).

## Summary table

`evaluation/freeze.py` counts the numbered rows of this table (at most 12), so every variant gets one row here, once it has been run.

| No. | Date | Variant (censored fit, memory M, spread floor, early pull) | Seeds | Primary result (G minus R0 and R1, km and vehicle hours at 15 run-outs) | Kept |
|---|---|---|---|---|---|
| 1 | up to 2026-11-11 | fit on, M = 4, floor 1, no pull, grid v1.1 | 1 to 10 | not evaluable: level 15 reached on 0 of 10 seeds | no |
| 2 | up to 2026-11-11 | fit on, M = 6, floor 1, no pull, grid v1.1 | 1 to 10 | not evaluable: level 15 reached on 0 of 10 seeds | no |
| 3 | up to 2026-11-11 | fit on, M = all, floor 1, no pull, grid v1.1 | 1 to 10 | not evaluable: level 15 reached on 2 of 10 seeds | carried forward |
| 4 | 2026-11-12 to 14 | fit on, M = all, floor 1, no pull, grid v1.2 (adds 0.01 and 0.02) | 1 to 10 | not evaluable: level 15 reached on 2 of 10 seeds | open (see entry) |
| 5 | 2026-11-15 | as variant 4, Gasora skip penalty scale S = 600 (pilot on seeds 1 to 3, full run on 1 to 10) | 1 to 10 | level 15 reached on 10 of 10 seeds; G minus R0 -1204.8 km, -197.4 h; G minus R1 -287.1 km, -40.2 h; graded supported on dev seeds; check seeds 11 to 20: level 15 on 10 of 10, G minus R0 -1239.8 km, -219.1 h; G minus R1 -348.1 km, -45.1 h, supported | **kept** (passed the check; freeze next) |
| 6 | pilot, 2026-11 | as variant 4, S = 1200 | 1 to 3 (G only) | pilot: level 15 reached on 3 of 3 seeds; G minus R0 -1109 km, -191 h; G minus R1 -243 km, -44 h | no (not needed; the rule takes the smallest S) |
| 7 | pilot, 2026-11 | as variant 4, S = 2400 | 1 to 3 (G only) | pilot: level 15 reached on 3 of 3 seeds; G minus R0 -1114 km, -192 h; G minus R1 -247 km, -44 h | no (not needed) |

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

## Variant 4: memory length M = all, extended cut-off grid

- Settings: `fit_m` = all, `fit_floor` = 1.0, `early_pull` = off. Cut-off grid of protocol v1.2 (0.01, 0.02, 0.03,
  0.05, 0.10, 0.15, 0.20, 0.30) for G and A. Seeds 1 to 10. The run was interrupted and resumed once; the
  checkpoint fingerprint was unchanged, so all 10 seeds come from the same code.
- Reaching level 15 / 25 / 40 / 10 (seeds out of 10): R0 10 / 10 / 10 / 8, R1 10 / 10 / 10 / 10, R2 10 / 10 / 10 / 10,
  **G 2 / 10 / 10 / 0**, A 10 / 10 / 10 / 10.
- Primary comparison at level 15: **not evaluable** (G covers it on 2 of 10 seeds, below the 80% needed).
- The curve of G is flat at its lower end: mean run-outs 16.8 (0.01), 16.7 (0.02), 16.8 (0.03), 18.8 (0.05);
  kilometres 2602, 2608, 2602, 2818. Lowering the cut-off below 0.03 changes nothing, so the extension of the
  grid in protocol v1.2 did not make level 15 reachable and a further extension (v1.3 in protocol section 5)
  would not either. The ablation A (same selection, nearest neighbour) reaches 3.6 run-outs at 0.01.
- Likely cause (read from `planner/routing.py` and `evaluation/arms.py`, not yet tested): the planner skips a
  customer when the skip penalty, `int(1 + risk x 300)`, is smaller than the minutes it costs to visit them
  (service 10 minutes plus detour). A customer with risk 0.03 has a penalty of 10 and is dropped. The rule arms give every
  candidate risk 1.0, so their penalty is 301 and they are always visited. The skip penalty scale is therefore
  what sets Gasora's floor, not the cut-off.
- Curves that cross a level more than once (seeds out of 10, section 6.1): at level 15 R0 10, G 1, all others 0; at
  level 25 R0 5; at level 10 R0 8.
- Level 25 (10 of 10 seeds for every arm), G minus other arm, mean [95% interval], negative = Gasora cheaper:
  kilometres vs R0 -666.5 [-784.0, -543.8], hours -80.9 [-97.7, -64.1]; vs R1 -262.7 [-304.8, -217.3], hours -19.2
  [-21.9, -16.6]; vs R2 -308.1 [-354.8, -262.6], hours -26.8 [-29.8, -23.7]; vs A -648.4 [-691.2, -598.4].
- Level 40: vs R0 kilometres -91.2 [-123.1, -64.2], hours -13.9 [-17.1, -10.5]; vs R1 kilometres -12.3 [-35.7, 9.5],
  hours -2.3 [-3.5, -0.8]; vs R2 kilometres -12.2 [-40.8, 14.7], hours -2.0 [-4.2, 0.0]; vs A -397.9 [-417.1, -378.5].
- Prediction quality (G at cut-off 0.1): forecast error 3.04 days (R1 average of exact records 2.84, R0 average of
  gaps 5.01); Brier 0.0352 against 0.0382 (skill 0.078); refill window coverage 72.4% (nominal 80%). The fit
  under-predicts the lowest risk band (mean predicted 0.015, observed 0.029).
- Decision: **not evaluable, carried to protocol v1.3**. The grid extension is not repeated (flat below 0.03). The skip
  penalty scale of Gasora is added as variant 6 with a pilot and a fixed choice rule (protocol section 9.2). Each scale
  other than 300 that is tried gets its own row and entry below, and counts as one of the 12.

## Entries after variant 4: pilot of the skip penalty scale (protocol section 9.2)

Common to variants 5 to 7: `python -m evaluation.pilot_penalty` (G only, dev seeds 1 to 3, 200 customers, road distances,
cut-off grid of v1.2). Rule arms were read from the dev run of variant 4 (S = 300 for them always). Exploratory:
three seeds only, so the intervals are weak. The repeat at S = 300 reproduces variant 4 (G floor about 16 to 17
run-outs, level 15 reached on 0 of 3 seeds) and is not counted again.
Mean run-outs / kilometres of G at cut-off 0.01 / 0.02 / 0.03 are shown for each scale.

## Variant 5: S = 600

- Run-outs / km: 8.2 / 2891, 9.0 / 2963, 10.8 / 3195. Run-outs of G at cut-off 0.01 per seed: 8.0, 9.0, 7.8.
- Level 15 reached on 3 of 3 seeds. Rule of section 9.2 (below 15 at cut-off 0.01 on every pilot seed): **met**.
- G minus R0 at level 15: km -1215.7 [-1323.2, -1152.1], hours -196.5 [-217.2, -164.8]; G minus R1: km -348.8
  [-388.0, -300.8], hours -49.1 [-54.1, -43.3] (3 seeds).
- Full dev run, seeds 1 to 10, `--skip-penalty 600` (output `data/dev_v5_S600.txt`). Reaching level 15 / 25 / 40 / 10:
  G 10 / 10 / 10 / 9 (R0 10 / 10 / 10 / 9, R1, R2 and A 10 on every level). Curves crossing a level more than once: R0 10 at
  level 15, 5 at level 25 and 9 at level 10; G 1 at level 10; others 0.
- Mean curve of G, run-outs / km: 0.01 8.4 / 2862, 0.02 8.6 / 2927, 0.03 10.6 / 3183, 0.05 17.4 / 3218, 0.10 30.6 / 3037.
- Primary comparison at level 15, G minus other arm, mean [95% interval]: R0 km -1204.8 [-1343.9, -1036.1], hours
  -197.4 [-239.4, -162.7]; R1 km -287.1 [-346.0, -222.7], hours -40.2 [-46.8, -33.3]. Grade on development seeds:
  **supported** against both (not the confirmation result).
- Level 25: R0 km -470.4 [-564.2, -368.5], R1 km -67.2 [-89.6, -39.5]. Level 40: R0 km -89.0 [-123.4, -60.1]; R1 km
  -9.9 [-33.5, 13.2] (interval includes 0), hours -2.1 [-3.4, -0.6]. Against A at level 15: km -593.5 [-637.2, -545.9].
- By customer type at level 15: G run-outs per 100 customer-months 2.8 for steady and 33.2 for irregular customers
  (R1: 0.0 and 37.2). Prediction quality is unchanged from variant 4 (S does not touch the predictor).
- Caveat: S was chosen on development seeds for Gasora only, while the rule arms keep 300. It is a tuned setting of G
  and must be reported as such.
- Check run, seeds 11 to 20, same settings (output `data/check_v5_S600.txt`). Reaching level 15 / 25 / 40 / 10: G 10 / 10 / 10 / 7
  (R0 10 / 10 / 10 / 8; R1, R2 and A 10 on all). Curves crossing a level more than once: R0 9 at level 15, 8 at level 25, 7 at
  level 10; none for G.
- Primary comparison at level 15, G minus other arm: R0 km -1239.8 [-1390.6, -1095.1], hours -219.1 [-254.4, -184.4]; R1 km
  -348.1 [-409.4, -288.9], hours -45.1 [-53.2, -37.8]. Grade: **supported** against both.
- Level 25: R0 km -523.5 [-592.1, -450.9], R1 km -68.1 [-91.4, -46.3]. Level 40: R0 km -75.1 [-113.8, -39.9]; R1 km -2.7
  [-19.9, 13.6] (interval includes 0), hours -1.4 [-3.2, 0.2]. Against A at level 15: km -648.0 [-691.9, -606.6].
- Level 10 is **not reported**: G reaches it on 7 of 10 seeds, below the 80% needed.
- Prediction quality (G at cut-off 0.1): forecast error 3.18 days (R1 2.96, R0 5.02); Brier 0.0369 against 0.0396 (skill 0.067);
  refill window coverage 73.2%. By type at level 15, run-outs per 100 customer-months: G 2.0 steady, 31.7 irregular (R1 0.0 and 34.3).
- Decision: **kept**. The result agrees with the development seeds. Next: freeze with `--skip-penalty 600`, tag
  `eval-freeze-v1`, then the confirmation run on seeds 21 to 40 (once).

## Variant 6: S = 1200

- Run-outs / km: 4.2 / 3451, 6.8 / 3612, 10.0 / 3441. Per seed at 0.01: 4.5, 5.2, 2.8. Level 15 on 3 of 3 seeds; rule met.
- G minus R0 km -1109.4 [-1195.3, -1049.1], hours -191.4; G minus R1 km -242.6 [-260.1, -212.9], hours -44.0.
- Decision: **pilot only, not carried forward**. Not needed, since 600 already meets the rule, and it costs more
  kilometres at the lowest cut-offs.

## Variant 7: S = 2400

- Run-outs / km: 3.2 / 4255, 6.4 / 3682, 9.9 / 3431. Per seed at 0.01: 3.8, 4.5, 1.5. Level 15 on 3 of 3 seeds; rule met.
- G minus R0 km -1113.8 [-1201.6, -1059.9], hours -191.7; G minus R1 km -247.0 [-266.4, -209.1], hours -44.3.
- Decision: **pilot only, not carried forward**.

## Entries after variant 7

(none yet. Next: freeze, then the confirmation run on seeds 21 to 40.)
