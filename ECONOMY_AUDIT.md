# Pondbound Economy & Progression Simulation (Source-Derived)

**Scope:** deterministic calculation of expected sale value per landed catch and rarity share across zone condition/equipment combinations, using the current `feature/maximal-one-shot-v0-2` source.

## Method and assumptions

- Uses all 50 registered species and each zone's authored spawn pool.
- Reproduces current `spawnWeightFor` day/night and clear/rain multipliers.
- Applies the existing 1.5x Rare+ weighting (as currently implemented for Rares and above) and gear luck multiplier to Rare+ only.
- Expected specimen value multiplier is 1.11, derived from the uniform percentile roll: `0.78 + 0.66 × E[q]`, where `E[q]=0.5`.
- Reported expected sale value is weighted fish `value` × 1.11. It excludes the level bonus (which rises from 1.5% per level and caps at +20%), catch XP/level rewards, quest rewards, and all time/catch-success estimates.
- Twelve condition/equipment combinations per zone were averaged: day/night × clear/rain × starter/Carbon+Mint/Starline+Spark. The min/max are across these combinations.
- This is mathematical expectation from source formulas, **not** a telemetry measurement or an Essence/hour estimate.

## Expected reward per landed catch

| Zone | Mean sale reward (Essence) | Lowest combo | Highest combo | Rare+ share (mean) |
|---|---:|---:|---:|---:|
| North Pond | 11.53 | 10.48 | 13.06 | 7.6% |
| Sunken Hollow | 20.75 | 18.04 | 24.34 | 20.3% |
| Ember Creek | 27.33 | 26.10 | 28.36 | 46.3% |
| Moonlit Bay | 38.52 | 28.79 | 49.33 | 46.6% |
| Crystal Reach | 57.26 | 54.74 | 59.69 | 74.9% |

## Unlock pacing — gross catch-sale equivalent

This table is a simple ratio of the zone unlock cost to the expected reward at the preceding zone. It is a **gross-sale equivalent**, not the number of catches a player needs, because player balance includes quest/level rewards, gear purchases, catch losses, and other spending.

| Unlock target | Unlock price | Previous zone mean sale | Gross-sale equivalent |
|---|---:|---:|---:|
| Sunken Hollow | 160 | 11.53 (North Pond) | 13.9 landed catches |
| Ember Creek | 420 | 20.75 (Sunken Hollow) | 20.2 landed catches |
| Moonlit Bay | 900 | 27.33 (Ember Creek) | 32.9 landed catches |
| Crystal Reach | 1,800 | 38.52 (Moonlit Bay) | 46.7 landed catches |

## Equipment cost context

Equipment purchase prices: rods = 1,310 total; baits = 305 total; all equipment = 1,615 Essence. This cost is not included in the unlock pacing ratios. Gear payback is not yet quantifiable because the simulation does not model catch duration, bite timing, hook success, fight win probability, or whether control/luck improvements translate to additional landed catches per hour.

## Balance interpretation / flags

- Reward expectation increases steadily by zone; the Crystal Reach's mean is ~4.96x North Pond's sale value.
- The condition/equipment spread is materially wider in Moonlit Bay than other zones (28.79–49.33 Essence), reflecting the large value and condition-sensitive Legendary fish weights in its pool. This creates stronger condition-setting incentives and should be reviewed through gameplay.
- Crystal Reach's high Rare+ share (74.9% mean under the selected 12-combination averaging; 72.5% neutral baseline from the prior audit) is intentional-looking progression but risks making Rare+ encounters feel routine rather than special. **No rarity nerf is made without playtest evidence.**
- Quest reward totals remain one-time authored rewards (790 Essence) and are excluded from catch-sale expectations; quest XP may generate additional level rewards, which are also excluded.
- No reproducible repeatable reward/quest exploit was proven in this source audit.

## What is still needed to make an Essence/hour model credible

Capture or instrument: casts/hour; bite wait; hook success; fight win rate by species/style; median fight duration; catch percentile distribution; average sale reward by level; quests completed per zone; and gear purchase timing. The next balance action should be driven by those measurements, not by assumed play speed.
