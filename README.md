# Goop Fishing

A small, dependency-free browser fishing game for Goopamon: cast, wait for a bite, hook it, and win a skill-based fight to catch Goops.

## Run
- Open `index.html` in a modern browser, or serve the folder (`npm start`). ES modules need `http://`, so a static server is the safest option.
- `npm test` runs the Node test suite (Node 20+).

## Play online
The game is published with GitHub Pages (Settings → Pages → Deploy from a branch → `main` / root): https://zachfalcon23-hue.github.io/fishing-game/

## How to play
1. **Explore North Pond.** Walk the shore with `◀ ▶`, `A / D` or the arrow keys, or swipe the scene sideways. You can also tap a pin on the pond map. Letting go glides you to the nearest fishing spot.
2. **Cast** (`C`, the button, or tap the scene) once you're standing at a spot. Wait for the bobber to dip and the `!` to appear.
3. **Hook** with a fresh press of **Reel** (`Space`, or hold the button).
4. **Fight:** hold Reel to wind tension up and release to let it fall. Keep the white needle inside the green safe zone to gain catch progress.
   - Holding forever snaps the line; going slack loses progress.
   - Each Goop pulls differently: steady, pulse, dart, drift, sleepy or wild.
5. **Fill the GoopDex.** Each spot has its own species. New stretches of shore open as your GoopDex grows; until then the path is overgrown.
6. **Read the field notes.** Glowing bottles wash up near each spot. Tap one to learn exactly where and when a rare Goop bites.
7. **Spend Essence** on tackle upgrades: Rod (faster reeling), Line (wider safe zone) and Lure (faster bites, better rare odds).

## Systems
- **72 Goop species** across 5 rarities (Common → Legendary), each with a portrait, a habitat, a fight pattern and a size range.
- **7 spots on one pond**, in walking order. Each opens at the GoopDex count shown:

  | Spot | Opens at |
  | --- | --- |
  | The Old Dock | start |
  | Lily Cove | start |
  | Cattail Reeds | 4 |
  | Slime Boulders | 10 |
  | Waterfall Inlet | 18 |
  | Glowshroom Grotto | 26 |
  | The Deep Drop | 36 |

  Each spot pays a discovery bonus on your first visit and a one-time bonus when you catch every species there.
- **Conditions:** time of day advances every 3 casts (Dawn → Day → Dusk → Night) and the weather re-rolls at each change.
  - Some Goops just *prefer* certain conditions, which raises their odds.
  - Others *need* them. Legendaries such as King Gloop (dawn at the dock), Nightmire (foggy nights in the grotto) and Prismadrake (rain in daylight at the falls) never bite otherwise.
- **Collection depth:**
  - Every catch rolls a size, and your biggest is kept as a record.
  - 1 in 48 catches is a shiny colour variant worth triple Essence.
  - The GoopDex tracks Goops you've seen (hooked but lost) separately from ones you've caught, with a detail card for each.
- **Saves:** stored in `localStorage` (save version 2). Version-1 saves migrate automatically: the GoopDex is kept, and Essence spent on the old separate lakes is refunded.

## Architecture
- `src/game.js` — all rules and state (no DOM): data tables, encounter pool, fight simulation, `SaveStore`, `FishingGame`. The visual update did not change this file.
- `src/scene.js` — canvas renderer for the walkable pond (presentation only; it reads game state and never changes it):
  - The pond is one continuous shoreline (`SPOT_X` gives each spot's position). Far layers tile along it (sky, mountains, two forest rows, cliffs and waterfalls). Each spot adds its own near props and foreground plants, and every layer scrolls at its own depth as you walk.
  - The reflection on the water is a mirrored copy of the far layers in their current scrolled position.
  - The sky is drawn in code for each time of day (stars and moon, sun, drifting clouds). The painted layers are colour-graded to match the sky, and the scene cross-fades when the spot, time or weather changes.
  - Animated water: wobbling strips, a mirrored reflection of the far shore, a moon/sun glitter path and caustics.
  - Weather: rain with splash rings, fog banks, storms with lightning bolts and flashes. Also fireflies, lantern and mushroom glows, and an animated waterfall.
  - Gameplay visuals: rod that bends with tension, cast arc, bobber, the Goop's shadow underwater, Goops leaping mid-fight, a catch reveal with god-rays, and a line-snap recoil.
  - Render resolution drops on its own when frames run slow.
- `src/audio.js` — procedural Web Audio sound effects and ambience (crickets, rain). There are no audio files. `M` toggles mute.
- `src/main.js` — game loop, DOM/HUD updates, input (pointer, touch, keyboard; tapping the scene casts or reels).
- `src/style.css`, `index.html` — layout and styling. The fonts (Lilita One, Nunito, OFL) are stored in `assets/fonts`, so the game needs no external requests.

## Art assets (`assets/`)
All art is optimised WebP, about 4 MB in total, taken from the North Pond art kits:
- `env/` — mountains (separated from the sky reference plate), distant forest strip, waterfall cliff, water surface plate, dock, foreground plant clusters split into left and right pieces with feathered edges, slime boulders, and lily pad clusters.
- `fx/` — 8-frame sprite sheets from the Animation Starter Kit (ripples, caustics, fog, fireflies, rain, bubbles) and the lantern glow.
- `goops/` — one portrait for each of the 72 Goops, cut from the roster sheets and standalone renders.
- `ui/title.webp` — title-screen backdrop (the approved cinematic North Pond composite).

## Embedding in a website
Everything uses relative paths and runs in a single page, so you can copy the folder into a site and either link to it or embed it in an `<iframe>` (16:9 on desktop; the scene switches to a 4:3 crop on phones). Saves use the `goop-fishing-save` key in `localStorage` on whatever origin hosts the game.
- `tests/game.test.js` — engine tests, including fight-balance checks (holding reel or never reeling must fail; feathering must succeed).

## Tuning notes
Fight constants live in `tickFight` and `pullForce` in `src/game.js`. Balance was checked with simulated players: a feathering player catches most Goops, a sloppy one struggles against fast patterns (dart, pulse, wild), and max tackle makes fights easy.
