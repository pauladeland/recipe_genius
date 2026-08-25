const SETTINGS_KEY = 'recipe-genius:settings';

export function parseRoute(hash) {
  const path = (hash || '#/').replace(/^#/, '');
  if (path === '' || path === '/') return { name: 'list' };
  const recipeMatch = path.match(/^\/r\/([^/?]+)/);
  if (recipeMatch) {
    try {
      return { name: 'recipe', recipeId: decodeURIComponent(recipeMatch[1]) };
    } catch {
      return { name: 'list' };
    }
  }
  if (path.startsWith('/settings')) return { name: 'settings' };
  return { name: 'list' };
}

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { theme: 'system', avoidanceIds: [], activeProtocolId: null, showNonCompliant: false };
    const parsed = JSON.parse(raw);
    return {
      theme: parsed.theme === 'light' || parsed.theme === 'dark' ? parsed.theme : 'system',
      avoidanceIds: Array.isArray(parsed.avoidanceIds) ? parsed.avoidanceIds : [],
      // Must be a non-empty string, or it normalizes to the one true "off"
      // value -- rejects both wrong types (e.g. a stray 42) and a
      // corrupt/hand-edited "".
      activeProtocolId: typeof parsed.activeProtocolId === 'string' && parsed.activeProtocolId ? parsed.activeProtocolId : null,
      showNonCompliant: parsed.showNonCompliant === true,
    };
  } catch {
    return { theme: 'system', avoidanceIds: [], activeProtocolId: null, showNonCompliant: false };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // localStorage can throw (private browsing, quota) -- settings just
    // won't persist this session rather than crashing the app.
  }
}
