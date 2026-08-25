import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const raw = readFileSync('css/print.css', 'utf8');
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '').trim();

/** Index of the brace matching the `{` at `open`. */
function matchBrace(source, open) {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) return i;
  }
  return -1;
}

/** The declarations inside `@media print { ... }`. */
function printBlock() {
  const start = css.search(/@media\s+print\s*\{/);
  assert.notEqual(start, -1, 'no @media print block found');
  const open = css.indexOf('{', start);
  const close = matchBrace(css, open);
  assert.notEqual(close, -1, 'unbalanced braces in @media print');
  return { body: css.slice(open + 1, close), before: css.slice(0, start), after: css.slice(close + 1) };
}

/** [{selectors: string[], decls: string}] for every rule in the print block. */
function rules() {
  const { body } = printBlock();
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(body)) !== null) {
    out.push({
      selectors: m[1].split(',').map((s) => s.trim()).filter(Boolean),
      decls: m[2],
    });
  }
  return out;
}

/** Every selector this stylesheet hides outright. */
function hiddenSelectors() {
  const set = new Set();
  for (const rule of rules()) {
    if (/display\s*:\s*none/.test(rule.decls)) rule.selectors.forEach((s) => set.add(s));
  }
  return set;
}

test('nothing sits outside the print block — this file must never affect the screen', () => {
  // Brace-matched rather than regex-stripped: a greedy /@media print{[\s\S]*}/
  // would swallow anything appended AFTER the block, so a stray
  // `body { display: none }` at the end of the file would pass unnoticed.
  const { before, after } = printBlock();
  assert.equal(before.trim(), '', 'found rules before @media print');
  assert.equal(after.trim(), '', 'found rules after @media print');
});

test('hides the chrome that has no meaning on paper', () => {
  const hidden = hiddenSelectors();
  for (const selector of ['.app-header', '.filterbar', '.app-footer', '.skip-link']) {
    assert.ok(hidden.has(selector), `${selector} is not actually hidden in print`);
  }
});

test('forces ink-on-white so a dark theme does not print a black page', () => {
  const body = rules().find((r) => r.selectors.includes('body'));
  assert.ok(body, 'no rule targets body');
  assert.match(body.decls, /background:\s*#fff/i);
  assert.match(body.decls, /color:\s*#000/i);
});

test('the safety disclaimer is never hidden', () => {
  // Checked against the parsed selector lists, so adding .detail-footer to an
  // existing comma-separated hide rule cannot slip past.
  assert.equal(hiddenSelectors().has('.detail-footer'), false, 'the disclaimer must print');
});

test('danger and caution badges stay visually distinct once color is gone', () => {
  // They share identical wording ("Contains X") for certain-level flags, so if
  // print flattens both to the same treatment a milk allergy and a mild
  // sensitivity become indistinguishable on paper.
  const danger = rules().find((r) => r.selectors.includes('.badge-danger'));
  const caution = rules().find((r) => r.selectors.includes('.badge-caution'));
  assert.ok(danger && caution, 'print stylesheet must style both badge weights');
  const bg = (r) => (r.decls.match(/background:\s*([^;!]+)/) || [])[1]?.trim();
  assert.notEqual(bg(danger), bg(caution), 'danger and caution print identically');
});

test('a blanket .badge rule never overrides the per-weight treatments', () => {
  const blanket = rules().find((r) => r.selectors.includes('.badge'));
  if (!blanket) return;
  assert.doesNotMatch(blanket.decls, /background:[^;]*!important/, 'a !important .badge background erases badge weight');
  assert.doesNotMatch(blanket.decls, /(^|;)\s*color:[^;]*!important/, 'a !important .badge color erases badge weight');
});

test('closed badge disclosures are forced open for print via ::details-content', () => {
  // `display: block` alone cannot reveal a closed <details>; Chrome hides its
  // content with content-visibility on the ::details-content pseudo-element.
  const rule = rules().find((r) => r.selectors.some((s) => s.includes('::details-content')));
  assert.ok(rule, 'no ::details-content rule — allergen causes would not print');
  assert.match(rule.decls, /content-visibility:\s*visible/);
});

test('index.html links the print stylesheet with media="print"', () => {
  const html = readFileSync('index.html', 'utf8');
  assert.match(html, /<link rel="stylesheet" href="css\/print\.css" media="print">/);
});
