# Goop Fishing

A small, dependency-free browser fishing game for Goopamon: cast, wait for a bite, hook it, and win a skill-based fight to catch Goops.

## Run
- Open `index.html` in a modern browser, or serve the folder (`npm start`). ES modules need `http://`, so a static server is the safest option.
- `npm test` runs the Node test suite (Node 20+).

## Play online
The game is published with GitHub Pages (Settings → Pages → Deploy from a branch → `main` / root): https://zachfalcon23-hue.github.io/fishing-game/

## How to play
1. **Roam the shore.** Hold `◀ ▶`, `A / D` or the arrow keys (or drag the scene) to walk; let go and you stop right there. A quick tap or flick hops to the next stop (a spot, or a clue). Tap a pin on the minimap or open the full map (`M`, or the map button) to walk somewhere.
2. **Cast anywhere** (`C`, the button, or tap the scene). Standing at a spot gives you its full bonuses; between spots you fish a blend of both neighbours' Goops for a little less Essence.
3. **Hook** with a fresh press of **Reel** (`Space`, or the button). Hook within 0.4 s of the `!` for a **perfect hook** (+12% fight progress), within 1.2 s for a **clean hook** (+6%), or later for a normal start.
4. **Fight:** hold Reel to wind tension up and release to let it fall. Keep the needle inside the green zone to gain progress.
   - Staying in the zone while reeling builds a **streak** (up to ×1.6 catch speed).
   - Rare-or-better Goops **lunge**: a red `!!` appears, then they surge. Each fighting style has its own warning window and lunge strength: slow styles give more notice, while darting and wild styles hit harder with less warning. Let go of the reel when it hits to dodge it (and gain a little progress); fighting it head-on costs progress.
   - Holding forever snaps the line; going slack loses progress.
   - **Signature moves.** Every fighting style has its own challenge mid-fight, shown as a big prompt with sound and vibration:

     | Style | Move | What to do |
     | --- | --- | --- |
     | Dart | Swerve | Steer the way it bolts (◀ ▶ buttons, swipe, or arrow keys) before the ring runs out |
     | Steady | Tug of War | Tap REEL fast to drag the rope to your side |
     | Sleepy | Fake-out | Hands off while it plays dead, then reel the instant it wakes (watch for the 👀 tell) |
     | Pulse | Rhythm | Tap REEL on each beat as the notes reach the ring (mashing doesn't work) |
     | Drift | Current | The safe zone drifts: keep the needle inside it 60% of the time |
     | Wild | Thrash | Follow a quick string of ◀ ▶ and ● taps |

     Winning a move gives a chunk of progress and tires the Goop; failing costs progress and line. Rarer Goops make the windows tighter and the moves more frequent.
   - **Boss stages.** Epics fight in two stages and Legendaries in three. At each stage mark the Goop breaks away and leaps out of the water. After a short breather it comes back stronger, and the final stage mixes in a second fighting style's move. Each individual Goop is sized before the fight: heavier specimens have more stamina, pull harder and reel in more slowly. The fight HUD identifies a light, average or heavy specimen, and the GoopDex records the exact size you landed. Size-focused tackle changes the size roll, so it can also change the difficulty of the catch.
5. **Use bait** (`B`, or the bait button). Every Goop has a favourite food (Sweet, Muck, Ember, Frost or Glow), shown on its GoopDex page. Matching bait makes it bite ×3 as often and sooner. Golden Goo favours rare Goops and doubles shiny odds. One bait is used per cast; the worm is free.
6. **Fill the GoopDex.** New stretches of shore open as your GoopDex grows; until then the path is overgrown.
7. **Find the secret places.** Three spots are not on the path. They only show themselves when conditions line up, marked by a beacon (and a `?` on the minimap). Walk up to the beacon to find them. Old Wiggs drops rumours about them on the map and the bounty board.
8. **Do bounties.** Three new bounties go up on Old Wiggs' board (on the dock, or the board button) every morning. They pay Essence and bait the moment you finish them. You can swap unfinished ones for 25 Essence.
9. **Pick a buddy.** Open any Goop you've caught and tap **Make buddy**. It hops along beside you, adds +10% Essence and flags nearby secrets.
10. **Open the tackle box** (🎣 button or `B`). Every item shows in a live preview before you buy:
     - **Rods** (10): distinct fishing styles with real trade-offs. Bamboo absorbs shock and forgives tension mistakes; Glass draws quicker bites but is delicate; Carbon reels rapidly but punishes poor tension; Ironwood controls heavy pulls and lunges but reels slowly; Coral and Magma specialize in Goop tastes; Storm excels in bad weather; Crystal favors shiny hunting; Abyssal Reach specializes in deep rare encounters.
    - **Skins** (10 colourways for any rod, including animated Galaxy and Prismatic), **bobbers** (8 styles, e.g. Rubber Duck, Goop Eye, Pond Lantern, Golden Goop) and **lines** (6 colours).
    - **Lures** (9): kept once bought and upgradeable to level 3. They speed up bites, attract fight types, favour rare Goops by day or night, grow bigger catches, boost shinies, calm fights or dive for Epics.
    - **Bait** (used up one per cast) and **extras**: Hourglass (skip to the next time of day), Weather Totem (pick the weather), Frenzy Flare, Wiggs' Tip (learn where an unknown Goop bites), the Fish Finder (live odds of what's biting where you stand), buddy treats (your buddy grows, +4% Essence per level) and tackle tuning (Reel Gears, Line Strength, Sharp Hooks).

## Places
The game has three places, switched with the buttons under the logo. Each has its own address, so a website can link straight to it:
- **The Pond** (`index.html`): roam, fish and explore.
- **Wiggs' Bait Shack** (`index.html#shack`): Old Wiggs, drawn and animated in SVG, gives you his story quests, bounties and rumours. His shop (rods, skins, bobbers, lines, lures, bait and extras, with a live preview) lives here, under a rod rack that shows every rod style.
- **The Aquarium** (`index.html#aquarium`): every Goop you've caught swims in a living tank.
  - Tap a Goop to say hi and see its card (make it your buddy from there).
  - Turn on FEED and tap the water to drop food; hungry Goops race for it.
  - Shinies sparkle and Legendaries glow.
  - **Up to four tanks** (extra tanks cost 500 / 1,200 / 2,500 Essence), each with its own name, backdrop and up to 6 decorations. Each tank holds 12 Goops; new catches move into the first tank with room, the rest wait in storage, and you choose who lives where.
  - Decorations (coral, castle, treasure chest, glowshrooms, crystals, anchor, a model wreck, the Goop Throne, the Sleeper Statue) are bought once and can be moved between tanks. Backdrops: North Pond, Sunset, Moonlit, Magma, Crystal Cave, Abyss. Completed collections appear as trophies in the first tank.
  - Goops swim at different depths (far ones are smaller and hazier), keep their distance from each other, and only the hungry ones chase food.
  - Visitors leave tips once a day based on what's in your tank.

## Old Wiggs' story
13 chapters that walk you through the whole game: first catches, bait, the paths, field notes, dodging lunges, each secret place, the GoopDex, frenzies, collections and Legendaries. Finished quests are turned in at the shack for Essence, rods, skins, bobbers and aquarium pieces. The finale sends you to the Deep Drop at night to catch **The Sleeper**, a quest-only Legendary. After the story ends it rises again on full-moon nights. A chip on the pond shows your current goal.

## Systems
- **86 Goop species** across 5 rarities, each with a portrait, a habitat, a favourite food, a fight pattern and a size range. 13 of them live only in the secret spots (regional variants of North Pond Goops).
- **10 spots on one pond.** Spots on the path open at the GoopDex count shown:

  | Spot | Opens |
  | --- | --- |
  | Moonlit Sandbar (secret) | west of the dock, at dusk or night |
  | The Old Dock | start |
  | Lily Cove | start |
  | Cattail Reeds | 3 |
  | Slime Boulders | 7 |
  | Waterfall Inlet | 12 |
  | Hidden Falls Cave (secret) | past the falls, by day or dawn |
  | Glowshroom Grotto | 18 |
  | The Deep Drop | 26 |
  | Sunken Wreck (secret) | past the Deep Drop, in storm or fog |

  Each spot pays a discovery bonus on your first visit and a one-time bonus when you catch every species there. Secrets pay 60 Essence when found and stay found.
- **Conditions and events:**
  - Time of day advances every 3 casts and the weather re-rolls at each change. Some Goops prefer certain conditions; others (most Legendaries) need them.
  - **Feeding frenzy:** at each change of time there is a 40% chance of a frenzy at one open spot: Goops leap out of the water there, bites come twice as fast, rare odds rise and catches pay ×1.5.
  - **Visitor:** each day a Rare or Epic Goop visits a spot it doesn't normally live at.
  - **Moon:** a 5-day cycle drawn in the night sky. On a full moon night Legendaries are twice as likely and shiny odds double.
- **Collection depth:** size records, 1-in-48 shinies (triple Essence), 17 field notes, and 13 **collections** (Jelly Jamboree, Hot Rocks, Legends of North Pond…) that award a trophy and Essence when every Goop in them is caught.
- **Saves:** stored in `localStorage` (save version 3; tackle fields are filled in for older saves). Version-2 saves load with the new fields filled in (and a few starter baits); version-1 saves still migrate.

## Architecture
- `src/game.js` — all rules and state (no DOM): species, spots and secrets, the shore zones (`shoreZone`, `zonePool`), baits, encounter pool, fight simulation (streaks, lunges), bounties, collections, `SaveStore`, `FishingGame`.
- `src/scene.js` — canvas renderer for the walkable pond (presentation only; it reads game state and never changes it):
  - The pond is one continuous shoreline (`SPOT_X` gives each spot's position). Far layers tile along it (sky, mountains, two forest rows, cliffs and waterfalls). Each spot adds its own near props and foreground plants, and every layer scrolls at its own depth as you walk.
  - The reflection on the water is a mirrored copy of the far layers in their current scrolled position.
  - The sky is drawn in code for each time of day (stars and moon, sun, drifting clouds). The painted layers are colour-graded to match the sky, and the scene cross-fades when the spot, time or weather changes.
  - Animated water: wobbling strips, a mirrored reflection of the far shore, a moon/sun glitter path and caustics.
  - Weather: rain with splash rings, fog banks, storms with lightning bolts and flashes. Also fireflies, lantern and mushroom glows, and an animated waterfall.
  - Gameplay visuals: rod that bends with tension, cast arc, bobber, the Goop's shadow underwater, Goops leaping mid-fight, lunge warnings, a catch reveal with god-rays, and a line-snap recoil.
  - Tackle looks: every rod style is drawn in code (bamboo joints, carbon weave, glass, magma seams, storm sparks, crystal glints, abyssal runes), recoloured by skins; bobbers, lines and lures each have their own drawings. The tackle box preview reuses the same drawing code.
  - World features: the sandbar, the cave mouth in the second waterfall's cliff, the wreck's mast, clue beacons, frenzy leaps, Old Wiggs' bounty board on the dock, your buddy Goop, and the moon's phases.
  - Render resolution drops on its own when frames run slow.
- `src/audio.js` — procedural Web Audio sound effects and ambience (crickets, rain, the waterfall's roar, birds, cave drips, waves). There are no audio files. `N` toggles mute.
- `src/main.js` — game loop, DOM/HUD updates, input (pointer, touch, keyboard; tapping the scene casts or reels), the three places and their URL hashes, Old Wiggs' dialogue and the shop.
- `src/aquarium.js` — the aquarium tank: swimming, feeding, taps, decorations, backdrops and trophies (presentation only).
- `src/style.css`, `index.html` — layout and styling. The fonts (Lilita One, Nunito, OFL) are stored in `assets/fonts`, so the game needs no external requests.

## Art assets (`assets/`)
All art is optimised WebP, about 4 MB in total, taken from the North Pond art kits:
- `env/` — mountains (separated from the sky reference plate), distant forest strip, waterfall cliff, water surface plate, dock, foreground plant clusters split into left and right pieces with feathered edges, slime boulders, and lily pad clusters.
- `fx/` — 8-frame sprite sheets from the Animation Starter Kit (ripples, caustics, fog, fireflies, rain, bubbles) and the lantern glow.
- `goops/` — one portrait for each of the 85 Goops: 72 cut from the roster sheets and standalone renders, plus 13 regional variants made from them (recoloured, with a moonlit, crystal or ghostly finish).
- `ui/title.webp` — title-screen backdrop (the approved cinematic North Pond composite).

## Embedding in a website
Everything uses relative paths and runs in a single page, so you can copy the folder into a site and either link to it or embed it in an `<iframe>` (16:9 on desktop; the scene switches to a 4:3 crop on phones). Saves use the `goop-fishing-save` key in `localStorage` on whatever origin hosts the game.
- `tests/game.test.js` — engine tests, including fight-balance checks (holding reel or never reeling must fail; feathering must succeed).

## Tuning notes
Fight constants live in `tickFight` and `pullForce` in `src/game.js`. Balance was checked with simulated players (`/tmp`-style scripts against `makeFight`/`tickFight`). A player who ignores signature moves still catches Commons and Uncommons, about 70% of Rares and 60% of Epics, but no Legendaries. A player who reacts to the moves catches nearly everything up to Epic, and roughly half (casual) to three-quarters (skilled) of Legendaries. Typical fights last about 11 seconds for a Common, 20 for an Epic and 29 for a three-stage Legendary.
