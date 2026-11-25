# Goop Fishing

A dependency-free browser fishing and Goop-collection game for Goopamon, with a walkable pond, multiple habitats, creature-specific fights, progression, and an Aquarium.

## Run
- Open `index.html` in a modern browser, or serve the folder (`npm start`). ES modules need `http://`, so a static server is the safest option.
- `npm run check` checks JavaScript syntax across the engine, renderer, interface, audio, Aquarium, wildlife, and test modules.
- `npm test` runs the Node regression suite (Node 20+).
- `npm run test:browser` runs the current-mainline Playwright smoke tests (after installing pinned Playwright and Chromium as in CI).
- `npm run economy:audit` prints a source-derived economy report for all current spots, weather/time combinations, and three equipment profiles.
- See [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md) for the current mainline verification and release gates.

## Local playtest session data

Open **PLAYTEST SESSION · LOCAL ONLY** in the Field Notes card to see session measurements. The collector observes the live fishing phases and records cast-to-bite, bite-to-hook, fight and round durations; catches, missed bites and breakaways; catch Essence; and context such as fishing spot, time, weather, rod, line, lure, bait and fight pattern.

- Measurements stay in memory in the current browser session. They are not written to the game save and are never uploaded.
- The recent-round detail is bounded to the latest 500 rounds; summary counters continue for the current page session.
- Use **EXPORT JSON** to download the session for balancing and playtest review, or **RESET SESSION** to clear the measurements without resetting game progress.

## Economy audit

The current-source economy audit is generated from the live encounter pool and reward/bite formulas in `src/game.js`. It covers all current spots, weather and time conditions, and starter/field/deep-hunter tackle profiles. It reports encounter rarity shares, expected Essence per successful catch, and expected bite delay.

The report is a neutral diagnostic baseline. It does not claim Essence/hour or catches/hour because fight success, fight duration, movement, quest/set rewards and player skill must be measured separately. Run `npm run economy:audit` after changing species weights, habitats, weather, tackle modifiers, bite windows or reward formulas. The current generated snapshot is published in [`ECONOMY_AUDIT.md`](ECONOMY_AUDIT.md).

## Play online
The game is published with GitHub Pages (Settings → Pages → Deploy from a branch → `main` / root): https://zachfalcon23-hue.github.io/fishing-game/

## How to play
New players are shown a five-step **Old Wiggs’ Field Lessons** guide on their first start. Reopen it any time with the `?` button in the top bar.

1. **Roam the shore.** Hold `◀ ▶`, `A / D` or the arrow keys (or drag the scene) to walk; let go and you stop right there. A quick tap or flick hops to the next stop (a spot, or a clue). Tap a pin on the minimap or open the full map (`M`, or the map button) to walk somewhere.
2. **Cast anywhere** (`C`, the button, or tap the scene). Standing at a spot gives you its full bonuses; between spots you fish a blend of both neighbours' Goops for a little less Essence.
3. **Hook** with a fresh press of **Reel** (`Space`, or the button). Hook within 0.4 s of the `!` for a **perfect hook** (+12% fight progress), within 1.2 s for a **clean hook** (+6%), or later for a normal start.
4. **Fight:** hold Reel to wind tension up and release to let it fall. Keep the needle inside the green zone to gain progress. Each landed specimen receives a **Rough, Sound, Prized or Flawless** grade from hook timing, streaks, signature-move results, lunge dodges and line control. Grades persist in the GoopDex and can add first-time field-study evidence or unlock higher-skill daily contracts.
   - Staying in the zone while reeling builds a **streak** (up to ×1.6 catch speed). Perfect hooks add +5% Essence and clean hooks +2.5%; this stacks with streak skill for a capped +15% total skill bonus.
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
   - **Read the water:** every cast stirs feeding activity in the habitat. Rare Goops become slightly more active as the water wakes up; activity is shown in the pond HUD and gradually settles as the time of day changes. Nearby shore zones keep their own activity, so moving along the bank reveals a different ecosystem pulse. **Cattail Reeds have dense cover:** each cast builds feeding activity twice as fast there, quickly drawing more rare Goops into the shallows. **Slime Boulders have rocky eddies:** fights have a narrower safe tension window, so line control and stronger line upgrades matter more. **Waterfall Inlet has a pulsing current:** every six seconds, a 1.2-second surge increases the Goop's pull by 35%; the HUD warns as the flow builds, so anglers can prepare to ease off the reel. **Hidden Falls Cave refracts the line window:** every five seconds, the safe tension band shifts first upward, then downward on the next cycle. Follow the prism warning and track the moving green band. **Glowshroom Grotto has a spore bloom:** spores gather on an eight-second cycle, then create a short luminous window where the Goop pulls 25% less and safe reeling is 18% more effective. **The Deep Drop has abyssal pressure:** every nine seconds a warning precedes a 1.2-second pressure drop that sinks the line; reel through it to keep tension from falling into slack. **The Sunken Wreck has loose rigging:** every eight seconds, a warning precedes a brief snag; steer in the called direction to cut free, gain a little progress and ease tension, or take a sharp tension penalty if you miss. **The Moonlit Sandbar has a full-moon tide:** casts made with at least 65% Sandbar habitat share on full-moon nights roll larger specimens; the HUD marks the window, and the size bonus is locked at cast time. **Lily Cove has a petal drift:** at dawn and dusk, the bloom line draws rare drift-pattern Goops; the HUD marks the window when at least 65% of your fishing zone is Lily Cove. **The Old Dock has a lantern wake:** at night, its lamps draw rare Goops that naturally feed after dark; the HUD marks the window when at least 65% of your fishing zone is the Old Dock.
   - **Track a hunt:** open a GoopDex entry you have identified and choose **TRACK THIS GOOP**. Its encounter weight is multiplied by ×4 only in a real habitat and when its hard time/weather requirements are met. The Fish Finder uses the same adjusted weights. Tap the tracking chip in the pond HUD to reopen the field log, or choose **STOP TRACKING** in the entry to clear it.
6. **Fill the GoopDex.** New stretches of shore open as your GoopDex grows; until then the path is overgrown.
7. **Find the secret places.** Three spots are not on the path. They only show themselves when conditions line up, marked by a beacon (and a `?` on the minimap). Walk up to the beacon to find them. Old Wiggs drops rumours about them on the map and the bounty board.
8. **Do bounties.** Three new bounties go up on Old Wiggs' board (on the dock, or the board button) every morning. They pay Essence and bait the moment you finish them. You can swap unfinished ones for 25 Essence.
9. **Pick a buddy.** Open any Goop you've caught and tap **Make buddy**. It hops along beside you, adds +10% Essence and flags nearby secrets.
10. **Open the tackle box** (🎣 button or `B`). Every item shows in a live preview before you buy:
     - **Rods** (10): distinct fishing styles with real trade-offs. Bamboo absorbs shock and forgives tension mistakes; Glass draws quicker bites but is delicate; Carbon reels rapidly but punishes poor tension; Ironwood controls heavy pulls and lunges but reels slowly; Coral and Magma specialize in Goop tastes; Storm excels in bad weather; Crystal favors shiny hunting; Abyssal Reach specializes in deep rare encounters.
    - **Skins** (10 colourways for any rod, including animated Galaxy and Prismatic), **bobbers** (8 styles, e.g. Rubber Duck, Goop Eye, Pond Lantern, Golden Goop) and **lines** (6 tactical choices): Clear Mono speeds bites and absorbs shock; Neon Slime widens the safe zone at the cost of reel speed; Hot Pink reels faster but narrows the zone; Ember Braid weakens pulls but slows bites and has less shock tolerance; Gold Thread boosts shiny odds and Essence; Rainbow Line offers balanced handling.
    - **Lures** (9): kept once bought and upgradeable to level 3. They speed up bites, attract fight types, favour rare Goops by day or night, grow bigger catches, boost shinies, calm fights or dive for Epics.
    - **Bait** (used up one per cast) and **extras**: Hourglass (skip to the next time of day), Weather Totem (pick the weather), Frenzy Flare, Wiggs' Tip (learn where an unknown Goop bites), the Fish Finder (a live, condition-aware forecast that refreshes with feeding activity, bait, tracked targets and habitat changes; it also shows your current water signal and hunt status), buddy treats (your buddy grows, +4% Essence per level) and tackle tuning (Reel Gears, Line Strength, Sharp Hooks).

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
- **Saves:** stored in `localStorage` (save version 6). Older saves migrate additively, including version-5 saves that gain an empty recent-catch log. The Field Notes card displays the latest eight landings, while the save retains a bounded history of 40 catches with habitat, conditions, bait, size, specimen grade, shiny status and Essence reward. The `SaveStore` maintains a `goop-fishing-save-backup` copy, seeds it from a validated primary save, and automatically restores/repairs the primary save if it is missing or damaged. The game reports when backup recovery occurs; reset clears both save slots.

## Architecture
- `src/game.js` — all rules and state (no DOM): species, spots and secrets, the shore zones (`shoreZone`, `zonePool`), baits, encounter pool, fight simulation (streaks, lunges), bounties, collections, `SaveStore`, `FishingGame`.
- `src/scene.js` — canvas renderer for the walkable pond (presentation only; it reads game state and never changes it):
  - The pond is one continuous shoreline (`SPOT_X` gives each spot's position). Far layers tile along it (sky, mountains, two forest rows, cliffs and waterfalls). Each spot adds its own near props and foreground plants, and every layer scrolls at its own depth as you walk.
  - The reflection on the water is a mirrored copy of the far layers in their current scrolled position.
  - The sky is drawn in code for each time of day (stars and moon, sun, drifting clouds). The painted layers are colour-graded to match the sky, and the scene cross-fades when the spot, time or weather changes.
  - Animated water: wobbling strips, a mirrored reflection of the far shore, a moon/sun glitter path and caustics.
  - Ambient aquatic life: small schools move beneath the surface along the continuous shoreline. Their depth and movement reflect nearby habitats; feeding activity draws them together, while a moving angler briefly spooks them. In an open habitat, each school can reveal a Goop selected from the exact encounter-eligible pool for that spot, weather, time and live event state. Species colours, body proportions, fins and movement rhythms are drawn from the Goop definition; Epic and Legendary sightings receive a subtle glow. Locked and undiscovered habitats remain anonymous. Nearby eligible sightings appear in the pond HUD with the habitat name and an explicit note that a sighting is not a guaranteed bite. Schools remain ambient visual wildlife, not catchable targets; fishing probabilities, encounter eligibility, save data and game-clock rules are unchanged.
  - Weather: rain with splash rings, fog banks, storms with lightning bolts and flashes. Also fireflies, lantern and mushroom glows, and an animated waterfall.
  - Gameplay visuals: rod that bends with tension, cast arc, bobber, the Goop's shadow underwater, Goops leaping mid-fight, lunge warnings, a distinct splash/ripple/sparkle burst when the player cleanly dodges a lunge, a catch reveal with god-rays, and a line-snap recoil.
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


### Creature fight identity
- Six named apex encounters have signature-move identities that differ from their baseline pull temperament: King Gloop (Tug of War), Stormray (Swerve), Prismadrake (Rhythm), Ghostshark (Thrash), Drowned King (Current), and The Sleeper (Fake-out). Their underlying pull patterns, rarity, lunge profiles and balance values remain unchanged; the distinct move changes the skill test rather than simply increasing difficulty.


### Creature approach and bite tells
- The submerged Goop now approaches a landed lure according to its movement temperament: darting species feint quickly, pulse species bob in repeated beats, drift species circle broadly, sleepy species linger, and wild species move in layered irregular bursts.
- During the bite window, the silhouette keeps that identity and creates matching surface disturbances. These are visual tells only: they do not alter bite timing, encounter odds, hook windows, or fight balance.
- The presentation stays in the water rather than adding another HUD meter, so players can learn to read the creature and the pond itself.

### Signature moves in the water
- During fights, the submerged creature and surrounding surface now express the active signature challenge: Swerve leaves lateral dart trails, Tug of War draws a taut oscillating pull, Fake-out quiets the silhouette and water before its wake-up, Rhythm sends repeated concentric pulses, Current bends rotating flow rings, and Thrash creates sharp irregular wake marks.
- The cues are tied to the existing active move and do not alter controls, timing, difficulty, rewards, or encounter logic. They are designed to make fight identity readable without adding another HUD meter.

### Fight outcome reactions
- Resolved signature moves now trigger a short creature reaction: a successful counter makes the Goop recoil and settle, while a failed counter makes it surge toward the lure with a sharper wake.
- Reactions use the existing move outcome events and their timestamps. They expire automatically, are cleared on a new cast/catch/escape, and do not change combat state, controls, timing, rewards, or saves.
