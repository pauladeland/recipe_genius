// Turns M1's precomputed flags into badge descriptors. The copy and
// weight rules below are safety copy, not style — see the design's
// "Safety copy — the wording is the mechanism" section before changing
// any string here.
//
// | severity     | level    | weight  | copy                    |
// |--------------|----------|---------|-------------------------|
// | allergy      | certain  | danger  | "Contains {label}"      |
// | allergy      | possible | caution | "Check for {label}"     |
// | sensitivity  | certain  | caution | "Contains {label}"      |
// | sensitivity  | possible | caution | "May contain {label}"   |
// | protocol     | any      | info    | "{label, lowercase}"    |

const WEIGHT_ORDER = { danger: 0, caution: 1, info: 2 };

function copyFor(severity, level, label) {
  const lower = label.toLowerCase();
  if (severity === 'allergy') {
    return level === 'certain' ? `Contains ${lower}` : `Check for ${lower}`;
  }
  if (severity === 'sensitivity') {
    return level === 'certain' ? `Contains ${lower}` : `May contain ${lower}`;
  }
  return lower; // protocol / anything else: quiet, lowercase, no verb
}

function weightFor(severity, level) {
  if (severity === 'allergy') return level === 'certain' ? 'danger' : 'caution';
  if (severity === 'sensitivity') return 'caution';
  return 'info';
}

export function computeBadges(flags, avoidances) {
  const byId = new Map(avoidances.map((a) => [a.id, a]));
  const seen = new Map(); // allergenId -> badge, keeping the highest-severity level seen

  for (const flag of flags) {
    const avoidance = byId.get(flag.allergenId);
    if (!avoidance) continue;

    const existing = seen.get(flag.allergenId);
    const isUpgrade = !existing || (existing.level === 'possible' && flag.level === 'certain');
    if (existing && !isUpgrade) continue;

    seen.set(flag.allergenId, {
      allergenId: flag.allergenId,
      level: flag.level,
      weight: weightFor(avoidance.severity, flag.level),
      text: copyFor(avoidance.severity, flag.level, avoidance.label),
    });
  }

  return [...seen.values()]
    .sort((a, b) => WEIGHT_ORDER[a.weight] - WEIGHT_ORDER[b.weight])
    .map(({ allergenId, weight, text }) => ({ allergenId, weight, text }));
}
