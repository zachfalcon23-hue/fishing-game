# Goop Fishing — Pondbound (v0.3 Fish Intelligence)

A browser-based fishing game prototype with a species collection loop, location progression, and skill-driven encounters.

## Play and test

Open `index.html` in a modern browser or serve the repository with a static server. Run `npm test` with Node 20+ for the regression suite.

## The fishing loop

- Cast, watch the bobber, hook the bite, and manage line tension while the fish fights.
- Hold **REEL** to gain line; release to let the line run and reduce pressure.
- Read the fish's intent panel. Its tell explains the maneuver it is preparing and the counter-action to use.
- Keep responding during the maneuver. A late correction can still turn a bad read into a successful one.
- A successful read tires the fish and creates a short recovery opening for the angler.
- Catch, sell for Essence, or keep the fish to build the collection.

## Fish Intelligence

Fish are not just different tension curves. Each encounter can use a distinct move set:

- **Tailwind Bolt** — a sudden run; let the line run.
- **Deepwater Dive** — a hard downward pull; ease off the reel.
- **Hook Shaker** — violent head movement; pause reeling.
- **False Calm** — a deceptive lull before a lunge; do not chase the calm.
- **Surface Rush** — a jump that creates slack; reel to keep contact.
- **Current Circle** — a broadside sweep; maintain steady pressure.

Every maneuver has a readable telegraph, an action window, and a counter. Species inherit a temperament from their fighting style, with individual overrides for signature fish. More adaptable fish can react to the angler's repeated habits: persistent over-reeling encourages moves that reward releasing, while excessive pauses invite moves that test line contact. Adaptation is bounded to move selection; it does not secretly alter the fish's stats.

The encounter UI communicates the current cue, action, counter, and recovery state. The fishing-scene fish also animates during its tell and active maneuver.

## GoopDex and progression

- 29 species across five zones and six rarity bands.
- The GoopDex records each discovered species' temperament, encountered maneuvers, and successful reads.
- Four rods, four bait choices, Essence purchases, zone unlocks, quests, achievements, levels, XP, and lifetime stats.
- Local save data persists progression and field notes.
- Responsive Fishing, GoopDex, Shop, Quests, and Stats views.

## Architecture

- `src/game.js` — fish data, save store, encounter simulation, fish-intelligence rules, progression, shops, quests, and achievements.
- `src/main.js` — canvas animation, screen rendering, encounter telegraphs, and touch/keyboard pointer handling.
- `src/style.css` — responsive visual system and encounter/field-guide panels.
- `tests/game.test.js` — Node regression tests for the fishing loop, encounter sequencing, counterplay, adaptation, and GoopDex knowledge.

## Prototype status

This is an integrated gameplay prototype, not a release-ready commercial game. Full browser/device playtesting, encounter balance, accessibility review, audio, and a final art pipeline remain future validation work.
