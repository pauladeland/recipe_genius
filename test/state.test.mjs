import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute } from '../js/state.js';

function fakeLocalStorage(initial = {}) {
  const store = { ...initial };
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
  };
}

test('empty hash routes to the list view', () => {
  assert.deepEqual(parseRoute(''), { name: 'list' });
});

test('#/ routes to the list view', () => {
  assert.deepEqual(parseRoute('#/'), { name: 'list' });
});

test('#/r/<id> routes to the recipe view with the id', () => {
  assert.deepEqual(parseRoute('#/r/chimichurri-sauce'), { name: 'recipe', recipeId: 'chimichurri-sauce' });
});

test('#/settings routes to the settings view', () => {
  assert.deepEqual(parseRoute('#/settings'), { name: 'settings' });
});

test('an unrecognized hash falls back to the list view', () => {
  assert.deepEqual(parseRoute('#/nonsense'), { name: 'list' });
});

test('a malformed percent-encoded recipe id falls back to the list view instead of throwing', () => {
  assert.deepEqual(parseRoute('#/r/%E0%A4%A'), { name: 'list' });
});

test('loadSettings returns the system/empty default when nothing is stored', async () => {
  globalThis.localStorage = fakeLocalStorage();
  const { loadSettings } = await import(`../js/state.js?t=${Date.now()}`);
  assert.deepEqual(loadSettings(), { theme: 'system', avoidanceIds: [], activeProtocolId: null, showNonCompliant: false });
});

test('saveSettings then loadSettings round-trips theme and avoidanceIds under the documented key', async () => {
  globalThis.localStorage = fakeLocalStorage();
  const { loadSettings, saveSettings } = await import(`../js/state.js?t=${Date.now()}`);
  saveSettings({ theme: 'dark', avoidanceIds: ['milk', 'yeast'] });
  assert.equal(globalThis.localStorage.getItem('recipe-genius:settings'), '{"theme":"dark","avoidanceIds":["milk","yeast"]}');
  assert.deepEqual(loadSettings(), { theme: 'dark', avoidanceIds: ['milk', 'yeast'], activeProtocolId: null, showNonCompliant: false });
});

test('loadSettings falls back to defaults on corrupt stored JSON instead of throwing', async () => {
  globalThis.localStorage = fakeLocalStorage({ 'recipe-genius:settings': '{not valid json' });
  const { loadSettings } = await import(`../js/state.js?t=${Date.now()}`);
  assert.deepEqual(loadSettings(), { theme: 'system', avoidanceIds: [], activeProtocolId: null, showNonCompliant: false });
});

test('saveSettings does not throw when localStorage.setItem throws', async () => {
  globalThis.localStorage = { setItem() { throw new Error('quota exceeded'); } };
  const { saveSettings } = await import(`../js/state.js?t=${Date.now()}`);
  assert.doesNotThrow(() => saveSettings({ theme: 'dark', avoidanceIds: [] }));
});

test('loadSettings defaults activeProtocolId to null and showNonCompliant to false when nothing is stored', async () => {
  globalThis.localStorage = fakeLocalStorage();
  const { loadSettings } = await import(`../js/state.js?t=${Date.now()}`);
  const settings = loadSettings();
  assert.equal(settings.activeProtocolId, null);
  assert.equal(settings.showNonCompliant, false);
});

test('loadSettings round-trips a saved activeProtocolId and showNonCompliant', async () => {
  globalThis.localStorage = fakeLocalStorage();
  const { loadSettings, saveSettings } = await import(`../js/state.js?t=${Date.now()}`);
  saveSettings({ theme: 'system', avoidanceIds: [], activeProtocolId: 'aip', showNonCompliant: true });
  const settings = loadSettings();
  assert.equal(settings.activeProtocolId, 'aip');
  assert.equal(settings.showNonCompliant, true);
});

test('loadSettings rejects a non-string activeProtocolId back to null', async () => {
  globalThis.localStorage = fakeLocalStorage();
  const { loadSettings } = await import(`../js/state.js?t=${Date.now()}`);
  globalThis.localStorage.setItem('recipe-genius:settings', JSON.stringify({ activeProtocolId: 42 }));
  assert.equal(loadSettings().activeProtocolId, null);
});
