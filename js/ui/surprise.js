import { applyFilters } from '../views/list.js';

export function pickSurprise(recipes, filterState, randomFn = Math.random) {
  const matches = applyFilters(recipes, filterState);
  if (matches.length === 0) return null;
  const index = Math.floor(randomFn() * matches.length);
  return matches[index].id;
}
