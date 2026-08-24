import { applyFilters } from '../views/list.js';

export function pickSurprise(recipes, filterState, randomFn = Math.random) {
  const matches = applyFilters(recipes, filterState);
  if (matches.length === 0) return null;
  const index = Math.min(Math.floor(randomFn() * matches.length), matches.length - 1);
  return matches[index].id;
}
