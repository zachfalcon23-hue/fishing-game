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
- `src/game.js` — all rules and state (no DOM): data tables, encounter pool, fight simulation, `SaveStore`, `FishingGame`. The visual update did not change this file.
- `src/scene.js` — layered canvas renderer (presentation only; it reads game state and never changes it):
  - Each spot is built from separate painted layers (sky → mountains → two forest rows → waterfall cliff → water → lily pads → dock → foreground), with pointer parallax by depth.
  - The sky is drawn in code for each time of day (stars and moon, sun, drifting clouds). The painted layers are colour-graded to match the sky, and the scene cross-fades when the spot, time or weather changes.
  - Animated water: wobbling strips, a mirrored reflection of the far shore, a moon/sun glitter path and caustics.
  - Weather: rain with splash rings, fog banks, storms with lightning bolts and flashes. Also fireflies, lantern and mushroom glows, and an animated waterfall.
  - Gameplay visuals: rod that bends with tension, cast arc, bobber, the Goop's shadow underwater, Goops leaping mid-fight, a catch reveal with god-rays, and a line-snap recoil.
  - Render resolution drops on its own when frames run slow.
- `src/audio.js` — procedural Web Audio sound effects and ambience (crickets, rain). There are no audio files. `M` toggles mute.
- `src/main.js` — game loop, DOM/HUD updates, input (pointer, touch, keyboard; tapping the scene casts or reels).
- `src/style.css`, `index.html` — layout and styling. The fonts (Lilita One, Nunito, OFL) are stored in `assets/fonts`, so the game needs no external requests.

## Art assets (`assets/`)
All art is optimised WebP, about 2.4 MB in total, taken from the North Pond art kits:
- `env/` — mountains (separated from the sky reference plate), distant forest strip, waterfall cliff, water surface plate, dock and shoreline, two foreground frames, lily pad clusters (with backgrounds removed where needed).
- `fx/` — 8-frame sprite sheets from the Animation Starter Kit (ripples, caustics, fog, fireflies, rain, bubbles) and the lantern glow.
- `goops/` — one portrait per Goop, cut from the roster sheets and standalone renders.
- `ui/title.webp` — title-screen backdrop (the approved cinematic North Pond composite).

## Embedding in a website
Everything uses relative paths and runs in a single page, so you can copy the folder into a site and either link to it or embed it in an `<iframe>` (16:9 on desktop; the scene switches to a 4:3 crop on phones). Saves use the `goop-fishing-save` key in `localStorage` on whatever origin hosts the game.
- `tests/game.test.js` — engine tests, including fight-balance checks (holding reel or never reeling must fail; feathering must succeed).

## Tuning notes
Fight constants live in `tickFight` and `pullForce` in `src/game.js`. Balance was checked with simulated players: a feathering player catches most Goops, a sloppy one struggles against fast patterns (dart, pulse, wild), and max tackle makes fights easy.
