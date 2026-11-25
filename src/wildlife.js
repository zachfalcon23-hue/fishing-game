// Deterministic, presentation-only habitat behavior for ambient wildlife.
// Inspired by Chase Da Goop's needs/action scoring, but deliberately smaller:
// these schools are visual ecosystem signals, not catchable entities or save data.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * Give each ambient school slow, repeatable hunger/energy cycles.
 * Deriving these from its stable traits avoids adding a second simulation clock.
 */
export function wildlifeNeeds(school, timeSeconds) {
  const t = Number.isFinite(timeSeconds) ? timeSeconds : 0;
  const phase = Number.isFinite(school?.phase) ? school.phase : 0;
  const chronotype = clamp(Number.isFinite(school?.chronotype) ? school.chronotype : 0, -1, 1);
  return {
    hunger: 0.5 + 0.5 * Math.sin(t * 0.095 + phase * 1.31),
    energy: 0.5 + 0.5 * Math.sin(t * 0.043 + phase * 0.77 + chronotype * 1.4),
  };
}

/**
 * Resolve a readable ambient behavior from local conditions.
 * Disturbance has priority; otherwise feeding, resting, and roaming compete
 * using simple bounded scores. The function is pure and deterministic.
 */
export function evaluateWildlifeBehavior({
  hunger = 0.5,
  energy = 0.7,
  activity = 0,
  frenzy = false,
  disturbance = 0,
  fidelity = 0.5,
  time = 'Day',
} = {}) {
  const h = clamp(Number.isFinite(hunger) ? hunger : 0.5, 0, 1);
  const e = clamp(Number.isFinite(energy) ? energy : 0.7, 0, 1);
  const siteActivity = clamp(Number.isFinite(activity) ? activity : 0, 0, 3) / 3;
  const foodSignal = clamp(siteActivity + (frenzy ? 0.45 : 0), 0, 1);
  const siteFidelity = clamp(Number.isFinite(fidelity) ? fidelity : 0.5, 0, 1);
  const alert = clamp(Number.isFinite(disturbance) ? disturbance : 0, 0, 1);

  const feedScore = h * (0.22 + foodSignal * 0.78) * (0.78 + siteFidelity * 0.22);
  const nightBias = time === 'Night' ? 0.95 : time === 'Dusk' ? 0.65 : time === 'Dawn' ? 0.38 : 0.22;
  const restScore = (1 - e) * nightBias;
  const roamScore = 0.24 + (1 - foodSignal) * 0.07;

  let state = 'roaming';
  if (alert > 0.08) state = 'fleeing';
  else if (feedScore >= restScore && feedScore > roamScore) state = 'feeding';
  else if (restScore > roamScore) state = 'resting';

  const feeding = state === 'feeding'
    ? clamp(0.42 + foodSignal * 0.42 + h * 0.16, 0, 1)
    : state === 'fleeing' ? 0 : foodSignal * 0.08;

  return {
    state,
    feeding,
    motionRate: state === 'fleeing' ? 1.65 : state === 'resting' ? 0.3 : state === 'feeding' ? 0.82 : 1,
    spacing: state === 'fleeing' ? 1.22 : state === 'feeding' ? 0.72 : 1,
    sway: state === 'fleeing' ? 1.42 : state === 'resting' ? 0.28 : state === 'feeding' ? 0.68 : 1,
  };
}

/**
 * Bounded visual return toward a school's familiar habitat.
 * Hunger and site fidelity strengthen the pull; disturbance suppresses it.
 * This changes only the school's rendered position, never encounter eligibility.
 */
export function habitatReturnOffset({
  worldX = 0,
  homeX = 0,
  hunger = 0.5,
  fidelity = 0.5,
  disturbance = 0,
  activity = 0,
  frenzy = false,
} = {}) {
  const x = Number.isFinite(worldX) ? worldX : 0;
  const home = Number.isFinite(homeX) ? homeX : x;
  const h = clamp(Number.isFinite(hunger) ? hunger : 0.5, 0, 1);
  const f = clamp(Number.isFinite(fidelity) ? fidelity : 0.5, 0, 1);
  const alert = clamp(Number.isFinite(disturbance) ? disturbance : 0, 0, 1);
  const food = clamp((Number.isFinite(activity) ? activity : 0) / 3 + (frenzy ? 0.45 : 0), 0, 1);
  const pull = (0.12 + h * 0.28 + food * 0.2) * f * (1 - alert * 0.9);
  return clamp((home - x) * pull, -180, 180);
}

// Deterministic species sightings and silhouettes for the presentation-only wildlife layer.
// The caller supplies the already-eligible encounter pool; this module never changes fishing rules.
function stableHash(value) {
  const text = String(value ?? '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}


/** Distinct, habitat-authored field clues driven by the same school needs and behavior model. */
export const HABITAT_INTERACTIONS = Object.freeze([
  { id: 'reeds-school-rise', spot: 'reeds', name: 'Schooling Surge', icon: '🌾',
    clue: 'Small schools are circling tightly along the cattails. A broader shadow holds below them.',
    description: 'Hungry schools compress against the reed edge, drawing pulse-pattern and muck-feeding Goops into the cover.',
    patterns: ['pulse', 'steady'], patternMul: 1.22, tastes: ['muck'], tasteMul: 1.16,
    rarities: ['Uncommon', 'Rare', 'Epic'], rarityMul: 1.1, timeLikes: [], timeMul: 1 },
  { id: 'dock-lantern-baitball', spot: 'dock', name: 'Lantern Baitball', icon: '🏮',
    clue: 'Tiny flashes are gathering beneath the dock lanterns. Something is feeding in the light.',
    description: 'Night-active schools gather under the lantern glow, drawing dark-water feeders toward a cast.',
    patterns: ['dart', 'sleepy'], patternMul: 1.18, tastes: ['glow', 'muck'], tasteMul: 1.12,
    rarities: ['Rare', 'Epic'], rarityMul: 1.12, timeLikes: ['Night'], timeMul: 1.18 },
  { id: 'lily-petal-drift', spot: 'lily', name: 'Petal Drift', icon: '🌸',
    clue: 'Loose petals are sliding along one quiet seam. Slow-moving shapes are following the bloom line.',
    description: 'At dawn and dusk, the petal line concentrates drifting Goops along the edge of the lilies.',
    patterns: ['drift', 'sleepy'], patternMul: 1.24, tastes: ['sweet'], tasteMul: 1.16,
    rarities: ['Uncommon', 'Rare', 'Epic'], rarityMul: 1.08, timeLikes: ['Dawn', 'Dusk'], timeMul: 1.12 },
  { id: 'boulder-eddy-break', spot: 'boulder', name: 'Eddy Break', icon: '🪨',
    clue: 'The current is folding back around the rocks. Bubbles are holding in a narrow, repeating line.',
    description: 'Rain-swollen water or heavy local feeding bends the current around the boulders, creating a seam used by pulse and dart Goops.',
    patterns: ['pulse', 'dart'], patternMul: 1.24, tastes: ['ember'], tasteMul: 1.14,
    rarities: ['Rare', 'Epic'], rarityMul: 1.1, timeLikes: [], timeMul: 1 },
  { id: 'falls-current-seam', spot: 'falls', name: 'Current Seam', icon: '💧',
    clue: 'A smooth ribbon has formed beside the falling water. Silhouettes cross it, then vanish into the spray.',
    description: 'Rain and waterfall flow create a sheltered seam that fast-moving and storm-responsive Goops cross.',
    patterns: ['dart', 'wild'], patternMul: 1.2, tastes: ['frost'], tasteMul: 1.12,
    rarities: ['Rare', 'Epic'], rarityMul: 1.1, timeLikes: [], timeMul: 1 },
  { id: 'cave-prism-echo', spot: 'cave', name: 'Prism Echo', icon: '🔮',
    clue: 'A brief band of coloured light moves across the cave pool. The ripples seem to answer it.',
    description: 'Low-angle light refracts through the cave opening at dawn and dusk, drawing slow and frost-touched residents toward the reflection.',
    patterns: ['drift', 'sleepy'], patternMul: 1.22, tastes: ['frost'], tasteMul: 1.18,
    rarities: ['Rare', 'Epic'], rarityMul: 1.12, timeLikes: ['Dawn', 'Dusk'], timeMul: 1.1 },
  { id: 'grotto-spore-bloom', spot: 'grotto', name: 'Spore Bloom', icon: '🍄',
    clue: 'The glowshrooms are releasing a soft cloud of spores. Dim lights are moving beneath the bloom.',
    description: 'Night and dusk bring a glowshroom spore release. Glow-tasting and slow-moving Goops investigate the luminous cloud.',
    patterns: ['drift', 'sleepy'], patternMul: 1.24, tastes: ['glow'], tasteMul: 1.22,
    rarities: ['Rare', 'Epic', 'Legendary'], rarityMul: 1.1, timeLikes: ['Night', 'Dusk'], timeMul: 1.12 },
  { id: 'deep-pressure-rise', spot: 'deep', name: 'Pressure Upwelling', icon: '⬇️',
    clue: 'A column of bubbles is rising from the dark water. The surface dips before each surge.',
    description: 'Night pressure shifts or storm-driven disturbance lifts deep-water residents toward the upper column.',
    patterns: ['wild', 'pulse'], patternMul: 1.18, tastes: ['ember', 'glow'], tasteMul: 1.12,
    rarities: ['Epic', 'Legendary'], rarityMul: 1.2, timeLikes: ['Night'], timeMul: 1.08 },
  { id: 'sandbar-moon-runnel', spot: 'sandbar', name: 'Moon-Tide Runnel', icon: '🌕',
    clue: 'Moonlight is tracing a narrow channel across the exposed sand. A pale wake follows the tide.',
    description: 'At full moon after dark, a shallow runnel forms across the sandbar and favours drifting and night-active residents.',
    patterns: ['drift', 'dart'], patternMul: 1.2, tastes: ['sweet'], tasteMul: 1.12,
    rarities: ['Rare', 'Legendary'], rarityMul: 1.18, timeLikes: ['Night'], timeMul: 1.1 },
  { id: 'wreck-ghost-wake', spot: 'wreck', name: 'Ghost Wake', icon: '⚓',
    clue: 'A faint wake crosses the wreck without disturbing the surface. The rigging hums in the shifting water.',
    description: 'Fog and storm currents move through the sunken rigging. Wild and darting residents become more active around the wreck.',
    patterns: ['wild', 'dart'], patternMul: 1.22, tastes: ['muck', 'glow'], tasteMul: 1.12,
    rarities: ['Rare', 'Epic', 'Legendary'], rarityMul: 1.14, timeLikes: [], timeMul: 1 },
]);

const INTERACTION_BY_SPOT = new Map(HABITAT_INTERACTIONS.map((interaction) => [interaction.spot, interaction]));

/** Resolve a clue from the existing wildlife needs/action scoring; no second ecology clock is saved. */
export function resolveHabitatInteraction({
  spot, time = 'Day', weather = 'clear', activity = 0, frenzy = false,
  fullMoon = false, timeSeconds = 0,
} = {}) {
  const definition = INTERACTION_BY_SPOT.get(spot?.id);
  if (!definition) return null;
  const seed = stableHash(spot.id);
  const school = {
    phase: (seed % 6283) / 1000,
    chronotype: ((seed >>> 5) % 5 - 2) * 0.42,
    fidelity: 0.68 + ((seed >>> 9) % 25) / 100,
  };
  const needs = wildlifeNeeds(school, (Number.isFinite(timeSeconds) ? timeSeconds : 0) + (seed % 97) * 0.13);
  const behavior = evaluateWildlifeBehavior({
    ...needs, activity, frenzy, fidelity: school.fidelity, time,
  });
  const localActivity = clamp(Number.isFinite(activity) ? activity : 0, 0, 3);
  const calm = behavior.state !== 'fleeing';
  const feeding = behavior.state === 'feeding' || frenzy
    || (localActivity >= 2 && needs.hunger >= 0.4);
  const dawnDusk = time === 'Dawn' || time === 'Dusk';
  let active = false;
  switch (spot.id) {
    case 'reeds': active = feeding; break;
    case 'dock': active = time === 'Night' && calm && (feeding || needs.hunger >= 0.35); break;
    case 'lily': active = dawnDusk && calm; break;
    case 'boulder': active = calm && (weather === 'rain' || weather === 'storm' || localActivity >= 2); break;
    case 'falls': active = calm && (weather === 'rain' || weather === 'storm' || (localActivity >= 1 && feeding)); break;
    case 'cave': active = calm && dawnDusk && (weather === 'clear' || weather === 'fog'); break;
    case 'grotto': active = calm && (time === 'Night' || time === 'Dusk') && (feeding || needs.hunger >= 0.35); break;
    case 'deep': active = calm && time === 'Night' && (weather === 'storm' || fullMoon || localActivity >= 2); break;
    case 'sandbar': active = time === 'Night' && fullMoon; break;
    case 'wreck': active = calm && (weather === 'fog' || weather === 'storm'); break;
    default: active = false;
  }
  if (!active) return null;
  return {
    ...definition,
    patterns: [...definition.patterns],
    tastes: [...definition.tastes],
    rarities: [...definition.rarities],
    timeLikes: [...definition.timeLikes],
    active: true, behavior: behavior.state, feeding: behavior.state === 'feeding',
    intensity: clamp(0.28 + localActivity * 0.12 + (frenzy ? 0.18 : 0) + needs.hunger * 0.16, 0.2, 1),
  };
}

/**
 * Choose one visible species from an existing encounter pool without consuming game RNG.
 * Keeping the selector deterministic prevents species flicker and makes rendering side-effect free.
 */
export function selectWildlifeSpecies(pool, seed = 'wildlife') {
  if (!Array.isArray(pool) || !pool.length) return null;
  const eligible = pool.filter((goop) => goop && typeof goop.id === 'string'
    && Number.isFinite(goop.weight) && goop.weight > 0);
  if (!eligible.length) return null;
  const total = eligible.reduce((sum, goop) => sum + goop.weight, 0);
  if (!Number.isFinite(total) || total <= 0) return null;
  let roll = (stableHash(seed) / 0x100000000) * total;
  for (const goop of eligible) {
    roll -= goop.weight;
    if (roll < 0) return goop;
  }
  return eligible[eligible.length - 1];
}

const SPECIES_MOTION = {
  steady: { speed: 0.78, sway: 0.46, vertical: 0.42 },
  pulse: { speed: 1.04, sway: 0.92, vertical: 0.72 },
  dart: { speed: 1.42, sway: 1.12, vertical: 0.86 },
  drift: { speed: 0.58, sway: 0.62, vertical: 0.48 },
  sleepy: { speed: 0.42, sway: 0.34, vertical: 0.28 },
  wild: { speed: 1.22, sway: 1.28, vertical: 1.08 },
};

/**
 * Stable, species-specific motion and body proportions.
 * Morphology varies by species ID; the actual palette, rarity and fight-pattern identity
 * come directly from the Goop definition.
 */
export function wildlifeDisplayProfile(goop) {
  const id = typeof goop?.id === 'string' ? goop.id : 'unknown';
  const hash = stableHash(id);
  const motion = SPECIES_MOTION[goop?.pattern] || SPECIES_MOTION.steady;
  const rarityRank = ({ Common: 0, Uncommon: 1, Rare: 2, Epic: 3, Legendary: 4 })[goop?.rarity] ?? 0;
  return {
    bodyLength: 0.84 + (hash & 255) / 255 * 0.48,
    bodyHeight: 0.76 + ((hash >>> 8) & 255) / 255 * 0.5,
    tailSpan: 0.68 + ((hash >>> 16) & 255) / 255 * 0.62,
    dorsalFin: 0.22 + ((hash >>> 24) & 15) / 15 * 0.68,
    lowerFin: 0.18 + ((hash >>> 12) & 15) / 15 * 0.48,
    speed: motion.speed,
    sway: motion.sway,
    vertical: motion.vertical,
    glow: rarityRank >= 3 ? 0.24 + rarityRank * 0.07 : 0,
  };
}

/** Suppress recognizable species in locked or undiscovered habitats. */
export function resolveWildlifeSighting(pool, seed = 'wildlife', unlocked = true) {
  return unlocked ? selectWildlifeSpecies(pool, seed) : null;
}
