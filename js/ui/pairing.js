// Device pairing state: the Apps Script endpoint plus the device token.
//
// Deliberately stored under its OWN key, not inside recipe-genius:settings.
// Pairing is per-device and settings are per-preference; folding them together
// would mean a settings reset silently unpairs a phone, and "my notes vanished"
// is the exact failure this app is built to never look like.
//
// Neither value is ever committed to the repo. The endpoint is a secret too --
// it is a public write endpoint acting with the owner's Google identity.

const PAIRING_KEY = 'recipe-genius:pairing';

function empty() {
  return { endpoint: '', token: '' };
}

/**
 * The endpoint is user-entered and then POSTed to WITH THE TOKEN IN THE BODY,
 * so this is a security control rather than input politeness: a typo'd or
 * hostile host would receive the household's credential. Only a real Apps
 * Script production deployment URL is accepted.
 *
 * /dev URLs are rejected on purpose -- they require a Google login and behave
 * differently from the deployed script, so accepting one produces a confusing
 * half-working pairing.
 */
export function validateEndpoint(url) {
  if (typeof url !== 'string' || !url) return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === 'https:' &&
    parsed.hostname === 'script.google.com' &&
    /^\/macros\/s\/[^/]+\/exec$/.test(parsed.pathname)
  );
}

export function isPaired(pairing) {
  return !!(pairing && pairing.endpoint && pairing.token);
}

export function loadPairing() {
  try {
    const raw = localStorage.getItem(PAIRING_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw);
    const endpoint = typeof parsed.endpoint === 'string' ? parsed.endpoint : '';
    return {
      // Re-validate on read, not just on write. A stored endpoint could have
      // been hand-edited in devtools, or written by an older build with looser
      // rules -- trusting it because it is already in localStorage would make
      // the check above bypassable.
      endpoint: validateEndpoint(endpoint) ? endpoint : '',
      token: typeof parsed.token === 'string' ? parsed.token : '',
    };
  } catch {
    return empty();
  }
}

export function savePairing({ endpoint, token }) {
  try {
    localStorage.setItem(PAIRING_KEY, JSON.stringify({ endpoint, token }));
  } catch {
    // localStorage can throw (private browsing, quota). Pairing just will not
    // persist this session rather than taking the app down.
  }
}

export function clearPairing() {
  try {
    localStorage.removeItem(PAIRING_KEY);
  } catch {
    // Same reasoning as savePairing.
  }
}
