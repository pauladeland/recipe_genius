import { html, raw } from '../ui/html.js';
import { computeBadges } from '../ui/badges.js';

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
  return html`<span class="badge badge-${raw(badge.weight)}">${badge.text}</span>`;
}

function cardHtml(recipe, avoidances) {
  const badges = computeBadges(recipe.flags || [], avoidances);
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

export function renderList(libraryData, filterState) {
  const { recipes, avoidances } = libraryData;
  const matches = applyFilters(recipes, filterState);

  const body = matches.length === 0
    ? html`
      <div class="empty-state">
        <h2>Nothing matches "${filterState.query || 'your filters'}"</h2>
        <p>Try clearing a filter or searching a different term.</p>
      </div>`
    : html`<div class="card-grid">${matches.map((r) => cardHtml(r, avoidances))}</div>`;

  return html`
    <h1 tabindex="-1">Browse recipes</h1>
    <p class="result-count">${matches.length} recipe${matches.length === 1 ? '' : 's'}</p>
    ${body}
  `;
}
