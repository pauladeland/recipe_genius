import { createStaticJsonSource } from './data/static-json-source.js';
import { parseRoute, loadSettings, saveSettings } from './state.js';
import { applyTheme } from './ui/theme.js';
import { html } from './ui/html.js';
import {
  renderList, renderResultsBody, applyFilters,
  PREP_SLIDER_MAX, COOK_SLIDER_MAX, timeFilterDisplay,
} from './views/list.js';
import { renderRecipe, renderNotFound } from './views/recipe.js';
import { renderSettings } from './views/settings.js';

const root = document.getElementById('main');
const liveRegion = document.getElementById('live-region');
const source = createStaticJsonSource();

let libraryData = null;
let settings = loadSettings();
let filterState = { query: '', cuisines: [], allergenIds: [], maxPrep: Infinity, maxCook: Infinity };

applyTheme(settings.theme);

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

function updateListResults() {
  const resultsEl = document.getElementById('list-results');
  resultsEl.innerHTML = renderResultsBody(libraryData, filterState, badgeAvoidances()).toString();
  const count = applyFilters(libraryData.recipes, filterState).length;
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
}

function renderCurrentList() {
  root.innerHTML = renderList(libraryData, filterState, badgeAvoidances()).toString();
  const count = applyFilters(libraryData.recipes, filterState).length;
  announce(`${count} recipe${count === 1 ? '' : 's'}`);
  wireListFilters();
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
      root.innerHTML = renderSettings(libraryData.avoidances, settings).toString();
      wireSettingsForm();
      // Stay on the button the user just pressed rather than yanking focus
      // up to the page heading -- this is an in-place update, not a route change.
      const pressed = root.querySelector(`[data-theme-choice="${theme}"]`);
      if (pressed) pressed.focus();
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
  } else if (route.name === 'settings') {
    root.innerHTML = renderSettings(libraryData.avoidances, settings).toString();
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
    return;
  }
  window.addEventListener('hashchange', render);
  render();
}

main();
