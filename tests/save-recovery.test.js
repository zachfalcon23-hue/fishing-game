import test from 'node:test';
import assert from 'node:assert/strict';
import { SaveStore } from '../src/game.js';

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

test('successful saves maintain matching primary and backup copies', () => {
  const storage = createStorage();
  const store = new SaveStore(storage, 'player-save');
  const state = store.fresh();
  state.essence = 425;

  assert.equal(store.save(state), true);
  assert.equal(store.lastSaveSucceeded, true);
  assert.deepEqual(JSON.parse(storage.getItem('player-save')), state);
  assert.deepEqual(JSON.parse(storage.getItem('player-save-backup')), state);
});

test('a damaged primary save recovers and repairs both save slots from backup', () => {
  const storage = createStorage();
  const original = new SaveStore(storage, 'player-save');
  const state = original.fresh();
  state.essence = 975;
  state.dex.gloop = { count: 3, fastest: 9.2, best: 1.4, shiny: 1 };
  assert.equal(original.save(state), true);

  storage.setItem('player-save', '{"version":3,');
  const recoveredStore = new SaveStore(storage, 'player-save');
  const loaded = recoveredStore.load();

  assert.equal(recoveredStore.lastLoadRecovered, true);
  assert.equal(loaded.essence, 975);
  assert.equal(loaded.dex.gloop.count, 3);
  assert.deepEqual(JSON.parse(storage.getItem('player-save')), loaded);
  assert.deepEqual(JSON.parse(storage.getItem('player-save-backup')), loaded);
});

test('a missing primary save recovers from the last known-good backup', () => {
  const storage = createStorage();
  const original = new SaveStore(storage, 'player-save');
  const state = original.fresh();
  state.essence = 310;
  assert.equal(original.save(state), true);
  storage.removeItem('player-save');

  const recoveredStore = new SaveStore(storage, 'player-save');
  const loaded = recoveredStore.load();

  assert.equal(recoveredStore.lastLoadRecovered, true);
  assert.equal(loaded.essence, 310);
  assert.deepEqual(JSON.parse(storage.getItem('player-save')), loaded);
});

test('invalid primary and backup saves safely fall back to a fresh game', () => {
  const storage = createStorage({
    'player-save': '{"version":99,"essence":999999}',
    'player-save-backup': 'not-json',
  });
  const store = new SaveStore(storage, 'player-save');
  const loaded = store.load();

  assert.equal(store.lastLoadRecovered, false);
  assert.equal(loaded.essence, 0);
  assert.deepEqual(loaded.dex, {});
});

test('a primary write failure is reported and does not overwrite the prior backup', () => {
  const storage = createStorage();
  const store = new SaveStore(storage, 'player-save');
  const previous = store.fresh();
  previous.essence = 125;
  assert.equal(store.save(previous), true);
  const goodBackup = storage.getItem('player-save-backup');

  const failingStorage = {
    getItem: key => storage.getItem(key),
    setItem(key, value) {
      if (key === 'player-save') throw new Error('quota exceeded');
      storage.setItem(key, value);
    },
    removeItem: key => storage.removeItem(key),
  };
  const failingStore = new SaveStore(failingStorage, 'player-save');
  const attempted = failingStore.fresh();
  attempted.essence = 999;

  assert.equal(failingStore.save(attempted), false);
  assert.equal(failingStore.lastSaveSucceeded, false);
  assert.equal(storage.getItem('player-save-backup'), goodBackup);
});

test('backup write failure does not misreport a committed primary save as failed', () => {
  const storage = createStorage();
  const failingBackupStorage = {
    getItem: key => storage.getItem(key),
    setItem(key, value) {
      if (key === 'player-save-backup') throw new Error('quota exceeded');
      storage.setItem(key, value);
    },
    removeItem: key => storage.removeItem(key),
  };
  const store = new SaveStore(failingBackupStorage, 'player-save');
  const state = store.fresh();
  state.essence = 615;

  assert.equal(store.save(state), true);
  assert.equal(store.lastSaveSucceeded, true);
  assert.equal(JSON.parse(storage.getItem('player-save')).essence, 615);
});

test('reset removes both primary and backup save slots', () => {
  const storage = createStorage();
  const store = new SaveStore(storage, 'player-save');
  assert.equal(store.save(store.fresh()), true);
  assert.ok(storage.getItem('player-save'));
  assert.ok(storage.getItem('player-save-backup'));

  const fresh = store.reset();
  assert.equal(storage.getItem('player-save'), null);
  assert.equal(storage.getItem('player-save-backup'), null);
  assert.equal(fresh.essence, 0);
  assert.equal(store.lastSaveSucceeded, null);
});
