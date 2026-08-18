import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStaticJsonSource } from '../js/data/static-json-source.js';

function fakeFetch(body, ok = true, status = 200) {
  return async () => ({ ok, status, json: async () => body });
}

test('loadPublic returns the parsed library data', async () => {
  const data = { meta: { recipeCount: 1 }, avoidances: [], protocols: [], recipes: [{ id: 'a' }] };
  const source = createStaticJsonSource(fakeFetch(data));
  const result = await source.loadPublic();
  assert.deepEqual(result, data);
});

test('loadPublic throws with the status code on a non-ok response', async () => {
  const source = createStaticJsonSource(fakeFetch(null, false, 503));
  await assert.rejects(() => source.loadPublic(), /503/);
});

test('loadPublic caches — a second call does not fetch again', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return { ok: true, status: 200, json: async () => ({ recipes: [] }) }; };
  const source = createStaticJsonSource(fetchImpl);
  await source.loadPublic();
  await source.loadPublic();
  assert.equal(calls, 1);
});

test('capabilities report no write and no private layer', () => {
  const source = createStaticJsonSource(fakeFetch({}));
  assert.deepEqual(source.capabilities, { write: false, private: false });
});
