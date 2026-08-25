import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderRecipe, renderNotFound } from '../js/views/recipe.js';

const avoidances = [{ id: 'milk', label: 'Milk / Dairy', severity: 'allergy' }];

const recipe = {
  id: 'parmesan-crusted-butter-beans',
  title: 'Parmesan-Crusted Butter Beans',
  sourceType: 'book',
  sourceName: null,
  sourceUrl: 'Justine Snacks (cookbook)',
  sourceNote: null,
  prepMinutes: 10,
  cookMinutes: 43,
  totalMinutes: 63,
  servingsCount: 6,
  servings: 'Serves 6',
  ingredients: ['1 (15-oz) can butter beans, drained', '6 oz Parmesan, freshly grated'],
  steps: ['Preheat oven to 400°F.', 'Bake 40–45 min until golden.'],
  flags: [{ allergenId: 'milk', term: 'parmesan', level: 'certain' }],
};

test('renders the title, times, and servings', () => {
  const out = renderRecipe(recipe, avoidances).toString();
  assert.match(out, /Parmesan-Crusted Butter Beans/);
  assert.match(out, /10.*min prep/s);
  assert.match(out, /43.*min cook/s);
  assert.match(out, /63.*min total/s);
  assert.match(out, /Serves 6/);
});

test('renders a danger badge above the title for a certain allergy', () => {
  const out = renderRecipe(recipe, avoidances).toString();
  const badgeIndex = out.indexOf('badge-danger');
  const titleIndex = out.indexOf('detail-title');
  assert.ok(badgeIndex > -1 && badgeIndex < titleIndex, 'badge must render before the title');
  assert.match(out, /Contains milk/);
});

test('a badge with a cause renders as an expandable details/summary, not a bare span', () => {
  const withCause = {
    ...recipe,
    flags: [{ allergenId: 'milk', term: 'parmesan', level: 'certain', line: '6 oz Parmesan, freshly grated', lineIndex: 1 }],
  };
  const out = renderRecipe(withCause, avoidances).toString();
  assert.match(out, /<details class="badge-detail">/);
  assert.match(out, /<summary class="badge badge-danger">Contains milk \/ dairy<\/summary>/);
});

test('expanding a badge shows the offending ingredient line', () => {
  const withCause = {
    ...recipe,
    flags: [{ allergenId: 'milk', term: 'parmesan', level: 'certain', line: '6 oz Parmesan, freshly grated', lineIndex: 1 }],
  };
  const out = renderRecipe(withCause, avoidances).toString();
  assert.match(out, /6 oz Parmesan, freshly grated/);
});

test('a badge with substitutions text shows a "Try instead" line', () => {
  const avoidancesWithSubs = [{ ...avoidances[0], substitutions: 'oat milk; coconut cream' }];
  const withCause = {
    ...recipe,
    flags: [{ allergenId: 'milk', term: 'parmesan', level: 'certain', line: '6 oz Parmesan, freshly grated', lineIndex: 1 }],
  };
  const out = renderRecipe(withCause, avoidancesWithSubs).toString();
  assert.match(out, /Try instead: oat milk; coconut cream/);
});

test('a badge with no substitutions text omits the "Try instead" line entirely', () => {
  const withCause = {
    ...recipe,
    flags: [{ allergenId: 'milk', term: 'parmesan', level: 'certain', line: '6 oz Parmesan, freshly grated', lineIndex: 1 }],
  };
  const out = renderRecipe(withCause, avoidances).toString(); // shared `avoidances` fixture has no substitutions
  assert.doesNotMatch(out, /Try instead/);
});

test('badge cause lines are escaped, same as every other interpolated value', () => {
  const malicious = {
    ...recipe,
    flags: [{ allergenId: 'milk', term: 'milk', level: 'certain', line: '<img src=x onerror=alert(1)> milk', lineIndex: 0 }],
  };
  const out = renderRecipe(malicious, avoidances).toString();
  assert.doesNotMatch(out, /<img/);
  assert.match(out, /&lt;img/);
});

test('renders source attribution quietly, without a source_url the text is plain (not linked)', () => {
  const out = renderRecipe(recipe, avoidances).toString();
  assert.match(out, /Justine Snacks \(cookbook\)/);
  assert.doesNotMatch(out, /<a[^>]*Justine Snacks/);
});

test('links source_url when it looks like a real http(s) url', () => {
  const withUrl = { ...recipe, sourceUrl: 'https://example.com/recipe' };
  const out = renderRecipe(withUrl, avoidances).toString();
  assert.match(out, /<a href="https:\/\/example\.com\/recipe"/);
});

test('never renders a javascript: url as a live link', () => {
  const malicious = { ...recipe, sourceUrl: 'javascript:alert(1)' };
  const out = renderRecipe(malicious, avoidances).toString();
  assert.doesNotMatch(out, /<a href="javascript:/);
});

test('exposes an h1 heading so route-change focus management can find it', () => {
  const out = renderRecipe(recipe, avoidances).toString();
  assert.match(out, /<h1[^>]*tabindex="-1"[^>]*>Parmesan-Crusted Butter Beans<\/h1>/);
});

test('renders every ingredient and step line', () => {
  const out = renderRecipe(recipe, avoidances).toString();
  for (const line of recipe.ingredients) assert.match(out, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  for (const line of recipe.steps) assert.match(out, new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace('°', '.')));
});

test('renders the persistent disclaimer footer', () => {
  const out = renderRecipe(recipe, avoidances).toString();
  assert.match(out, /Ingredient checks are automatic and can miss things\. Always read labels\./);
});

test('renderNotFound names the missing id and does not throw', () => {
  const out = renderNotFound('made-up-id').toString();
  assert.match(out, /made-up-id/);
});

test('renderNotFound exposes an h1 heading so route-change focus management can find it', () => {
  const out = renderNotFound('made-up-id').toString();
  assert.match(out, /<h1[^>]*tabindex="-1"[^>]*>Recipe not found<\/h1>/);
});

test('renders a photo when the recipe has a local one', () => {
  const withPhoto = { ...recipe, image: 'assets/photos/salmon-risotto.jpg', imageAlt: null };
  const out = renderRecipe(withPhoto, avoidances).toString();
  assert.match(out, /<img class="detail-photo" src="assets\/photos\/salmon-risotto\.jpg"/);
  assert.match(out, /alt=""/, 'a photo with no alt text is decorative');
  assert.match(out, /decoding="async"/);
  assert.doesNotMatch(out, /loading="lazy"/, 'the hero photo must not be lazy — it is the largest paint');
});

test('announces populated alt text instead of leaving the photo decorative', () => {
  const withAlt = { ...recipe, image: 'assets/photos/x.jpg', imageAlt: 'Risotto in a wide bowl' };
  const out = renderRecipe(withAlt, avoidances).toString();
  assert.match(out, /alt="Risotto in a wide bowl"/);
});

test('renders no photo element at all when there is none — silence, not a placeholder', () => {
  const out = renderRecipe(recipe, avoidances).toString();
  assert.doesNotMatch(out, /detail-photo/);
  assert.doesNotMatch(out, /no photo/i);
});

test('never renders an external image URL sitting in the image column', () => {
  const misplaced = { ...recipe, image: 'https://www.instagram.com/modhippiehabits/' };
  const out = renderRecipe(misplaced, avoidances).toString();
  assert.doesNotMatch(out, /detail-photo/);
  assert.doesNotMatch(out, /instagram/i);
});

// --- M6: private layer ------------------------------------------------------

const PRIVATE_ON = { private: true, write: true };
const entry = {
  lastCooked: '2026-08-20',
  timesCooked: 3,
  rating: 4,
  notes: '2026-08-01 - Doubled the garlic.\n2026-08-20 - Better with butter beans.',
};

// This block is the public-view privacy test. If any of it starts failing,
// the read-only public site has begun leaking the household's private layer.
test('unpaired renders NO note section, rating, or cooked affordance', () => {
  const out = renderRecipe(recipe, avoidances).toString();
  assert.doesNotMatch(out, /private-section/);
  assert.doesNotMatch(out, /note-form/);
  assert.doesNotMatch(out, /rating-row/);
  assert.doesNotMatch(out, /Made it/i);
});

test('unpaired renders nothing private even if a private entry is somehow passed in', () => {
  const out = renderRecipe(recipe, avoidances, entry, { private: false, write: false }).toString();
  assert.doesNotMatch(out, /Doubled the garlic/);
  assert.doesNotMatch(out, /private-section/);
});

test('unpaired shows no "not paired" prompt on the recipe -- absent, not broken', () => {
  const out = renderRecipe(recipe, avoidances).toString();
  assert.doesNotMatch(out, /pair/i);
});

test('paired renders the note section', () => {
  const out = renderRecipe(recipe, avoidances, entry, PRIVATE_ON).toString();
  assert.match(out, /private-section/);
  assert.match(out, /note-form/);
});

test('each dated note renders as its own line', () => {
  const out = renderRecipe(recipe, avoidances, entry, PRIVATE_ON).toString();
  assert.match(out, /Doubled the garlic/);
  assert.match(out, /Better with butter beans/);
  assert.equal((out.match(/<li>2026-08-/g) || []).length, 2);
});

test('the rating renders five real buttons with the current one pressed', () => {
  const out = renderRecipe(recipe, avoidances, entry, PRIVATE_ON).toString();
  assert.equal((out.match(/data-rating="/g) || []).length, 5);
  assert.match(out, /data-rating="4"[^>]*aria-pressed="true"/);
  assert.match(out, /data-rating="5"[^>]*aria-pressed="false"/);
});

test('cooked history renders when present', () => {
  const out = renderRecipe(recipe, avoidances, entry, PRIVATE_ON).toString();
  // Tolerant of the <b> emphasis the times row already uses -- this asserts
  // the history is shown, not how the count is marked up.
  assert.match(out, /Cooked\s*<b>3<\/b>\s*times/);
  assert.match(out, /2026-08-20/);
});

test('a never-cooked recipe says so rather than showing a zero', () => {
  const out = renderRecipe(recipe, avoidances, null, PRIVATE_ON).toString();
  assert.match(out, /private-section/);
  assert.doesNotMatch(out, /0 times/);
});

test('note text containing markup is escaped', () => {
  const malicious = { ...entry, notes: '2026-08-01 - <img src=x onerror=alert(1)>' };
  const out = renderRecipe(recipe, avoidances, malicious, PRIVATE_ON).toString();
  assert.doesNotMatch(out, /<img/);
  assert.match(out, /&lt;img/);
});

test('renderRecipe still works with the pre-M6 two-argument signature', () => {
  const out = renderRecipe(recipe, avoidances).toString();
  assert.match(out, /Parmesan-Crusted Butter Beans/);
});
