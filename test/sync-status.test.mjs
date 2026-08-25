import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncStatus } from '../js/ui/sync-status.js';

const now = new Date('2026-08-25T12:00:00Z');
const ago = (ms) => new Date(now.getTime() - ms).toISOString();
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

test('a sync within the minute reads as just now', () => {
  assert.equal(syncStatus(ago(30_000), now).text, 'Synced just now');
});

test('minutes, hours, and days each get their own unit', () => {
  assert.equal(syncStatus(ago(5 * MIN), now).text, 'Synced 5 minutes ago');
  assert.equal(syncStatus(ago(4 * HOUR), now).text, 'Synced 4 hours ago');
  assert.equal(syncStatus(ago(3 * DAY), now).text, 'Synced 3 days ago');
});

test('singular units are not pluralized', () => {
  assert.equal(syncStatus(ago(1 * MIN), now).text, 'Synced 1 minute ago');
  assert.equal(syncStatus(ago(1 * HOUR), now).text, 'Synced 1 hour ago');
  assert.equal(syncStatus(ago(1 * DAY), now).text, 'Synced 1 day ago');
});

test('under 7 days is not stale', () => {
  assert.equal(syncStatus(ago(6 * DAY), now).stale, false);
});

test('past 7 days flips to stale and says so, with a prompt to act', () => {
  const result = syncStatus(ago(12 * DAY), now);
  assert.equal(result.stale, true);
  assert.equal(result.text, 'Last synced 12 days ago — tap to sync');
});

test('exactly 7 days is already stale — the boundary is inclusive', () => {
  assert.equal(syncStatus(ago(7 * DAY), now).stale, true);
});

test('a missing or unparseable timestamp is stale, never silently fine', () => {
  assert.equal(syncStatus(null, now).stale, true);
  assert.equal(syncStatus('not-a-date', now).stale, true);
  assert.match(syncStatus(null, now).text, /never synced/i);
});

test('a future timestamp does not render as negative time', () => {
  const result = syncStatus(new Date(now.getTime() + 60 * MIN).toISOString(), now);
  assert.equal(result.text, 'Synced just now');
  assert.equal(result.stale, false);
});
