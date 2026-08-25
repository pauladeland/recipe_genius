import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateEndpoint, isPaired } from '../js/ui/pairing.js';

function fakeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

const GOOD = 'https://script.google.com/macros/s/AKfycbxSAMPLEIDONLY1234567890/exec';

// --- validateEndpoint -------------------------------------------------------
// This is a security control, not politeness: the endpoint is user-entered and
// then POSTed to *with the device token in the body*. A typo'd or hostile host
// exfiltrates the token to whoever owns it.

test('validateEndpoint accepts a real Apps Script exec URL', () => {
  assert.equal(validateEndpoint(GOOD), true);
});

test('validateEndpoint rejects plain http, which would send the token in the clear', () => {
  assert.equal(validateEndpoint(GOOD.replace('https:', 'http:')), false);
});

test('validateEndpoint rejects a lookalike host', () => {
  assert.equal(validateEndpoint('https://script.google.com.evil.test/macros/s/abc/exec'), false);
  assert.equal(validateEndpoint('https://evil.test/macros/s/abc/exec'), false);
});

test('validateEndpoint rejects a javascript: url', () => {
  assert.equal(validateEndpoint('javascript:alert(1)'), false);
});

test('validateEndpoint requires the /exec suffix, not /dev', () => {
  assert.equal(validateEndpoint(GOOD.replace('/exec', '/dev')), false);
});

test('validateEndpoint rejects empty, null, and non-string input without throwing', () => {
  for (const bad of ['', null, undefined, 42, {}]) {
    assert.equal(validateEndpoint(bad), false);
  }
});

// --- isPaired ---------------------------------------------------------------

test('isPaired requires BOTH an endpoint and a token', () => {
  assert.equal(isPaired({ endpoint: GOOD, token: 'abc' }), true);
  assert.equal(isPaired({ endpoint: GOOD, token: '' }), false);
  assert.equal(isPaired({ endpoint: '', token: 'abc' }), false);
  assert.equal(isPaired({}), false);
  assert.equal(isPaired(null), false);
});

// --- persistence ------------------------------------------------------------

test('loadPairing defaults to unpaired when nothing is stored', async () => {
  globalThis.localStorage = fakeLocalStorage();
  const { loadPairing } = await import('../js/ui/pairing.js?t=' + Math.random());
  assert.deepEqual(loadPairing(), { endpoint: '', token: '' });
});

test('savePairing round-trips through loadPairing', async () => {
  globalThis.localStorage = fakeLocalStorage();
  const { loadPairing, savePairing } = await import('../js/ui/pairing.js?t=' + Math.random());
  savePairing({ endpoint: GOOD, token: 'sekrit' });
  assert.deepEqual(loadPairing(), { endpoint: GOOD, token: 'sekrit' });
});

test('clearPairing removes both fields', async () => {
  globalThis.localStorage = fakeLocalStorage();
  const { loadPairing, savePairing, clearPairing } = await import('../js/ui/pairing.js?t=' + Math.random());
  savePairing({ endpoint: GOOD, token: 'sekrit' });
  clearPairing();
  assert.deepEqual(loadPairing(), { endpoint: '', token: '' });
});

test('pairing lives under its own key, so clearing settings never unpairs a device', async () => {
  globalThis.localStorage = fakeLocalStorage();
  const { savePairing } = await import('../js/ui/pairing.js?t=' + Math.random());
  savePairing({ endpoint: GOOD, token: 'sekrit' });
  assert.equal(globalThis.localStorage.getItem('recipe-genius:settings'), null);
  assert.ok(globalThis.localStorage.getItem('recipe-genius:pairing'));
});

test('a corrupt stored blob yields unpaired rather than throwing', async () => {
  globalThis.localStorage = fakeLocalStorage();
  globalThis.localStorage.setItem('recipe-genius:pairing', '{not json');
  const { loadPairing } = await import('../js/ui/pairing.js?t=' + Math.random());
  assert.deepEqual(loadPairing(), { endpoint: '', token: '' });
});

test('a stored endpoint that no longer passes validation is dropped, not trusted', async () => {
  globalThis.localStorage = fakeLocalStorage();
  globalThis.localStorage.setItem(
    'recipe-genius:pairing',
    JSON.stringify({ endpoint: 'https://evil.test/macros/s/abc/exec', token: 'sekrit' })
  );
  const { loadPairing } = await import('../js/ui/pairing.js?t=' + Math.random());
  assert.equal(loadPairing().endpoint, '');
});

test('savePairing survives a throwing localStorage without crashing the app', async () => {
  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => { throw new Error('quota'); },
    removeItem: () => {},
  };
  const { savePairing } = await import('../js/ui/pairing.js?t=' + Math.random());
  assert.doesNotThrow(() => savePairing({ endpoint: GOOD, token: 'x' }));
});
