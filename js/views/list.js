import { html } from '../ui/html.js';
import { computeBadges } from '../ui/badges.js';

export const PREP_SLIDER_MAX = 60;
export const COOK_SLIDER_MAX = 300;

export function applyFilters(recipes, filterState) {
  const { query, cuisines, allergenIds, maxPrep, maxCook } = filterState;
  const q = query.trim().toLowerCase();

  return recipes.filter((r) => {
    if (q && !r.title.toLowerCase().includes(q)) return false;
    if (cuisines.length && !cuisines.includes(r.cuisine)) return false;
    if (maxPrep != null && r.prepMinutes != null && r.prepMinutes > maxPrep) return false;
    if (maxCook != null && r.cookMinutes != null && r.cookMinutes > maxCook) return false;
    if (allergenIds.length) {
      const flagged = new Set((r.flags || []).map((f) => f.allergenId));
      if (!allergenIds.some((id) => flagged.has(id))) return false;
    }
    return true;
  });
}

function badgeHtml(badge) {
  return html`<span class="badge badge-${badge.weight}">${badge.text}</span>`;
}

function cardHtml(recipe, badgeAvoidances) {
  const badges = computeBadges(recipe.flags || [], badgeAvoidances);
  const meta = [
    recipe.prepMinutes != null ? `${recipe.prepMinutes} min prep` : null,
    recipe.cookMinutes != null ? `${recipe.cookMinutes} min cook` : null,
    recipe.servingsCount != null ? `${recipe.servingsCount} servings` : null,
  ].filter(Boolean).join(' · ');

  return html`
    <a class="card" href="#/r/${recipe.id}">
      <p class="card-title">${recipe.title}</p>
      <p class="card-meta">${meta}</p>
      <div class="badges">${badges.map(badgeHtml)}</div>
    </a>
  `;
}

function cuisineOptionsHtml(recipes, selected) {
  const cuisines = [...new Set(recipes.map((r) => r.cuisine).filter(Boolean))].sort();
  return cuisines.map((c) => html`
    <label>
      <input type="checkbox" name="cuisine" value="${c}" ${selected.includes(c) ? html`checked` : ''}>
      ${c}
    </label>
  `);
}

function allergenOptionsHtml(avoidances, selected) {
  const primary = avoidances.filter((a) => a.severity === 'allergy' || a.severity === 'sensitivity');
  const other = avoidances.filter((a) => a.severity !== 'allergy' && a.severity !== 'sensitivity');
  const rowHtml = (a) => html`
    <label>
      <input type="checkbox" name="allergen" value="${a.id}" ${selected.includes(a.id) ? html`checked` : ''}>
      ${a.label}
    </label>
  `;
  return html`
    ${primary.map(rowHtml)}
    ${other.length ? html`<p class="ms-divider">Other ingredients</p>` : ''}
    ${other.map(rowHtml)}
  `;
}

/** Shared with app.js's live slider-input handler so the two never drift. */
export function timeFilterDisplay(value, sliderMax) {
  return value >= sliderMax ? 'No limit' : `≤ ${value}m`;
}

function timeFilterHtml(id, label, currentMax, sliderMax) {
  const value = currentMax === Infinity || currentMax > sliderMax ? sliderMax : currentMax;
  return html`
    <div class="timefilter">
      <label for="${id}">${label}</label>
      <input type="range" id="${id}" min="0" max="${sliderMax}" step="5" value="${value}">
      <span class="timefilter-value">${timeFilterDisplay(value, sliderMax)}</span>
    </div>
  `;
}

export function renderFilterBar(libraryData, filterState) {
  const cuisineCount = filterState.cuisines.length;
  const allergenCount = filterState.allergenIds.length;

  return html`
    <div class="filterbar">
      <input type="search" class="search-input" placeholder="Search recipes…" value="${filterState.query}">
      <details class="multiselect" id="cuisine-multiselect">
        <summary><span class="ms-label">Cuisine</span> ${cuisineCount ? html`<span class="ms-count">${cuisineCount}</span>` : ''}</summary>
        <div class="ms-panel">${cuisineOptionsHtml(libraryData.recipes, filterState.cuisines)}</div>
      </details>
      <details class="multiselect" id="allergen-multiselect">
        <summary><span class="ms-label">Allergens</span> ${allergenCount ? html`<span class="ms-count">${allergenCount}</span>` : ''}</summary>
        <div class="ms-panel">${allergenOptionsHtml(libraryData.avoidances, filterState.allergenIds)}</div>
      </details>
      ${timeFilterHtml('prep-slider', 'PREP ≤', filterState.maxPrep, PREP_SLIDER_MAX)}
      ${timeFilterHtml('cook-slider', 'COOK ≤', filterState.maxCook, COOK_SLIDER_MAX)}
    </div>
    <p class="card-meta" style="margin: -8px 0 16px;">Cook time filters on active cook minutes only — marinating and passive time are excluded and only count toward the total shown on each card.</p>
  `;
}

export function renderResultsBody(libraryData, filterState, badgeAvoidances = libraryData.avoidances) {
  const matches = applyFilters(libraryData.recipes, filterState);

  const body = matches.length === 0
    ? html`
      <div class="empty-state">
        <h2>Nothing matches "${filterState.query || 'your filters'}"</h2>
        <p>Try clearing a filter or searching a different term.</p>
      </div>`
    : html`<div class="card-grid">${matches.map((r) => cardHtml(r, badgeAvoidances))}</div>`;

  return html`
    <p class="result-count">${matches.length} recipe${matches.length === 1 ? '' : 's'}</p>
    ${body}
  `;
}

export function renderList(libraryData, filterState, badgeAvoidances = libraryData.avoidances) {
  return html`
    <h1 tabindex="-1">Browse recipes</h1>
    ${renderFilterBar(libraryData, filterState)}
    <div id="list-results">${renderResultsBody(libraryData, filterState, badgeAvoidances)}</div>
  `;
}
