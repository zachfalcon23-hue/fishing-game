# Goop Fish Art Production Manifest

Status: production kickoff  
Target: replace the current CSS-only GoopDex fish silhouettes with original, species-specific creature art while preserving the fishing simulation, species IDs, save format, catch records, and progression.

## Art direction and delivery rules

- One isolated creature per source image; no collages or contact sheets.
- Full body visible, three-quarter view facing right, readable silhouette, consistent camera and scale.
- Glossy, translucent, highly tactile slime material with thick drips, rounded organic forms, expressive eyes, and species-specific anatomy.
- Each species must read as a fish/creature first and as a Goop second. Avoid generic recolors.
- Transparent-background production exports; keep a clean alpha edge and no ground shadow unless a scene specifically needs one.
- Target export: WebP with alpha, 512x512 for GoopDex cards; preserve a high-resolution master for future use.
- Keep species IDs as filenames: `public/assets/goops/<species-id>.webp`.
- Do not change game balance or fish data to accommodate art.

## Existing roster (source of truth: `src/game.js`)

### North Pond
`gloop`, `murkling`, `flicker`, `puddlit`, `drowsy`, `voidling`, `sprout`, `bubblegum`, `tadgoop`, `mudball`, `oldboot`, `reedlet`, `pebblit`, `splashkin`, `willowisp`, `rootwhisper`

### Sunken Hollow
`murkling`, `puddlit`, `voidling`, `briney`, `glimmer`, `mossback`, `ripple`, `nightcap`, `kelpkin`, `inkblot`, `lanternfin`, `siltwhisker`, `mireling`, `lanternlurker`

### Ember Creek
`flicker`, `drowsy`, `flarefin`, `cinder`, `sizzle`, `sunspot`, `sprout`, `glimmer`, `sunbud`, `emberoot`, `coppersnap`, `steamfin`, `charflare`, `cindercoil`

### Moonlit Bay
`voidling`, `nightcap`, `lunar`, `ghostfin`, `starry`, `briney`, `ripple`, `stormblob`, `moonmote`, `tidetwirl`, `abyssaloo`, `cometide`, `moonveil`

### Crystal Reach
`glimmer`, `starry`, `crystalisk`, `prism`, `ghostfin`, `lunar`, `mossback`, `sunspot`, `sapphire`, `quartzle`, `opalisk`, `shardfin`, `auroragloop`, `glacieroo`, `prismwisp`

The roster contains shared species across zones. Produce one canonical image per unique `fish.id`, not duplicate files per zone. The current code defines 55 unique fish records; the hidden-species entries are included in the roster above.

## Batch plan

1. **Batch 01 — visual language prototypes:** four exploratory fish concepts generated locally (green slime fish, amber puffer, blue angler, teal whiskered fish). These are style exploration only and are not yet committed or mapped to canonical species IDs.
2. **Batch 02 — starter-water identities:** Gloop, Murkling, Flicker, Puddlit, Drowsy, Sproutfin, Bubblegum, Tadgoop.
3. **Batch 03 — pond and hollow residents:** Mudball, Old Boot, Reedlet, Pebblit, Splashkin, Willowisp, Briney, Glimmer, Mossback, Ripple, Nightcap.
4. **Batch 04 — hollow specialists:** Kelpkin, Inkblot, Lanternfin, Siltwhisker, Mireling, Rootwhisper, Lanternlurker.
5. **Batch 05 — ember residents:** Flarefin, Cinder, Sizzle, Sunspot, Sunbud, Emberoot, Coppersnap, Steamfin, Charflare, Cindercoil.
6. **Batch 06 — moonlit residents:** Lunar Goo, Ghostfin, Starry, Stormblob, Moonmote, Tidetwirl, Abyssaloo, Cometide, Moonveil.
7. **Batch 07 — crystal residents:** Crystalisk, Prism, Sapphire Slime, Quartzle, Opalisk, Shardfin, Aurora Gloop, Glacieroo, Prismwisp.
8. **Batch 08 — integration and polish:** verify all 55 IDs have art, add image loading/fallbacks, responsive card rendering, unknown-species silhouettes, image caching, and regression coverage.

## Integration contract

- The art lookup is keyed by existing `fish.id`; never key by display name.
- Missing art must gracefully fall back to the existing procedural silhouette.
- Undiscovered species must remain obscured; do not reveal art for locked/unknown Goops in the GoopDex.
- Fishing-scene rendering can adopt the same art only after checking canvas image loading, scaling, layering, and animation behavior.
- Keep all existing data, controls, fight mechanics, telemetry, and save migrations unchanged.
- Every integration change must pass `npm run check` and `npm test`; browser smoke tests remain required when the runner is available.

## Current implementation status

- [x] Create isolated art branch: `art/goop-fish-concepts-01`
- [x] Record the authoritative roster and production contract
- [ ] Generate canonical species-specific art for all 55 IDs
- [x] Commit first transparent image asset: `public/assets/goops/gloop.webp` (Gloop prototype)
- [ ] Commit remaining concept assets and complete the canonical 55-species art set
- [x] Integrate discovered-species GoopDex image rendering with safe fallback (Gloop wired; other species retain procedural art)
- [x] Integrate Gloop into the fishing-scene renderer with procedural fallback for all other species
- [ ] Validate all art paths and undiscovered-state privacy
