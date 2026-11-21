import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GOOPS, SPOTS, UPGRADES, NOTES, NOTE_REWARD, weightedPick, encounterPool, makeFight, tickFight, pullForce,
  FishingGame, SaveStore, PHASES, CASTS_PER_TIME, conditionsMet, conditionText,
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

test('spots open as the GoopDex fills, and walking is blocked mid-cast', () => {
  const g = newGame();
  assert.ok(g.travel('lily'), 'second spot is open from the start');
  assert.equal(g.state.spot, 'lily');
  assert.equal(g.travel('reeds'), false, 'needs more GoopDex entries');
  for (const goop of GOOPS.slice(0, 4)) g.state.dex[goop.id] = { count: 1, fastest: null, best: null, shiny: 0 };
  const before = g.state.essence;
  assert.ok(g.travel('reeds'));
  assert.ok(g.state.essence > before, 'first visit pays a discovery reward');
  assert.ok(g.state.discovered.includes('reeds'));
  const again = g.state.essence;
  assert.ok(g.travel('dock') && g.travel('reeds'));
  assert.equal(g.state.essence, again, 'revisiting pays nothing');
  g.cast();
  assert.equal(g.travel('dock'), false, 'busy');
  assert.equal(g.travel('nowhere'), false);
});

test('you can only cast while standing at a spot', () => {
  const g = newGame();
  assert.ok(g.leave());
  assert.equal(g.cast(), false);
  g.travel('dock');
  assert.ok(g.cast());
});

test('every species has art-ready ids, a valid rarity and at least one habitat', () => {
  const ids = new Set();
  for (const goop of GOOPS) {
    assert.ok(!ids.has(goop.id), `duplicate ${goop.id}`); ids.add(goop.id);
    assert.ok(/^[a-z]+$/.test(goop.id));
    assert.ok(['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'].includes(goop.rarity));
    assert.ok(goop.size[0] < goop.size[1]);
    assert.ok(conditionText(goop).length > 0);
  }
  assert.ok(GOOPS.length >= 70, `expected a big GoopDex, got ${GOOPS.length}`);
  for (const s of SPOTS) assert.ok(s.goops.length >= 6, `${s.id} needs enough species`);
});

test('hard requirements keep a Goop out of the pool until conditions line up', () => {
  const grotto = SPOTS.find((s) => s.id === 'grotto');
  const has = (pool, id) => pool.some((x) => x.id === id);
  assert.equal(has(encounterPool({ spot: grotto, weather: 'clear', time: 'Night' }), 'nightmire'), false);
  assert.equal(has(encounterPool({ spot: grotto, weather: 'fog', time: 'Day' }), 'nightmire'), false);
  assert.ok(has(encounterPool({ spot: grotto, weather: 'fog', time: 'Night' }), 'nightmire'));
  assert.ok(conditionsMet(GOOPS[0], 'storm', 'Night'), 'Goops without needs always qualify');
  // every spot always has something to catch
  for (const s of SPOTS) for (const w of ['clear', 'rain', 'fog', 'storm']) for (const t of ['Dawn', 'Day', 'Dusk', 'Night']) {
    assert.ok(encounterPool({ spot: s, weather: w, time: t }).length > 0, `${s.id} ${w} ${t}`);
  }
  // and every species can be caught under some combination
  for (const goop of GOOPS) {
    const ok = ['clear', 'rain', 'fog', 'storm'].some((w) => ['Dawn', 'Day', 'Dusk', 'Night'].some((t) => conditionsMet(goop, w, t)));
    assert.ok(ok, `${goop.id} is uncatchable`);
  }
});

test('catches roll a size, track records and shiny variants', () => {
  const rolls = [0.99, 0.999]; // size near max, then shiny
  const { store } = memStore();
  const g = new FishingGame({ rng: () => (rolls.length ? rolls.shift() : 0), saveStore: store });
  g.goop = GOOPS[0]; g.phase = PHASES.FIGHT; g.fight = makeFight(GOOPS[0]); g.fight.caught = true;
  g.update(0);
  const e = g.state.dex.gloop;
  assert.ok(e.best > GOOPS[0].size[0]);
  assert.equal(e.shiny, 1);
  assert.equal(g.state.stats.shiny, 1);
  assert.equal(g.lastCatch.reward, GOOPS[0].essence * 3, 'shinies pay triple');
  // a smaller second catch does not beat the record
  g.goop = GOOPS[0]; g.phase = PHASES.FIGHT; g.fight = makeFight(GOOPS[0]); g.fight.caught = true;
  g.update(0);
  assert.equal(g.state.dex.gloop.count, 2);
  assert.equal(g.lastCatch.record, false);
});

test('completing a spot pays a one-time bonus and new spots announce themselves', () => {
  const g = newGame();
  const dock = SPOTS.find((s) => s.id === 'dock');
  for (const id of dock.goops.slice(1)) g.state.dex[id] = { count: 1, fastest: null, best: null, shiny: 0 };
  g.goop = GOOPS.find((x) => x.id === dock.goops[0]); g.phase = PHASES.FIGHT; g.fight = makeFight(g.goop); g.fight.caught = true;
  g.update(0);
  const types = g.events.map((e) => e.type);
  assert.ok(types.includes('spotComplete'));
  assert.ok(g.state.completed.includes('dock'));
  assert.ok(types.includes('unlock'), 'the dock set is big enough to open the reeds');
});

test('field notes are picked up once, at their own spot, and teach the Goop', () => {
  const g = newGame();
  const note = NOTES.find((n) => n.spot === 'dock');
  assert.equal(g.knows(note.reveals), false);
  assert.equal(g.collectNote('n-lily-1'), false, 'wrong spot');
  assert.ok(g.collectNote(note.id));
  assert.equal(g.state.essence, NOTE_REWARD);
  assert.ok(g.knows(note.reveals));
  assert.equal(g.collectNote(note.id), false, 'only once');
  for (const n of NOTES) assert.ok(GOOPS.some((x) => x.id === n.reveals) && SPOTS.some((s) => s.id === n.spot));
});

test('save storage recovers from malformed data and version mismatch', () => {
  const mem = { v: 'bad', getItem() { return this.v; }, setItem(k, v) { this.v = v; }, removeItem() { this.v = null; } };
  const store = new SaveStore(mem);
  assert.equal(store.load().version, 2);
  mem.v = JSON.stringify({ version: 99, essence: 999 });
  assert.equal(store.load().essence, 0);
});

test('save sanitizing drops bad values and keeps good ones', () => {
  const { mem, store } = memStore(JSON.stringify({
    version: 2, essence: 'lots', day: -5, spot: 'deep', discovered: ['dock', 'deep'], weather: 'meteors',
    gear: { rod: 99, line: 'x' }, dex: { gloop: { count: 2 }, fakefish: { count: 9 } }, timeIndex: 17, notes: ['bogus'],
  }));
  const s = store.load();
  assert.equal(s.essence, 0);
  assert.equal(s.day, 1);
  assert.equal(s.spot, 'dock', 'cannot stand at a locked spot');
  assert.deepEqual(s.discovered, ['dock']);
  assert.equal(s.weather, 'clear');
  assert.equal(s.gear.rod, UPGRADES.rod.cost.length);
  assert.equal(s.gear.line, 0);
  assert.deepEqual(Object.keys(s.dex), ['gloop'], 'unknown species dropped');
  assert.deepEqual(s.notes, []);
  assert.ok(s.timeIndex <= 3);
});

test('version-1 saves migrate: GoopDex kept, old lake purchases refunded', () => {
  const { mem, store } = memStore(JSON.stringify({
    version: 1, essence: 40, dex: { gloop: { count: 2, fastest: 3.1 }, lumen: { count: 1 } }, day: 3, weather: 'clear',
    caughtToday: 1, spot: 'reeds', unlocked: ['pond', 'reeds'], gear: { rod: 1 },
  }));
  const s = store.load();
  assert.equal(s.version, 2);
  assert.equal(s.essence, 240, 'the 200 paid for Reed Shallows comes back');
  assert.equal(s.dex.gloop.count, 2);
  assert.equal(s.dex.gloop.fastest, 3.1);
  assert.ok(s.seen.includes('lumen'));
  assert.equal(s.spot, 'dock', 'reeds needs a bigger GoopDex now');
  assert.equal(s.gear.rod, 1);
  mem.v = JSON.stringify({ version: 1, essence: 5 });
  assert.equal(store.load().essence, 5, 'minimal old saves still load');
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
