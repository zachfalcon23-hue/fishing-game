# Chase Da Goop VR Conversion Assessment

**Status:** Technical assessment complete; implementation not started  
**Target hardware:** Meta Quest 3S  
**Priority:** Goop Fishing first, Hollow Reach second  
**Architecture decision:** One project at a time; share technology where it is genuinely reusable  
**Assessment date:** 26 November 2026

## Executive decision

Convert Goop Fishing into a native standalone Quest application using Unity 6, C#, OpenXR, XR Interaction Toolkit, and URP. Keep the existing browser game intact. Build the VR application in a separate Unity repository so Unity assets, Android build settings, and generated files do not complicate the browser game's source tree.

The first playable slice should be a compact North Pond / Old Dock fishing experience. Reedbed Hollow is an optional exploration side trail in the current browser game, not the main fishing location; it should not be selected as the first fishing scene by default.

Build the reusable VR foundation inside the Goop Fishing VR project first. Once its rig, input, interaction, locomotion, haptics, audio, UI, persistence, and diagnostics are stable, extract the genuinely generic parts into a versioned Unity package for Hollow Reach. Do not create a separate shared-package repository before there is a working consumer.

## 1. Repository audit

### Goop Fishing source

- Repository: https://github.com/zachfalcon23-hue/fishing-game
- Default branch: `main`
- Audited mainline commit: `11541ca5334c1d0d04a96d9717c497c29cf574bf`
- Mainline CI: [Goop Fishing CI run #45874279219](https://github.com/zachfalcon23-hue/fishing-game/actions/runs/45874279219) completed successfully on that exact commit.
- The successful workflow ran JavaScript syntax checks, the Node regression suite, the source-derived economy audit, desktop/mobile Playwright smoke tests, and release-readiness browser checks.
- The latest mainline README describes a dependency-light browser game with 86 Goop species, 10 pond spots, three connected views (Pond, Wiggs' Bait Shack, Aquarium), six signature fight styles, progression, collections, quests, equipment, and persistent saves.
- The browser project is not a Unity project and contains no OpenXR or Meta Quest integration.

### Existing Goop Fishing architecture

| File / area | Current responsibility | VR treatment |
|---|---|---|
| `src/game.js` | Game rules and state; documented as having no DOM access | Primary source for the C# domain port and parity fixtures |
| `src/wildlife.js` | Habitat/wildlife behavior and interactions | Port relevant gameplay rules; replace visual-only behavior as needed |
| `src/scene.js` | 1920×1080 Canvas shoreline renderer, parallax, water, weather, Goop visuals | Art-direction/reference source only; replace with Unity 3D rendering |
| `src/main.js` | DOM/HUD, browser input, game loop, view switching, exploration overlay | Replace with Unity input, XR interactions, and world-space UI |
| `src/audio.js` | Procedural Web Audio effects and ambience | Rebuild using Unity audio and spatial audio |
| `src/aquarium.js` | Aquarium presentation | Rebuild as a later VR room or world-space tank |
| SaveStore in game layer | Browser save/recovery behavior | Implement a native save repository and explicit import path |

The separation between game rules and Canvas/DOM presentation is a strong conversion advantage. We should port the rules, not attempt to embed the browser UI inside a headset.

### Asset inventory

The current `assets/` tree contains 115 files: 108 WebP files, one SVG, four WOFF2 fonts, and two text files. The inventory contains no GLB, glTF, FBX, OBJ, Blender, USD, or USDZ models.

Consequences:

- Existing Goop portraits, environmental art, UI art, and brand elements can inform menus, collection cards, decals, textures, and visual direction, subject to confirming the original asset-kit licences for the intended distribution.
- The current 2D art does not constitute a production 3D asset library.
- The VR project needs a deliberate 3D art pipeline for the fishing rod/reel, bobber, line, dock, shoreline props, water, and at least the first playable Goop creature.
- Do not promise 86 fully modelled and animated creatures in the first vertical slice.

## 2. Hollow Reach audit for the second conversion

- Repository: https://github.com/zachfalcon23-hue/chase-da-goop
- Default integration branch: `dev`
- Audited merge commit: `64bedd5ab20ed5ec2785ce5b2a0fa8f68669b1a0`
- The primary playable experience is a 2D top-down Glasswater Marsh expedition. The existing 3D world is explicitly documented as a separate three.js r155 look-test, not the primary game.
- The simulation, research, and save modules are deliberately separated from DOM rendering. The world advances on fixed one-game-minute ticks and uses seeded random state.
- Existing systems include autonomous Goop behavior, observations and field watches, evidence-backed hypotheses, manuscript versions, deterministic peer review, local stewardship effects, and save validation/migration.
- The 3D look-test, character bench, and original supplied assets provide useful visual/asset references. Asset formats, rig compatibility, and licences must be audited before deciding what can be imported into Unity.
- The latest `dev` workflow run [#45766589123](https://github.com/zachfalcon23-hue/chase-da-goop/actions/runs/45766589123) reports both jobs failed with no recorded steps. This is not evidence that application assertions failed; it is an unresolved CI execution/setup issue. Do not report Hollow Reach CI as green until a run actually executes the jobs.

Hollow Reach should be converted only after the Goop Fishing VR foundation is proven. Port its deterministic simulation and research rules into a Unity-independent C# domain layer; keep Unity responsible for rendering, input, animation, spatial audio, and VR presentation.

## 3. Target architecture

### Repository boundaries

1. Keep `fishing-game` as the authoritative browser game.
2. Create a separate `goop-fishing-vr` Unity repository for the native Quest application.
3. Initially keep the reusable package under the Unity project at `Packages/com.chasedagoop.vr-core`.
4. After Goop Fishing has a working vertical slice, extract and version the generic package for reuse by Hollow Reach.
5. Keep Hollow Reach's browser repository and existing runtime intact.

This avoids mixing Unity's large binary/imported asset workload with the browser game's small source tree and keeps each product independently releasable.

### Unity project layers

- **VR Core package:** XR Origin/player rig, action maps, controller abstraction, grab/interact primitives, teleport and snap-turn locomotion, haptics, spatial-audio helpers, world-space UI patterns, persistence interfaces, diagnostics.
- **Goop Fishing domain:** species, habitats, encounter selection, bait/equipment modifiers, cast/bite/hook/fight state machine, signature moves, catch grading, rewards, progression, quests, collections.
- **Goop Fishing presentation:** North Pond scene, water and weather, fishing equipment models, Goop models/animations, shop, GoopDex, Aquarium, spatial audio and effects.
- **Platform layer:** OpenXR/Quest configuration, Android build settings, device capabilities, performance profiling.

The domain layer should be plain C# and should not depend on UnityEngine. Unity components adapt controller input and presentation to the domain.

### Initial technology stack

- Unity 6 LTS (pin one exact editor patch for the project).
- Universal Render Pipeline (URP).
- XR Plug-in Management and Unity OpenXR Plugin.
- XR Interaction Toolkit and Input System.
- Meta OpenXR features / Meta XR SDK only where a required Quest capability is not covered by standard OpenXR.
- Android ARM64 standalone build.
- Git LFS for large binary art/audio/model assets; commit Unity project settings and package lock files, not generated Library/Temp/Build folders.

Do not pin package versions in this assessment. Resolve and lock mutually compatible versions when the Unity project is created.

## 4. Goop Fishing VR vertical slice

### First environment

Start with a small Old Dock / North Pond section. Keep the scene bounded and optimize for a complete fishing loop. The existing Reedbed Hollow side trail can be adapted as a later exploration feature.

### First-slice scope

- Quest 3S launches a standalone application.
- XR Origin, head tracking, both controllers, and controller haptics work.
- Player can teleport along a small safe shoreline and use snap turning.
- Player can pick up and hold one fishing rod.
- Player can cast using controller movement and a calibrated release gesture.
- Bobber lands in the water; the fishing line is visible and behaves plausibly.
- One or two initial Goop species can approach, bite, be hooked, fight, and be landed.
- Reeling and line tension are understandable without relying on a flat-screen HUD.
- Catch reveal, keep/sell decision, and save/reload work.
- A compact world-space UI shows essential state without blocking the fishing view.

### Controller interaction proposal

- Dominant hand: rod grip and rod orientation; cast gesture from a calibrated controller velocity/release.
- Non-dominant hand: reel interaction using a tracked crank/rotation gesture, with an accessible button/trigger alternative.
- Trigger: context interaction / hook action, configurable to avoid conflicting with grip.
- Grip: pick up / hold rod and physical equipment.
- Thumbstick: menu navigation; locomotion is teleport-first with optional smooth movement and snap turning.
- Haptics and spatial audio communicate bite, line tension, lunge, signature-move success/failure, and catch.

Do not make raw controller velocity the only casting input. Use calibration, bounded power, release detection, and a fallback cast control so players with different arm movement can play comfortably.

### Porting and parity

- Inventory the authoritative rules and state transitions in `src/game.js` and `src/wildlife.js`.
- Extract/record canonical data for species, rarity, habitats, bait tastes, gear, fight patterns, and rewards.
- Port the domain rules to C# with deterministic seeded randomness.
- Create cross-implementation test vectors from the browser game for encounter eligibility, bite modifiers, hook grades, fight transitions, signature-move outcomes, catch grade, rewards, and save migration.
- Compare discrete outcomes exactly where possible; document any intentional differences in physics-driven presentation.
- Keep browser and VR save formats separate initially. Provide an explicit browser-save import/export path only after the native schema and migration tests are stable. Never silently overwrite a browser save.

## 5. Quest 3S performance and comfort

Initial target: stable 72 FPS at a supported refresh mode. Profile before attempting 90 FPS. Do not optimize for headline polygon counts; optimize for stable frame pacing and comfortable interaction.

- URP, single-pass/multiview stereo where supported, baked lighting where practical, LODs, occlusion culling, texture compression, and controlled shader complexity.
- Water should use a Quest-appropriate shader and restrained transparency/refraction; avoid expensive full-screen effects.
- Pool transient effects and frequently created objects.
- Keep simulation update cadence independent of rendering frame rate.
- Profile CPU, GPU, memory, thermal behavior, and frame timing on physical Quest 3S hardware.
- Teleport-first movement, snap turn, seated/standing calibration, adjustable reach, and comfort settings.
- A desktop Editor run is not acceptance evidence for standalone Quest performance.

## 6. Milestones and acceptance gates

### M0 — Audit and specification
- Confirm authoritative game source and current mainline commit.
- Inventory rules, save schema, assets, licenses, and manual test gaps.
- Produce data mapping and C# port plan.

**Exit:** reviewed technical specification and source-to-domain mapping.

### M1 — Unity/OpenXR foundation
- Create the separate Unity project and Quest Android build configuration.
- Add XR Origin, OpenXR, action maps, haptics, teleport, snap turn, and a simple test scene.
- Build and install on Quest 3S.

**Exit:** physical headset build with reliable tracking and input.

### M2 — Fishing interaction prototype
- Rod pickup, calibrated cast, line, bobber, bite cue, hook action, basic reel, and haptics.

**Exit:** player can cast, get a bite, hook, and land a test catch on Quest 3S.

### M3 — Domain parity and complete loop
- Port encounter/fight/reward rules.
- Add initial Goop model and fight reactions.
- Add catch result and native save/load.

**Exit:** a complete, repeatable cast-to-catch-to-save loop with parity tests.

### M4 — Vertical slice polish
- Old Dock environment, audio, water, UI, accessibility, performance, and manual playtesting.

**Exit:** a self-contained Quest 3S vertical slice; all known defects recorded.

### M5 — Hollow Reach VR foundation
- Extract generic VR Core package.
- Create separate Hollow Reach Unity project.
- Prototype Glasswater Marsh and port the fixed-tick simulation.

**Exit:** a playable VR field observation loop, not a rushed full-game conversion.

## 7. Repository and verification policy

- No changes to the existing browser game are required to begin the Unity prototype.
- Keep the VR application isolated in its own repository and version-control branch strategy.
- Use local Unity tests and local device builds as the primary verification path; do not depend on paid hosted runner credits.
- Hosted CI may be used only where existing free capacity is available and does not consume a user-requested runner budget.
- Record exact source commit, Unity editor version, package versions, APK build identifier, headset firmware, and test results for each milestone.
- A milestone is not complete until the APK installs and the stated acceptance criteria pass on the physical headset.

## 8. Open decisions before implementation

1. Confirm the intended 3D visual style for Goop Fishing: stylized 3D faithful to the existing Goop art, or more realistic fishing simulation.
2. Confirm dominant-hand preference and whether casting should be gesture-only or include an accessibility assist.
3. Decide whether VR progression begins fresh or supports importing an existing browser save.
4. Inspect and verify licences for the source art kits before reusing them in a standalone commercial distribution.

## Immediate next implementation task

Create the separate Unity Goop Fishing VR project, pin the Unity/OpenXR/XR Interaction Toolkit package set, and deliver the M1 Quest 3S foundation build. Do not begin mass creature modelling or full habitat production until the player rig and fishing interaction prototype work on the headset.
