# Goop Fishing — Pondbound (0.2 One-shot vertical slice)
A substantially expanded browser game prototype with modular game rules and a lightweight dependency-free frontend.

## Play
Open index.html in a modern browser or serve the repository with a static server. Run `npm test` (Node 20+) for the built-in regression suite.

## Gameplay
- Fishing: cast → bite → hook → tension/energy fight → catch or escape.
- Fish roster: 29 named species across Common, Uncommon, Rare, Epic, Legendary, and Junk.
- Five zones with species pools and Essence unlock costs.
- Catch: species discovery, count, rarity, XP, level rewards; sell for Essence or keep the catch.
- Equipment: four rods and four bait/lure choices with control, luck, and bite speed modifiers.
- Progression: player levels, quests, achievements, lifetime stats, local saves.
- GoopDex: discovery reveal, search and caught/undiscovered filters.
- Shop: gear, bait, and area unlocks.
- Responsive interface and touch-friendly press/hold reel.

## Architecture
`src/game.js` owns game data, save store, encounter weighting, fight simulation, progression, shops, quests and achievements. `src/main.js` renders the canvas and UI. `src/style.css` handles presentation. `tests/game.test.js` uses Node's test runner.

## One-shot caveat
This is an ambitious integrated prototype. A full balance pass, real player testing, accessibility review, audio/art pipeline, and device/browser compatibility validation remain future work.