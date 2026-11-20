// Goop Fishing — game rules and state. No DOM access in this file so it can be unit tested in Node.

export const PHASES = Object.freeze({
  IDLE: 'idle', CAST: 'cast', BITE: 'bite', FIGHT: 'fight', CAUGHT: 'caught', ESCAPED: 'escaped',
});

// `likes` multiplies a Goop's encounter weight in matching conditions.
export const GOOPS = [
  { id: 'gloop', name: 'Gloop', rarity: 'Common', weight: 42, stamina: 1, pattern: 'steady', essence: 8, color: '#73f27c', hint: 'A steady tug. Keep your rhythm.' },
  { id: 'murkling', name: 'Murkling', rarity: 'Common', weight: 28, stamina: 1.2, pattern: 'pulse', essence: 10, color: '#69b7e8', hint: 'Short pulses, then a pause.' },
  { id: 'sploot', name: 'Sploot', rarity: 'Common', weight: 26, stamina: 0.95, pattern: 'pulse', essence: 9, color: '#c8e86b', hint: 'Splashy and impatient. Ease off on each pulse.' },
  { id: 'flicker', name: 'Flicker', rarity: 'Uncommon', weight: 16, stamina: 0.85, pattern: 'dart', essence: 14, color: '#f3d96b', hint: 'Quick surges. Ease off between them.' },
  { id: 'puddlit', name: 'Puddlit', rarity: 'Uncommon', weight: 9, stamina: 1.1, pattern: 'drift', essence: 16, color: '#e9a2ff', hint: 'Slow drifting tension. Stay centered.', likes: { weather: ['rain'] } },
  { id: 'drowsy', name: 'Drowsy', rarity: 'Rare', weight: 4, stamina: 0.7, pattern: 'sleepy', essence: 22, color: '#ff9f91', hint: 'Gentle movement with sudden wake-ups.', likes: { time: ['Night', 'Dawn'] } },
  { id: 'mistfin', name: 'Mistfin', rarity: 'Rare', weight: 3, stamina: 1, pattern: 'drift', essence: 26, color: '#b9d6e8', hint: 'It hides in the fog and tugs in long waves.', likes: { weather: ['fog'] } },
  { id: 'lumen', name: 'Lumen', rarity: 'Rare', weight: 3, stamina: 0.9, pattern: 'dart', essence: 28, color: '#7ff0ff', hint: 'Glows when it surges. Watch the flashes.', likes: { time: ['Night'] } },
  { id: 'voidling', name: 'Voidling', rarity: 'Epic', weight: 1, stamina: 1.65, pattern: 'wild', essence: 35, color: '#a39aff', hint: 'Unpredictable bursts. Watch the tells.' },
  { id: 'stormling', name: 'Stormling', rarity: 'Epic', weight: 1, stamina: 1.5, pattern: 'wild', essence: 45, color: '#ffe46b', hint: 'Crackling with energy. It loves a good storm.', likes: { weather: ['storm'] } },
];

export const SPOTS = [
  { id: 'pond', name: 'North Pond', cost: 0, essenceMul: 1, rareMul: 1, biteMin: 1.0, biteMax: 3.0,
    goops: ['gloop', 'murkling', 'flicker', 'puddlit', 'drowsy', 'voidling'] },
  { id: 'reeds', name: 'Reed Shallows', cost: 200, essenceMul: 1.25, rareMul: 1.2, biteMin: 0.9, biteMax: 2.6,
    goops: ['gloop', 'sploot', 'flicker', 'puddlit', 'mistfin', 'drowsy'] },
  { id: 'deep', name: 'Deep Lake', cost: 600, essenceMul: 1.6, rareMul: 1.6, biteMin: 1.2, biteMax: 3.4,
    goops: ['murkling', 'flicker', 'drowsy', 'lumen', 'voidling', 'stormling'] },
];

export const WEATHER = {
  clear: { label: 'Clear', weight: 50, biteMul: 1, forceMul: 1 },
  rain: { label: 'Rain', weight: 22, biteMul: 0.75, forceMul: 1 },
  fog: { label: 'Fog', weight: 16, biteMul: 1.1, forceMul: 1 },
  storm: { label: 'Storm', weight: 12, biteMul: 0.7, forceMul: 1.2 },
};

export const TIMES = ['Dawn', 'Day', 'Dusk', 'Night'];
export const CASTS_PER_TIME = 3;

// Permanent tackle upgrades, bought with Essence. cost[i] buys level i + 1.
export const UPGRADES = {
  rod: { name: 'Rod', desc: 'Reel faster inside the safe zone.', cost: [120, 320, 700] },
  line: { name: 'Line', desc: 'Wider safe zone, gentler on snaps.', cost: [150, 360, 750] },
  lure: { name: 'Lure', desc: 'Faster bites and better odds at rare Goops.', cost: [100, 280, 650] },
};

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

/** Weighted pool of Goops for the given conditions. */
export function encounterPool({ spot = SPOTS[0], weather = 'clear', time = 'Day', lure = 0 } = {}) {
  return GOOPS.filter((g) => spot.goops.includes(g.id)).map((g) => {
    let weight = g.weight;
    if (g.likes?.weather?.includes(weather)) weight *= 4;
    if (g.likes?.time?.includes(time)) weight *= 3;
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
    forceMul: env.forceMul ?? 1,
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

export class SaveStore {
  constructor(storage = globalThis.localStorage, key = 'goop-fishing-save') {
    this.storage = storage;
    this.key = key;
  }

  fresh() {
    return {
      version: 1, essence: 0, dex: {}, day: 1, weather: 'clear', caughtToday: 0,
      timeIndex: 1, casts: 0, spot: 'pond', unlocked: ['pond'],
      gear: { rod: 0, line: 0, lure: 0 }, stats: { caught: 0, escaped: 0, missed: 0 },
    };
  }

  load() {
    try {
      const raw = this.storage?.getItem(this.key);
      if (!raw) return this.fresh();
      const p = JSON.parse(raw);
      if (!p || typeof p !== 'object' || p.version !== 1) return this.fresh();
      return this.sanitize(p);
    } catch {
      return this.fresh();
    }
  }

  /** Merge a parsed save over fresh defaults, discarding values of the wrong type. */
  sanitize(p) {
    const f = this.fresh();
    const num = (v, d, min = 0) => (Number.isFinite(v) ? Math.max(min, v) : d);
    const s = { ...f };
    s.essence = Math.floor(num(p.essence, 0));
    s.day = Math.floor(num(p.day, 1, 1));
    s.caughtToday = Math.floor(num(p.caughtToday, 0));
    s.casts = Math.floor(num(p.casts, 0));
    s.timeIndex = Math.min(TIMES.length - 1, Math.floor(num(p.timeIndex, 1)));
    s.weather = WEATHER[p.weather] ? p.weather : 'clear';
    s.dex = p.dex && typeof p.dex === 'object' && !Array.isArray(p.dex) ? p.dex : {};
    s.unlocked = Array.isArray(p.unlocked) ? p.unlocked.filter((id) => SPOTS.some((sp) => sp.id === id)) : ['pond'];
    if (!s.unlocked.includes('pond')) s.unlocked.unshift('pond');
    s.spot = s.unlocked.includes(p.spot) ? p.spot : 'pond';
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
    this.resetRound('Cast your line to begin.');
  }

  resetRound(message) {
    this.phase = PHASES.IDLE;
    this.timer = 0;
    this.biteAt = 1.2;
    this.goop = null;
    this.fight = null;
    this.lastReward = 0;
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

  cast() {
    if (this.busy) return false;
    const pool = encounterPool({ spot: this.spot, weather: this.state.weather, time: this.timeOfDay, lure: this.state.gear.lure });
    const picked = weightedPick(pool, this.rng);
    this.goop = picked ? GOOPS.find((g) => g.id === picked.id) : GOOPS[0];
    this.fight = null;
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
    const id = this.goop.id;
    const prev = this.state.dex[id] || { count: 0, fastest: null };
    const time = this.fight.elapsed;
    this.state.dex[id] = {
      count: prev.count + 1,
      fastest: prev.fastest == null ? time : Math.min(prev.fastest, time),
    };
    const reward = Math.round(this.goop.essence * this.spot.essenceMul);
    this.lastReward = reward;
    this.state.essence += reward;
    this.state.caughtToday += 1;
    this.state.stats.caught += 1;
    this.message = `${this.goop.name} caught! +${reward} Essence`;
    this.emit('catch', { goop: id, reward, firstTime: prev.count === 0 });
    this.saveStore.save(this.state);
  }

  // ----- shop and travel -----

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

  /** Move to a spot, buying access first if it is locked and affordable. Not allowed mid-cast. */
  travel(spotId) {
    const spot = SPOTS.find((s) => s.id === spotId);
    if (!spot || this.busy) return false;
    if (!this.state.unlocked.includes(spotId)) {
      if (this.state.essence < spot.cost) return false;
      this.state.essence -= spot.cost;
      this.state.unlocked.push(spotId);
      this.emit('unlock', { spot: spotId });
    }
    this.state.spot = spotId;
    this.message = `You head to ${spot.name}. Cast your line!`;
    this.emit('travel', { spot: spotId });
    this.saveStore.save(this.state);
    return true;
  }

  reset() {
    this.state = this.saveStore.reset();
    this.prevReel = false;
    this.resetRound('Save reset. Cast your line!');
    this.emit('reset');
  }
}
