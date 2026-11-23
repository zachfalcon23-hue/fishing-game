import test from 'node:test';
import assert from 'node:assert/strict';
import { GOOPS, SPOTS, encounterPool } from '../src/game.js';
import {
  evaluateWildlifeBehavior, wildlifeNeeds, habitatReturnOffset,
  selectWildlifeSpecies, wildlifeDisplayProfile,
} from '../src/wildlife.js';

test('ambient needs are repeatable for the same school and scene time', () => {
  const school = { phase: 2.4, chronotype: -0.5 };
  assert.deepEqual(wildlifeNeeds(school, 42), wildlifeNeeds(school, 42));
  assert.notDeepEqual(wildlifeNeeds(school, 42), wildlifeNeeds(school, 43));
});

test('local feeding activity attracts hungry schools into a tighter feeding formation', () => {
  const quiet = evaluateWildlifeBehavior({ hunger: 1, energy: 1, activity: 0, fidelity: 0.8 });
  const active = evaluateWildlifeBehavior({ hunger: 1, energy: 1, activity: 3, fidelity: 0.8 });
  assert.equal(quiet.state, 'roaming');
  assert.equal(active.state, 'feeding');
  assert.ok(active.feeding > quiet.feeding);
  assert.ok(active.spacing < 1);
});

test('frenzy acts as a local food signal even before ordinary activity builds', () => {
  const calm = evaluateWildlifeBehavior({ hunger: 0.8, energy: 1, activity: 0 });
  const frenzy = evaluateWildlifeBehavior({ hunger: 0.8, energy: 1, activity: 0, frenzy: true });
  assert.equal(calm.state, 'roaming');
  assert.equal(frenzy.state, 'feeding');
});

test('low energy makes wildlife rest more readily at night', () => {
  const day = evaluateWildlifeBehavior({ hunger: 0.05, energy: 0.05, time: 'Day' });
  const night = evaluateWildlifeBehavior({ hunger: 0.05, energy: 0.05, time: 'Night' });
  assert.equal(day.state, 'roaming');
  assert.equal(night.state, 'resting');
  assert.ok(night.sway < day.sway);
  assert.ok(night.motionRate < day.motionRate);
});

test('player disturbance overrides feeding and causes a flee response', () => {
  const behavior = evaluateWildlifeBehavior({
    hunger: 1, energy: 1, activity: 3, disturbance: 0.6, fidelity: 1,
  });
  assert.equal(behavior.state, 'fleeing');
  assert.equal(behavior.feeding, 0);
  assert.ok(behavior.spacing > 1);
  assert.ok(behavior.motionRate > 1);
});

test('behavior outputs remain finite and bounded for malformed inputs', () => {
  const behavior = evaluateWildlifeBehavior({
    hunger: Number.NaN, energy: Number.POSITIVE_INFINITY,
    activity: Number.POSITIVE_INFINITY, disturbance: Number.NaN,
    fidelity: Number.NaN,
  });
  for (const value of Object.values(behavior)) {
    if (typeof value === 'number') assert.ok(Number.isFinite(value));
  }
  assert.ok(behavior.feeding >= 0 && behavior.feeding <= 1);
});

test('hungry, faithful schools bias toward their home habitat', () => {
  const baseline = habitatReturnOffset({
    worldX: 100, homeX: 500, hunger: 0.2, fidelity: 0.2,
  });
  const returning = habitatReturnOffset({
    worldX: 100, homeX: 500, hunger: 1, fidelity: 1,
  });
  assert.ok(returning > baseline);
  assert.ok(returning > 0);
});

test('disturbance suppresses habitat return and the offset remains bounded', () => {
  const settled = habitatReturnOffset({
    worldX: -1000, homeX: 1000, hunger: 1, fidelity: 1,
  });
  const startled = habitatReturnOffset({
    worldX: -1000, homeX: 1000, hunger: 1, fidelity: 1, disturbance: 1,
  });
  assert.equal(Math.abs(settled), 180);
  assert.ok(Math.abs(startled) < Math.abs(settled));
});

test('local feeding activity strengthens the return toward a familiar feeding site', () => {
  const quiet = habitatReturnOffset({
    worldX: 0, homeX: 400, hunger: 0.8, fidelity: 0.8, activity: 0,
  });
  const active = habitatReturnOffset({
    worldX: 0, homeX: 400, hunger: 0.8, fidelity: 0.8, activity: 3,
  });
  assert.ok(active > quiet);
});


test('species sightings are selected only from the real encounter-eligible pool', () => {
  const falls = SPOTS.find((spot) => spot.id === 'falls');
  const blocked = encounterPool({ spot: falls, weather: 'clear', time: 'Dawn' });
  const eligible = encounterPool({ spot: falls, weather: 'rain', time: 'Dawn' });
  assert.ok(!blocked.some((goop) => goop.id === 'prismadrake'));
  assert.ok(eligible.some((goop) => goop.id === 'prismadrake'));

  const before = structuredClone(eligible);
  const sighting = selectWildlifeSpecies(eligible, 'school-12|falls|rain|Dawn');
  assert.ok(sighting);
  assert.ok(eligible.some((goop) => goop.id === sighting.id));
  assert.deepEqual(eligible, before, 'sighting selection must not change encounter weights or pool data');
});

test('species sightings can include a valid daily visitor but never invent one', () => {
  const dock = SPOTS.find((spot) => spot.id === 'dock');
  const withoutVisitor = encounterPool({ spot: dock, weather: 'clear', time: 'Night' });
  const withVisitor = encounterPool({
    spot: dock,
    weather: 'clear',
    time: 'Night',
    event: { visitor: { goop: 'stardrift', spot: 'dock' } },
  });
  assert.ok(!withoutVisitor.some((goop) => goop.id === 'stardrift'));
  assert.ok(withVisitor.some((goop) => goop.id === 'stardrift'));
  const sighting = selectWildlifeSpecies(withVisitor, 'visitor-night-dock');
  assert.ok(withVisitor.some((goop) => goop.id === sighting?.id));
});

test('quest-only species appear in sighting pools only when the real encounter rules permit them', () => {
  const deep = SPOTS.find((spot) => spot.id === 'deep');
  const asleep = encounterPool({ spot: deep, weather: 'clear', time: 'Night' });
  const awakened = encounterPool({
    spot: deep, weather: 'clear', time: 'Night', event: { sleeper: true },
  });
  assert.ok(!asleep.some((goop) => goop.id === 'sleeper'));
  assert.ok(awakened.some((goop) => goop.id === 'sleeper'));
});

test('species display profiles are stable, bounded, and reflect species fight identity', () => {
  const gloop = GOOPS.find((goop) => goop.id === 'gloop');
  const stormray = GOOPS.find((goop) => goop.id === 'stormray');
  const first = wildlifeDisplayProfile(gloop);
  assert.deepEqual(first, wildlifeDisplayProfile(gloop));
  assert.notDeepEqual(first, wildlifeDisplayProfile(stormray));
  assert.equal(first.speed, 0.78);
  assert.equal(wildlifeDisplayProfile(stormray).speed, 0.58);
  for (const profile of [first, wildlifeDisplayProfile(stormray)]) {
    for (const [key, value] of Object.entries(profile)) {
      assert.ok(Number.isFinite(value), `${key} should be finite`);
      assert.ok(value >= 0 && value <= 2, `${key} should remain bounded`);
    }
  }
});

test('species selector safely handles empty, malformed, and zero-weight pools', () => {
  assert.equal(selectWildlifeSpecies([], 'empty'), null);
  assert.equal(selectWildlifeSpecies(null, 'missing'), null);
  assert.equal(selectWildlifeSpecies([{ id: 'zero', weight: 0 }], 'zero'), null);
  assert.equal(selectWildlifeSpecies([{ weight: 3 }], 'invalid-id'), null);
});
