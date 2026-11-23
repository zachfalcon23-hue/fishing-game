# Goop Fishing — Mainline Release Readiness

This checklist describes the current mainline game, not the older Pondbound 0.4 snapshot. It separates implemented scope from evidence required to call a release verified.

## Current mainline scope

The repository README currently documents:

- 86 Goop species across five rarity tiers.
- Ten fishing spots, including three condition-gated secret places.
- Three connected views: The Pond, Wiggs' Bait Shack, and the Aquarium.
- A 13-chapter Old Wiggs story, daily bounties, field notes, collections, buddy progression, and achievements.
- Cast, bite, hook, and skill-fight gameplay, with six signature fight styles and multi-stage Epic/Legendary encounters.
- Species-specific catch size/weight records, shiny catches, and GoopDex progression.
- Day/night, weather, feeding frenzy, visitors, and full-moon conditions.
- Rods, skins, bobbers, lines, lures, bait, charms, and other fishing equipment.
- Aquarium tanks, residents, feeding, decorations, backdrops, and visitor tips.
- A browser build published through GitHub Pages.

These are documented features, not a claim that every release check below has passed.

## Integration notes — 2026-11-23

- PR #32, autonomous ambient pond wildlife, is merged into main.
- PR #33 adds species-aware wildlife sightings using the live encounter pool. It is still draft until its Node regression suite and browser playtest are validated.
- The older `feature/maximal-one-shot-v0-2` branch is not a safe wholesale merge target. Its base is substantially behind current main and its snapshot omits current mainline scene, aquarium, audio, wildlife, and art assets. Its game-engine, HTML, browser-smoke, telemetry, and economy files target an older interface and require selective porting or replacement.
- The old browser smoke script targets the Pondbound 0.4 UI and save key; it must not be treated as a current-mainline test.
- The old telemetry adapter assumes different game fields and a sell/keep flow not present in the current mainline API. Do not integrate it without an explicit adapter and tests.
- The old economy audit models a 50-species, five-zone build. Its figures are not valid for the current 86-species, ten-spot mainline and must be recalculated from current source before use.

## Automated release gates

Run these against the exact candidate commit:

- [ ] `npm run check` passes.
- [ ] `npm test` passes with zero failures.
- [ ] The GitHub Actions validation workflow passes on the candidate commit.
- [ ] The test run includes the species-aware wildlife suite after PR #33 is integrated.
- [ ] A current browser smoke suite is available and passes on desktop and mobile viewports.
- [ ] Browser smoke coverage checks startup, primary navigation, GoopDex, casting, bite/hook/fight, catch resolution, reload/save behavior, console errors, and failed local assets.
- [ ] Any failed or skipped check is explained; runner-allocation failures are not counted as passing tests.

## Core gameplay validation

- [ ] A new save starts correctly and the first cast can be completed.
- [ ] Bite timing, hook timing grades, tension handling, patience/rhythm handling, and all six signature moves work as described.
- [ ] Rare, Epic, and Legendary encounters have the intended difficulty and stage transitions.
- [ ] Catch rewards, specimen measurements, GoopDex discovery, records, shinies, and collections update consistently.
- [ ] Each of the ten spots becomes available at its intended progression point.
- [ ] The three secret locations reveal only under their stated conditions.
- [ ] Day/night, weather, feeding frenzy, visitors, full-moon effects, and habitat eligibility remain consistent between the scene and encounter rules.
- [ ] Tackle purchases, equipment selection, bait consumption, lure levels, and modifiers work and persist.
- [ ] Old Wiggs' chapters, daily bounties, rumours, rewards, and quest-only encounters progress correctly.
- [ ] Aquarium placement, storage, feeding, tank capacity, decorations, themes, and visitor tips work correctly.
- [ ] Ambient wildlife remains presentation-only and does not consume encounter RNG or alter fishing outcomes.
- [ ] Species-aware sightings never reveal locked/undiscovered habitats and never imply that a sighting guarantees a bite.

## Save, accessibility, and device validation

- [ ] Existing player saves load without losing GoopDex, Essence, equipment, quests, or Aquarium state.
- [ ] A refreshed page restores the expected progression and game state.
- [ ] Corrupted or unavailable local storage produces safe, understandable behavior.
- [ ] Keyboard controls work and focus remains visible.
- [ ] Primary controls are usable on a touch screen and meet the project's target-size expectations.
- [ ] Reduced-motion behavior is respected.
- [ ] Screen-reader labels and live announcements describe important game state and catch/fight feedback.
- [ ] Audio can be enabled/disabled and does not produce stuck or accumulating audio nodes.
- [ ] Test at representative desktop and mobile sizes; separately verify physical Android/iOS browsers before release.

## Release decision

Release only when the automated gates pass on the final commit and the manual gameplay, save, accessibility, audio, and device checks have been completed and recorded. A previously green run on an older commit does not validate a newer candidate.
