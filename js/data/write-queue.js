// Offline write queue.
//
// Every private-layer write goes through here, not straight to the network.
// A write made in a kitchen with no signal must not be lost, and must not be
// silently dropped -- it queues, the UI says so, and Settings shows the count.
//
// Each op carries a client-generated opId which travels to the Apps Script
// endpoint, where it is recorded in the OpLog sheet. That is what makes a
// replay safe: without it, a replayed markCooked double-counts times_cooked.

const QUEUE_KEY = 'recipe-genius:write-queue';

const REPLAYABLE = new Set(['saveNote', 'setRating', 'markCooked']);

export function loadQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Drop malformed elements. Array.isArray alone is not enough: a stored
    // [null, {...}] made replayQueue throw on `op.action`, and because
    // syncQueue is called un-awaited that surfaced as an unhandled rejection
    // with the queue wedged permanently and no signal to the user.
    return parsed.filter((op) => op && typeof op.action === 'string' && typeof op.opId === 'string');
  } catch {
    return [];
  }
}

function persist(queue) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Quota or private browsing. The write is lost rather than the app.
  }
}

export function queueLength() {
  return loadQueue().length;
}

export function enqueue(op) {
  const queue = loadQueue();
  // Guard against a double-tap enqueuing the same op twice locally. The
  // endpoint dedupes too, but not sending it twice is cheaper than being
  // deduped twice.
  if (queue.some((existing) => existing.opId === op.opId)) return queue;
  const next = [...queue, op];
  persist(next);
  return next;
}

export function dequeue(opId) {
  const next = loadQueue().filter((op) => op.opId !== opId);
  persist(next);
  return next;
}

/**
 * Send queued ops oldest-first.
 *
 * On the first failure, STOP. Skipping a failed op to attempt later ones would
 * reorder the household's history -- a note written before a rating landing
 * after it -- and ordering is the one thing an append-only log has to get
 * right. The failed op stays at the head of the queue for the next attempt.
 */
export async function replayQueue(source, { skipOpIds = new Set() } = {}) {
  let sent = 0;
  let dropped = 0;

  for (const op of loadQueue()) {
    // Never re-send an op that submitWrite currently has in flight. The op
    // stays queued for its whole round trip, so a connectivity flap firing
    // 'online' mid-request would otherwise replay the SAME opId concurrently
    // -- and two server executions can both pass the idempotency check before
    // either records it.
    if (skipOpIds.has(op.opId)) continue;
    if (!REPLAYABLE.has(op.action)) {
      // Written by a newer build than this one (e.g. an M8 setWeekPlan). It
      // can never succeed here, so drop it rather than wedge the queue
      // permanently behind an op this version cannot send.
      dequeue(op.opId);
      dropped += 1;
      continue;
    }
    try {
      await source[op.action]({ ...op.args, opId: op.opId });
      dequeue(op.opId);
      sent += 1;
    } catch {
      return { sent, dropped, remaining: queueLength() };
    }
  }

  return { sent, dropped, remaining: queueLength() };
}
