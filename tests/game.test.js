import test from 'node:test';
import assert from 'node:assert/strict';
import { fightReactionPose } from '../src/scene.js';
import {
  GOOPS, SPOTS, UPGRADES, NOTES, NOTE_REWARD, HABITAT_RESEARCH_TIERS, weightedPick, encounterPool, makeFight, tickFight, pullForce,
  FishingGame, SaveStore, PHASES, CASTS_PER_TIME, conditionsMet, conditionText,
  SPOT_BY, BAITS, SETS, RODS, SKINS, BOBBERS, LINES, LURES, CHARMS, FINDER_COST, BUDDY_TRAIN, tackleMods, QUESTS, DECOR, THEMES, tankTips, TANK_CAP, TANK_COSTS, DECOR_SLOTS, startMove, SIGNATURE, MOVE_INFO, stagesFor, BREAK_TIME, shoreZone, zonePool, makeBounties, bountyMatches, comboFor, LUNGE_PROFILE, PERFECT_HOOK, CLEAN_HOOK, hookTiming, isFullMoon, rollGoopSize, TRACK_WEIGHT_MULT,
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

test('pond activity rises where the player fishes, changes rare encounter weights, and decays with the clock', () => {
  const g = newGame();
  const spot = SPOTS.find((s) => s.id === 'dock');
  const baseline = encounterPool({ spot, weather: 'clear', time: 'Day' });
  const active = encounterPool({ spot, weather: 'clear', time: 'Day', event: { activity: { dock: 3 } } });
  const rareId = spot.goops.find((id) => GOOPS.find((x) => x.id === id).rarity !== 'Common');
  const commonId = spot.goops.find((id) => GOOPS.find((x) => x.id === id).rarity === 'Common');
  assert.ok(Math.abs(active.find((x) => x.id === rareId).weight / baseline.find((x) => x.id === rareId).weight - 1.18) < 1e-9);
  assert.equal(active.find((x) => x.id === commonId).weight, baseline.find((x) => x.id === commonId).weight);
  assert.equal(g.ecosystemStatus().label, 'QUIET WATER');
  g.stirWater(g.zone());
  assert.equal(g.activityAt('dock'), 1);
  assert.equal(g.ecosystemStatus().label, 'RIPPLES GATHERING');
  g.state.activity.dock = 3;
  g.state.casts = CASTS_PER_TIME - 1;
  g.advanceClock();
  assert.equal(g.activityAt('dock'), 2, 'activity fades one step when the water moves into a new time period');
  assert.equal(g.ecosystemStatus().label, 'FEEDING ACTIVITY');
});

test('pond activity save data is bounded and ignores unknown habitats', () => {
  const { store } = memStore(JSON.stringify({ version: 3, activity: { dock: 9, nowhere: 2, lily: -4 } }));
  const state = store.load();
  assert.deepEqual(state.activity, { dock: 3 });
});

test('field tracking multiplies only the selected Goop after its real habitat and conditions qualify', () => {
  const spot = SPOTS.find((s) => s.id === 'deep');
  const base = encounterPool({ spot, weather: 'storm', time: 'Night' });
  const tracked = encounterPool({ spot, weather: 'storm', time: 'Night', trackedGoop: 'abyssmelt' });
  const baseTarget = base.find((g) => g.id === 'abyssmelt');
  const trackedTarget = tracked.find((g) => g.id === 'abyssmelt');
  assert.ok(baseTarget && trackedTarget, 'the eligible species is in the encounter pool');
  assert.equal(trackedTarget.weight / baseTarget.weight, TRACK_WEIGHT_MULT);
  assert.equal(tracked.find((g) => g.id === 'goopshark').weight, base.find((g) => g.id === 'goopshark').weight,
    'tracking does not inflate unrelated species');
  const wrongTime = encounterPool({ spot, weather: 'storm', time: 'Day', trackedGoop: 'abyssmelt' });
  assert.equal(wrongTime.some((g) => g.id === 'abyssmelt'), false, 'tracking cannot bypass a hard night requirement');
});

test('field tracking forecast uses the same target multiplier and reports field readiness', () => {
  const plain = newGame();
  const hunted = newGame();
  plain.state.seen.push('gloop');
  hunted.state.seen.push('gloop');
  assert.ok(hunted.setTrackedGoop('gloop'));
  const chance = (rows, id) => rows.find((row) => row.id === id)?.chance || 0;
  const baseline = plain.forecast(GOOPS.length);
  const forecast = hunted.forecast(GOOPS.length);
  const baselineRatio = chance(baseline, 'gloop') / chance(baseline, 'murkling');
  const huntRatio = chance(forecast, 'gloop') / chance(forecast, 'murkling');
  assert.ok(Math.abs(huntRatio / baselineRatio - TRACK_WEIGHT_MULT) < 1e-9,
    'Fish Finder target-to-control odds reflect the same ×4 weight change as casts');
  assert.equal(hunted.trackingStatus().active, true, 'Gloop is on the trail at the starting dock');
  hunted.state.seen.push('kinggloop');
  assert.ok(hunted.setTrackedGoop('kinggloop'));
  const waiting = hunted.trackingStatus();
  assert.equal(waiting.active, false);
  assert.match(waiting.status, /WAIT FOR DAWN/, 'the status points to the hard time requirement');
});

test('field tracking requires known species, persists, and can be cleared', () => {
  const { store } = memStore();
  const game = new FishingGame({ rng: () => 0, saveStore: store });
  assert.equal(game.setTrackedGoop('lumen'), false, 'unknown species cannot be tracked');
  game.state.seen.push('lumen');
  assert.equal(game.setTrackedGoop('lumen'), true, 'a species already hooked can be tracked');
  assert.equal(game.state.trackedGoop, 'lumen');
  assert.equal(store.load().trackedGoop, 'lumen', 'the selected target survives a save reload');
  assert.equal(game.setTrackedGoop(null), true);
  assert.equal(game.state.trackedGoop, null);
  assert.equal(game.setTrackedGoop(null), false, 'clearing an empty hunt is a no-op');
});


test('named apex Goops use distinctive signature moves without changing their pull temperament', () => {
  const cases = [
    ['kinggloop', 'tug'], ['stormray', 'swerve'], ['prismadrake', 'rhythm'],
    ['ghostshark', 'thrash'], ['drownedking', 'current'], ['sleeper', 'fakeout'],
  ];
  for (const [id, expected] of cases) {
    const goop = GOOPS.find((g) => g.id === id);
    const fight = makeFight(goop, {}, { rng: () => 0.25 });
    assert.equal(goop.signature, expected, id);
    assert.equal(startMove(fight).type, expected, id);
    assert.ok(goop.pattern, 'the underlying pull temperament remains defined');
  }
  const ordinary = makeFight(GOOPS.find((g) => g.id === 'gloop'), {}, { rng: () => 0.25 });
  assert.equal(startMove(ordinary).type, SIGNATURE[ordinary.goop.pattern], 'species without an override retain pattern-based moves');
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

test('specimen size is decided before the fight and changes its difficulty', () => {
  for (const goop of GOOPS) {
    const small = makeFight(goop, {}, { size: goop.size[0], rng: () => 0.5, moves: false });
    const large = makeFight(goop, {}, { size: goop.size[1], rng: () => 0.5, moves: false });
    assert.equal(small.size, goop.size[0]);
    assert.equal(large.size, goop.size[1]);
    assert.equal(small.sizeClass, 'LIGHT');
    assert.equal(large.sizeClass, 'HEAVY');
    assert.ok(large.maxStamina > small.maxStamina, `${goop.id}: larger specimen has more stamina`);
    assert.ok(large.reelRate < small.reelRate, `${goop.id}: larger specimen reels in more slowly`);
    assert.ok(large.forceMul > small.forceMul, `${goop.id}: larger specimen pulls harder`);
  }

  const goop = GOOPS[0];
  assert.equal(rollGoopSize(goop, () => 0, 2), goop.size[0]);
  assert.equal(rollGoopSize(goop, () => 1, 2), goop.size[1]);
  assert.ok(rollGoopSize(goop, () => 0.5, 2) < rollGoopSize(goop, () => 0.5, 1), 'size exponent keeps large specimens rare');

  const game = newGame({ rng: () => 0.5 });
  game.cast();
  game.goop = goop;
  game.phase = PHASES.BITE;
  game.timer = 0;
  game.prevReel = false;
  game.update(1 / 60, { reel: true });
  const foughtSize = rollGoopSize(goop, () => 0.5, game.mods().sizeExp);
  assert.equal(game.fight.size, foughtSize, 'the hook creates the specimen before the fight');
  game.fight.caught = true;
  game.update(0, { reel: true });
  assert.equal(game.lastCatch.size, foughtSize, 'the GoopDex records the exact specimen fought');
});

test('fight handling stays locked to the weather and time of the cast', () => {
  const game = newGame({ rng: () => 0 });
  game.state.casts = CASTS_PER_TIME - 1;
  game.state.timeIndex = 1;
  game.state.weather = 'storm';
  game.state.equip.rod = 'storm';
  const castForce = game.weather.forceMul * game.mods().force;
  assert.equal(castForce, 0.84, 'Storm Caller weakens a storm pull before the clock rolls');

  game.cast();
  assert.equal(game.state.timeIndex, 2, 'the third cast advances time');
  assert.equal(game.state.weather, 'clear', 'the deterministic weather roll changes conditions');

  game.goop = GOOPS[0];
  game.phase = PHASES.BITE;
  game.timer = 0;
  game.prevReel = false;
  game.update(1 / 60, { reel: true });
  assert.equal(game.fight.forceMul, castForce * GOOPS[0].force * 0.95, 'fight uses the conditions that selected the encounter');
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

test('hook timing and fight execution combine into a capped Essence skill bonus', () => {
  const catchWith = ({ hookGrade, best = 1 }) => {
    const g = newGame();
    g.cast();
    g.phase = PHASES.FIGHT;
    g.goop = GOOPS[0];
    g.fight = makeFight(GOOPS[0]);
    g.fight.hookGrade = hookGrade;
    g.fight.best = best;
    g.fight.caught = true;
    g.update(0);
    return g;
  };
  const perfect = catchWith({ hookGrade: 'perfect' });
  assert.equal(perfect.lastCatch.hookSkillBonus, 0.05);
  assert.equal(perfect.lastCatch.skillBonus, 0.05);
  assert.equal(perfect.lastCatch.reward, 8, 'the small bonus is retained through whole-Essence rounding');

  const clean = catchWith({ hookGrade: 'clean' });
  assert.equal(clean.lastCatch.hookSkillBonus, 0.025);
  assert.equal(clean.lastCatch.skillBonus, 0.025);

  const late = catchWith({ hookGrade: 'late' });
  assert.equal(late.lastCatch.hookSkillBonus, 0);
  assert.equal(late.lastCatch.skillBonus, 0);

  const skilled = catchWith({ hookGrade: 'perfect', best: 1.6 });
  assert.equal(skilled.lastCatch.skillBonus, 0.15, 'perfect timing stacks with streak skill up to the 15% cap');
  assert.equal(skilled.lastCatch.reward, 9);
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

test('you can cast anywhere on the shore; between spots you fish a blend of both', () => {
  const g = newGame();
  g.setShore(0.5);
  assert.equal(g.here, false, 'halfway between the dock and Lily Cove');
  const z = g.zone();
  assert.equal(z.hot, false);
  assert.deepEqual(z.mix.map(([s]) => s.id), ['dock', 'lily']);
  const pool = zonePool(z, { weather: 'clear', time: 'Day' });
  assert.ok(pool.some((x) => x.id === 'dripfin'), 'dock-only Goop');
  assert.ok(pool.some((x) => x.id === 'blushkoi'), 'cove-only Goop');
  assert.ok(g.cast(), 'casting on the open shore works');
  g.phase = PHASES.IDLE;
  g.setShore(1.05);
  assert.ok(g.here && g.state.spot === 'lily', 'walking up to a spot arrives at it');
  // locked spots are not part of the open shore
  const far = shoreZone(3, g.openSpots());
  assert.equal(far.spot.id, 'lily');
  assert.equal(far.mix.length, 1);
});

test('baits: matching taste triples weight, one is used per cast, and they can be bought', () => {
  const lily = SPOT_BY.lily;
  const w = (pool, id) => pool.find((x) => x.id === id).weight;
  const plain = encounterPool({ spot: lily, bait: 'worm' });
  const sugar = encounterPool({ spot: lily, bait: 'sugar' });
  const koi = plain.find((x) => x.taste === 'sweet');
  assert.ok(Math.abs(w(sugar, koi.id) / w(plain, koi.id) - 3) < 1e-9);
  const g = newGame();
  assert.equal(g.state.baits.sugar, 3, 'new players get a few starter baits');
  assert.ok(g.selectBait('sugar'));
  assert.equal(g.selectBait('ember'), false, 'none owned');
  g.cast();
  assert.equal(g.state.baits.sugar, 2);
  assert.equal(g.castCtx.bait, 'sugar');
  g.phase = PHASES.IDLE; g.cast(); g.phase = PHASES.IDLE; g.cast();
  assert.equal(g.state.baits.sugar, undefined);
  assert.equal(g.state.bait, 'worm', 'falls back to the worm when the bait runs out');
  assert.ok(g.events.some((e) => e.type === 'baitOut'));
  assert.equal(g.buyBait('ember'), false, 'broke');
  g.state.essence = BAITS.ember.cost;
  assert.ok(g.buyBait('ember'));
  assert.equal(g.state.baits.ember, BAITS.ember.pack);
  assert.equal(g.state.essence, 0);
  assert.equal(g.buyBait('worm'), false);
});

test('golden goo favours rare Goops and events change the pool', () => {
  const deep = SPOT_BY.deep;
  const w = (pool, id) => pool.find((x) => x.id === id)?.weight ?? 0;
  assert.ok(w(encounterPool({ spot: deep, bait: 'golden' }), 'goopshark') > w(encounterPool({ spot: deep }), 'goopshark'));
  assert.equal(w(encounterPool({ spot: SPOT_BY.dock }), 'goldkoi'), 0);
  const visit = encounterPool({ spot: SPOT_BY.dock, event: { visitor: { goop: 'goldkoi', spot: 'dock' } } });
  assert.ok(w(visit, 'goldkoi') > 0, 'a visitor shows up away from home');
  const night = encounterPool({ spot: deep, time: 'Night', event: { fullMoon: true } });
  assert.ok(w(night, 'abyssmelt') > w(encounterPool({ spot: deep, time: 'Night' }), 'abyssmelt'));
  assert.ok(isFullMoon(3) && !isFullMoon(4));
});

test('hook timing has fair perfect, clean and late grades with exact boundaries', () => {
  assert.deepEqual(hookTiming(0), { grade: 'perfect', progress: 0.12 });
  assert.deepEqual(hookTiming(PERFECT_HOOK), { grade: 'perfect', progress: 0.12 });
  assert.deepEqual(hookTiming(PERFECT_HOOK + 0.001), { grade: 'clean', progress: 0.06 });
  assert.deepEqual(hookTiming(CLEAN_HOOK), { grade: 'clean', progress: 0.06 });
  assert.deepEqual(hookTiming(CLEAN_HOOK + 0.001), { grade: 'late', progress: 0 });
  assert.deepEqual(hookTiming(-1), { grade: 'perfect', progress: 0.12 });
  assert.deepEqual(hookTiming(NaN), { grade: 'late', progress: 0 });

  const makeHook = (delay) => {
    const game = newGame();
    game.cast();
    runUntil(game, PHASES.BITE);
    for (let elapsed = 0; elapsed < delay; elapsed += 0.05) game.update(Math.min(0.05, delay - elapsed), { reel: false });
    game.update(0.05, { reel: true });
    return game;
  };
  const perfect = makeHook(0.1);
  assert.equal(perfect.fight.hookGrade, 'perfect');
  assert.equal(perfect.fight.progress, 0.12);
  assert.equal(perfect.fight.perfect, true);

  const clean = makeHook(0.8);
  assert.equal(clean.fight.hookGrade, 'clean');
  assert.equal(clean.fight.progress, 0.06);
  assert.equal(clean.fight.perfect, false);

  const late = makeHook(1.4);
  assert.equal(late.fight.hookGrade, 'late');
  assert.equal(late.fight.progress, 0);
  assert.equal(late.fight.perfect, false);
});

test('lunge temperament changes warning time and force by Goop pattern', () => {
  for (const [pattern, profile] of Object.entries(LUNGE_PROFILE)) {
    const goop = GOOPS.find((g) => g.pattern === pattern && g.rarity !== 'Common');
    assert.ok(goop, `fixture for ${pattern}`);
    const f = makeFight(goop, {}, { rng: () => 0.5 });
    assert.equal(f.lungeWarn, profile.warning);
    const basePower = 0.3 + 0.05 * ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'].indexOf(goop.rarity);
    assert.ok(Math.abs(f.lungePower / basePower - profile.power) < 1e-9, `${pattern} power multiplier`);
    f.nextLunge = profile.warning + 0.05;
    tickFight(f, { reel: false }, 0.06);
    assert.ok(f.warn, `${pattern} warning appears inside its telegraph window`);
    f.nextLunge = 0.04;
    const before = f.tension;
    tickFight(f, { reel: true }, 0.08);
    assert.ok(f.log.includes('lunge'));
    assert.ok(f.tension > before, `${pattern} lunge applies force`);
  }

  const run = (reelDuringLunge) => {
    const f = makeFight(GOOPS.find((x) => x.rarity === 'Rare' && x.pattern === 'pulse'), {}, { rng: () => 0 });
    f.nextLunge = f.lungeWarn + 0.05;
    tickFight(f, { reel: false }, 0.06);
    assert.ok(f.warn, 'warning shows before the lunge');
    f.nextLunge = 0.04;
    tickFight(f, { reel: reelDuringLunge }, 0.08);
    return f;
  };
  assert.ok(run(false).log.includes('dodge'));
  assert.ok(run(true).log.includes('lunge'));
  assert.equal(makeFight(GOOPS[0]).nextLunge, null, 'common Gloops do not lunge');
});

test('staying in the zone builds a combo that speeds the catch', () => {
  assert.equal(comboFor(0), 1);
  assert.ok(comboFor(3) > comboFor(1.3));
  assert.equal(comboFor(999), comboFor(4.8 * 10));
  const f = makeFight(GOOPS[0]);
  f.tension = 0.55;
  for (let i = 0; i < 120; i++) { tickFight(f, { reel: f.tension < 0.6 }, 1 / 60); }
  assert.ok(f.best >= 1);
});

test('bounties: three a day, progress on matching catches and pay out once', () => {
  const g = newGame();
  assert.equal(g.state.bounties.length, 3);
  assert.equal(g.state.bountyDay, 1);
  const list = makeBounties(() => 0.5, { open: [SPOT_BY.dock], dexCount: 10, day: 4 });
  assert.equal(new Set(list.map((b) => b.kind)).size, 3, 'no duplicate kinds');
  assert.ok(bountyMatches({ kind: 'rarity', rarity: 'Rare' }, { rarity: 'Epic' }));
  assert.equal(bountyMatches({ kind: 'rarity', rarity: 'Rare' }, { rarity: 'Common' }), false);
  assert.ok(bountyMatches({ kind: 'size', cm: 20 }, { size: 21 }));
  g.state.bounties = [{ id: 't', kind: 'count', need: 2, have: 0, done: false, text: 'Catch 2', essence: 50, bait: 'mud', baitN: 4 }];
  const catchOne = () => { g.goop = GOOPS[0]; g.phase = PHASES.FIGHT; g.fight = makeFight(GOOPS[0]); g.fight.caught = true; g.update(0); };
  catchOne();
  assert.equal(g.state.bounties[0].have, 1);
  const before = g.state.essence;
  catchOne();
  assert.ok(g.state.bounties[0].done);
  assert.equal(g.state.baits.mud, 3 + 4);
  assert.ok(g.state.essence >= before + 50);
  const paid = g.state.essence;
  catchOne();
  assert.equal(g.state.essence, paid + 8, 'no second payout');
  // a new day brings new bounties
  g.state.timeIndex = 3; g.state.casts = CASTS_PER_TIME - 1; g.phase = PHASES.IDLE;
  g.cast();
  assert.equal(g.state.day, 2);
  assert.equal(g.state.bountyDay, 2);
  assert.ok(g.state.bounties.every((b) => b.id.startsWith('d2-')));
});

test('collections pay out when every Goop in the set is caught', () => {
  const g = newGame();
  const set = SETS.find((x) => x.id === 'regulars');
  for (const id of set.goops.slice(1)) g.state.dex[id] = { count: 1, fastest: null, best: null, shiny: 0 };
  g.goop = GOOPS.find((x) => x.id === set.goops[0]); g.phase = PHASES.FIGHT; g.fight = makeFight(g.goop); g.fight.caught = true;
  g.update(0);
  assert.ok(g.state.sets.includes('regulars'));
  assert.ok(g.events.some((e) => e.type === 'set' && e.detail.reward === set.reward));
  for (const s of SETS) for (const id of s.goops) assert.ok(GOOPS.some((x) => x.id === id), `${s.id}: ${id}`);
});

test('a buddy must be caught first and adds a bonus', () => {
  const g = newGame();
  assert.equal(g.setBuddy('gloop'), false);
  g.state.dex.gloop = { count: 1, fastest: null, best: null, shiny: 0 };
  assert.ok(g.setBuddy('gloop'));
  g.goop = GOOPS[0]; g.phase = PHASES.FIGHT; g.fight = makeFight(GOOPS[0]); g.fight.caught = true;
  g.update(0);
  assert.equal(g.lastCatch.reward, Math.round(8 * 1.1));
});

test('secret spots show up only when conditions line up, and stay found', () => {
  const g = newGame();
  g.state.timeIndex = 1; // day
  assert.equal(g.secretVisible('sandbar'), false);
  assert.equal(g.revealSecret('sandbar'), false);
  assert.equal(g.spotUnlocked('sandbar'), false);
  g.state.timeIndex = 3; // night
  assert.ok(g.secretVisible('sandbar'));
  assert.ok(g.revealSecret('sandbar'));
  assert.equal(g.state.essence, 60);
  assert.ok(g.spotUnlocked('sandbar'));
  assert.equal(g.secretVisible('sandbar'), false, 'only found once');
  g.state.timeIndex = 1;
  assert.equal(g.secretVisible('cave'), false, 'the falls are still locked');
  assert.equal(g.rumor(), null, 'no rumour about places you cannot reach yet');
  for (const goop of GOOPS.slice(0, 12)) g.state.dex[goop.id] = { count: 1, fastest: null, best: null, shiny: 0 };
  assert.ok(g.secretVisible('cave'));
  assert.equal(g.rumor().spot, 'cave');
  // a saved secret survives a reload
  const { store } = memStore(JSON.stringify(g.state));
  assert.ok(store.load().discovered.includes('sandbar'));
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
  const g = new FishingGame({ rng: () => 0, saveStore: store });
  g.rng = () => (rolls.length ? rolls.shift() : 0);
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
  // crossing a threshold announces the newly opened stretch of shore
  const h = newGame();
  for (const goop of GOOPS.slice(1, 3)) h.state.dex[goop.id] = { count: 1, fastest: null, best: null, shiny: 0 };
  h.goop = GOOPS[0]; h.phase = PHASES.FIGHT; h.fight = makeFight(h.goop); h.fight.caught = true;
  h.update(0);
  assert.ok(h.events.some((e) => e.type === 'unlock' && e.detail.spot === 'reeds'));
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
  assert.equal(store.load().version, 3);
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

test('version-2 saves load with new fields filled in and bad new fields are dropped', () => {
  const { store } = memStore(JSON.stringify({
    version: 2, essence: 30, dex: { gloop: { count: 1 } }, discovered: ['dock', 'sandbar'], spot: 'dock',
  }));
  const s = store.load();
  assert.equal(s.version, 3);
  assert.equal(s.baits.sugar, 3, 'returning players get starter bait');
  assert.equal(s.bait, 'worm');
  assert.ok(s.discovered.includes('sandbar'), 'found secrets are kept');
  const bad = memStore(JSON.stringify({
    version: 3, bait: 'ember', baits: { ember: 0, glow: 'x', fake: 9 }, buddy: 'lumen', sets: ['bogus', 'jelly'],
    bounties: [{ kind: 'nope', text: 'x' }, 5], frenzy: 'deep', visitor: { goop: 'nope', spot: 'dock' }, shore: 99,
  })).store.load();
  assert.equal(bad.bait, 'worm');
  assert.deepEqual(bad.baits, {});
  assert.equal(bad.buddy, null, 'must be caught to be a buddy');
  assert.deepEqual(bad.sets, ['jelly']);
  assert.deepEqual(bad.bounties, []);
  assert.equal(bad.frenzy, null, 'cannot frenzy at a locked spot');
  assert.equal(bad.visitor, null);
  assert.equal(bad.shore, 0);
});

test('version-1 saves migrate: GoopDex kept, old lake purchases refunded', () => {
  const { mem, store } = memStore(JSON.stringify({
    version: 1, essence: 40, dex: { gloop: { count: 2, fastest: 3.1 }, lumen: { count: 1 } }, day: 3, weather: 'clear',
    caughtToday: 1, spot: 'reeds', unlocked: ['pond', 'reeds'], gear: { rod: 1 },
  }));
  const s = store.load();
  assert.equal(s.version, 3);
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
  assert.ok(g.events.length <= 60);
  g.reset();
  assert.equal(g.state.essence, 0);
  assert.equal(g.phase, PHASES.IDLE);
});

test('rods: dex-gated purchases, equip, and real effects on the fight and the pool', () => {
  const g = newGame();
  assert.equal(g.state.equip.rod, 'twig');
  assert.equal(g.buyTackle('rods', 'bamboo'), false, 'broke');
  g.state.essence = 5000;
  assert.equal(g.buyTackle('rods', 'carbon'), false, 'needs a bigger GoopDex');
  assert.ok(g.buyTackle('rods', 'bamboo'));
  assert.equal(g.state.equip.rod, 'bamboo');
  assert.equal(g.state.essence, 5000 - RODS.bamboo.cost);
  assert.equal(g.buyTackle('rods', 'bamboo'), false, 'already owned');
  for (const goop of GOOPS.slice(0, 12)) g.state.dex[goop.id] = { count: 1, fastest: null, best: null, shiny: 0 };
  assert.ok(g.buyTackle('rods', 'carbon'));
  const f = makeFight(GOOPS[0], {}, { reel: g.mods().reel, zone: g.mods().zone });
  const base = makeFight(GOOPS[0]);
  assert.ok(f.reelRate > base.reelRate && f.safeHi < base.safeHi, 'carbon: fast but narrow');
  assert.ok(g.equipTackle('rods', 'twig'));
  assert.equal(g.equipTackle('rods', 'abyss'), false, 'not owned');
  const coral = tackleMods({ rod: 'coral' }, {}, {});
  const lily = SPOT_BY.lily;
  const sweet = encounterPool({ spot: lily }).find((x) => x.taste === 'sweet');
  const w = (pool) => pool.find((x) => x.id === sweet.id).weight;
  assert.ok(Math.abs(w(encounterPool({ spot: lily, mods: coral })) / w(encounterPool({ spot: lily })) - 1.6) < 1e-9);
  const storm = tackleMods({ rod: 'storm' }, {}, { weather: 'storm' });
  assert.ok(storm.force < 1 && storm.essence > 1);
  assert.equal(tackleMods({ rod: 'storm' }, {}, { weather: 'clear' }).essence, 1);
  for (const r of Object.values(RODS)) assert.ok(r.name && r.style && r.desc);
});

test('rod handling identities affect actual fight tolerance', () => {
  const get = (rod) => tackleMods({ rod }, {});
  const bamboo = get('bamboo');
  const glass = get('glass');
  const carbon = get('carbon');
  const oak = get('oak');
  const coral = get('coral');
  const crystal = get('crystal');
  const abyss = get('abyss');
  assert.ok(bamboo.snapGuard > 1 && bamboo.zone > 0, 'bamboo absorbs shock and is forgiving');
  assert.ok(glass.bite < 1 && glass.snapGuard < 1, 'glass attracts bites but is delicate');
  assert.ok(carbon.reel > 1 && carbon.snapGuard < 1 && carbon.zone < 0, 'carbon is fast but punishes mistakes');
  assert.ok(oak.force < 1 && oak.lunge < 1 && oak.snapGuard > 1, 'ironwood controls powerful surges');
  assert.ok(coral.taste.sweet > 1, 'coral remains a sweet-Goop specialist');
  assert.ok(crystal.shiny > 1 && crystal.snapGuard < 1, 'crystal prioritizes trophy odds over heavy-fight control');
  assert.ok(abyss.legend > 1 && abyss.lunge < 1, 'abyssal reach specializes in deep rare encounters');
  const goop = GOOPS.find((g) => g.rarity === 'Rare');
  const fight = makeFight(goop, {}, { snapGuard: oak.snapGuard });
  assert.ok(fight.snapGuard > makeFight(goop).snapGuard, 'rod shock absorption reaches the fight simulation');
});

test('fishing lines provide distinct tactical bonuses and trade-offs', () => {
  const mods = (line) => tackleMods({ line }, {});
  const mono = mods('classic');
  const slime = mods('slime');
  const pink = mods('pink');
  const braid = mods('ember');
  const gold = mods('gold');
  const rainbow = mods('rainbow');
  assert.ok(mono.bite < 1 && mono.snapGuard > 1, 'mono improves bite speed but protects against tension');
  assert.ok(slime.zone > 0 && slime.reel < 1, 'slime line is forgiving but slower');
  assert.ok(pink.reel > 1 && pink.zone < 0, 'pink line rewards precise play');
  assert.ok(braid.force < 1 && braid.snapGuard < 1 && braid.bite > 1, 'braid weakens Goops but has slower bites and lower shock tolerance');
  assert.ok(gold.shiny > 1 && gold.essence > 1, 'gold line improves rewards');
  assert.ok(rainbow.zone > 0 && rainbow.reel > 1, 'rainbow line is a balanced option');
  const goop = GOOPS.find((g) => g.rarity === 'Rare');
  const fight = makeFight(goop, {}, { snapGuard: mono.snapGuard });
  assert.ok(fight.snapGuard > makeFight(goop).snapGuard, 'line shock protection reaches fight simulation');
});

test('skins, bobbers and lines are bought once and equipped', () => {
  const g = newGame();
  g.state.essence = 10000;
  for (const [kind, table, slot] of [['skins', SKINS, 'skin'], ['bobbers', BOBBERS, 'bobber'], ['lines', LINES, 'line']]) {
    const id = Object.keys(table).find((k) => table[k].cost > 0);
    assert.ok(g.buyTackle(kind, id));
    assert.equal(g.state.equip[slot], id);
    assert.equal(g.buyTackle(kind, id), false);
  }
  assert.equal(g.buyTackle('hats', 'x'), false);
});

test('lures level up to 3 and change odds, bites, sizes and shinies', () => {
  const g = newGame();
  g.state.essence = 100000;
  assert.equal(g.lureCost('spinner'), LURES.spinner.cost[0]);
  const baselineBite = g.mods().bite;
  for (let i = 0; i < 3; i++) assert.ok(g.buyLure('spinner'));
  assert.equal(g.state.owned.lures.spinner, 3);
  assert.equal(g.lureCost('spinner'), null);
  assert.equal(g.buyLure('spinner'), false, 'maxed');
  assert.equal(g.mods().bite, baselineBite * LURES.spinner.lv[2]);
  assert.ok(g.equipLure('none'));
  assert.equal(g.equipLure('clover'), false, 'not owned');
  const owned = { lures: { jig: 2, spoon: 1, glowjig: 1, trophy: 3, clover: 1, feather: 1, diver: 1 } };
  assert.equal(tackleMods({ lure: 'jig' }, owned).pattern.dart, LURES.jig.lv[1]);
  assert.ok(tackleMods({ lure: 'spoon' }, owned, { time: 'Day' }).rare > 1);
  assert.equal(tackleMods({ lure: 'spoon' }, owned, { time: 'Night' }).rare, 1);
  assert.ok(tackleMods({ lure: 'glowjig' }, owned, { time: 'Night' }).rare > 1);
  assert.ok(tackleMods({ lure: 'trophy' }, owned).sizeExp < 2);
  assert.ok(tackleMods({ lure: 'clover' }, owned).shiny > 1);
  assert.ok(tackleMods({ lure: 'feather' }, owned).force < 1);
  const d = tackleMods({ lure: 'diver' }, owned);
  assert.ok(d.legend > 1 && d.bite > 1);
  for (const [id, l] of Object.entries(LURES)) if (id !== 'none') { assert.equal(l.cost.length, 3); assert.equal(l.lv.length, 3); assert.ok(l.fx(l.lv[0]).length); }
});

test('charms: hourglass, weather totem, frenzy flare and tips cost Essence and work', () => {
  const g = newGame();
  assert.equal(g.useCharm('hourglass'), false, 'broke');
  g.state.essence = 1000;
  const t = g.state.timeIndex;
  assert.ok(g.useCharm('hourglass'));
  assert.equal(g.state.timeIndex, (t + 1) % 4);
  assert.equal(g.state.essence, 1000 - CHARMS.hourglass.cost);
  assert.ok(g.useCharm('totem', 'storm'));
  assert.equal(g.state.weather, 'storm');
  assert.equal(g.useCharm('totem', 'storm'), false, 'already storming');
  assert.equal(g.useCharm('totem', 'meteors'), false);
  g.setShore(1);
  assert.ok(g.useCharm('flare'));
  assert.equal(g.state.frenzy, 'lily');
  const before = GOOPS.filter((x) => g.knows(x.id)).length;
  assert.ok(g.useCharm('tip'));
  assert.equal(GOOPS.filter((x) => g.knows(x.id)).length, before + 1);
  g.cast();
  assert.equal(g.useCharm('hourglass'), false, 'not mid-cast');
});

test('fish finder forecasts the pool; buddies train up', () => {
  const g = newGame();
  assert.equal(g.buyFinder(), false);
  g.state.essence = FINDER_COST + 2000;
  assert.ok(g.buyFinder());
  assert.equal(g.buyFinder(), false, 'only once');
  const fc = g.forecast(50);
  assert.ok(fc.length > 3);
  assert.ok(Math.abs(fc.reduce((a, x) => a + x.chance, 0) - 1) < 1e-9);
  assert.ok(fc[0].chance >= fc[fc.length - 1].chance);
  assert.equal(g.trainBuddy(), false, 'no buddy yet');
  g.state.dex.gloop = { count: 1, fastest: null, best: null, shiny: 0 };
  g.setBuddy('gloop');
  assert.ok(g.trainBuddy());
  assert.equal(g.state.buddyLv, 1);
  g.goop = GOOPS[0]; g.phase = PHASES.FIGHT; g.fight = makeFight(GOOPS[0]); g.fight.caught = true;
  g.update(0);
  assert.equal(g.lastCatch.reward, Math.round(8 * 1.14));
  g.state.essence = 100000;
  while (g.trainBuddy());
  assert.equal(g.state.buddyLv, BUDDY_TRAIN.length);
});

test('tackle saves round-trip and junk tackle data is cleaned', () => {
  const g = newGame();
  g.state.essence = 5000;
  g.buyTackle('rods', 'bamboo'); g.buyLure('jig'); g.buyTackle('skins', 'gold');
  const { store } = memStore(JSON.stringify(g.state));
  const s = store.load();
  assert.equal(s.equip.rod, 'bamboo');
  assert.equal(s.owned.lures.jig, 1);
  assert.equal(s.equip.skin, 'gold');
  const bad = memStore(JSON.stringify({ version: 3, owned: { rods: ['abyss', 'fake'], lures: { jig: 9, nope: 2, none: 1 } }, equip: { rod: 'fake', lure: 'nope', skin: 'gold' }, buddyLv: 99, finder: 'yes', tips: ['nope', 'gloop'] })).store.load();
  assert.deepEqual(bad.owned.rods, ['twig', 'abyss']);
  assert.deepEqual(bad.owned.lures, { jig: 3 });
  assert.equal(bad.equip.rod, 'twig');
  assert.equal(bad.equip.lure, 'none');
  assert.equal(bad.equip.skin, 'factory', 'skin not owned');
  assert.equal(bad.buddyLv, BUDDY_TRAIN.length);
  assert.equal(bad.finder, false);
  assert.deepEqual(bad.tips, ['gloop']);
});

test('quests: progress, claim at Wiggs, rewards, and state-based goals', () => {
  const g = newGame();
  assert.equal(g.quest.id, 'q1');
  assert.equal(g.claimQuest(), false, 'not done yet');
  const catchOne = (goop = GOOPS[0]) => { g.goop = goop; g.phase = PHASES.FIGHT; g.fight = makeFight(goop); g.fight.caught = true; g.update(0); };
  catchOne(); catchOne();
  assert.deepEqual(g.questProgress(), { have: 2, need: 3, ready: false });
  catchOne();
  assert.ok(g.questProgress().ready);
  assert.ok(g.events.some((e) => e.type === 'questReady'));
  const before = g.state.essence;
  assert.ok(g.claimQuest());
  assert.equal(g.state.essence, before + 50);
  assert.ok(g.state.owned.bobbers.includes('slime'), 'item reward');
  assert.equal(g.quest.id, 'q2');
  // bait quest
  g.selectBait('sugar'); g.cast(); g.phase = PHASES.FIGHT; g.goop = GOOPS[0]; g.fight = makeFight(GOOPS[0]); g.fight.caught = true; g.update(0);
  assert.ok(g.claimQuest());
  assert.equal(g.quest.id, 'q3');
  // state-based: discover the reeds
  for (const goop of GOOPS.slice(1, 4)) g.state.dex[goop.id] = { count: 1, fastest: null, best: null, shiny: 0 };
  assert.ok(g.travel('reeds'));
  assert.ok(g.questProgress().ready);
  assert.ok(g.claimQuest());
  assert.equal(g.quest.id, 'q4');
  for (const q of QUESTS) {
    assert.ok(q.title && q.story && q.done && q.goal.type);
    if (q.reward.item) { const [kind, id] = q.reward.item; assert.ok(kind === 'decor' ? DECOR[id] : { rods: RODS, skins: SKINS, bobbers: BOBBERS }[kind][id], `${q.id} reward`); }
  }
});

test('the Sleeper only rises during the last quest, then on full-moon nights', () => {
  const deep = SPOT_BY.deep;
  const has = (ev) => encounterPool({ spot: deep, time: 'Night', event: ev }).some((x) => x.id === 'sleeper');
  assert.equal(has({}), false);
  assert.ok(has({ sleeper: true }));
  assert.equal(encounterPool({ spot: deep, time: 'Day', event: { sleeper: true } }).some((x) => x.id === 'sleeper'), false, 'night only');
  const g = newGame();
  assert.equal(g.event.sleeper, false);
  g.state.quest.i = QUESTS.length - 1;
  assert.ok(g.event.sleeper, 'quest active');
  const sleeper = GOOPS.find((x) => x.id === 'sleeper');
  g.goop = sleeper; g.phase = PHASES.FIGHT; g.fight = makeFight(sleeper); g.fight.caught = true; g.update(0);
  assert.ok(g.claimQuest());
  assert.equal(g.quest, null, 'story complete');
  assert.ok(g.state.tank.decor.includes('statue'));
  g.state.day = 3; // full moon
  assert.ok(g.event.sleeper);
  g.state.day = 4;
  assert.equal(g.event.sleeper, false);
});

test('aquarium: daily tip jar, decorations and themes', () => {
  const g = newGame();
  assert.equal(g.tipJar(), 0, 'empty tank');
  g.state.dex.gloop = { count: 1, fastest: null, best: null, shiny: 1 };
  g.state.dex.lumen = { count: 1, fastest: null, best: null, shiny: 0 };
  assert.equal(g.tipJar(), tankTips(g.state.dex));
  assert.equal(tankTips({ gloop: { shiny: 1 }, lumen: {} }), 3 + 15 + 3 + 4);
  const tip = g.collectTips();
  assert.ok(tip > 0 && g.state.essence === tip);
  assert.equal(g.collectTips(), 0, 'once a day');
  g.state.day += 1;
  assert.ok(g.tipJar() > 0);
  g.state.essence = 5000;
  assert.ok(g.buyDecor('coral'));
  assert.equal(g.buyDecor('coral'), false, 'owned');
  assert.equal(g.buyDecor('statue'), false, 'quest only');
  assert.equal(g.buyDecor('throne'), false, 'needs 3 Legendaries');
  assert.deepEqual(g.state.tank.tanks[0].decor, ['coral']);
  assert.ok(g.setTheme('moon'));
  assert.equal(g.state.tank.tanks[0].theme, 'moon');
  const left = g.state.essence;
  assert.ok(g.setTheme('pond') && g.setTheme('moon'));
  assert.equal(g.state.essence, left, 'owned themes are free to switch');
  const { store } = memStore(JSON.stringify(g.state));
  const s = store.load();
  assert.deepEqual(s.tank.decor, ['coral']);
  assert.equal(s.tank.tanks[0].theme, 'moon');
  const bad = memStore(JSON.stringify({ version: 3, quest: { i: 999, have: -4 }, tank: { decor: ['coral', 'ufo'], theme: 'lava', themes: ['nope'] } })).store.load();
  assert.equal(bad.quest.i, QUESTS.length);
  assert.equal(bad.quest.have, 0);
  assert.deepEqual(bad.tank.decor, ['coral']);
  assert.equal(bad.tank.tanks[0].theme, 'pond', 'theme not owned');
  assert.deepEqual(bad.tank.tanks[0].decor, ['coral'], 'old single-tank saves keep their decor');
});

test('multiple tanks: buy, rename, residents with a cap, decor moves between tanks', () => {
  const g = newGame();
  const ids = GOOPS.slice(0, TANK_CAP + 2).map((x) => x.id);
  // catching new Goops houses them until the tank is full
  for (const goop of GOOPS.slice(0, TANK_CAP + 1)) { g.goop = goop; g.phase = PHASES.FIGHT; g.fight = makeFight(goop); g.fight.caught = true; g.update(0); }
  assert.equal(g.state.tank.tanks[0].fish.length, TANK_CAP);
  assert.equal(g.lastCatch.tank, -1, 'full tanks send new Goops to storage');
  assert.equal(g.tankOf(ids[TANK_CAP]), -1);
  assert.equal(g.setResident(ids[TANK_CAP], 0), false, 'tank is full');
  assert.equal(g.buyTank(), false, 'broke');
  g.state.essence = 10000;
  assert.equal(g.tankCost(), TANK_COSTS[1]);
  assert.ok(g.buyTank());
  assert.equal(g.state.tank.tanks.length, 2);
  assert.ok(g.setResident(ids[TANK_CAP], 1));
  assert.equal(g.tankOf(ids[TANK_CAP]), 1);
  assert.ok(g.setResident(ids[0], 1), 'move between tanks');
  assert.equal(g.tankOf(ids[0]), 1);
  assert.equal(g.state.tank.tanks[0].fish.length, TANK_CAP - 1);
  assert.ok(g.setResident(ids[0], -1), 'back to storage');
  assert.equal(g.tankOf(ids[0]), -1);
  assert.ok(g.renameTank(1, '  Night <Tank>  '));
  assert.equal(g.state.tank.tanks[1].name, 'Night Tank');
  assert.equal(g.renameTank(1, '   '), false);
  assert.ok(g.buyDecor('coral', 1));
  assert.deepEqual(g.state.tank.tanks[1].decor, ['coral']);
  assert.ok(g.placeDecor('coral', 0), 'moves to the other tank');
  assert.deepEqual(g.state.tank.tanks[1].decor, []);
  assert.deepEqual(g.state.tank.tanks[0].decor, ['coral']);
  assert.ok(g.placeDecor('coral', 0), 'take it out');
  assert.deepEqual(g.state.tank.tanks[0].decor, []);
  for (const id of ['coral', 'anchor', 'shrooms', 'crystals', 'castle', 'chest']) { if (!g.state.tank.decor.includes(id)) g.buyDecor(id, 0); else g.placeDecor(id, 0); }
  assert.equal(g.state.tank.tanks[0].decor.length, DECOR_SLOTS);
  assert.equal(g.buyDecor('ship', 0), false, 'no free slot');
  while (g.buyTank());
  assert.equal(g.state.tank.tanks.length, TANK_COSTS.length);
  assert.equal(g.tankCost(), null);
  const s = memStore(JSON.stringify(g.state)).store.load();
  assert.equal(s.tank.tanks[1].name, 'Night Tank');
  assert.equal(s.tank.tanks[1].fish.length, 1);
});

// ----- signature moves -----
const quiet = (goop) => { const f = makeFight(goop, {}, { rng: () => 0.3, moves: false }); f.nextLunge = null; return f; };
const step = (f, input = {}, dt = 1 / 60) => tickFight(f, { reel: false, tap: false, steer: 0, ...input }, dt);
const lastLog = (f, type) => f.log.filter((e) => typeof e === 'object' && e.type === type).pop();

test('every fighting style has a signature move', () => {
  for (const p of ['steady', 'pulse', 'dart', 'drift', 'sleepy', 'wild']) assert.ok(MOVE_INFO[SIGNATURE[p]], p);
  const f = makeFight(GOOPS[0], {}, { rng: () => 0.5 });
  assert.ok(f.nextMove > 1 && f.nextMove < 5, 'first move comes a couple of seconds in');
});

test('swerve: steering the right way wins, the wrong way or too late loses', () => {
  const dart = GOOPS.find((g) => g.pattern === 'dart' && g.rarity === 'Uncommon');
  let f = quiet(dart); f.progress = 0.2; const m = startMove(f, 'swerve');
  step(f); step(f, { steer: m.dir });
  assert.equal(f.move, null); assert.ok(lastLog(f, 'moveWin')); assert.ok(f.progress > 0.2);
  f = quiet(dart); f.progress = 0.2; const m2 = startMove(f, 'swerve');
  step(f, { steer: -m2.dir });
  assert.equal(lastLog(f, 'moveFail').why, 'wrong'); assert.ok(f.progress < 0.2);
  f = quiet(dart); startMove(f, 'swerve');
  for (let i = 0; i < 120 && f.move; i++) step(f);
  assert.equal(lastLog(f, 'moveFail').why, 'slow');
});

test('a failed signature move cannot overfill a specimen stamina bar', () => {
  const goop = GOOPS.find((x) => x.pattern === 'dart');
  const fight = makeFight(goop, {}, { size: goop.size[1], rng: () => 0.3, moves: false });
  fight.nextLunge = null;
  fight.stamina = fight.maxStamina - 0.001;
  startMove(fight, 'swerve');
  for (let i = 0; i < 120 && fight.move; i++) step(fight);
  assert.ok(lastLog(fight, 'moveFail'));
  assert.ok(fight.stamina <= fight.maxStamina, 'failure recovery is capped even after the same frame resumes normal fight drain');
});

test('tug of war: fast taps win, no taps lose, and the tension game pauses', () => {
  const g = GOOPS.find((x) => x.pattern === 'steady' && x.rarity === 'Common');
  let f = quiet(g); startMove(f, 'tug');
  const before = f.progress;
  for (let i = 0; i < 400 && f.move; i++) step(f, { tap: i % 8 === 0, reel: i % 8 === 0 });
  assert.ok(lastLog(f, 'moveWin'), 'about 7 taps a second is enough'); assert.ok(f.progress > before);
  f = quiet(g); startMove(f, 'tug');
  for (let i = 0; i < 400 && f.move; i++) step(f, { reel: true });
  assert.ok(lastLog(f, 'moveFail'), 'holding the reel is not tapping');
});

test('fake-out: reeling while it plays dead loses; reeling right as it wakes wins', () => {
  const g = GOOPS.find((x) => x.pattern === 'sleepy');
  let f = quiet(g); startMove(f, 'fakeout');
  for (let i = 0; i < 30; i++) step(f);
  step(f, { tap: true, reel: true });
  assert.equal(lastLog(f, 'moveFail').why, 'eager');
  f = quiet(g); const m = startMove(f, 'fakeout');
  let told = false;
  while (f.move && m.state === 'still') { step(f); told ||= !!f.tell; }
  assert.ok(told, 'there is a tell just before it wakes');
  assert.ok(lastLog(f, 'surge'));
  step(f, { tap: true, reel: true });
  assert.ok(lastLog(f, 'moveWin'));
  f = quiet(g); const m3 = startMove(f, 'fakeout');
  while (f.move && m3.state === 'still') step(f);
  for (let i = 0; i < 60 && f.move; i++) step(f);
  assert.equal(lastLog(f, 'moveFail').why, 'slow');
});

test('rhythm: taps on the beat win, random taps lose', () => {
  const g = GOOPS.find((x) => x.pattern === 'pulse');
  let f = quiet(g); const m = startMove(f, 'rhythm');
  const beats = Array.from({ length: m.n }, (_, i) => m.lead + i * m.gap);
  let t = 0;
  while (f.move) { const tap = beats.some((b) => t < b && t + 1 / 60 >= b); step(f, { tap, reel: tap }); t += 1 / 60; }
  assert.ok(lastLog(f, 'moveWin'));
  f = quiet(g); startMove(f, 'rhythm'); let i = 0;
  while (f.move) { step(f, { tap: i % 23 === 0 }); i++; }
  assert.ok(lastLog(f, 'moveFail'));
});

test('current: the zone drifts and you must follow it', () => {
  const g = GOOPS.find((x) => x.pattern === 'drift');
  let f = quiet(g); startMove(f, 'current');
  let shifted = false;
  while (f.move) {
    const c = (f.safeLo + f.safeHi) / 2 + (f.zoneShift || 0); shifted ||= Math.abs(f.zoneShift) > 0.05;
    step(f, { reel: f.tension < c });
  }
  assert.ok(shifted); assert.ok(lastLog(f, 'moveWin'));
  f = quiet(g); startMove(f, 'current');
  while (f.move) step(f);
  assert.ok(lastLog(f, 'moveFail'), 'a slack line drifts out of the zone');
});

test('thrash: follow every arrow and tap in order', () => {
  const g = GOOPS.find((x) => x.pattern === 'wild');
  let f = quiet(g); const m = startMove(f, 'thrash');
  while (f.move) { const w = m.steps[m.idx]; step(f, w === 'T' ? { tap: true, reel: true } : { steer: w === 'L' ? -1 : 1 }); step(f); }
  assert.ok(lastLog(f, 'moveWin'));
  f = quiet(g); const m2 = startMove(f, 'thrash');
  m2.steps = ['L', 'T']; step(f, { steer: 1 });
  assert.equal(lastLog(f, 'moveFail').why, 'wrong');
});

test('Epics fight in two stages and Legendaries in three, with a breather between', () => {
  const leg = GOOPS.find((x) => x.rarity === 'Legendary');
  assert.equal(stagesFor(leg), 3);
  assert.equal(stagesFor(GOOPS.find((x) => x.rarity === 'Epic')), 2);
  assert.equal(stagesFor(GOOPS[0]), 1);
  const f = quiet(leg);
  f.progress = 0.3; f.tension = 0.55;
  for (let i = 0; i < 300 && !lastLog(f, 'breakaway'); i++) step(f, { reel: f.tension < 0.58 });
  assert.ok(lastLog(f, 'breakaway'));
  assert.ok(f.progress <= 1 / 3 + 1e-9, 'progress stops at the end of the stage');
  const stam = f.stamina, prog = f.progress;
  for (let i = 0; i < BREAK_TIME * 60 + 30 && f.stage === 1; i++) step(f, { reel: true });
  assert.equal(f.stage, 2);
  assert.ok(lastLog(f, 'stage'));
  assert.ok(f.stamina > stam, 'it catches its breath');
  assert.equal(f.progress, prog, 'no progress lost or gained during the break');
  assert.equal(f.caught, false);
});
test('fight outcome reactions are bounded, directional, and expire deterministically', () => {
  const start = 10_000;
  const win = fightReactionPose({ type: 'win', move: 'swerve', at: start, duration: 1 }, start + 500, 300, 500, 500);
  assert.ok(win);
  assert.equal(win.type, 'win');
  assert.equal(win.move, 'swerve');
  assert.ok(win.x < 300, 'a successful counter makes the Goop recoil away from the bobber');
  assert.ok(win.y > 500, 'a successful counter briefly sinks the Goop');
  assert.ok(win.scale < 1);
  assert.ok(win.alpha < 1);

  const fail = fightReactionPose({ type: 'fail', move: 'thrash', at: start, duration: 0.8 }, start + 400, 300, 500, 500);
  assert.ok(fail);
  assert.equal(fail.type, 'fail');
  assert.ok(fail.x > 300, 'a failed counter makes the Goop surge toward the bobber');
  assert.ok(fail.y < 500, 'a failed counter brings the Goop closer to the surface');
  assert.ok(fail.scale > 1);

  assert.equal(fightReactionPose({ type: 'win', at: start, duration: 1 }, start + 1_000, 300, 500, 500), null);
  assert.equal(fightReactionPose({ type: 'win', at: start, duration: 0 }, start + 100, 300, 500, 500), null);
  assert.equal(fightReactionPose({ type: 'win', at: start, duration: 1 }, start + 100, Number.NaN, 500, 500), null);
  assert.equal(fightReactionPose(null, start + 100, 300, 500, 500), null);
});


test('habitat research upgrades v3 saves safely and sanitizes malformed v4 research', () => {
  const legacy = memStore(JSON.stringify({
    version: 3,
    essence: 415,
    day: 4,
    dex: { gloop: { count: 2, best: 18 } },
    discovered: ['dock'],
    spot: 'dock',
  })).store.load();

  assert.equal(legacy.version, 4);
  assert.equal(legacy.essence, 415);
  assert.equal(legacy.dex.gloop.count, 2);
  assert.deepEqual(legacy.research, {}, 'old saves gain an empty research ledger without losing progress');

  const migrated = memStore(JSON.stringify({
    version: 4,
    essence: 90,
    research: {
      dock: {
        points: 72.8,
        catches: 9,
        species: ['gloop', 'drowsy', 'invalid', 'gloop'],
        times: ['Night', 'bad'],
        weather: ['storm', 'meteors'],
        baits: ['worm', 'not-a-bait'],
        perfect: 2,
      },
      nowhere: { points: 9999, species: ['sleeper'] },
      lily: null,
    },
  })).store.load();

  assert.deepEqual(migrated.research.dock, {
    points: 72,
    catches: 9,
    species: ['gloop', 'drowsy'],
    times: ['Night'],
    weather: ['storm'],
    baits: ['worm'],
    perfect: 2,
  });
  assert.equal(migrated.research.nowhere, undefined, 'unknown habitats are discarded');
  assert.equal(migrated.research.lily, undefined, 'malformed records are discarded');
  const survey = new FishingGame({ rng: () => 0, saveStore: memStore(JSON.stringify({
    version: 4,
    research: { dock: { points: 72, species: ['gloop'] } },
  })).store });
  assert.equal(survey.habitatResearch('dock').rank, 2);
  assert.equal(survey.habitatResearch('dock').title, HABITAT_RESEARCH_TIERS[1].name);
});

test('habitat research rewards first local evidence, rare specimens and perfect hooks once', () => {
  const game = newGame();
  const dockGloop = GOOPS.find((g) => g.id === 'gloop');
  const dockRare = GOOPS.find((g) => g.id === 'drowsy');

  const first = game.recordHabitatResearch({
    spot: 'dock', time: 'Day', weather: 'clear', bait: 'worm',
  }, dockGloop, { hookGrade: 'perfect' });

  assert.equal(first.earned, 14, 'base sample + new species + new time + new weather + new bait + perfect hook');
  assert.equal(first.total, 14);
  assert.equal(first.rank, 0);
  assert.deepEqual(first.reasons, ['new species', 'new time of day', 'new weather', 'new bait', 'perfect hook']);

  const rare = game.recordHabitatResearch({
    spot: 'dock', time: 'Night', weather: 'storm', bait: 'mud',
  }, dockRare, { hookGrade: 'late' });

  assert.equal(rare.earned, 15, 'a first local rare species earns additional evidence');
  assert.equal(rare.total, 29);
  assert.equal(rare.rank, 1);
  assert.equal(rare.title, 'Surveyor');
  assert.ok(rare.reasons.includes('rare specimen'));

  const repeat = game.recordHabitatResearch({
    spot: 'dock', time: 'Night', weather: 'storm', bait: 'mud',
  }, dockRare, { hookGrade: 'late' });

  assert.equal(repeat.earned, 3, 'repeat samples earn only the base field notes');
  assert.equal(repeat.total, 32);
  assert.equal(game.habitatResearch('dock').catches, 3);
  assert.equal(game.habitatResearch('dock').speciesCount, 2);
  assert.equal(game.habitatResearch('dock').timeCount, 2);
  assert.equal(game.habitatResearch('dock').weatherCount, 2);
  assert.equal(game.habitatResearch('dock').baitCount, 2);
  assert.equal(game.habitatResearch('dock').perfect, 1);
  assert.equal(game.habitatResearch('lily').points, 0, 'research is isolated per habitat');
});

test('habitat mastery perks compose with tackle and blend smoothly between neighboring spots', () => {
  const game = newGame();
  const empty = game.mods({ weather: 'clear', time: 'Day' });
  assert.equal(empty.bite, 1);
  assert.equal(empty.rare, 1);
  assert.equal(empty.essence, 1);
  assert.equal(empty.shiny, 1);

  game.state.research.dock = {
    points: 148, catches: 24, species: [], times: [], weather: [], baits: [], perfect: 0,
  };
  const full = game.mods({ weather: 'clear', time: 'Day' }, {
    spot: SPOT_BY.dock, hot: true, mix: [[SPOT_BY.dock, 1]],
  });
  assert.ok(Math.abs(full.bite - 0.97) < 1e-12);
  assert.ok(Math.abs(full.rare - 1.05) < 1e-12);
  assert.ok(Math.abs(full.essence - 1.04) < 1e-12);
  assert.ok(Math.abs(full.shiny - 1.08) < 1e-12);

  const blended = game.habitatModifiers({
    spot: SPOT_BY.dock, hot: false, mix: [[SPOT_BY.dock, 0.5], [SPOT_BY.lily, 0.5]],
  });
  assert.ok(Math.abs(blended.bite - 0.985) < 1e-12);
  assert.ok(Math.abs(blended.rare - 1.025) < 1e-12);
  assert.ok(Math.abs(blended.essence - 1.02) < 1e-12);
  assert.ok(Math.abs(blended.shiny - 1.04) < 1e-12);
});

test('habitat rare-rank bonus changes forecast encounter weighting without bypassing ecology gates', () => {
  const game = newGame();
  const baseline = game.forecast(GOOPS.length);
  const chanceOf = (rows, id) => rows.find((row) => row.id === id)?.chance || 0;
  const baseRatio = chanceOf(baseline, 'drowsy') / chanceOf(baseline, 'gloop');

  game.state.research.dock = {
    points: 52, catches: 20, species: [], times: [], weather: [], baits: [], perfect: 0,
  };
  const researched = game.forecast(GOOPS.length);
  const researchedRatio = chanceOf(researched, 'drowsy') / chanceOf(researched, 'gloop');
  assert.ok(Math.abs(researchedRatio / baseRatio - 1.05) < 1e-9,
    'Naturalist rank raises eligible rare encounter weight by 5% relative to common Goops');

  game.state.timeIndex = 1;
  const before = encounterPool({ spot: SPOT_BY.dock, weather: 'clear', time: 'Day', mods: game.mods() });
  game.state.timeIndex = 3;
  const night = encounterPool({ spot: SPOT_BY.dock, weather: 'clear', time: 'Night', mods: game.mods() });
  assert.equal(before.some((g) => g.id === 'kinggloop'), false, 'time-gated legends remain unavailable outside Dawn');
  assert.equal(night.some((g) => g.id === 'kinggloop'), false, 'habitat mastery does not bypass a species hard gate');
});
