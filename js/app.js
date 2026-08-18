import { createStaticJsonSource } from './data/static-json-source.js';
import { parseRoute, loadSettings, saveSettings } from './state.js';
import { applyTheme } from './ui/theme.js';
import { renderList, applyFilters } from './views/list.js';
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

function wireListFilters() {
  const searchInput = root.querySelector('.search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterState = { ...filterState, query: e.target.value };
      renderCurrentList();
    });
  }
  root.querySelectorAll('input[name="cuisine"]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const checked = [...root.querySelectorAll('input[name="cuisine"]:checked')].map((c) => c.value);
      filterState = { ...filterState, cuisines: checked };
      renderCurrentList();
    });
  });
  root.querySelectorAll('input[name="allergen"]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const checked = [...root.querySelectorAll('input[name="allergen"]:checked')].map((c) => c.value);
      filterState = { ...filterState, allergenIds: checked };
      renderCurrentList();
    });
  });
  const prepSlider = root.querySelector('#prep-slider');
  if (prepSlider) {
    prepSlider.addEventListener('input', (e) => {
      filterState = { ...filterState, maxPrep: Number(e.target.value) };
      renderCurrentList();
    });
  }
  const cookSlider = root.querySelector('#cook-slider');
  if (cookSlider) {
    cookSlider.addEventListener('input', (e) => {
      filterState = { ...filterState, maxCook: Number(e.target.value) };
      renderCurrentList();
    });
  }
}

function renderCurrentList() {
  root.innerHTML = renderList(libraryData, filterState).toString();
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
      focusHeading();
      wireSettingsForm();
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
    root.innerHTML = recipe ? renderRecipe(recipe, libraryData.avoidances).toString() : renderNotFound(route.recipeId).toString();
  } else if (route.name === 'settings') {
    root.innerHTML = renderSettings(libraryData.avoidances, settings).toString();
    wireSettingsForm();
  }

  focusHeading();
}

async function main() {
  try {
    libraryData = await source.loadPublic();
  } catch (err) {
    root.innerHTML = `<div class="empty-state"><h1 tabindex="-1">Couldn't load recipes</h1><p>Check your connection and reload. (${err.message})</p></div>`;
    focusHeading();
    return;
  }
  window.addEventListener('hashchange', render);
  render();
}

main();
