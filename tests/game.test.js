import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GOOPS, SPOTS, UPGRADES, weightedPick, encounterPool, makeFight, tickFight, pullForce,
  FishingGame, SaveStore, PHASES, CASTS_PER_TIME,
} from '../src/game.js';

function memStore(initial = null) {
  const mem = { v: initial, getItem() { return this.v; }, setItem(k, v) { this.v = v; }, removeItem() { this.v = null; } };
  return { mem, store: new SaveStore(mem, 'test') };
}
function newGame(opts = {}) {
  const { store } = memStore();
  return new FishingGame({ rng: () => 0, saveStore: store, ...opts });
}
/** Advance until the phase changes or time runs out. */
function runUntil(g, phase, input = {}, max = 20) {
  for (let t = 0; t < max && g.phase !== phase; t += 0.05) g.update(0.05, input);
}

test('empty and zero-weight encounter pools return null', () => {
  assert.equal(weightedPick([]), null);
  assert.equal(weightedPick([{ weight: 0 }]), null);
});

test('weighted selection respects deterministic ranges', () => {
  const pool = [{ id: 'a', weight: 1 }, { id: 'b', weight: 3 }];
  assert.equal(weightedPick(pool, () => 0).id, 'a');
  assert.equal(weightedPick(pool, () => 0.5).id, 'b');
  assert.equal(weightedPick(pool, () => 0.9999).id, 'b');
});

test('every spot only lists real Goops and every Goop is catchable somewhere', () => {
  const ids = new Set(GOOPS.map((g) => g.id));
  for (const s of SPOTS) for (const id of s.goops) assert.ok(ids.has(id), `${s.id} -> ${id}`);
  for (const g of GOOPS) assert.ok(SPOTS.some((s) => s.goops.includes(g.id)), `${g.id} has no habitat`);
});

test('weather and time boost matching Goops in the encounter pool', () => {
  const spot = SPOTS.find((s) => s.id === 'deep');
  const weightOf = (pool, id) => pool.find((g) => g.id === id).weight;
  const clear = encounterPool({ spot, weather: 'clear', time: 'Day' });
  const storm = encounterPool({ spot, weather: 'storm', time: 'Day' });
  assert.ok(weightOf(storm, 'stormling') > weightOf(clear, 'stormling'));
  const night = encounterPool({ spot, weather: 'clear', time: 'Night' });
  assert.ok(weightOf(night, 'lumen') > weightOf(clear, 'lumen'));
});

test('fight tension remains clamped and every pattern produces a finite pull', () => {
  const f = makeFight(GOOPS[0]);
  for (let i = 0; i < 500; i++) tickFight(f, { reel: i % 2 === 0 }, 0.05);
  assert.ok(f.tension >= 0 && f.tension <= 1);
  for (const p of ['steady', 'pulse', 'dart', 'drift', 'sleepy', 'wild']) {
    for (let t = 0; t < 30; t += 0.1) assert.ok(Number.isFinite(pullForce(p, t)));
  }
});

test('holding reel forever fails: tension snaps and the Goop escapes', () => {
  for (const g of GOOPS) {
    const f = makeFight(g);
    for (let t = 0; t < 60 && !f.caught && !f.escaped; t += 0.02) tickFight(f, { reel: true }, 0.02);
    assert.ok(f.escaped && !f.caught, `${g.id} should escape from a held reel`);
  }
});

test('never reeling fails too', () => {
  const f = makeFight(GOOPS[0]);
  for (let t = 0; t < 120 && !f.caught && !f.escaped; t += 0.02) tickFight(f, { reel: false }, 0.02);
  assert.ok(f.escaped && !f.caught);
});

test('a player who feathers the reel can catch a Gloop', () => {
  let wins = 0;
  for (let start = 0; start < 10; start++) {
    const f = makeFight(GOOPS[0]);
    f.phase = start * 2;
    for (let t = 0; t < 60 && !f.caught && !f.escaped; t += 1 / 60) tickFight(f, { reel: f.tension < 0.6 }, 1 / 60);
    if (f.caught) wins++;
  }
  assert.ok(wins >= 8, `expected most feathered fights to succeed, got ${wins}/10`);
});

test('gear widens the safe zone and speeds up reeling', () => {
  const base = makeFight(GOOPS[0]);
  const geared = makeFight(GOOPS[0], { rod: 3, line: 3 });
  assert.ok(geared.safeLo < base.safeLo && geared.safeHi > base.safeHi && geared.reelRate > base.reelRate);
});

test('catch awards Essence and records Dex entry', () => {
  const { mem, store } = memStore();
  const g = new FishingGame({ rng: () => 0, saveStore: store });
  g.cast();
  g.phase = PHASES.FIGHT;
  g.goop = GOOPS[0];
  g.fight = makeFight(GOOPS[0]);
  g.fight.caught = true;
  g.update(0);
  assert.equal(g.phase, PHASES.CAUGHT);
  assert.equal(g.state.essence, 8);
  assert.equal(g.state.dex.gloop.count, 1);
  assert.equal(g.state.stats.caught, 1);
  assert.ok(mem.v, 'catch is saved');
});

test('full round trip: cast, bite, hook, fight', () => {
  const g = newGame();
  assert.ok(g.cast());
  assert.equal(g.phase, PHASES.CAST);
  assert.equal(g.cast(), false, 'cannot cast while line is out');
  runUntil(g, PHASES.BITE);
  assert.equal(g.phase, PHASES.BITE);
  g.update(0.02, { reel: false });
  g.update(0.02, { reel: true });
  assert.equal(g.phase, PHASES.FIGHT);
  assert.ok(g.fight);
});

test('a reel button held since before the bite does not auto-hook', () => {
  const g = newGame();
  g.cast();
  runUntil(g, PHASES.BITE, { reel: true });
  assert.equal(g.phase, PHASES.BITE);
  g.update(0.05, { reel: true });
  assert.equal(g.phase, PHASES.BITE, 'still waiting for a fresh press');
  g.update(0.05, { reel: false });
  g.update(0.05, { reel: true });
  assert.equal(g.phase, PHASES.FIGHT);
});

test('missing the bite window escapes and counts a miss', () => {
  const g = newGame();
  g.cast();
  runUntil(g, PHASES.BITE);
  runUntil(g, PHASES.ESCAPED, {});
  assert.equal(g.phase, PHASES.ESCAPED);
  assert.equal(g.state.stats.missed, 1);
  assert.ok(g.cast(), 'can cast again after an escape');
});

test('time of day advances every few casts and rolls a new day', () => {
  const g = newGame();
  const start = g.state.timeIndex;
  for (let i = 0; i < CASTS_PER_TIME; i++) { g.phase = PHASES.IDLE; g.cast(); }
  assert.equal(g.state.timeIndex, (start + 1) % 4);
  g.state.caughtToday = 5;
  for (let i = 0; i < CASTS_PER_TIME * 3; i++) { g.phase = PHASES.IDLE; g.cast(); }
  assert.equal(g.state.day, 2);
  assert.equal(g.state.caughtToday, 0);
});

test('upgrades cost Essence, cap at max level, and cannot be bought when broke', () => {
  const g = newGame();
  assert.equal(g.buyUpgrade('rod'), false);
  g.state.essence = 100000;
  for (let i = 0; i < UPGRADES.rod.cost.length; i++) assert.ok(g.buyUpgrade('rod'));
  assert.equal(g.buyUpgrade('rod'), false);
  assert.equal(g.state.gear.rod, UPGRADES.rod.cost.length);
  assert.equal(g.upgradeCost('rod'), null);
  assert.equal(g.buyUpgrade('nonsense'), false);
});

test('traveling unlocks spots for Essence and is blocked mid-cast', () => {
  const g = newGame();
  assert.equal(g.travel('reeds'), false, 'too poor');
  g.state.essence = 1000;
  assert.ok(g.travel('reeds'));
  assert.equal(g.state.essence, 1000 - SPOTS[1].cost);
  assert.equal(g.state.spot, 'reeds');
  assert.ok(g.travel('pond'));
  assert.equal(g.state.essence, 1000 - SPOTS[1].cost, 'revisiting is free');
  g.cast();
  assert.equal(g.travel('reeds'), false, 'busy');
  assert.equal(g.travel('nowhere'), false);
});

test('save storage recovers from malformed data and version mismatch', () => {
  const mem = { v: 'bad', getItem() { return this.v; }, setItem(k, v) { this.v = v; }, removeItem() { this.v = null; } };
  const store = new SaveStore(mem);
  assert.equal(store.load().version, 1);
  mem.v = JSON.stringify({ version: 99, essence: 999 });
  assert.equal(store.load().essence, 0);
});

test('save sanitizing drops bad values and keeps good ones', () => {
  const { mem, store } = memStore(JSON.stringify({
    version: 1, essence: 'lots', day: -5, spot: 'deep', unlocked: ['pond'], weather: 'meteors',
    gear: { rod: 99, line: 'x' }, dex: [], timeIndex: 17,
  }));
  const s = store.load();
  assert.equal(s.essence, 0);
  assert.equal(s.day, 1);
  assert.equal(s.spot, 'pond', 'cannot start at a locked spot');
  assert.equal(s.weather, 'clear');
  assert.equal(s.gear.rod, UPGRADES.rod.cost.length);
  assert.equal(s.gear.line, 0);
  assert.deepEqual(s.dex, {});
  assert.ok(s.timeIndex <= 3);
  // an old version-1 save without the new fields still loads
  mem.v = JSON.stringify({ version: 1, essence: 40, dex: { gloop: { count: 2 } }, day: 3, weather: 'clear', caughtToday: 1 });
  const old = store.load();
  assert.equal(old.essence, 40);
  assert.deepEqual(old.unlocked, ['pond']);
});

test('reset wipes progress and the event log stays bounded', () => {
  const g = newGame();
  g.state.essence = 50;
  for (let i = 0; i < 200; i++) g.emit('x');
  assert.ok(g.events.length <= 50);
  g.reset();
  assert.equal(g.state.essence, 0);
  assert.equal(g.phase, PHASES.IDLE);
});
