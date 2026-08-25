import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAppsScriptSource } from '../js/data/apps-script-source.js';

const PAIRED = {
  endpoint: 'https://script.google.com/macros/s/AKfycbxSAMPLEIDONLY1234567890/exec',
  token: 'sekrit-token',
};

/** Records what was passed to fetch so the wire contract can be asserted. */
function recordingFetch(payload, { ok = true, status = 200, text } = {}) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok,
      status,
      text: async () => (text !== undefined ? text : JSON.stringify(payload)),
    };
  };
  impl.calls = calls;
  return impl;
}

// --- the CORS contract ------------------------------------------------------
// Apps Script cannot set CORS response headers, so an application/json body
// would trigger a preflight OPTIONS that fails. text/plain keeps this a CORS
// "simple request". These two tests exist so a future "tidy-up" to
// application/json fails here rather than in production only.

test('posts with Content-Type text/plain, never application/json', async () => {
  const fetchImpl = recordingFetch({ ok: true, data: { byRecipe: {} } });
  const source = createAppsScriptSource({ pairing: PAIRED, fetchImpl });
  await source.loadPrivate();
  const { init } = fetchImpl.calls[0];
  assert.equal(init.method, 'POST');
  assert.match(init.headers['Content-Type'], /^text\/plain/);
  assert.doesNotMatch(init.headers['Content-Type'], /application\/json/);
});

test('sends the token and action as a JSON string body to the paired endpoint', async () => {
  const fetchImpl = recordingFetch({ ok: true, data: { byRecipe: {} } });
  const source = createAppsScriptSource({ pairing: PAIRED, fetchImpl });
  await source.loadPrivate();
  const { url, init } = fetchImpl.calls[0];
  assert.equal(url, PAIRED.endpoint);
  assert.equal(typeof init.body, 'string');
  const body = JSON.parse(init.body);
  assert.equal(body.token, 'sekrit-token');
  assert.equal(body.action, 'loadPrivate');
});

test('follows redirects — Apps Script 302s every POST to googleusercontent', async () => {
  const fetchImpl = recordingFetch({ ok: true, data: { byRecipe: {} } });
  const source = createAppsScriptSource({ pairing: PAIRED, fetchImpl });
  await source.loadPrivate();
  assert.notEqual(fetchImpl.calls[0].init.redirect, 'error');
  assert.notEqual(fetchImpl.calls[0].init.redirect, 'manual');
});

// --- response envelope ------------------------------------------------------

test('an ok envelope resolves to its data', async () => {
  const data = { byRecipe: { a: { rating: 4 } }, fetchedAt: '2026-08-25T00:00:00Z' };
  const source = createAppsScriptSource({ pairing: PAIRED, fetchImpl: recordingFetch({ ok: true, data }) });
  assert.deepEqual(await source.loadPrivate(), data);
});

test('a not-ok envelope rejects with the error the script reported', async () => {
  const source = createAppsScriptSource({
    pairing: PAIRED,
    fetchImpl: recordingFetch({ ok: false, error: 'unauthorized' }),
  });
  await assert.rejects(() => source.loadPrivate(), /unauthorized/);
});

test('a non-ok HTTP status rejects', async () => {
  const source = createAppsScriptSource({
    pairing: PAIRED,
    fetchImpl: recordingFetch(null, { ok: false, status: 500 }),
  });
  await assert.rejects(() => source.loadPrivate(), /500/);
});

test('an HTML body names the likely deployment misconfiguration, not a JSON parse error', async () => {
  // What Google actually returns when the deployment's access is set to
  // "Anyone with Google account" instead of "Anyone": a sign-in interstitial.
  const source = createAppsScriptSource({
    pairing: PAIRED,
    fetchImpl: recordingFetch(null, { text: '<!DOCTYPE html><html><body>Sign in</body></html>' }),
  });
  await assert.rejects(() => source.loadPrivate(), /deployment|access|sign|Anyone/i);
});

// --- unpaired ---------------------------------------------------------------

test('unpaired capabilities are both false', () => {
  const source = createAppsScriptSource({ pairing: { endpoint: '', token: '' }, fetchImpl: recordingFetch({}) });
  assert.deepEqual(source.capabilities, { write: false, private: false });
});

test('paired capabilities are both true', () => {
  const source = createAppsScriptSource({ pairing: PAIRED, fetchImpl: recordingFetch({}) });
  assert.deepEqual(source.capabilities, { write: true, private: true });
});

test('unpaired calls reject WITHOUT hitting the network at all', async () => {
  const fetchImpl = recordingFetch({ ok: true, data: {} });
  const source = createAppsScriptSource({ pairing: { endpoint: '', token: '' }, fetchImpl });
  await assert.rejects(() => source.loadPrivate(), /not paired/i);
  await assert.rejects(() => source.saveNote({ recipeId: 'a', text: 'x', opId: '1' }), /not paired/i);
  assert.equal(fetchImpl.calls.length, 0);
});

// --- write actions ----------------------------------------------------------

test('saveNote sends its action, recipeId, text, and opId', async () => {
  const fetchImpl = recordingFetch({ ok: true, data: {} });
  const source = createAppsScriptSource({ pairing: PAIRED, fetchImpl });
  await source.saveNote({ recipeId: 'chimichurri-sauce', text: 'Great with steak', opId: 'op-1' });
  const body = JSON.parse(fetchImpl.calls[0].init.body);
  assert.equal(body.action, 'saveNote');
  assert.equal(body.recipeId, 'chimichurri-sauce');
  assert.equal(body.text, 'Great with steak');
  assert.equal(body.opId, 'op-1');
});

test('setRating and markCooked send their own action names', async () => {
  const fetchImpl = recordingFetch({ ok: true, data: {} });
  const source = createAppsScriptSource({ pairing: PAIRED, fetchImpl });
  await source.setRating({ recipeId: 'a', rating: 5, opId: 'op-2' });
  await source.markCooked({ recipeId: 'a', opId: 'op-3' });
  assert.equal(JSON.parse(fetchImpl.calls[0].init.body).action, 'setRating');
  assert.equal(JSON.parse(fetchImpl.calls[1].init.body).action, 'markCooked');
});

test('a network rejection propagates so the caller can queue the write', async () => {
  const source = createAppsScriptSource({
    pairing: PAIRED,
    fetchImpl: async () => { throw new TypeError('Failed to fetch'); },
  });
  await assert.rejects(() => source.saveNote({ recipeId: 'a', text: 'x', opId: '1' }), /fetch/i);
});
