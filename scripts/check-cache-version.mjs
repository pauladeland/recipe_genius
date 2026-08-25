#!/usr/bin/env node
// Fails CI when js/ or css/ changed without sw.js's CACHE_VERSION changing.
// A stale precache serves old JS against a new library.json — invisible
// locally (where the SW is usually bypassed) and broken on every installed
// phone, indefinitely.
import { execSync } from 'node:child_process';

const base = process.env.DIFF_BASE || 'origin/main';

// stdio 'pipe' on stderr keeps git's own "fatal: path ... does not exist"
// chatter out of the CI log, where it reads like a real failure. Both callers
// treat a throw as an expected, meaningful outcome.
const quiet = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };

function changedFiles() {
  try {
    return execSync(`git diff --name-only ${base}...HEAD`, quiet)
      .split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    console.log(`Could not diff against ${base} — skipping the CACHE_VERSION check.`);
    return null;
  }
}

function versionAt(ref) {
  try {
    const source = execSync(`git show ${ref}:sw.js`, quiet);
    return (source.match(/const CACHE_VERSION = '([^']+)'/) || [])[1] ?? null;
  } catch {
    return null; // sw.js did not exist at that ref
  }
}

const files = changedFiles();
if (files === null) process.exit(0);

const shellFiles = files.filter((f) => f.startsWith('js/') || f.startsWith('css/'));
if (shellFiles.length === 0) {
  console.log('No js/ or css/ changes — CACHE_VERSION check not required.');
  process.exit(0);
}

const before = versionAt(base);
const after = versionAt('HEAD');

if (before === null) {
  console.log('sw.js is new on this branch — nothing to compare.');
  process.exit(0);
}

if (before === after) {
  console.error(
    `CACHE_VERSION is still '${after}' but these app-shell files changed:\n` +
    shellFiles.map((f) => `  - ${f}`).join('\n') +
    `\n\nBump CACHE_VERSION in sw.js, or installed devices will keep serving the old bundle.`
  );
  process.exit(1);
}

console.log(`CACHE_VERSION moved ${before} -> ${after}. OK.`);
