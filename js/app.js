import { createStaticJsonSource } from './data/static-json-source.js';
import { parseRoute, loadSettings, saveSettings } from './state.js';
import { applyTheme } from './ui/theme.js';
import { html } from './ui/html.js';
import {
  renderList, renderResultsBody, applyFilters, applyProtocolFilter,
  PREP_SLIDER_MAX, COOK_SLIDER_MAX, TOTAL_SLIDER_MAX, timeFilterDisplay,
} from './views/list.js';
import { renderRecipe, renderNotFound } from './views/recipe.js';
import { renderSettings, protocolLabel } from './views/settings.js';
import { pickSurprise } from './ui/surprise.js';
import { loadPairing, savePairing, clearPairing, validateEndpoint, isPaired } from './ui/pairing.js';
import { createAppsScriptSource } from './data/apps-script-source.js';
import { enqueue, dequeue, queueLength, replayQueue } from './data/write-queue.js';
import { syncStatus } from './ui/sync-status.js';

const root = document.getElementById('main');
const liveRegion = document.getElementById('live-region');
const source = createStaticJsonSource();

let libraryData = null;
let settings = loadSettings();
let filterState = {
  query: '', cuisines: [], allergenIds: [], tags: [],
  maxPrep: Infinity, maxCook: Infinity, maxTotal: Infinity,
  maxIngredients: Infinity, onePanOnly: false,
};

let pairing = loadPairing();
let privateSource = createAppsScriptSource({ pairing });
let privateData = loadPrivateCache();

applyTheme(settings.theme);

function renderSyncStatus() {
  const el = document.getElementById('sync-status');
  if (!el) return;
  const { text, stale } = syncStatus(libraryData?.meta?.generatedAt);
  el.textContent = text;
  el.classList.toggle('is-stale', stale);
}

// A photo that fails to load — offline before it was ever cached, or a file
// renamed out from under the Sheet — must leave no trace. The design is
// explicit that a missing photo says nothing at all, and a broken-image strip
// is not nothing.
function hidePhotoIfUnavailable() {
  const img = root.querySelector('.detail-photo');
  if (!img) return;
  const hide = () => img.remove();
  if (img.complete && img.naturalWidth === 0) hide();
  else img.addEventListener('error', hide, { once: true });
}

function announce(message) {
  liveRegion.textContent = message;
}

function focusHeading() {
  const heading = root.querySelector('h1');
  if (heading) heading.focus();
}

function setNavCurrent(routeName) {
  document.querySelectorAll('.app-header nav a').forEach((a) => a.removeAttribute('aria-current'));
  const active = document.querySelector(
    routeName === 'settings' ? '.app-header nav a[href="#/settings"]' : '.app-header nav a[href="#/"]'
  );
  if (active) active.setAttribute('aria-current', 'page');
}

// Personal avoidances badge everywhere; an empty selection (nothing set up
// yet) falls back to the full Sheet-defined list rather than showing zero
// badges, matching how every other empty filter in this app means "no
// restriction" rather than "restrict to nothing".
function badgeAvoidances() {
  return settings.avoidanceIds.length
    ? libraryData.avoidances.filter((a) => settings.avoidanceIds.includes(a.id))
    : libraryData.avoidances;
}

function setMsCount(detailsId, count) {
  const summary = document.querySelector(`#${detailsId} summary`);
  if (!summary) return;
  let countEl = summary.querySelector('.ms-count');
  if (count > 0) {
    if (!countEl) {
      countEl = document.createElement('span');
      countEl.className = 'ms-count';
      summary.appendChild(countEl);
    }
    countEl.textContent = String(count);
  } else if (countEl) {
    countEl.remove();
  }
}

function protocolFilteredRecipes() {
  return applyProtocolFilter(libraryData.recipes, settings.activeProtocolId, settings.showNonCompliant);
}

// Single source of truth for "how many recipes comply with protocol X" --
// the banner, its live-region announcement, and the settings-screen
// announcement on activation all read this instead of each hand-rolling
// the same filter.
function compliantCount(protocolId) {
  return libraryData.recipes.filter((r) => r.protocolCompliance?.[protocolId] === true).length;
}

function protocolBannerHtml() {
  if (!settings.activeProtocolId) return '';
  const protocol = libraryData.protocols.find((p) => p.id === settings.activeProtocolId);
  if (!protocol) return ''; // stale id from a protocol removed/deactivated in the Sheet -- reconciled at boot in main()
  return html`
    <div class="protocol-banner">
      <span>${protocolLabel(protocol)} active &mdash; ${compliantCount(protocol.id)} of ${libraryData.recipes.length} recipes.</span>
      <label><input type="checkbox" id="show-non-compliant" ${settings.showNonCompliant ? html`checked` : ''}> Show non-compliant</label>
      <button type="button" id="protocol-off">Turn off</button>
    </div>
  `;
}

function wireProtocolBanner() {
  const checkbox = document.getElementById('show-non-compliant');
  if (checkbox) {
    checkbox.addEventListener('change', (e) => {
      settings = { ...settings, showNonCompliant: e.target.checked };
      saveSettings(settings);
      renderCurrentList();
      // The banner (and this checkbox) survives this toggle -- stay on it
      // rather than yanking focus up to the heading, same convention as
      // the theme/protocol pickers in Settings.
      const restored = document.getElementById('show-non-compliant');
      if (restored) restored.focus();
    });
  }
  const offBtn = document.getElementById('protocol-off');
  if (offBtn) {
    offBtn.addEventListener('click', () => {
      settings = { ...settings, activeProtocolId: null, showNonCompliant: false };
      saveSettings(settings);
      renderCurrentList();
      // Unlike the checkbox above, this control itself disappears once the
      // protocol turns off -- there is nothing to restore focus to, so the
      // heading is the correct fallback here (matching route-change focus).
      focusHeading();
      announce('Protocol turned off.');
    });
  }
}

function updateListResults() {
  const scoped = { ...libraryData, recipes: protocolFilteredRecipes() };
  const resultsEl = document.getElementById('list-results');
  resultsEl.innerHTML = renderResultsBody(scoped, filterState, badgeAvoidances()).toString();
  const count = applyFilters(scoped.recipes, filterState).length;
  announce(`${count} recipe${count === 1 ? '' : 's'}`);
}

// Filter interactions only patch #list-results and small in-place DOM bits
// (count badges, slider labels) -- never re-render the whole view. Replacing
// the search input / dropdowns / sliders via innerHTML on every keystroke
// destroys focus and closes open <details> mid-interaction.
function wireListFilters() {
  const searchInput = root.querySelector('.search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterState = { ...filterState, query: e.target.value };
      updateListResults();
    });
  }
  root.querySelectorAll('input[name="cuisine"]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const checked = [...root.querySelectorAll('input[name="cuisine"]:checked')].map((c) => c.value);
      filterState = { ...filterState, cuisines: checked };
      setMsCount('cuisine-multiselect', checked.length);
      updateListResults();
    });
  });
  root.querySelectorAll('input[name="allergen"]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const checked = [...root.querySelectorAll('input[name="allergen"]:checked')].map((c) => c.value);
      filterState = { ...filterState, allergenIds: checked };
      setMsCount('allergen-multiselect', checked.length);
      updateListResults();
    });
  });
  const prepSlider = root.querySelector('#prep-slider');
  if (prepSlider) {
    prepSlider.addEventListener('input', (e) => {
      const raw = Number(e.target.value);
      filterState = { ...filterState, maxPrep: raw >= PREP_SLIDER_MAX ? Infinity : raw };
      prepSlider.parentElement.querySelector('.timefilter-value').textContent = timeFilterDisplay(raw, PREP_SLIDER_MAX);
      updateListResults();
    });
  }
  const cookSlider = root.querySelector('#cook-slider');
  if (cookSlider) {
    cookSlider.addEventListener('input', (e) => {
      const raw = Number(e.target.value);
      filterState = { ...filterState, maxCook: raw >= COOK_SLIDER_MAX ? Infinity : raw };
      cookSlider.parentElement.querySelector('.timefilter-value').textContent = timeFilterDisplay(raw, COOK_SLIDER_MAX);
      updateListResults();
    });
  }
  const totalSlider = root.querySelector('#total-slider');
  if (totalSlider) {
    totalSlider.addEventListener('input', (e) => {
      const raw = Number(e.target.value);
      filterState = { ...filterState, maxTotal: raw >= TOTAL_SLIDER_MAX ? Infinity : raw };
      totalSlider.parentElement.querySelector('.timefilter-value').textContent = timeFilterDisplay(raw, TOTAL_SLIDER_MAX);
      updateListResults();
    });
  }
  root.querySelectorAll('input[name="tag"]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const checked = [...root.querySelectorAll('input[name="tag"]:checked')].map((c) => c.value);
      filterState = { ...filterState, tags: checked };
      setMsCount('tags-multiselect', checked.length);
      updateListResults();
    });
  });
  const onePanChip = root.querySelector('[data-chip="one-pan"]');
  if (onePanChip) {
    onePanChip.addEventListener('click', () => {
      const next = !filterState.onePanOnly;
      filterState = { ...filterState, onePanOnly: next };
      onePanChip.setAttribute('aria-pressed', next ? 'true' : 'false');
      updateListResults();
    });
  }
  const maxSevenChip = root.querySelector('[data-chip="max-7-ingredients"]');
  if (maxSevenChip) {
    maxSevenChip.addEventListener('click', () => {
      const next = filterState.maxIngredients <= 7 ? Infinity : 7;
      filterState = { ...filterState, maxIngredients: next };
      maxSevenChip.setAttribute('aria-pressed', next <= 7 ? 'true' : 'false');
      updateListResults();
    });
  }
  const surpriseBtn = root.querySelector('#surprise-btn');
  if (surpriseBtn) {
    surpriseBtn.addEventListener('click', () => {
      const id = pickSurprise(protocolFilteredRecipes(), filterState);
      if (id != null) {
        location.hash = `#/r/${encodeURIComponent(id)}`;
      } else {
        announce('Nothing matches your current filters to surprise you with.');
      }
    });
  }
}

function renderCurrentList() {
  const scoped = { ...libraryData, recipes: protocolFilteredRecipes() };
  // Filter-bar options (Cuisine/Tags checkboxes) are derived from the FULL,
  // unscoped library -- not `scoped` -- so a checkbox a protocol has
  // narrowed to zero results never disappears out from under a filter the
  // user already has checked (it would otherwise be impossible to uncheck).
  root.innerHTML = renderList(scoped, filterState, badgeAvoidances(), libraryData, protocolBannerHtml()).toString();
  const count = applyFilters(scoped.recipes, filterState).length;
  announce(`${count} recipe${count === 1 ? '' : 's'}`);
  wireListFilters();
  wireProtocolBanner();
}

// --- private layer ---------------------------------------------------------
// The private cache is what makes notes and ratings readable offline. It is
// deliberately a plain localStorage mirror of the last successful fetch: the
// service worker never sees this traffic (it is a cross-origin POST to Apps
// Script), so the SW's caching strategies do not apply to it.
const PRIVATE_CACHE_KEY = 'recipe-genius:private-cache';

function loadPrivateCache() {
  try {
    const raw = localStorage.getItem(PRIVATE_CACHE_KEY);
    if (!raw) return { byRecipe: {} };
    const parsed = JSON.parse(raw);
    return parsed && parsed.byRecipe && typeof parsed.byRecipe === 'object' ? parsed : { byRecipe: {} };
  } catch {
    return { byRecipe: {} };
  }
}

function savePrivateCache(data) {
  try {
    localStorage.setItem(PRIVATE_CACHE_KEY, JSON.stringify(data));
  } catch {
    // Quota or private browsing -- the layer just will not read offline.
  }
}

function privateEntryFor(recipeId) {
  return privateData && privateData.byRecipe ? privateData.byRecipe[recipeId] || null : null;
}

/**
 * Refresh the private layer. Never blocks and never breaks the public view: a
 * failure here leaves the last cached copy in place, because a household whose
 * Apps Script is down should still be able to read their recipes.
 */
async function refreshPrivate({ rerender = false } = {}) {
  if (!privateSource.capabilities.private) return;
  try {
    const data = await privateSource.loadPrivate();
    privateData = data;
    savePrivateCache(data);
    if (rerender && parseRoute(location.hash).name === 'recipe') render();
  } catch {
    // Offline, or the endpoint is down. The cached copy stands.
  }
}

// Ops currently being POSTed. They stay in the durable queue for the whole
// round trip (so a crash mid-write cannot lose them), which means a replay
// triggered by 'online' could otherwise re-send the same opId concurrently.
const inFlightOpIds = new Set();
let syncing = false;

function newOpId() {
  return 'op-' + (crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(16).slice(2));
}

function setPrivateStatus(message, state = '') {
  const el = document.getElementById('private-status');
  if (!el) return;
  el.textContent = message;
  el.setAttribute('data-state', state);
}

/**
 * Every write goes through the queue, never straight to the network. Enqueue
 * first, then attempt: if the attempt fails the op is already durably stored,
 * so closing the tab mid-write cannot lose it.
 */
async function submitWrite(action, args, { pending, done, onSuccess }) {
  const opId = newOpId();
  enqueue({ opId, action, args, queuedAt: new Date().toISOString() });
  setPrivateStatus(pending);
  inFlightOpIds.add(opId);
  try {
    const data = await privateSource[action]({ ...args, opId });
    dequeue(opId);
    privateData = data;
    savePrivateCache(data);
    // Runs BEFORE the re-render. Clearing the note draft afterwards was too
    // late: render() destroys and recreates the textarea, and the rewiring
    // restored the just-saved draft into it -- so the note appeared in the
    // list AND stayed in the box, and tapping again created a duplicate with
    // a fresh opId that server-side dedupe could not catch.
    if (onSuccess) onSuccess();
    render();
    // After the re-render, not before: render() replaces #private-status, so
    // a message set earlier was written to a detached element and never seen.
    setPrivateStatus(done);
    announce(done);
    return true;
  } catch (err) {
    const message = String((err && err.message) || err);
    // Offline and "your credential is bad" are completely different problems.
    // Telling someone a rejected token will "sync when you're online" leaves
    // them waiting forever for something that can never happen.
    if (isAuthFailure(message)) {
      dequeue(opId);
      setPrivateStatus('This device is no longer authorised. Re-pair it in Settings.', 'error');
    } else {
      setPrivateStatus('Saved on this device. It will send next time you are online.');
    }
    return false;
  } finally {
    inFlightOpIds.delete(opId);
  }
}

function isAuthFailure(message) {
  return /unauthorized|not paired|rejected/i.test(message);
}

const noteDraftKey = (recipeId) => `recipe-genius:note-draft:${recipeId}`;

// render() ends in focusHeading(), which is right for a route change and
// wrong for an in-place update -- tapping a rating star would throw a
// keyboard or screen-reader user back to the recipe title. Same convention
// the theme and protocol pickers already follow.
function restoreFocus(selector) {
  const el = document.querySelector(selector);
  if (el) el.focus();
}

function wireRecipePrivate(recipeId) {
  const cookedBtn = document.getElementById('mark-cooked');
  if (cookedBtn) {
    cookedBtn.addEventListener('click', () => {
      submitWrite('markCooked', { recipeId }, {
        pending: 'Saving…', done: 'Marked as cooked.',
        onSuccess: () => queueMicrotask(() => restoreFocus('#mark-cooked')),
      });
    });
  }

  document.querySelectorAll('[data-rating]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const rating = Number(btn.getAttribute('data-rating'));
      submitWrite('setRating', { recipeId, rating }, {
        pending: 'Saving…', done: 'Rating saved.',
        onSuccess: () => queueMicrotask(() => restoreFocus(`[data-rating="${rating}"]`)),
      });
    });
  });

  const input = document.getElementById('note-input');
  if (input) {
    // Restore any draft first. Losing a half-typed note to an interruption is
    // the single most common recipe-app complaint.
    try {
      const draft = localStorage.getItem(noteDraftKey(recipeId));
      if (draft) input.value = draft;
    } catch { /* no draft available */ }

    input.addEventListener('input', () => {
      try {
        localStorage.setItem(noteDraftKey(recipeId), input.value);
      } catch { /* draft just will not persist */ }
    });
  }

  const saveBtn = document.getElementById('note-save');
  if (saveBtn && input) {
    saveBtn.addEventListener('click', async () => {
      const text = input.value.trim();
      if (!text) {
        setPrivateStatus('Type a note first.');
        return;
      }
      await submitWrite('saveNote', { recipeId, text }, {
        pending: 'Saving…',
        done: 'Note added.',
        // Clearing here, before render(), is what stops the saved text being
        // restored into the fresh textarea as a draft.
        onSuccess: () => {
          try {
            localStorage.removeItem(noteDraftKey(recipeId));
          } catch { /* nothing to clear */ }
          queueMicrotask(() => restoreFocus('#note-input'));
        },
      });
    });
  }
}

function rebuildPrivateSource() {
  privateSource = createAppsScriptSource({ pairing });
}

function wirePairingForm() {
  const submit = document.getElementById('pair-submit');
  if (submit) {
    submit.addEventListener('click', async () => {
      const endpointEl = document.getElementById('pair-endpoint');
      const tokenEl = document.getElementById('pair-token');
      const status = document.getElementById('pair-status');
      const endpoint = endpointEl.value.trim();
      const token = tokenEl.value.trim();

      const fail = (msg) => {
        if (!status) return;
        status.textContent = msg;
        status.setAttribute('data-state', 'error');
      };

      if (!validateEndpoint(endpoint)) {
        fail('That does not look like a deployed Apps Script URL. It should start with https://script.google.com/macros/s/ and end with /exec.');
        return;
      }
      if (!token) {
        fail('Enter the device token.');
        return;
      }

      if (status) {
        status.textContent = 'Checking…';
        status.removeAttribute('data-state');
      }

      // Verify the credential live BEFORE storing it. Saving first and finding
      // out the token is wrong later is how a device ends up looking paired
      // while silently failing every write.
      const candidate = createAppsScriptSource({ pairing: { endpoint, token } });
      try {
        const data = await candidate.loadPrivate();
        pairing = { endpoint, token };
        savePairing(pairing);
        rebuildPrivateSource();
        privateData = data;
        savePrivateCache(data);
        render();
        announce('This device is now paired.');
      } catch (err) {
        const msg = String((err && err.message) || err);
        fail(/unauthorized/i.test(msg)
          ? 'That token was rejected. Check it matches the DEVICE_TOKEN script property exactly.'
          : msg);
      }
    });
  }

  const unpairDevice = (message) => {
    pairing = { endpoint: '', token: '' };
    clearPairing();
    rebuildPrivateSource();
    // Drop the local mirror too. Leaving the household's notes readable on a
    // device that was just unpaired defeats the point of unpairing.
    privateData = { byRecipe: {} };
    // Purge EVERY local trace, not just the cache. Half-typed note drafts and
    // the unsent write queue both contain the household's note text verbatim.
    // Leaving them means the next person to pair this device to a different
    // sheet sees the previous household's draft restored into the textarea,
    // and their queued ops replay to the NEW endpoint on the first 'online'.
    try {
      localStorage.removeItem(PRIVATE_CACHE_KEY);
      localStorage.removeItem('recipe-genius:write-queue');
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('recipe-genius:note-draft:')) localStorage.removeItem(k);
      }
    } catch { /* nothing to clear */ }
    render();
    if (message) announce(message);
  };

  const repair = document.getElementById('pair-repair');
  if (repair) repair.addEventListener('click', () => unpairDevice(''));

  const unpair = document.getElementById('pair-unpair');
  if (unpair) unpair.addEventListener('click', () => unpairDevice('This device is no longer paired.'));
}

async function syncQueue() {
  // Non-reentrant: a connectivity flap can fire 'online' twice in quick
  // succession, and two loops over the same loadQueue() snapshot would send
  // every op twice.
  if (syncing) return;
  if (!privateSource.capabilities.write || queueLength() === 0) return;
  syncing = true;
  try {
    const result = await replayQueue(privateSource, { skipOpIds: inFlightOpIds });
    if (result.sent > 0) await refreshPrivate({ rerender: true });
    if (result.remaining > 0 && parseRoute(location.hash).name === 'settings') {
      // Re-render Settings so its pending count reflects what is actually
      // still stuck, rather than the number from page load.
      render();
    }
  } finally {
    syncing = false;
  }
}

function wireSettingsForm() {
  wirePairingForm();
  root.querySelectorAll('input[name="avoidance"]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const checked = [...root.querySelectorAll('input[name="avoidance"]:checked')].map((c) => c.value);
      settings = { ...settings, avoidanceIds: checked };
      saveSettings(settings);
    });
  });
  root.querySelectorAll('[data-theme-choice]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const theme = btn.getAttribute('data-theme-choice');
      settings = { ...settings, theme };
      saveSettings(settings);
      applyTheme(theme);
      root.innerHTML = renderSettings(libraryData.avoidances, libraryData.protocols, settings, pairing, queueLength()).toString();
      wireSettingsForm();
      // Stay on the button the user just pressed rather than yanking focus
      // up to the page heading -- this is an in-place update, not a route change.
      const pressed = root.querySelector(`[data-theme-choice="${theme}"]`);
      if (pressed) pressed.focus();
    });
  });
  root.querySelectorAll('[data-protocol-choice]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const chosenId = btn.getAttribute('data-protocol-choice');
      settings = { ...settings, activeProtocolId: chosenId || null, showNonCompliant: false };
      saveSettings(settings);
      root.innerHTML = renderSettings(libraryData.avoidances, libraryData.protocols, settings, pairing, queueLength()).toString();
      wireSettingsForm();
      // Find by attribute value rather than interpolating chosenId into a
      // selector string -- a Sheet-authored protocol id containing a `"`
      // would otherwise throw and abort the handler mid-way.
      const pressed = [...root.querySelectorAll('[data-protocol-choice]')]
        .find((el) => el.getAttribute('data-protocol-choice') === chosenId);
      if (pressed) pressed.focus();
      if (chosenId) {
        const protocol = libraryData.protocols.find((p) => p.id === chosenId);
        announce(`${protocolLabel(protocol)} active — ${compliantCount(chosenId)} of ${libraryData.recipes.length} recipes.`);
      }
    });
  });
}

async function render() {
  const route = parseRoute(location.hash);
  setNavCurrent(route.name);

  if (route.name === 'list') {
    renderCurrentList();
  } else if (route.name === 'recipe') {
    const recipe = libraryData.recipes.find((r) => r.id === route.recipeId);
    root.innerHTML = recipe
      ? renderRecipe(recipe, badgeAvoidances(), privateEntryFor(route.recipeId), privateSource.capabilities).toString()
      : renderNotFound(route.recipeId).toString();
    hidePhotoIfUnavailable();
    if (recipe && privateSource.capabilities.private) wireRecipePrivate(recipe.id);
  } else if (route.name === 'settings') {
    root.innerHTML = renderSettings(libraryData.avoidances, libraryData.protocols, settings, pairing, queueLength()).toString();
    wireSettingsForm();
  }

  focusHeading();
}

function wireSkipLink() {
  const skipLink = document.querySelector('.skip-link[href="#main"]');
  if (!skipLink) return;
  skipLink.addEventListener('click', (e) => {
    e.preventDefault();
    root.focus();
  });
}

async function main() {
  wireSkipLink();
  try {
    libraryData = await source.loadPublic();
  } catch (err) {
    root.innerHTML = html`<div class="empty-state"><h1 tabindex="-1">Couldn't load recipes</h1><p>Check your connection and reload. (${err.message})</p></div>`.toString();
    focusHeading();
    // Still report sync state here. Leaving the footer on its "Checking sync…"
    // placeholder in the one case it most needs to speak is exactly the
    // silent-staleness failure this indicator exists to prevent.
    renderSyncStatus();
    return;
  }
  renderSyncStatus();
  // A protocol can be removed or deactivated by a single Sheet edit
  // (scripts/sync.mjs drops it from `protocols` and from every recipe's
  // `protocolCompliance`). Reconcile any stale saved id now, before the
  // first render, rather than leaving a user permanently stuck on an empty
  // "0 recipes" Browse with no banner and no visible way out.
  if (settings.activeProtocolId && !libraryData.protocols.some((p) => p.id === settings.activeProtocolId)) {
    settings = { ...settings, activeProtocolId: null, showNonCompliant: false };
    saveSettings(settings);
  }
  // Both are deliberately un-awaited: the public library must render
  // immediately whether or not the private endpoint is reachable.
  refreshPrivate({ rerender: true });
  syncQueue();
  // A write made offline should go up the moment the device reconnects,
  // without the user having to reopen the app or retry by hand.
  window.addEventListener('online', syncQueue);

  window.addEventListener('hashchange', render);
  render();
}

main();

// Registered after boot so a SW failure can never keep the app from rendering.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err.message);
    });
  });
}
