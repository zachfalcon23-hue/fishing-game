# Goop Fishing

A small, dependency-free browser fishing game for Goopamon: cast, wait for a bite, hook it, and win a skill-based fight to catch Goops.

## Run
- Open `index.html` in a modern browser, or serve the folder (`npm start`). ES modules need `http://`, so a static server is the safest option.
- `npm test` runs the Node test suite (Node 20+).

## Play online
The game is published with GitHub Pages (Settings → Pages → Deploy from a branch → `main` / root): https://zachfalcon23-hue.github.io/fishing-game/

## How to play
1. **Cast** (`C` / button). Wait for the bobber to dip and the `!` to appear.
2. **Hook** with a fresh press of **Reel** (`Space` / hold the button). A button already held during the cast will not hook.
3. **Fight:** hold Reel to wind tension up and release to let it fall. Keep the white needle inside the green safe zone to gain catch progress.
   - Holding forever snaps the line (stamina drains fast above 95% tension); going slack loses progress.
   - Each Goop pulls differently — read the hint text: steady, pulse, dart, drift, sleepy, wild.
4. **Spend Essence** on tackle upgrades (Rod: faster reeling, Line: wider safe zone, Lure: faster bites and better rare odds) and on new fishing spots.

## Systems
- 10 Goops across 4 rarities, 3 spots (North Pond, Reed Shallows, Deep Lake).
- Time of day advances every 3 casts (Dawn → Day → Dusk → Night, new day on Dawn) and the weather is re-rolled each change. Rain, fog, storms and night boost the odds of matching Goops (Puddlit, Mistfin, Stormling, Drowsy, Lumen).
- GoopDex with catch counts and fastest catch times; progress saves automatically to `localStorage` (old saves migrate).

## Architecture
- `src/game.js` — all rules and state (no DOM): data tables, encounter pool, fight simulation, `SaveStore`, `FishingGame`.
- `src/main.js` — canvas scene, DOM updates, input handling (pointer, touch, keyboard).
- `src/style.css`, `index.html` — layout and styling.
- `tests/game.test.js` — engine tests, including fight-balance checks (holding reel or never reeling must fail; feathering must succeed).

## Tuning notes
Fight constants live in `tickFight` and `pullForce` in `src/game.js`. Balance was checked with simulated players: a feathering player catches most Goops, a sloppy one struggles against fast patterns (dart, pulse, wild), and max tackle makes fights easy.
