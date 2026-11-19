# Goop Fishing — Pondbound 0.4

A browser-based fishing and Goop-collection game prototype built around distinct fish behavior, adaptive encounters, specimen hunting, and changing fishing conditions.

## Play and test

Open `index.html` in a modern browser or serve the repository with a static server. Run `npm run check` and `npm test` with Node 20+ for syntax and regression checks. For real-browser smoke coverage, install the pinned browser runner with `npm install --no-save --no-package-lock playwright@1.56.1` and install the browser you want with `npx playwright install chromium` (or `firefox` / `webkit`), then run `PLAYWRIGHT_BROWSER=chromium npm run test:browser` (replace `chromium` with the selected engine). GitHub Actions runs the syntax checks, Node regression suite, and browser smoke suite in a Chromium, Firefox, and WebKit matrix on pull requests (including this feature branch) and on pushes to `main` or `test/browser-smoke-harness`. The feature branch is validated through its pull request to avoid duplicate push and pull-request matrix runs. The browser suite covers desktop/mobile viewports, navigation, GoopDex search, conditions, cast/bite/fight, save hydration, responsive overflow/touch targets, corrupted-primary backup recovery, Sell/Keep catch resolution, failed-write rollback, and storage-quota failure reporting. See [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) for remaining hands-on QA.

## The fishing loop

- Cast into one of five waters, watch the bobber, hook the bite, and manage line tension.
- Hold **REEL** to gain line; release to let the line run and reduce pressure.
- Read the fish intent panel. Its tell explains the maneuver it is preparing and the counter-action to use.
- React during the maneuver. A late correction can still turn a bad read into a successful one.
- A successful read tires the fish and creates a short recovery opening.
- Catch, sell for Essence, or keep the catch as part of the growing specimen collection.

## 50 Goops to discover

The roster now contains **50 named Goops** across North Pond, Sunken Hollow, Ember Creek, Moonlit Bay, and Crystal Reach. Species have different rarity, spawn weighting, fighting patterns, temperament, physical size ranges, and procedural silhouette/marking profiles. Goops have distinct round, long, sleek, finned, winged, lantern, spiky, shell, or sprout-like forms.

## Specimen hunting: weight, length, trophies and records

Every hooked Goop receives an individual specimen roll:
- **Weight:** species-specific range, recorded in pounds
- **Length:** species-specific range, recorded in inches
- **Size class:** Small, Standard, Big, Trophy, or Record
- **Physical scale:** the fish rendered in the water scales to its rolled specimen size
- **Fight strength:** larger specimens exert more pressure
- **Rewards:** specimen size influences XP and sale value
- **Records:** the GoopDex tracks each species' best weight, length, and trophy count; the Stats view tracks total caught weight, trophy catches, and the heaviest specimen

A player's specimen log keeps the most recent 120 catches. Each specimen is recorded independently, so catching the same species again can produce a new personal best or the heaviest catch in the collection.

## Fish Intelligence

Fish are not just different tension curves. Each encounter can use a distinct move set:
- **Tailwind Bolt** — a sudden run; let the line run.
- **Deepwater Dive** — a hard downward pull; ease off the reel.
- **Hook Shaker** — violent head movement; pause reeling.
- **False Calm** — a deceptive lull before a lunge; do not chase the calm.
- **Surface Rush** — a jump that creates slack; reel to keep contact.
- **Current Circle** — a broadside sweep; maintain steady pressure.

Species inherit a temperament from their fighting style, with signature overrides for notable Goops. More adaptable fish can react to repeated over-reeling or excessive pauses. Adaptation changes move selection, not hidden stats.

The encounter UI communicates the current cue, action, counter, and recovery state. The fishing-scene fish animates during its tell and active maneuver. The GoopDex records whether a species has been encountered through tension or patience fights.

## Two fight styles

Fishing uses more than one control mechanic:
- **Tension fights** — hold to reel and release to manage pressure, read fish maneuver tells, and counter their attacks.
- **Patience fights** — Drift- and Sleepy-pattern Goops invite a steady tap rhythm. Correct timing builds approach progress; frantic taps raise spook, while long pauses lose the fish's interest.

The correct control is surfaced in the encounter HUD. The player must recognize the fish's behavior and switch from reeling to rhythmic taps when the encounter calls for it.

## Dynamic conditions

Players can set **Day** or **Night**, and **Clear** or **Rain**, before casting. Spawn weights respond to these conditions:
- Night favors nocturnal, spectral, lunar, and deep-water species while reducing daylight specialists.
- Rain favors current-riding, mud, reed, and silt species.
- Clear conditions favor luminous and crystalline species.

Conditions are stored with the player's save and are shown visually in the Fishing view (daylight or moonlight, plus animated rain).

## Five distinct fishing environments

Each location now has its own scene palette, shoreline landmarks, and environmental description: reed beds and willows at North Pond, sunken stone ruins in Sunken Hollow, ember-lit rock shelves at Ember Creek, a moonlit lighthouse at Moonlit Bay, and crystal spires at Crystal Reach. Day/night lighting and rain remain layered over each location's identity. The zone-profile regression test verifies complete coverage, unique palettes, and a dedicated renderer for every landmark.

## Collection and progression

- GoopDex discovery, temperament notes, maneuver research, observed fight styles, best weight/length, and trophy counts.
- Four rods, four bait choices, Essence purchases, five unlockable locations, quests, achievements, levels, XP, and lifetime stats.
- Local save data persists progression, specimen records, settings, and the latest catch.
- Responsive Fishing, GoopDex, Shop, Quests, and Stats views.

## Phase 1 reliability and accessibility pass

- Reel input supports mouse/touch and keyboard hold (Space/Enter), with interruption release safeguards.
- Interactive controls have visible keyboard focus styling, minimum 44px targets, and reduced-motion support.
- Fishing-scene narration updates for screen readers across ready, cast, bite, fight, catch, and escape states; encounter feedback uses a live status region.
- Save writes report success/failure in the header. A second local backup copy is maintained; backup recovery immediately repairs the corrupt primary save.
- Pending catch and sell/keep state persist across reloads, so a landed specimen and reward decision are not lost.
- Casting is blocked while a landed specimen awaits Sell or Keep, preventing overwriting an unresolved catch.
- Quest rewards immediately feed the level-up calculation; XP earned from a quest no longer waits for the next catch to trigger leveling.
- Daily catch count resets when Sell or Keep advances the fishing day, while lifetime catches remain intact.
- Save hydration normalizes malformed-but-valid JSON (wrong field types, invalid equipment/zone, negative or nonnumeric counters) to safe defaults while preserving valid fields.

## Feedback and accessibility

Original synthesized sound effects provide distinct cues for casting, bites, hooking, fish maneuvers, successful patience taps, catches, and escapes. Sound can be switched off with the **SFX ON/OFF** control. The game remains playable with sound disabled; encounter text and meters communicate the same essential information visually.

The frontend uses pointer-based hold/release controls for tension fights and a dedicated tap control for patience fights. Both controls work with mouse and touch input.

## Architecture

- `src/game.js` — fish content, specimen profiles, spawn weighting, save store, encounter simulation, fish-intelligence rules, progression, shops, quests, and achievements.
- `src/main.js` — canvas animation, specimen-scale rendering, encounter telegraphs, GoopDex/record views, and UI controls.
- `src/style.css` — responsive visual system, conditions controls, specimen reveal, and field-guide panels.
- `tests/game.test.js` — Node regression tests for roster integrity, size generation, condition weighting, save migration, encounter counterplay, adaptation, and specimen persistence.

## Validation status

The project has automated regression coverage for content, visual profiles, DOM references, specimen metrics, conditions, saves, both fight styles, and progression. CI runs syntax checks, the Node regression suite, and a Playwright Chromium smoke suite on the feature branch and pull requests. The browser suite exercises Chromium at desktop and mobile viewport sizes; it does not replace hands-on Chrome/Firefox/Safari, Android/iOS, keyboard-only, screen-reader, audio, or full progression playtesting. Economy telemetry, accessibility review, audio, and final art pipeline still require validation before a commercial release.

### Economy/progression audit — gear luck correction

- Audit finding: rod and bait luck were multiplied uniformly into every fish's spawn weight. Since weighted selection normalizes by total pool weight, this multiplier canceled out and **did not change encounter odds**. Luck upgrades therefore had no gameplay effect on rarity despite their descriptions.
- Fix: luck is now applied only to Rare-or-better species spawn weights; Common and Uncommon weights remain unchanged. Existing Epic/Legendary baseline weighting remains intact. This gives luck gear a measurable rarity effect while avoiding an across-the-board spawn inflation.
- Cost baseline: zone unlocks total 3,280 Essence (160 + 420 + 900 + 1,800); rods total 1,310 and baits total 305. These costs are documented as audit context, not a claim of a fully simulated payback curve.

### Rarity distribution baseline (neutral conditions, no luck gear)

The current authored spawn weights, with the existing 1.5 Epic+ baseline weighting and no day/night/weather modifiers, produce these aggregate Rare-or-better encounter shares:

| Zone | Species | Rare+ baseline |
|---|---:|---:|
| North Pond | 15 | 6.0% |
| Sunken Hollow | 13 | 20.8% |
| Ember Creek | 13 | 40.1% |
| Moonlit Bay | 12 | 47.4% |
| Crystal Reach | 14 | 72.5% |

This is a source-weight calculation, not a measured gameplay rate. Day/night and rain/clear condition modifiers change these shares. The progression is intentionally strongly rarity-forward in later zones; the Reach baseline is particularly high and should be reviewed for whether it still feels like an aspirational destination after luck gear becomes effective. Actual Essence/hour and upgrade payback remain unverified until gameplay telemetry/manual runs measure bite, hook, fight success, and time per catch.


### Follow-up source-derived economy simulation

See [`ECONOMY_AUDIT.md`](ECONOMY_AUDIT.md) for modeled expected sale rewards across day/night, clear/rain, and starter/late gear; gross-sale unlock equivalents; and the assumptions/limitations. This calculation is not Essence/hour or measured catch success.


### Save-state integrity follow-up

Zone unlock flags are now whitelist-normalized: only known zone IDs with literal `true` are accepted. Invalid truthy values and unknown keys cannot unlock zones during hydration. Owned rods and baits are deduplicated on load. Regression tests cover malformed flags, duplicate equipment, and invalid selected-zone recovery.


## Session telemetry and balance evidence

The Stats view includes an in-memory session summary and an **Export session telemetry** action. The JSON export records completed fishing rounds and groups outcomes by zone, day/night, weather, rod, bait, and fight style. It includes cast-to-bite, bite-to-hook, fight, and total-round durations, plus catches, escapes, Sell/Keep decisions, realized sale Essence, and session-normalized catches/Essence per hour. Estimated catch value is kept separate from actual earned Essence: only a completed Sell decision counts as income.

Telemetry is local to the current page session: it is not uploaded, does not include player identifiers, and is not written into the progression save. Up to 500 detailed rounds are retained in memory; aggregate event counters continue for the session. Export before closing or reloading the page if you want to keep a playtest sample.

Use multiple sessions across zones and condition combinations before adjusting rarity, fight difficulty, or economy. Small samples should be treated as directional evidence, not definitive balance results.
