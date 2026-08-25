import { test } from 'node:test';
import assert from 'node:assert/strict';

function fakeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

async function freshModule() {
  globalThis.localStorage = fakeLocalStorage();
  return import('../js/data/write-queue.js?t=' + Math.random());
}

const op = (opId, action = 'saveNote') => ({
  opId,
  action,
  args: { recipeId: 'a', text: 'note ' + opId },
  queuedAt: '2026-08-25T00:00:00Z',
});

test('an empty queue loads as an empty array', async () => {
  const { loadQueue, queueLength } = await freshModule();
  assert.deepEqual(loadQueue(), []);
  assert.equal(queueLength(), 0);
});

test('enqueue then load round-trips', async () => {
  const { enqueue, loadQueue } = await freshModule();
  enqueue(op('1'));
  enqueue(op('2'));
  assert.deepEqual(loadQueue().map((o) => o.opId), ['1', '2']);
});

test('the same opId cannot be enqueued twice', async () => {
  const { enqueue, queueLength } = await freshModule();
  enqueue(op('1'));
  enqueue(op('1'));
  assert.equal(queueLength(), 1);
});

test('dequeue removes only the named op', async () => {
  const { enqueue, dequeue, loadQueue } = await freshModule();
  enqueue(op('1'));
  enqueue(op('2'));
  dequeue('1');
  assert.deepEqual(loadQueue().map((o) => o.opId), ['2']);
});

test('a corrupt stored blob yields an empty queue rather than throwing', async () => {
  globalThis.localStorage = fakeLocalStorage();
  globalThis.localStorage.setItem('recipe-genius:write-queue', '{not json');
  const { loadQueue } = await import('../js/data/write-queue.js?t=' + Math.random());
  assert.deepEqual(loadQueue(), []);
});

test('a stored value that is not an array yields an empty queue', async () => {
  globalThis.localStorage = fakeLocalStorage();
  globalThis.localStorage.setItem('recipe-genius:write-queue', '{"opId":"1"}');
  const { loadQueue } = await import('../js/data/write-queue.js?t=' + Math.random());
  assert.deepEqual(loadQueue(), []);
});

// --- replay -----------------------------------------------------------------

function fakeSource(behaviour = () => Promise.resolve({})) {
  const seen = [];
  return {
    seen,
    saveNote: (args) => { seen.push(['saveNote', args]); return behaviour(args); },
    setRating: (args) => { seen.push(['setRating', args]); return behaviour(args); },
    markCooked: (args) => { seen.push(['markCooked', args]); return behaviour(args); },
  };
}

test('replayQueue on an empty queue is a no-op', async () => {
  const { replayQueue } = await freshModule();
  const source = fakeSource();
  const result = await replayQueue(source);
  assert.equal(result.sent, 0);
  assert.equal(source.seen.length, 0);
});

test('replayQueue sends ops in FIFO order and clears them', async () => {
  const { enqueue, replayQueue, queueLength } = await freshModule();
  enqueue(op('1'));
  enqueue(op('2'));
  const source = fakeSource();
  const result = await replayQueue(source);
  assert.equal(result.sent, 2);
  assert.deepEqual(source.seen.map(([, a]) => a.opId), ['1', '2']);
  assert.equal(queueLength(), 0);
});

test('replayQueue dispatches each op to the matching source method', async () => {
  const { enqueue, replayQueue } = await freshModule();
  enqueue({ ...op('1', 'setRating'), args: { recipeId: 'a', rating: 5 } });
  enqueue({ ...op('2', 'markCooked'), args: { recipeId: 'a' } });
  const source = fakeSource();
  await replayQueue(source);
  assert.deepEqual(source.seen.map(([m]) => m), ['setRating', 'markCooked']);
});

test('the opId travels with the replayed op, so the script can dedupe it', async () => {
  const { enqueue, replayQueue } = await freshModule();
  enqueue(op('abc'));
  const source = fakeSource();
  await replayQueue(source);
  assert.equal(source.seen[0][1].opId, 'abc');
});

test('a failing op stays queued and replay STOPS rather than skipping ahead', async () => {
  // Order matters: a note written before a rating must not land after it.
  // Skipping a failed op to try later ones would silently reorder history.
  const { enqueue, replayQueue, loadQueue } = await freshModule();
  enqueue(op('1'));
  enqueue(op('2'));
  const source = fakeSource(() => Promise.reject(new Error('offline')));
  const result = await replayQueue(source);
  assert.equal(result.sent, 0);
  assert.equal(source.seen.length, 1, 'must not attempt op 2 after op 1 failed');
  assert.deepEqual(loadQueue().map((o) => o.opId), ['1', '2']);
});

test('a partial failure keeps the successful op removed and the failing one queued', async () => {
  const { enqueue, replayQueue, loadQueue } = await freshModule();
  enqueue(op('1'));
  enqueue(op('2'));
  const source = fakeSource((args) =>
    args.opId === '2' ? Promise.reject(new Error('offline')) : Promise.resolve({})
  );
  const result = await replayQueue(source);
  assert.equal(result.sent, 1);
  assert.deepEqual(loadQueue().map((o) => o.opId), ['2']);
});

test('an op with an unknown action is dropped rather than blocking the queue forever', async () => {
  const { enqueue, replayQueue, queueLength } = await freshModule();
  enqueue({ ...op('1'), action: 'setWeekPlan' }); // e.g. queued by a newer build
  const source = fakeSource();
  const result = await replayQueue(source);
  assert.equal(queueLength(), 0);
  assert.equal(result.dropped, 1);
});
