# Goop Fishing — Mainline Economy Audit

Generated from current source definitions: **86 Goops**, **10 spots**, 4 weather states, 4 times of day, and 3 equipment profiles.

## Method

- The model uses the live `GOOPS`, `SPOTS`, `WEATHER`, `TIMES`, `BAITS`, `tackleMods`, `encounterPool`, and `zoneStats` definitions from `src/game.js`.
- Each spot is evaluated across every weather/time combination. Weather is weighted by its authored `WEATHER.weight`; Dawn, Day, Dusk and Night receive equal time weights.
- Encounter probabilities are calculated from the actual weighted selection pool after bait taste, gear, rarity, and hard condition requirements are applied.
- The reward estimate assumes a successful catch and includes the current spot multiplier, line/rod/lure Essence modifiers, and expected shiny payout. It excludes first-time record bonuses, sets, quests, bounties, buddy bonuses, catch streaks, hook-grade skill bonuses and fish escape probability.
- Mean bite delay uses the authored bite window, weather bite multiplier, Sharp Hooks upgrade, equipped tackle bite modifier and the matching-bait reduction. The 0.6-second minimum is applied to the bite-wait distribution.
- Neutral event conditions are used: no visitor, frenzy, feeding activity, full moon, tracked Goop or Sleeper quest unlock. Secret spots are modelled as already discovered/unlocked; their reveal and access conditions are not priced here.
- These are expected values per successful catch and bite-wait estimates, **not Essence/hour, catch/hour or a progression guarantee**. Fight success, fight duration, player movement and first-time collection rewards require gameplay telemetry.

## Equipment profiles

| Profile | Rod | Line | Lure | Lure level | Bait | Sharp Hooks |
|---|---|---|---|---:|---|---:|
| Starter rig | Twig | Classic | None | 0 | Worm | 0 |
| Field spinner | Carbon | Rainbow | Spinner III | 3 | Sugar Drop | 2 |
| Abyssal hunter | Abyssal Reach | Gold Thread | Diver III | 3 | Golden Goo | 3 |

## Spot-level neutral baseline

| Spot | Profile | Species seen | Avg. eligible | Rare+ | Epic+ | Legendary | Expected Essence / successful catch | Mean bite wait |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Moonlit Sandbar (secret) | Starter rig | 6 | 4.25 | 9.11% | 0.43% | 0.13% | 19.33 | 1.62s |
| Moonlit Sandbar (secret) | Field spinner | 6 | 4.25 | 5.12% | 0.21% | 0.07% | 19.46 | 0.78s |
| Moonlit Sandbar (secret) | Abyssal hunter | 6 | 4.25 | 18.14% | 2.2% | 0.82% | 26.14 | 1.48s |
| The Old Dock | Starter rig | 10 | 9.25 | 5.04% | 0.13% | 0.13% | 11.58 | 1.7s |
| The Old Dock | Field spinner | 10 | 9.25 | 3.92% | 0.1% | 0.1% | 11.1 | 0.87s |
| The Old Dock | Abyssal hunter | 10 | 9.25 | 10.38% | 0.96% | 0.96% | 15.4 | 1.55s |
| Lily Cove | Starter rig | 17 | 16.13 | 7.42% | 0.9% | 0% | 14.43 | 1.62s |
| Lily Cove | Field spinner | 17 | 16.13 | 9.92% | 1.11% | 0% | 15.29 | 0.75s |
| Lily Cove | Abyssal hunter | 17 | 16.13 | 16.3% | 4.61% | 0% | 19.64 | 1.48s |
| Cattail Reeds | Starter rig | 15 | 15 | 8.79% | 0.91% | 0% | 16.53 | 1.49s |
| Cattail Reeds | Field spinner | 15 | 15 | 7.36% | 0.78% | 0% | 17.71 | 0.8s |
| Cattail Reeds | Abyssal hunter | 15 | 15 | 18.18% | 4.5% | 0% | 22.28 | 1.36s |
| Slime Boulders | Starter rig | 11 | 11 | 32.1% | 2.06% | 0% | 24.51 | 1.74s |
| Slime Boulders | Field spinner | 11 | 11 | 33.45% | 2.15% | 0% | 25.02 | 0.99s |
| Slime Boulders | Abyssal hunter | 11 | 11 | 47.65% | 7.74% | 0% | 32.68 | 1.59s |
| Waterfall Inlet | Starter rig | 14 | 11.35 | 38.46% | 5.27% | 0.29% | 29.62 | 1.62s |
| Waterfall Inlet | Field spinner | 14 | 11.35 | 41.64% | 10.2% | 0.82% | 31.96 | 0.91s |
| Waterfall Inlet | Abyssal hunter | 14 | 11.35 | 55.03% | 17.23% | 1.27% | 41.74 | 1.48s |
| Hidden Falls Cave (secret) | Starter rig | 8 | 7.5 | 32.25% | 1.53% | 0% | 28.18 | 1.74s |
| Hidden Falls Cave (secret) | Field spinner | 8 | 7.5 | 35.02% | 1.66% | 0% | 29.35 | 0.99s |
| Hidden Falls Cave (secret) | Abyssal hunter | 8 | 7.5 | 49.37% | 5.96% | 0% | 39.05 | 1.59s |
| Glowshroom Grotto | Starter rig | 12 | 9.79 | 36.47% | 5.23% | 0.03% | 28.36 | 1.87s |
| Glowshroom Grotto | Field spinner | 12 | 9.79 | 19.4% | 4.52% | 0.02% | 25.41 | 0.86s |
| Glowshroom Grotto | Abyssal hunter | 12 | 9.79 | 57.02% | 18.47% | 0.13% | 40.86 | 1.71s |
| The Deep Drop | Starter rig | 16 | 12.24 | 55.04% | 14.45% | 0.42% | 44.89 | 2.08s |
| The Deep Drop | Field spinner | 16 | 12.24 | 55.04% | 14.45% | 0.42% | 44.89 | 1.18s |
| The Deep Drop | Abyssal hunter | 16 | 12.24 | 74.36% | 37.53% | 1.44% | 65.48 | 1.9s |
| Sunken Wreck (secret) | Starter rig | 8 | 7.28 | 28.34% | 3.78% | 0.38% | 35.38 | 2s |
| Sunken Wreck (secret) | Field spinner | 8 | 7.28 | 19.75% | 2.62% | 0.27% | 30.3 | 0.99s |
| Sunken Wreck (secret) | Abyssal hunter | 8 | 7.28 | 47.6% | 14.4% | 1.69% | 53.7 | 1.83s |

## Interpretation limits

- A high Rare+ share is not automatically a balance defect; the player must still meet habitat/time/weather gates and win the fight.
- Golden Goo changes both rare encounter weighting and shiny odds; taste bait changes both pool weights and the expected wait for matching species.
- The Field Spinner and Abyssal Hunter are analytical loadouts, not purchase recommendations. Their prices, unlock requirements and real-world catch payback should be evaluated alongside player telemetry.
- Re-run `npm run economy:audit` after changing species weights, spot composition, tackle modifiers, bite windows, weather weights or reward formulas.
