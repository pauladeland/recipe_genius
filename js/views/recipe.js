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
  // Eager, not lazy: this is the one image on the page and it sits just below
  // the title, so deferring it only delays the largest paint.
  return html`<img class="detail-photo" src="${src}" alt="${photoAlt(recipe)}" decoding="async">`;
}

function ratingButton(value, current) {
  return html`<button type="button" data-rating="${value}" aria-pressed="${current === value ? 'true' : 'false'}" aria-label="${value} out of 5">${value}</button>`;
}

/**
 * The household's private layer. Renders ONLY when the device is paired --
 * `capabilities.private` is the single gate, and it is checked here rather
 * than by each caller so the public view cannot leak this by forgetting a
 * check. An unpaired device shows nothing at all: not an empty note box, not
 * a "pair to add notes" prompt. Absent, never broken.
 */
function privateHtml(privateEntry, capabilities) {
  if (!capabilities || !capabilities.private) return '';

  const entry = privateEntry || {};
  // Notes arrive as one append-only cell of dated lines.
  const notes = (entry.notes || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const cooked = entry.timesCooked > 0
    ? html`<p class="cooked-meta">Cooked <b>${entry.timesCooked}</b> times${entry.lastCooked ? html` &middot; last on <b>${entry.lastCooked}</b>` : ''}</p>`
    : '';

  return html`
    <section class="private-section">
      <h2>Your notes</h2>
      ${cooked}
      <button type="button" class="cooked-btn" id="mark-cooked">Made it</button>
      <div class="rating-row" role="group" aria-label="Rating">
        ${[1, 2, 3, 4, 5].map((n) => ratingButton(n, entry.rating))}
      </div>
      ${notes.length ? html`<ul class="note-list">${notes.map((n) => html`<li>${n}</li>`)}</ul>` : ''}
      <div class="note-form">
        <label for="note-input" class="visually-hidden">Add a note</label>
        <textarea id="note-input" placeholder="What would you change next time?"></textarea>
        <button type="button" id="note-save">Add note</button>
      </div>
      <p class="private-status" id="private-status" role="status"></p>
    </section>
  `;
}

export function renderRecipe(recipe, avoidances, privateEntry = null, capabilities = { private: false, write: false }) {
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
      ${privateHtml(privateEntry, capabilities)}
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
