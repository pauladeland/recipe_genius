// Photo path resolution, fails closed.
//
// The Sheet's `image` column is not trustworthy: on 6 of 31 recipes it holds
// a source URL (Instagram, Bon Appétit) rather than a local asset path,
// because the source columns were entered one position off. Rendering those
// as <img src> would hotlink a third party from a public repo and leak a
// referrer. Anything that is not a local file under assets/photos/ with an
// image extension resolves to no photo at all — and a recipe with no photo
// renders nothing, which is the designed state for most recipes anyway.

const ALLOWED_PREFIX = 'assets/photos/';
const ALLOWED_EXTENSIONS = /\.(jpe?g|png|webp)$/i;

export function photoSrc(recipe) {
  const value = recipe?.image;
  // A Sheet cell can arrive as a number or a boolean; .trim() would throw.
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;
  if (!raw.startsWith(ALLOWED_PREFIX)) return null;
  if (raw.includes('..')) return null;
  // Percent-encoding is never needed for these filenames (they are slugs), and
  // allowing it would smuggle traversal past the check above: the URL parser
  // resolves %2e%2e as a double-dot segment.
  if (raw.includes('%')) return null;
  if (!ALLOWED_EXTENSIONS.test(raw)) return null;
  return raw;
}

// Blank alt is correct for a decorative food photo — it keeps a screen reader
// from announcing a filename, or a title it already read. Populated alt is
// announced. Never synthesized from the title.
export function photoAlt(recipe) {
  return recipe?.imageAlt || '';
}
