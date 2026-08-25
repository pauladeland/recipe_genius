import { html } from '../ui/html.js';
import { computeBadges } from '../ui/badges.js';
import { photoSrc, photoAlt } from '../ui/photo.js';

function badgeHtml(badge) {
  return html`
    <details class="badge-detail">
      <summary class="badge badge-${badge.weight}">${badge.text}</summary>
      <div class="badge-detail-body">
        <ul class="badge-causes">${badge.causes.map((c) => html`<li>${c.line || c.term}</li>`)}</ul>
        ${badge.substitutions ? html`<p class="badge-sub">Try instead: ${badge.substitutions}</p>` : ''}
      </div>
    </details>
  `;
}

function sourceLine(recipe) {
  if (!recipe.sourceUrl) return null;
  const isSafeUrl = /^https?:\/\//i.test(recipe.sourceUrl);
  if (isSafeUrl) {
    return html`<p class="detail-source">From <a href="${recipe.sourceUrl}">${recipe.sourceName || recipe.sourceUrl}</a></p>`;
  }
  return html`<p class="detail-source">From ${recipe.sourceName || recipe.sourceUrl}</p>`;
}

// A recipe with no usable photo renders no element at all — no placeholder,
// no broken-image icon. Silence is the designed state for most recipes.
function photoHtml(recipe) {
  const src = photoSrc(recipe);
  if (!src) return '';
  return html`<img class="detail-photo" src="${src}" alt="${photoAlt(recipe)}" loading="lazy" decoding="async">`;
}

export function renderRecipe(recipe, avoidances) {
  const badges = computeBadges(recipe.flags || [], avoidances);
  const source = sourceLine(recipe);

  return html`
    <div class="detail">
      <div class="detail-badges">${badges.map(badgeHtml)}</div>
      <h1 class="detail-title" tabindex="-1">${recipe.title}</h1>
      ${source}
      ${photoHtml(recipe)}
      <div class="detail-times">
        ${recipe.prepMinutes != null ? html`<span><b>${recipe.prepMinutes}</b> min prep</span>` : ''}
        ${recipe.cookMinutes != null ? html`<span><b>${recipe.cookMinutes}</b> min cook</span>` : ''}
        ${recipe.totalMinutes != null ? html`<span><b>${recipe.totalMinutes}</b> min total</span>` : ''}
        ${recipe.servings ? html`<span><b>${recipe.servings}</b></span>` : ''}
      </div>
      <div class="detail-cols">
        <div>
          <h2>Ingredients</h2>
          <ul class="ingredients">${(recipe.ingredients || []).map((line) => html`<li>${line}</li>`)}</ul>
        </div>
        <div>
          <h2>Steps</h2>
          <ol class="steps">${(recipe.steps || []).map((line) => html`<li>${line}</li>`)}</ol>
        </div>
      </div>
      <p class="detail-footer">Ingredient checks are automatic and can miss things. Always read labels.</p>
    </div>
  `;
}

export function renderNotFound(recipeId) {
  return html`
    <div class="empty-state">
      <h1 tabindex="-1">Recipe not found</h1>
      <p>There's no recipe with id "${recipeId}". It may have been archived or renamed.</p>
      <p><a href="#/">Back to browse</a></p>
    </div>
  `;
}
