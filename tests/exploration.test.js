import test from 'node:test';
import assert from 'node:assert/strict';
import { HOLLOW, isHollowWalkable, moveHollowPlayer, nearbyHollowDiscovery, sanitizeHollowSave, segmentDistance } from '../src/exploration.js';

test('Reedbed Hollow path graph is connected from entrance to every branch', () => {
  assert.ok(isHollowWalkable(120, 930));
  assert.ok(isHollowWalkable(760, 700));
  assert.ok(isHollowWalkable(820, 1030));
  assert.ok(isHollowWalkable(1540, 330));
  assert.equal(isHollowWalkable(900, 200), false);
});

test('movement is normalized, bounded, and cannot leave the authored trail corridor', () => {
  const start = { x: 120, y: 930 };
  const moved = moveHollowPlayer(start, { x: 1, y: -1 }, 0.08);
  assert.ok(Math.abs(Math.hypot(moved.x - start.x, moved.y - start.y) - HOLLOW.speed * 0.08) < 0.001);
  const edge = moveHollowPlayer({ x: 820, y: 1030 }, { x: 0, y: 1 }, 0.08);
  assert.ok(isHollowWalkable(edge.x, edge.y, HOLLOW.corridor * 0.72));
  assert.ok(Math.abs(edge.y - 1030) < 20, 'blocked movement should stop at the trail boundary');
});

test('discovery prompts resolve only within authored interaction radii', () => {
  assert.equal(nearbyHollowDiscovery({ x: 505, y: 690 })?.id, 'trail-marker');
  assert.equal(nearbyHollowDiscovery({ x: 505, y: 400 }), null);
});

test('saved position and discoveries are validated against the authored world', () => {
  const save = sanitizeHollowSave({ position: { x: 900, y: 200 }, discovered: ['trail-marker', 'bogus', 'trail-marker'] });
  assert.deepEqual(save.position, { x: 120, y: 930 });
  assert.deepEqual(save.discovered, ['trail-marker']);
  assert.deepEqual(sanitizeHollowSave({ position: { x: 760, y: 700 }, discovered: [] }).position, { x: 760, y: 700 });
});

test('segment distance handles degenerate and projected segments', () => {
  assert.equal(segmentDistance(3, 4, [0, 0], [0, 0]), 5);
  assert.equal(segmentDistance(5, 2, [0, 0], [10, 0]), 2);
});
