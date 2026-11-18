# Pondbound 0.4 — Release Readiness Checklist

This checklist separates automated verification from hands-on release validation. Do not mark manual checks complete without testing the deployed build.

## Automated checks

- [x] 50 registered Goops with unique IDs.
- [x] Every Goop has a weight and length profile.
- [x] Every Goop has a visual silhouette/marking profile.
- [x] Every zone spawn reference resolves to a registered Goop.
- [x] Every zone retains a non-empty spawn pool for day/night and clear/rain.
- [x] Specimen generation stays inside each species' authored physical-size bounds.
- [x] Specimen size affects rendered scale, fight pressure, XP, and sale value.
- [x] Weight and length personal records are stored and displayed.
- [x] Save v3 data hydrates into v4 defaults without losing existing progress.
- [x] Tension maneuver counterplay, adaptation, and recovery windows are covered.
- [x] Patience rhythm success and spook escape paths are covered.
- [x] GoopDex records encountered maneuvers and fight styles.
- [x] Trophy/weight quest and collection achievement logic is covered.
- [x] Browser DOM references resolve to unique HTML IDs.
- [x] JavaScript syntax check and Node regression suite pass in GitHub Actions.

## Phase 1 improvements added in this pass

- [x] Keyboard Space/Enter hold support for reel control.
- [x] Pointer capture and cancellation/release safeguards for reel control.
- [x] Release reel state on window focus loss and document visibility interruption.
- [x] Visible keyboard focus styling and reduced-motion preference support.
- [x] Minimum 44px control targets for touch and accessibility.
- [x] Local save success/failure is reported in the header; storage/quota failures are no longer falsely reported as success.
- [x] Regression tests added for reel input interruption/keyboard support and save storage failure reporting.

## Manual release validation — still required

### Browser and device coverage

- [ ] Desktop Chrome: first-time launch, reload, navigation, and complete fishing loop.
- [ ] Desktop Firefox and Safari: layout, Canvas rendering, pointer input, and WebAudio.
- [ ] Android Chrome: portrait/landscape layout, touch hold/release, rhythm taps, and browser back/reload.
- [ ] iOS Safari: touch behavior, audio unlock, viewport and safe-area handling.
- [ ] Verify no controls overlap or become unreachable on narrow screens.

### Gameplay and balance

- [ ] Play multiple catches in every zone under all four condition combinations.
- [ ] Verify each of the 50 species can be hooked and caught.
- [ ] Sample small, standard, big, trophy, and record specimens across several species.
- [ ] Confirm very large specimens are harder but remain fair in both fight styles.
- [ ] Tune tension safe-zone, patience tap windows, spook decay, fish stamina, and fight duration.
- [ ] Balance species spawn odds, rarity, rod/bait benefits, XP, Essence, and unlock costs.
- [ ] Confirm kept and sold catches produce expected progression and records.
- [ ] Verify all quests and achievements unlock correctly in a real playthrough.

### Saves, accessibility, and polish

- [ ] Test upgrade from an actual existing v3 browser save.
- [x] Pending catch and sell-or-keep decision survive reload; regression tested.
- [x] Casting cannot bypass Sell/Keep for a landed catch; regression tested.
- [x] Corrupted primary is immediately restored from valid backup; regression tested.
- [x] Quest XP is immediately processed through level-up progression; regression tested.
- [x] Daily catch count resets on Sell and Keep day advancement; regression tested.
- [x] Malformed-but-valid JSON save shapes are normalized safely; regression tested.
- [ ] Test corrupt, missing, and storage-quota save scenarios in a browser.
- [x] Local save backup and corrupted-primary recovery covered by automated regression tests.
- [x] Pending catch and sell/keep decision survive reload; regression tested.
- [ ] Test keyboard navigation and non-pointer access to all game actions.
- [ ] Review contrast, text sizing, reduced motion, and screen-reader labels.
- [ ] Confirm sound toggle behavior and audio levels on real devices.
- [ ] Complete final fish-art, animation, sound, and UI polish.
- [ ] Complete a fresh-player playthrough and a longer progression playthrough.
- [ ] Review the final PR diff and merge only after manual QA is signed off.

## Release decision

Current state: feature-complete prototype with automated coverage. It is not yet a verified commercial release until the manual items above have been completed and reviewed.

## Economy and progression audit additions

- [x] Rod/bait luck materially affects Rare-or-better spawn odds, not all fish weights uniformly (uniform scaling previously canceled during weighted selection).
- [x] Common and Uncommon spawn weights are unaffected by rarity luck gear.
- [ ] Validate actual catch success rates and Essence/hour through browser playtesting; automated spawn-weight checks are not a substitute.
- [ ] Review zone-unlock/gear payback using measured catch success, not assumed rates.

## Rarity and progression balance baseline

- [x] Source-weight audit calculated Rare+ share under neutral conditions (no gear luck, no time/weather modifiers; Epic+ receives existing 1.5 baseline weight multiplier): Pond 6.0%, Hollow 20.8%, Creek 40.1%, Bay 47.4%, Reach 72.5%.
- [x] Owner reports hands-on playtesting went fine; proceed using that assumption for progression decisions. (No independent browser/device test was performed in this session.)
- [ ] Recheck the Reach Rare+ share after luck gear correction through player-facing simulation/playtests; its 72.5% neutral baseline is high by design/source weights and still needs a focused rarity-feel review.
- [ ] Capture measured Essence/hour and catch success per zone before tuning unlock costs or gear payback.


## Economy simulation follow-up
- [x] Source-derived reward model across 50 fish, five zone pools, day/night, clear/rain, and three equipment profiles documented in `ECONOMY_AUDIT.md`.
- [x] Unlock gross-sale equivalents calculated (not presented as actual catches-to-unlock, since quests, levels, spending, and misses alter balance).
- [ ] Validate reward variance in Moonlit Bay and high Rare+ share in Crystal Reach through hands-on play.
- [ ] Capture casts/hour, bite timing, hook success, fight win rate/duration, and actual Essence/hour before economy tuning.


## Save integrity follow-up
- [x] Zone unlock hydration accepts only known IDs with literal `true` flags; malformed truthy values cannot unlock zones.
- [x] Rod and bait ownership arrays are deduplicated during hydration.
- [x] Regression coverage validates corrupted unlock flags, duplicate gear, and selected-zone fallback.
