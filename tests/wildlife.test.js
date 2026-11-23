import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateWildlifeBehavior, wildlifeNeeds } from '../src/wildlife.js';

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
