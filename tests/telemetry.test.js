import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionTelemetry, downloadJSONFile } from '../src/telemetry.js';

function makeClock(start = 1000) {
  let value = start;
  return { now: () => value, set: next => { value = next; } };
}

function makeGame() {
  return {
    phase: 'idle',
    state: {
      spot: 'dock',
      weather: 'clear',
      bait: 'worm',
      equip: { rod: 'twig', line: 'classic', lure: 'none' },
    },
    timeOfDay: 'Day',
    castCtx: null,
    goop: null,
    fight: null,
    lastReward: 0,
    lastCatch: null,
  };
}

test('telemetry measures a complete cast, bite, hook and catch using mainline fields', () => {
  const clock = makeClock();
  const telemetry = new SessionTelemetry({ now: clock.now });
  const game = makeGame();

  game.phase = 'cast';
  game.castCtx = { spot: 'dock', time: 'Day', weather: 'clear', bait: 'worm' };
  telemetry.observe(game);
  clock.set(1750);
  game.phase = 'bite';
  telemetry.observe(game);
  clock.set(2000);
  game.phase = 'fight';
  game.goop = { id: 'gloop', rarity: 'Common', pattern: 'steady' };
  telemetry.observe(game);
  clock.set(6500);
  game.phase = 'caught';
  game.lastReward = 8;
  game.lastCatch = { goop: 'gloop', reward: 8, size: 1.2, shiny: false, hookGrade: 'perfect' };
  telemetry.observe(game);

  const summary = telemetry.summary();
  assert.equal(summary.events.casts, 1);
  assert.equal(summary.events.bites, 1);
  assert.equal(summary.events.hooks, 1);
  assert.equal(summary.events.catches, 1);
  assert.equal(summary.catchRate, 1);
  assert.equal(summary.averageCastToBiteMs, 750);
  assert.equal(summary.averageBiteToHookMs, 250);
  assert.equal(summary.averageFightMs, 4500);
  assert.equal(summary.averageRoundMs, 5500);
  assert.equal(summary.averageCatchReward, 8);
  assert.equal(summary.byContext[0].spot, 'dock');
  assert.equal(summary.byContext[0].rod, 'twig');
  assert.equal(summary.byContext[0].pattern, 'steady');
  assert.equal(telemetry.rounds[0].hookGrade, 'perfect');
});

test('telemetry separates missed bites from fish that break free after a hook', () => {
  const clock = makeClock();
  const telemetry = new SessionTelemetry({ now: clock.now });
  const game = makeGame();

  game.phase = 'cast';
  telemetry.observe(game);
  clock.set(2000);
  game.phase = 'bite';
  telemetry.observe(game);
  clock.set(4500);
  game.phase = 'escaped';
  game.goop = { id: 'murkling', rarity: 'Common', pattern: 'pulse' };
  telemetry.observe(game);

  clock.set(5000);
  game.phase = 'cast';
  telemetry.observe(game);
  clock.set(6000);
  game.phase = 'bite';
  telemetry.observe(game);
  clock.set(6250);
  game.phase = 'fight';
  game.goop = { id: 'flicker', rarity: 'Uncommon', pattern: 'dart' };
  telemetry.observe(game);
  clock.set(8000);
  game.phase = 'escaped';
  telemetry.observe(game);

  assert.equal(telemetry.events.misses, 1);
  assert.equal(telemetry.events.escapes, 1);
  assert.equal(telemetry.events.catches, 0);
  assert.equal(telemetry.summary().completedRounds, 2);
  assert.deepEqual(telemetry.rounds.map(item => item.outcome), ['missed', 'escaped']);
});

test('telemetry retains a bounded recent-round log while lifetime counters continue', () => {
  const clock = makeClock();
  const telemetry = new SessionTelemetry({ now: clock.now });
  const game = makeGame();

  for (let i = 0; i < 510; i += 1) {
    game.phase = 'cast';
    telemetry.observe(game);
    clock.set(clock.now() + 1);
    game.phase = 'bite';
    telemetry.observe(game);
    clock.set(clock.now() + 1);
    game.phase = 'escaped';
    telemetry.observe(game);
    clock.set(clock.now() + 1);
  }

  assert.equal(telemetry.events.casts, 510);
  assert.equal(telemetry.events.misses, 510);
  assert.equal(telemetry.rounds.length, 500);
  assert.equal(telemetry.summary().retainedRounds, 500);
});

test('telemetry summary remains safe before the first cast and after reset', () => {
  const clock = makeClock();
  const telemetry = new SessionTelemetry({ now: clock.now });
  assert.equal(telemetry.summary().catchRate, null);
  assert.equal(telemetry.summary().catchesPerHour, null);

  telemetry.reset('fight');
  const game = makeGame();
  game.phase = 'fight';
  telemetry.observe(game);
  assert.equal(telemetry.events.hooks, 0, 'reset does not attach telemetry to a round already underway');

  game.phase = 'cast';
  telemetry.observe(game);
  assert.equal(telemetry.events.casts, 1);
  telemetry.reset('idle');
  assert.equal(telemetry.events.casts, 0);
  assert.equal(telemetry.rounds.length, 0);
  assert.equal(telemetry.summary().elapsedMs, 0);
});

test('session export has a versioned schema and contains no player identifier', () => {
  const clock = makeClock();
  const telemetry = new SessionTelemetry({ now: clock.now });
  const game = makeGame();
  game.phase = 'cast';
  telemetry.observe(game);

  const exported = JSON.parse(telemetry.exportJSON());
  assert.equal(exported.schemaVersion, 1);
  assert.equal(exported.exportedAt, new Date(clock.now()).toISOString());
  assert.ok(exported.summary);
  assert.ok(Array.isArray(exported.rounds));
  assert.equal(Object.hasOwn(exported, 'playerId'), false);
  assert.equal(Object.hasOwn(exported, 'userId'), false);
});

test('JSON download removes its temporary link and revokes its object URL', () => {
  let clicked = false;
  let removed = false;
  let revoked = false;
  let scheduled;
  const anchor = {
    hidden: false,
    href: '',
    download: '',
    click() { clicked = true; },
    remove() { removed = true; },
  };
  const doc = {
    body: { append(node) { assert.equal(node, anchor); } },
    createElement(tag) { assert.equal(tag, 'a'); return anchor; },
  };
  const urlApi = {
    createObjectURL(blob) { assert.ok(blob); return 'blob:test-session'; },
    revokeObjectURL(url) { assert.equal(url, 'blob:test-session'); revoked = true; },
  };

  downloadJSONFile('{"schemaVersion":1}', 'goop-session.json', {
    documentRef: doc,
    urlApi,
    schedule(callback, delay) { assert.equal(delay, 1000); scheduled = callback; },
  });

  assert.equal(clicked, true);
  assert.equal(removed, true);
  assert.equal(anchor.download, 'goop-session.json');
  assert.equal(revoked, false);
  scheduled();
  assert.equal(revoked, true);
});
