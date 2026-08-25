#!/usr/bin/env node
// Fails the build if a private-layer secret is committed.
//
// The Apps Script deployment URL is a secret: it is a public write endpoint
// acting with the owner's full Google identity, and this repo is public. A URL
// committed here is a URL published permanently -- deleting the file later
// does not remove it from git history, or from any clone already taken.
//
// This exists because "just don't commit it" is not a control. It is a hope.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Patterns that must never appear in a tracked file.
const FORBIDDEN = [
  {
    // A deployed Apps Script Web App URL.
    pattern: /script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{10,}/,
    what: 'an Apps Script deployment URL',
  },
  {
    // A token accidentally pasted into the .gs instead of Script Properties.
    pattern: /DEVICE_TOKEN\s*[=:]\s*['"][^'"]{8,}['"]/,
    what: 'a hardcoded DEVICE_TOKEN',
  },
];

// Files that legitimately describe the URL *shape* without containing a real
// one. Kept explicit and tiny so it cannot quietly become a blanket exemption.
const ALLOWLIST = new Set([
  'scripts/check-no-secrets.mjs',
  'test/check-no-secrets.test.mjs',
  'apps-script/README.md',
  'js/ui/pairing.js',
  'js/views/settings.js',
  'js/app.js',
  'test/pairing.test.mjs',
  'test/apps-script-source.test.mjs',
  'test/settings-view.test.mjs',
  'docs/superpowers/plans/2026-08-25-m6-write-path-pairing.md',
]);

export function scanContent(content) {
  return FORBIDDEN.filter(({ pattern }) => pattern.test(content)).map((f) => f.what);
}

function trackedFiles() {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean);
}

function main() {
  const offences = [];

  for (const file of trackedFiles()) {
    if (ALLOWLIST.has(file)) continue;
    let content;
    try {
      content = readFileSync(file, 'utf8');
    } catch {
      continue; // binary or unreadable — nothing to scan
    }
    for (const what of scanContent(content)) {
      offences.push(`${file}: contains ${what}`);
    }
  }

  if (offences.length) {
    console.error('Secret leak check FAILED:\n' + offences.map((o) => '  ' + o).join('\n'));
    console.error('\nThe endpoint and token belong in the pairing step on each device,');
    console.error('never in the repo. If this was already pushed, rotate the token in');
    console.error('Script Properties and create a new deployment.');
    process.exit(1);
  }

  console.log(`Secret leak check passed (${trackedFiles().length} tracked files).`);
}

// Only run when invoked directly, so the test can import scanContent.
if (process.argv[1] && process.argv[1].endsWith('check-no-secrets.mjs')) {
  main();
}
