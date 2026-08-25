// The sync indicator. A scheduled GitHub workflow auto-disables after ~60
// days of repo inactivity, and a failing run looks exactly like a working one
// from inside the app — Sheet edits just stop appearing. A discreet timestamp
// lets that pass for weeks and reads as "the app is broken." Past a week the
// indicator changes state visibly and names the number.

const STALE_AFTER_DAYS = 7;
const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;

function plural(n, unit) {
  return `${n} ${unit}${n === 1 ? '' : 's'}`;
}

export function syncStatus(generatedAt, now = new Date()) {
  const then = generatedAt ? new Date(generatedAt) : null;
  if (!then || Number.isNaN(then.getTime())) {
    return { text: 'Never synced — tap to sync', stale: true };
  }

  // Clock skew between the CI runner and this device can put the timestamp
  // slightly in the future; that is not staleness.
  const elapsed = Math.max(0, now.getTime() - then.getTime());
  const days = Math.floor(elapsed / DAY);

  if (days >= STALE_AFTER_DAYS) {
    return { text: `Last synced ${plural(days, 'day')} ago — tap to sync`, stale: true };
  }
  if (days >= 1) return { text: `Synced ${plural(days, 'day')} ago`, stale: false };

  const hours = Math.floor(elapsed / HOUR);
  if (hours >= 1) return { text: `Synced ${plural(hours, 'hour')} ago`, stale: false };

  const minutes = Math.floor(elapsed / MINUTE);
  if (minutes >= 1) return { text: `Synced ${plural(minutes, 'minute')} ago`, stale: false };

  return { text: 'Synced just now', stale: false };
}
