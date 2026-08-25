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

function wireSettingsForm() {
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
      root.innerHTML = renderSettings(libraryData.avoidances, libraryData.protocols, settings).toString();
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
      root.innerHTML = renderSettings(libraryData.avoidances, libraryData.protocols, settings).toString();
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
    root.innerHTML = recipe ? renderRecipe(recipe, badgeAvoidances()).toString() : renderNotFound(route.recipeId).toString();
    hidePhotoIfUnavailable();
  } else if (route.name === 'settings') {
    root.innerHTML = renderSettings(libraryData.avoidances, libraryData.protocols, settings).toString();
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
