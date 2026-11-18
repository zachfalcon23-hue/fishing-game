import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionTelemetry } from '../src/telemetry.js';

function makeGame() {
  return { phase: 'idle', state: { zone: 'pond', timeOfDay: 'day', weather: 'clear', rod: 'twig', bait: 'plain' }, fish: null, fight: null, reward: 0, zone() { return { id: this.state.zone }; } };
}

test('session telemetry measures one complete catch and attributes its context', () => {
  let now = 1000;
  const telemetry = new SessionTelemetry({ now: () => now });
  const game = makeGame();
  game.phase = 'cast'; telemetry.observe(game);
  now = 4000; game.phase = 'bite'; telemetry.observe(game);
  now = 4500; game.phase = 'fight'; game.fight = { style: 'tension' }; game.fish = { id: 'gloop', rarity: 'Common' }; telemetry.observe(game);
  now = 9000; game.phase = 'caught'; game.reward = 12; telemetry.observe(game);
  telemetry.resolveCatch('sold', 12);\n  const result = telemetry.summary();
  assert.equal(result.completedRounds, 1);
  assert.equal(result.catchRate, 1);
  assert.equal(result.averageCastToBiteMs, 3000);
  assert.equal(result.averageBiteToHookMs, 500);
  assert.equal(result.averageFightMs, 4500);
  assert.equal(result.averageCatchValue, 12);\n  assert.equal(result.essenceEarned, 12);\n  assert.equal(result.events.sold, 1);\n  assert.equal(result.essencePerHour, 5400);
  assert.equal(result.byContext[0].zone, 'pond');
  assert.equal(result.byContext[0].style, 'tension');
});

test('session telemetry counts escapes once and supports a new round after resolution', () => {
  let now = 0;
  const telemetry = new SessionTelemetry({ now: () => now });
  const game = makeGame();
  game.phase = 'cast'; telemetry.observe(game);
  now = 100; game.phase = 'bite'; telemetry.observe(game);
  now = 200; game.phase = 'fight'; game.fight = { style: 'patience' }; telemetry.observe(game);
  now = 800; game.phase = 'escaped'; telemetry.observe(game); telemetry.observe(game);
  assert.equal(telemetry.summary().events.escapes, 1);
  assert.equal(telemetry.summary().catchRate, 0);
  now = 1000; game.phase = 'idle'; telemetry.observe(game);
  now = 1100; game.phase = 'cast'; telemetry.observe(game);
  now = 1200; game.phase = 'escaped'; telemetry.observe(game);
  assert.equal(telemetry.summary().completedRounds, 2);
});

test('telemetry handles incomplete rounds and empty samples without inventing rates', () => {
  const telemetry = new SessionTelemetry({ now: () => 42 });
  assert.equal(telemetry.summary().catchRate, null);
  assert.equal(telemetry.summary().averageFightMs, null);
  const game = makeGame();
  game.phase = 'cast'; telemetry.observe(game);
  game.phase = 'escaped'; telemetry.observe(game);
  assert.equal(telemetry.summary().averageCastToBiteMs, null);
  assert.equal(telemetry.summary().averageFightMs, null);
});

test('telemetry export is valid JSON and contains no player identifiers', () => {
  const telemetry = new SessionTelemetry({ now: () => 1700000000000 });
  const payload = JSON.parse(telemetry.exportJSON());
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.summary.completedRounds, 0);
  assert.equal('userId' in payload, false);
});

test('telemetry caps retained rounds and reset clears all session data', () => {
  let now = 0;
  const telemetry = new SessionTelemetry({ now: () => now });
  const game = makeGame();
  for (let i = 0; i < 510; i++) {
    game.phase = 'cast'; telemetry.observe(game);
    now++; game.phase = 'escaped'; telemetry.observe(game);
    now++; game.phase = 'idle'; telemetry.observe(game);
  }
  assert.equal(telemetry.rounds.length, 500);
  assert.equal(telemetry.summary().events.escapes, 510);
  telemetry.reset();
  assert.equal(telemetry.summary().completedRounds, 0);
  assert.equal(telemetry.summary().events.casts, 0);
});
