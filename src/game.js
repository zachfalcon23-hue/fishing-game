// Goop Fishing — game rules and state. No DOM access in this file so it can be unit tested in Node.

export const PHASES = Object.freeze({
  IDLE: 'idle', CAST: 'cast', BITE: 'bite', FIGHT: 'fight', CAUGHT: 'caught', ESCAPED: 'escaped',
});

export const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
const BY_RARITY = {
  Common: { weight: 40, essence: 9, stamina: 1, force: 1, size: [8, 24] },
  Uncommon: { weight: 16, essence: 15, stamina: 1.05, force: 1.03, size: [14, 34] },
  Rare: { weight: 6, essence: 26, stamina: 1, force: 1.08, size: [22, 50] },
  Epic: { weight: 2, essence: 44, stamina: 1.2, force: 1.14, size: [34, 72] },
  Legendary: { weight: 0.9, essence: 110, stamina: 1.35, force: 1.22, size: [60, 130] },
};
const PATTERN_HINT = {
  steady: 'A steady tug. Keep your rhythm.',
  pulse: 'Short pulses, then a pause.',
  dart: 'Quick surges. Ease off between them.',
  drift: 'Slow drifting tension. Stay centered.',
  sleepy: 'Gentle movement with sudden wake-ups.',
  wild: 'Unpredictable bursts. Watch the tells.',
};

/**
 * Species. `spots` are the pond spots it lives in. `likes` multiplies its odds in matching
 * conditions; `needs` are hard requirements (it never bites otherwise).
 */
function sp(id, name, rarity, spots, color, pattern, o = {}) {
  const r = BY_RARITY[rarity];
  return {
    id, name, rarity, spots, color, pattern,
    weight: o.weight ?? r.weight,
    stamina: o.stamina ?? r.stamina,
    force: o.force ?? r.force,
    essence: o.essence ?? r.essence,
    size: o.size ?? r.size,
    hint: o.hint ?? PATTERN_HINT[pattern],
    ...(o.likes ? { likes: o.likes } : {}),
    ...(o.needs ? { needs: o.needs } : {}),
  };
}

export const GOOPS = [
  // the original ten (ids and stats kept so old saves carry over)
  sp('gloop', 'Gloop', 'Common', ['dock', 'lily'], '#73f27c', 'steady', { weight: 42, stamina: 1, essence: 8, force: 1 }),
  sp('murkling', 'Murkling', 'Common', ['dock', 'reeds'], '#69b7e8', 'pulse', { weight: 28, stamina: 1.2, essence: 10 }),
  sp('sploot', 'Sploot', 'Common', ['reeds', 'boulder'], '#c8e86b', 'pulse', { weight: 26, stamina: 0.95, essence: 9, hint: 'Splashy and impatient. Ease off on each pulse.' }),
  sp('flicker', 'Flicker', 'Uncommon', ['dock', 'lily'], '#f3d96b', 'dart', { stamina: 0.85, essence: 14, likes: { time: ['Day'] } }),
  sp('puddlit', 'Puddlit', 'Uncommon', ['lily', 'reeds'], '#e9a2ff', 'drift', { stamina: 1.1, essence: 16, likes: { weather: ['rain'] } }),
  sp('drowsy', 'Drowsy', 'Rare', ['dock', 'grotto'], '#ff9f91', 'sleepy', { stamina: 0.9, essence: 22, likes: { time: ['Night', 'Dawn'] } }),
  sp('mistfin', 'Mistfin', 'Rare', ['reeds', 'falls'], '#b9d6e8', 'drift', { essence: 26, likes: { weather: ['fog'] }, hint: 'It hides in the fog and tugs in long waves.' }),
  sp('lumen', 'Lumen', 'Rare', ['grotto', 'deep'], '#7ff0ff', 'dart', { stamina: 0.9, essence: 28, likes: { time: ['Night'] }, hint: 'Glows when it surges. Watch the flashes.' }),
  sp('voidling', 'Voidling', 'Epic', ['grotto', 'deep'], '#a39aff', 'wild', { stamina: 1.65, essence: 35 }),
  sp('stormling', 'Stormling', 'Epic', ['falls', 'deep'], '#ffe46b', 'wild', { stamina: 1.5, essence: 45, likes: { weather: ['storm'] }, hint: 'Crackling with energy. It loves a good storm.' }),

  // The Old Dock
  sp('bubblegum', 'Bubblegum', 'Common', ['dock', 'lily'], '#ff9a3c', 'pulse'),
  sp('dripfin', 'Dripfin', 'Common', ['dock'], '#b050ff', 'pulse'),
  sp('mudmouth', 'Mudmouth', 'Common', ['dock', 'reeds'], '#b08a50', 'steady'),
  sp('slimeperch', 'Slimeperch', 'Uncommon', ['dock'], '#c060ff', 'steady'),
  sp('lanternfin', 'Lanternfin', 'Uncommon', ['dock', 'deep'], '#3d6cff', 'dart', { likes: { time: ['Night'] } }),
  sp('kinggloop', 'King Gloop', 'Legendary', ['dock'], '#ffd23a', 'wild', { needs: { time: ['Dawn'] }, hint: 'The king of the pond. It answers to no one.' }),

  // Lily Cove
  sp('blushkoi', 'Blushkoi', 'Common', ['lily'], '#ff9ad8', 'drift'),
  sp('gumdrop', 'Gumdrop', 'Common', ['lily'], '#ff7ac8', 'drift'),
  sp('driptail', 'Driptail', 'Common', ['lily'], '#d060ff', 'drift'),
  sp('jellygill', 'Jellygill', 'Common', ['lily', 'grotto'], '#ff60c8', 'drift'),
  sp('veilfin', 'Veilfin', 'Uncommon', ['lily'], '#c070ff', 'drift'),
  sp('jellykoi', 'Jellykoi', 'Uncommon', ['lily'], '#d070ff', 'drift', { likes: { time: ['Dawn'] } }),
  sp('jellytrout', 'Jellytrout', 'Uncommon', ['lily'], '#e0a0ff', 'drift'),
  sp('goldkoi', 'Goldgoop Koi', 'Rare', ['lily'], '#ffc83a', 'steady', { likes: { time: ['Day'] } }),
  sp('jellytail', 'Jellytail', 'Rare', ['lily'], '#ff70d0', 'drift', { likes: { time: ['Dusk'] } }),
  sp('coralgoop', 'Coralgoop', 'Rare', ['lily'], '#ff6aa8', 'pulse'),
  sp('prismgill', 'Prismgill', 'Epic', ['lily'], '#ff9aff', 'dart', { likes: { weather: ['rain'] } }),
  sp('stardrift', 'Stardrift', 'Epic', ['lily', 'deep'], '#c88aff', 'drift', { needs: { time: ['Night'], weather: ['clear'] }, hint: 'Swims only under a clear night sky.' }),

  // Cattail Reeds
  sp('bogbelly', 'Bogbelly', 'Common', ['reeds'], '#6a9a3a', 'steady'),
  sp('mireback', 'Mireback', 'Common', ['reeds'], '#8a9a3a', 'steady'),
  sp('mirecarp', 'Mirecarp', 'Uncommon', ['reeds'], '#8a7a3a', 'steady'),
  sp('swampgill', 'Swampgill', 'Uncommon', ['reeds'], '#7aa83a', 'steady', { likes: { weather: ['fog'] } }),
  sp('mosskarp', 'Mosskarp', 'Uncommon', ['reeds'], '#7ac83a', 'steady'),
  sp('toxitail', 'Toxitail', 'Uncommon', ['reeds'], '#e8e040', 'pulse'),
  sp('plumfin', 'Plumfin', 'Uncommon', ['reeds', 'grotto'], '#b060e0', 'steady', { likes: { time: ['Dusk'] } }),
  sp('venomfin', 'Venomfin', 'Rare', ['reeds'], '#8ae030', 'dart'),
  sp('toxibass', 'Toxibass', 'Rare', ['reeds', 'boulder'], '#b8f02a', 'pulse', { likes: { weather: ['rain'] } }),

  // Slime Boulders
  sp('sludgejaw', 'Sludgejaw', 'Uncommon', ['boulder'], '#e0402a', 'pulse'),
  sp('meltjaw', 'Meltjaw', 'Uncommon', ['boulder'], '#ff4a3a', 'dart'),
  sp('magmamin', 'Magmamin', 'Uncommon', ['boulder'], '#ff8a2a', 'pulse'),
  sp('magmatail', 'Magmatail', 'Uncommon', ['boulder', 'deep'], '#ff6a2a', 'pulse'),
  sp('geodeback', 'Geodeback', 'Rare', ['boulder'], '#5ac8ff', 'steady'),
  sp('nuggetfin', 'Nuggetfin', 'Rare', ['boulder'], '#ffcc33', 'steady', { likes: { time: ['Day'] } }),
  sp('oilspill', 'Oilspill', 'Rare', ['boulder', 'deep'], '#a040ff', 'dart', { likes: { weather: ['storm'] } }),
  sp('lavagill', 'Lavagill', 'Rare', ['boulder', 'deep'], '#ff6a1a', 'pulse'),
  sp('wastebloater', 'Wastebloater', 'Epic', ['boulder', 'reeds'], '#a8e030', 'pulse', { likes: { weather: ['storm'] } }),

  // Waterfall Inlet
  sp('glidegloop', 'Glidegloop', 'Uncommon', ['falls', 'lily'], '#4aa8ff', 'drift'),
  sp('crystalgill', 'Crystalgill', 'Uncommon', ['falls'], '#7aa8ff', 'steady'),
  sp('glacierfin', 'Glacierfin', 'Uncommon', ['falls'], '#5aa8ff', 'steady', { likes: { weather: ['fog'] } }),
  sp('cloudgill', 'Cloudgill', 'Uncommon', ['falls'], '#c8b0ff', 'drift', { likes: { weather: ['fog'] } }),
  sp('crystalfin', 'Crystalfin', 'Rare', ['falls'], '#7ad8ff', 'steady'),
  sp('shardfin', 'Shardfin', 'Rare', ['falls'], '#8ab8ff', 'steady'),
  sp('sparkfin', 'Sparkfin', 'Rare', ['falls'], '#3a8aff', 'dart', { likes: { weather: ['storm'] } }),
  sp('voltfin', 'Voltfin', 'Rare', ['falls'], '#3ab8ff', 'dart', { likes: { weather: ['storm', 'rain'] } }),
  sp('prismfin', 'Prismfin', 'Epic', ['falls'], '#a0f0ff', 'dart', { likes: { time: ['Day'] } }),
  sp('stormray', 'Stormray', 'Epic', ['falls'], '#4a8aff', 'drift', { needs: { weather: ['storm'] }, hint: 'Rides the lightning. Only seen in storms.' }),
  sp('prismadrake', 'Prismadrake', 'Legendary', ['falls'], '#ff9ae0', 'wild', { needs: { weather: ['rain'], time: ['Day', 'Dawn'] }, hint: 'A living rainbow. It wakes when sunlight meets rain.' }),
  sp('aurorafin', 'Aurorafin', 'Legendary', ['falls'], '#ffd84a', 'wild', { needs: { time: ['Dusk'], weather: ['clear'] }, hint: 'Shimmers like the evening sky.' }),

  // Glowshroom Grotto
  sp('jellyglow', 'Jellyglow', 'Uncommon', ['grotto'], '#e070ff', 'drift', { likes: { time: ['Night'] } }),
  sp('bonepool', 'Bonepool', 'Rare', ['grotto'], '#c08aff', 'sleepy', { likes: { time: ['Night'] } }),
  sp('ectofish', 'Ectofish', 'Rare', ['grotto'], '#6aff9a', 'sleepy', { likes: { time: ['Night', 'Dusk'] } }),
  sp('starslime', 'Starslime', 'Epic', ['grotto', 'deep'], '#8a6aff', 'drift', { needs: { time: ['Night', 'Dusk'] } }),
  sp('phantomfin', 'Phantomfin', 'Epic', ['grotto'], '#9ff0ff', 'sleepy', { needs: { time: ['Night'] }, hint: 'A ghost of the grotto. Never seen by daylight.' }),
  sp('voidripper', 'Voidripper', 'Epic', ['grotto'], '#a03aff', 'wild', { likes: { weather: ['storm'] } }),
  sp('nightmire', 'Nightmire', 'Legendary', ['grotto'], '#8a2aff', 'wild', { needs: { time: ['Night'], weather: ['fog'] }, hint: 'Born of fog and darkness.' }),

  // The Deep Drop
  sp('goopshark', 'Goopshark', 'Rare', ['deep'], '#8a50c8', 'dart'),
  sp('lavaflow', 'Lavaflow', 'Rare', ['deep'], '#ff7a1a', 'pulse'),
  sp('magmafin', 'Magmafin', 'Epic', ['deep'], '#ff5a1a', 'pulse'),
  sp('embergill', 'Embergill', 'Epic', ['deep'], '#ff3a1a', 'pulse', { likes: { time: ['Dusk'] } }),
  sp('voidfin', 'Voidfin', 'Epic', ['deep'], '#7a3aff', 'wild', { needs: { time: ['Night'] } }),
  sp('abyssmelt', 'Abyssmelt', 'Legendary', ['deep'], '#6a4aff', 'wild', { needs: { time: ['Night'] }, hint: 'Its jaws open only in the dead of night.' }),
  sp('abyssgloop', 'Abyssgloop', 'Legendary', ['deep'], '#c03aff', 'wild', { needs: { weather: ['storm'] }, hint: 'Storms stir it up from the bottom.' }),
];

// The pond's fishing spots, in walking order along the shore. `unlockAt` is the number of
// GoopDex entries needed before the path to the spot is clear.
const SPOT_DEFS = [
  { id: 'dock', name: 'The Old Dock', unlockAt: 0, essenceMul: 1, rareMul: 1, biteMin: 1.0, biteMax: 3.0, desc: 'Lantern-lit planks over open water. Every journey starts here.' },
  { id: 'lily', name: 'Lily Cove', unlockAt: 0, essenceMul: 1.1, rareMul: 1.05, biteMin: 1.0, biteMax: 2.8, desc: 'A sheltered cove of lily pads and pink blooms.' },
  { id: 'reeds', name: 'Cattail Reeds', unlockAt: 4, essenceMul: 1.2, rareMul: 1.1, biteMin: 0.9, biteMax: 2.6, desc: 'Cattails, moss and murky shallows.' },
  { id: 'boulder', name: 'Slime Boulders', unlockAt: 10, essenceMul: 1.3, rareMul: 1.15, biteMin: 1.1, biteMax: 3.0, desc: 'Slime-streaked boulders where tough Goops lurk.' },
  { id: 'falls', name: 'Waterfall Inlet', unlockAt: 18, essenceMul: 1.4, rareMul: 1.25, biteMin: 1.0, biteMax: 2.8, desc: 'Cold, churning water under the falls.' },
  { id: 'grotto', name: 'Glowshroom Grotto', unlockAt: 26, essenceMul: 1.5, rareMul: 1.35, biteMin: 1.2, biteMax: 3.2, desc: 'Glowing mushrooms over still, dark water.' },
  { id: 'deep', name: 'The Deep Drop', unlockAt: 36, essenceMul: 1.8, rareMul: 1.6, biteMin: 1.3, biteMax: 3.6, desc: 'The pond floor drops away. Legends sleep here.' },
];
export const SPOTS = SPOT_DEFS.map((s) => ({ ...s, goops: GOOPS.filter((g) => g.spots.includes(s.id)).map((g) => g.id) }));

// Field notes hidden along the shore. Each one reveals where and when a rare Goop bites.
export const NOTES = [
  { id: 'n-dock-1', spot: 'dock', reveals: 'kinggloop' }, { id: 'n-dock-2', spot: 'dock', reveals: 'drowsy' },
  { id: 'n-lily-1', spot: 'lily', reveals: 'stardrift' }, { id: 'n-lily-2', spot: 'lily', reveals: 'jellytail' },
  { id: 'n-reeds-1', spot: 'reeds', reveals: 'mistfin' }, { id: 'n-reeds-2', spot: 'reeds', reveals: 'toxibass' },
  { id: 'n-boulder-1', spot: 'boulder', reveals: 'oilspill' }, { id: 'n-boulder-2', spot: 'boulder', reveals: 'wastebloater' },
  { id: 'n-falls-1', spot: 'falls', reveals: 'prismadrake' }, { id: 'n-falls-2', spot: 'falls', reveals: 'stormray' },
  { id: 'n-grotto-1', spot: 'grotto', reveals: 'nightmire' }, { id: 'n-grotto-2', spot: 'grotto', reveals: 'phantomfin' },
  { id: 'n-deep-1', spot: 'deep', reveals: 'abyssmelt' }, { id: 'n-deep-2', spot: 'deep', reveals: 'abyssgloop' },
];
export const NOTE_REWARD = 25;

export const WEATHER = {
  clear: { label: 'Clear', weight: 50, biteMul: 1, forceMul: 1 },
  rain: { label: 'Rain', weight: 22, biteMul: 0.75, forceMul: 1 },
  fog: { label: 'Fog', weight: 16, biteMul: 1.1, forceMul: 1 },
  storm: { label: 'Storm', weight: 12, biteMul: 0.7, forceMul: 1.2 },
};

export const TIMES = ['Dawn', 'Day', 'Dusk', 'Night'];
export const CASTS_PER_TIME = 3;
export const SHINY_ODDS = 1 / 48;

// Permanent tackle upgrades, bought with Essence. cost[i] buys level i + 1.
export const UPGRADES = {
  rod: { name: 'Rod', desc: 'Reel faster inside the safe zone.', cost: [120, 320, 700] },
  line: { name: 'Line', desc: 'Wider safe zone, gentler on snaps.', cost: [150, 360, 750] },
  lure: { name: 'Lure', desc: 'Faster bites and better odds at rare Goops.', cost: [100, 280, 650] },
};

/** Plain-language description of when a Goop bites (used by the GoopDex). */
export function conditionText(goop) {
  const spots = goop.spots.map((id) => SPOTS.find((s) => s.id === id)?.name).filter(Boolean).join(' & ');
  const words = (list) => list.map((w) => (WEATHER[w]?.label || w).toLowerCase()).join(' or ');
  const parts = [];
  if (goop.needs?.time) parts.push(`only at ${words(goop.needs.time)}`);
  if (goop.needs?.weather) parts.push(`only in ${words(goop.needs.weather)} weather`);
  if (goop.likes?.time) parts.push(`more active at ${words(goop.likes.time)}`);
  if (goop.likes?.weather) parts.push(`drawn out by ${words(goop.likes.weather)}`);
  return `${spots}${parts.length ? ` · ${parts.join(', ')}` : ''}`;
}

// ---------- encounter selection ----------

export function weightedPick(items, rng = Math.random) {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (!items.length || total <= 0) return null;
  let roll = rng() * total;
  for (const item of items) {
    roll -= Math.max(0, item.weight);
    if (roll < 0) return item;
  }
  return items[items.length - 1];
}

/** Does a Goop's hard requirement (if any) allow it to bite right now? */
export function conditionsMet(goop, weather, time) {
  if (goop.needs?.weather && !goop.needs.weather.includes(weather)) return false;
  if (goop.needs?.time && !goop.needs.time.includes(time)) return false;
  return true;
}

/** Weighted pool of Goops for the given conditions. */
export function encounterPool({ spot = SPOTS[0], weather = 'clear', time = 'Day', lure = 0 } = {}) {
  return GOOPS.filter((g) => spot.goops.includes(g.id) && conditionsMet(g, weather, time)).map((g) => {
    let weight = g.weight;
    if (g.likes?.weather?.includes(weather)) weight *= 4;
    if (g.likes?.time?.includes(time)) weight *= 3;
    if (g.needs) weight *= 1.5; // conditions are hard to line up; reward the player who does
    if (g.rarity !== 'Common') weight *= spot.rareMul * (1 + 0.15 * lure);
    return { ...g, weight };
  });
}

// ---------- fight ----------

/** Pull force a Goop applies to the line (positive = tension up). Roughly -0.2 .. +1.2 per second. */
export function pullForce(pattern, t) {
  switch (pattern) {
    case 'steady': return 0.1 + Math.sin(t * 1.4) * 0.15;
    case 'pulse': return Math.sin(t * 3.2) > 0.1 ? 0.45 : -0.05;
    case 'dart': return (Math.sin(t * 2.6) > 0.6 ? 0.7 : 0) + Math.sin(t * 4.8) * 0.1;
    case 'drift': return 0.1 + Math.sin(t * 0.7) * 0.4;
    case 'sleepy': return Math.sin(t * 1.1) * 0.08 + (Math.sin(t * 1.9 + 1) > 0.9 ? 0.85 : -0.05);
    case 'wild': return Math.sin(t * 3.7) * 0.5 + Math.sin(t * 1.3 + 2) * 0.4 + (Math.sin(t * 2.3) > 0.7 ? 0.6 : 0);
    default: return 0;
  }
}

export function gearStats(gear = {}) {
  const rod = gear.rod || 0, line = gear.line || 0;
  return {
    reelRate: 1 + 0.15 * rod, // multiplier on catch progress
    safeLo: 0.38 - 0.03 * line,
    safeHi: 0.78 + 0.03 * line,
    snapGuard: 1 - 0.15 * line, // multiplier on stamina lost while over-tensioned
  };
}

export function makeFight(goop, gear = {}, env = {}) {
  const g = gearStats(gear);
  return {
    goop, progress: 0, stamina: goop.stamina, tension: 0.5, phase: 0, elapsed: 0, caught: false, escaped: false,
    safeLo: g.safeLo, safeHi: g.safeHi, reelRate: g.reelRate, snapGuard: g.snapGuard,
    forceMul: (env.forceMul ?? 1) * (goop.force ?? 1),
  };
}

export function tickFight(fight, input, dt) {
  if (!fight || fight.caught || fight.escaped) return fight;
  const d = Math.max(0, Math.min(dt, 0.08));
  fight.elapsed += d;
  fight.phase += d;
  const reeling = !!input.reel;

  // Reeling winds tension up, releasing lets it fall; the Goop pulls against you.
  const pull = pullForce(fight.goop.pattern, fight.phase) * (fight.forceMul ?? 1);
  fight.tension += (reeling ? 0.62 : -0.55) * d + pull * d;
  fight.tension = Math.max(0, Math.min(1, fight.tension));

  const lo = fight.safeLo ?? 0.38, hi = fight.safeHi ?? 0.78;
  const safe = fight.tension >= lo && fight.tension <= hi;
  const rate = fight.reelRate ?? 1, guard = fight.snapGuard ?? 1;

  if (safe && reeling) fight.progress += d * 0.3 * rate;
  else if (fight.tension > 0.88 || fight.tension < 0.15) fight.progress = Math.max(0, fight.progress - d * 0.1);
  else if (!reeling) fight.progress = Math.max(0, fight.progress - d * 0.02);

  // The Goop tires when you work it in the zone; snapping tension or slack lets it recover/flee.
  if (fight.tension > 0.95) fight.stamina -= d * 0.6 * guard;
  else if (safe) fight.stamina -= d * (reeling ? 0.07 : 0.04);
  else fight.stamina -= d * 0.08;

  fight.progress = Math.min(1, fight.progress);
  if (fight.progress >= 1) fight.caught = true;
  else if (fight.stamina <= 0) fight.escaped = true;
  return fight;
}

// ---------- persistence ----------

const SAVE_VERSION = 2;
const OLD_SPOT = { pond: 'dock', reeds: 'reeds', deep: 'deep' };
const OLD_SPOT_COST = { reeds: 200, deep: 600 };

export class SaveStore {
  constructor(storage = globalThis.localStorage, key = 'goop-fishing-save') {
    this.storage = storage;
    this.key = key;
  }

  fresh() {
    return {
      version: SAVE_VERSION, essence: 0, dex: {}, seen: [], notes: [], day: 1, weather: 'clear', caughtToday: 0,
      timeIndex: 1, casts: 0, spot: 'dock', discovered: ['dock'], completed: [],
      gear: { rod: 0, line: 0, lure: 0 }, stats: { caught: 0, escaped: 0, missed: 0, shiny: 0 },
    };
  }

  load() {
    try {
      const raw = this.storage?.getItem(this.key);
      if (!raw) return this.fresh();
      const p = JSON.parse(raw);
      if (!p || typeof p !== 'object') return this.fresh();
      if (p.version === 1) return this.sanitize(this.migrateV1(p));
      if (p.version !== SAVE_VERSION) return this.fresh();
      return this.sanitize(p);
    } catch {
      return this.fresh();
    }
  }

  /** Version 1 had three separate lakes bought with Essence; they became spots on one pond. */
  migrateV1(p) {
    const unlocked = Array.isArray(p.unlocked) ? p.unlocked : [];
    let refund = 0;
    for (const id of unlocked) refund += OLD_SPOT_COST[id] || 0;
    const essence = (Number.isFinite(p.essence) ? p.essence : 0) + refund;
    return {
      ...p, version: SAVE_VERSION, essence,
      spot: OLD_SPOT[p.spot] || 'dock',
      discovered: ['dock'],
      seen: p.dex && typeof p.dex === 'object' ? Object.keys(p.dex) : [],
    };
  }

  /** Merge a parsed save over fresh defaults, discarding values of the wrong type. */
  sanitize(p) {
    const f = this.fresh();
    const num = (v, d, min = 0) => (Number.isFinite(v) ? Math.max(min, v) : d);
    const ids = new Set(GOOPS.map((g) => g.id));
    const list = (v, ok) => (Array.isArray(v) ? [...new Set(v.filter(ok))] : []);
    const s = { ...f };
    s.essence = Math.floor(num(p.essence, 0));
    s.day = Math.floor(num(p.day, 1, 1));
    s.caughtToday = Math.floor(num(p.caughtToday, 0));
    s.casts = Math.floor(num(p.casts, 0));
    s.timeIndex = Math.min(TIMES.length - 1, Math.floor(num(p.timeIndex, 1)));
    s.weather = WEATHER[p.weather] ? p.weather : 'clear';
    s.dex = {};
    if (p.dex && typeof p.dex === 'object' && !Array.isArray(p.dex)) {
      for (const [id, e] of Object.entries(p.dex)) {
        if (!ids.has(id) || !e || typeof e !== 'object') continue;
        s.dex[id] = {
          count: Math.floor(num(e.count, 1, 1)),
          fastest: Number.isFinite(e.fastest) ? e.fastest : null,
          best: Number.isFinite(e.best) ? e.best : null,
          shiny: Math.floor(num(e.shiny, 0)),
        };
      }
    }
    s.seen = list(p.seen, (id) => ids.has(id));
    for (const id of Object.keys(s.dex)) if (!s.seen.includes(id)) s.seen.push(id);
    s.notes = list(p.notes, (id) => NOTES.some((n) => n.id === id));
    s.completed = list(p.completed, (id) => SPOTS.some((sp) => sp.id === id));
    const found = Object.keys(s.dex).length;
    const open = (id) => (SPOTS.find((sp) => sp.id === id)?.unlockAt ?? Infinity) <= found;
    s.discovered = list(p.discovered, open);
    if (!s.discovered.includes('dock')) s.discovered.unshift('dock');
    s.spot = open(p.spot) ? p.spot : 'dock';
    if (!s.discovered.includes(s.spot)) s.discovered.push(s.spot);
    for (const k of Object.keys(UPGRADES)) {
      s.gear[k] = Math.min(UPGRADES[k].cost.length, Math.floor(num(p.gear?.[k], 0)));
    }
    for (const k of Object.keys(f.stats)) s.stats[k] = Math.floor(num(p.stats?.[k], 0));
    return s;
  }

  save(s) {
    try { this.storage?.setItem(this.key, JSON.stringify(s)); return true; } catch { return false; }
  }

  reset() {
    try { this.storage?.removeItem(this.key); } catch { /* storage unavailable */ }
    return this.fresh();
  }
}

// ---------- game ----------

const MAX_EVENTS = 50;

export class FishingGame {
  constructor({ rng = Math.random, saveStore = new SaveStore(), biteDuration = 2.4 } = {}) {
    this.rng = rng;
    this.saveStore = saveStore;
    this.state = saveStore.load();
    this.biteDuration = biteDuration;
    this.events = [];
    this.prevReel = false;
    this.here = true; // standing at state.spot (false while walking the shore)
    this.resetRound('Cast your line to begin.');
  }

  resetRound(message) {
    this.phase = PHASES.IDLE;
    this.timer = 0;
    this.biteAt = 1.2;
    this.goop = null;
    this.fight = null;
    this.lastReward = 0;
    this.lastCatch = null;
    this.message = message;
  }

  emit(type, detail = {}) {
    this.events.push({ type, detail, time: Date.now() });
    if (this.events.length > MAX_EVENTS) this.events.shift();
  }

  get spot() { return SPOTS.find((s) => s.id === this.state.spot) || SPOTS[0]; }
  get weather() { return WEATHER[this.state.weather] || WEATHER.clear; }
  get timeOfDay() { return TIMES[this.state.timeIndex] || 'Day'; }
  get busy() { return [PHASES.CAST, PHASES.BITE, PHASES.FIGHT].includes(this.phase); }
  get dexCount() { return Object.keys(this.state.dex).length; }

  spotUnlocked(id) {
    const s = SPOTS.find((x) => x.id === id);
    return !!s && this.dexCount >= s.unlockAt;
  }

  /** Species at a spot, and how many of them are in the GoopDex. */
  spotProgress(id) {
    const s = SPOTS.find((x) => x.id === id);
    if (!s) return { found: 0, total: 0 };
    return { found: s.goops.filter((g) => this.state.dex[g]).length, total: s.goops.length };
  }

  cast() {
    if (this.busy || !this.here) return false;
    const pool = encounterPool({ spot: this.spot, weather: this.state.weather, time: this.timeOfDay, lure: this.state.gear.lure });
    const picked = weightedPick(pool, this.rng);
    this.goop = picked ? GOOPS.find((g) => g.id === picked.id) : GOOPS[0];
    this.fight = null;
    this.lastCatch = null;
    this.timer = 0;
    const { biteMin, biteMax } = this.spot;
    const wait = (biteMin + this.rng() * (biteMax - biteMin)) * this.weather.biteMul * (1 - 0.1 * this.state.gear.lure);
    this.biteAt = Math.max(0.6, wait);
    this.phase = PHASES.CAST;
    this.prevReel = true; // a button already held at cast time must be released and pressed again to hook
    this.message = 'Line out… watch for a bite.';
    this.advanceClock();
    this.emit('cast');
    this.saveStore.save(this.state);
    return true;
  }

  /** Every few casts the time of day moves on; the weather is re-rolled at each change. */
  advanceClock() {
    const s = this.state;
    s.casts += 1;
    if (s.casts % CASTS_PER_TIME !== 0) return;
    s.timeIndex = (s.timeIndex + 1) % TIMES.length;
    if (s.timeIndex === 0) { s.day += 1; s.caughtToday = 0; }
    const entries = Object.entries(WEATHER).map(([id, w]) => ({ id, weight: w.weight }));
    s.weather = weightedPick(entries, this.rng)?.id || 'clear';
    this.emit('clock', { time: this.timeOfDay, weather: s.weather, day: s.day });
  }

  update(dt, input = {}) {
    const step = Math.max(0, Math.min(dt, 0.08));
    const reel = !!input.reel;
    const pressed = reel && !this.prevReel;
    this.prevReel = reel;
    this.timer += step;

    if (this.phase === PHASES.CAST) {
      if (this.timer >= this.biteAt) {
        this.phase = PHASES.BITE;
        this.timer = 0;
        this.message = 'BITE! Tap REEL to hook it!';
        this.emit('bite');
      }
    } else if (this.phase === PHASES.BITE) {
      if (pressed) {
        this.phase = PHASES.FIGHT;
        this.fight = makeFight(this.goop, this.state.gear, { forceMul: this.weather.forceMul });
        this.timer = 0;
        this.message = this.goop.hint;
        if (!this.state.seen.includes(this.goop.id)) this.state.seen.push(this.goop.id);
        this.emit('hooked', { goop: this.goop.id });
      } else if (this.timer >= this.biteDuration) {
        this.phase = PHASES.ESCAPED;
        this.state.stats.missed += 1;
        this.message = 'It slipped away. Cast again!';
        this.emit('missedBite');
        this.saveStore.save(this.state);
      }
    } else if (this.phase === PHASES.FIGHT) {
      tickFight(this.fight, { reel }, step);
      if (this.fight.caught) this.finishCatch();
      else if (this.fight.escaped) {
        this.phase = PHASES.ESCAPED;
        this.state.stats.escaped += 1;
        this.message = `${this.goop.name} broke free!`;
        this.emit('escaped', { goop: this.goop.id });
        this.saveStore.save(this.state);
      }
    }
  }

  finishCatch() {
    this.phase = PHASES.CAUGHT;
    const g = this.goop;
    const id = g.id;
    const before = this.dexCount;
    const prev = this.state.dex[id] || { count: 0, fastest: null, best: null, shiny: 0 };
    const time = this.fight.elapsed;
    const [lo, hi] = g.size;
    const size = Math.round((lo + (hi - lo) * this.rng() ** 2) * 10) / 10; // big ones are rare
    const shiny = this.rng() > 1 - SHINY_ODDS;
    const record = prev.best == null || size > prev.best;
    this.state.dex[id] = {
      count: prev.count + 1,
      fastest: prev.fastest == null ? time : Math.min(prev.fastest, time),
      best: record ? size : prev.best,
      shiny: prev.shiny + (shiny ? 1 : 0),
    };
    const reward = Math.round(g.essence * this.spot.essenceMul * (shiny ? 3 : 1));
    this.lastReward = reward;
    this.state.essence += reward;
    this.state.caughtToday += 1;
    this.state.stats.caught += 1;
    if (shiny) this.state.stats.shiny += 1;
    const firstTime = prev.count === 0;
    this.lastCatch = { goop: id, reward, firstTime, size, record: record && !firstTime, shiny, time };
    this.message = `${shiny ? '✦ Shiny ' : ''}${g.name} caught! +${reward} Essence`;
    this.emit('catch', this.lastCatch);

    // A full set at a spot pays a bonus once.
    const sp = this.spot;
    const prog = this.spotProgress(sp.id);
    if (prog.found === prog.total && !this.state.completed.includes(sp.id)) {
      this.state.completed.push(sp.id);
      const bonus = Math.round(100 * sp.essenceMul);
      this.state.essence += bonus;
      this.emit('spotComplete', { spot: sp.id, bonus });
    }
    // New stretches of shore open as the GoopDex grows.
    const after = this.dexCount;
    for (const s of SPOTS) if (s.unlockAt > before && s.unlockAt <= after) this.emit('unlock', { spot: s.id });
    this.saveStore.save(this.state);
  }

  // ----- exploring -----

  /** Arrive at a spot on the shore. Spots open as the GoopDex fills; not allowed mid-cast. */
  travel(spotId) {
    const spot = SPOTS.find((s) => s.id === spotId);
    if (!spot || this.busy || !this.spotUnlocked(spotId)) return false;
    this.state.spot = spotId;
    this.here = true;
    if (!this.state.discovered.includes(spotId)) {
      this.state.discovered.push(spotId);
      const reward = 15 + spot.unlockAt * 2;
      this.state.essence += reward;
      this.emit('discover', { spot: spotId, reward });
      this.message = `Discovered ${spot.name}! +${reward} Essence`;
    } else {
      this.message = `${spot.name}. Cast your line!`;
    }
    this.emit('travel', { spot: spotId });
    this.saveStore.save(this.state);
    return true;
  }

  /** Step away from the current spot (walking). Casting needs you to stand at a spot. */
  leave() {
    if (this.busy) return false;
    if (this.phase !== PHASES.IDLE) this.resetRound('');
    this.here = false;
    return true;
  }

  /** Pick up a field note found on the shore at the current spot. */
  collectNote(noteId) {
    const note = NOTES.find((n) => n.id === noteId);
    if (!note || this.state.notes.includes(noteId) || note.spot !== this.state.spot) return false;
    this.state.notes.push(noteId);
    this.state.essence += NOTE_REWARD;
    const g = GOOPS.find((x) => x.id === note.reveals);
    this.message = `Field note found: ${g.name} — ${conditionText(g)}`;
    this.emit('note', { note: noteId, goop: g.id, reward: NOTE_REWARD });
    this.saveStore.save(this.state);
    return true;
  }

  /** Has the player learned where/when a Goop bites (caught it or read its note)? */
  knows(goopId) {
    return !!this.state.dex[goopId] || this.state.notes.some((id) => NOTES.find((n) => n.id === id)?.reveals === goopId);
  }

  // ----- shop -----

  upgradeCost(kind) {
    const u = UPGRADES[kind];
    const level = this.state.gear[kind];
    return u && level < u.cost.length ? u.cost[level] : null;
  }

  buyUpgrade(kind) {
    const cost = this.upgradeCost(kind);
    if (cost == null || this.state.essence < cost) return false;
    this.state.essence -= cost;
    this.state.gear[kind] += 1;
    this.message = `${UPGRADES[kind].name} upgraded to level ${this.state.gear[kind]}!`;
    this.emit('upgrade', { kind, level: this.state.gear[kind] });
    this.saveStore.save(this.state);
    return true;
  }

  reset() {
    this.state = this.saveStore.reset();
    this.prevReel = false;
    this.here = true;
    this.resetRound('Save reset. Cast your line!');
    this.emit('reset');
  }
}
