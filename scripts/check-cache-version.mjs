#!/usr/bin/env node
// Fails CI when an app-shell file changed without sw.js's CACHE_VERSION
// moving forward. A stale precache serves old JS against a new library.json —
// invisible locally (where the SW is usually bypassed) and broken on every
// installed phone, indefinitely.
//
// The pure decision logic is exported and unit-tested in
// test/check-cache-version.test.mjs; main() below is the thin git-I/O shell.
import { execSync } from 'node:child_process';

// Everything the service worker precaches from the repo. js/ and css/ are the
// obvious ones, but index.html and the manifest are precached too — a change
// to either also has to invalidate the shell or installed devices keep the old
// copy until some unrelated js/ edit happens to force a bump.
const SHELL_PATHS = [/^js\//, /^css\//, /^index\.html$/, /^manifest\.webmanifest$/];

export function shellFilesIn(files) {
  return files.filter((f) => SHELL_PATHS.some((re) => re.test(f)));
}

export function parseVersion(value) {
  const m = /^v(\d+)$/.exec(value || '');
  return m ? Number(m[1]) : null;
}

/**
 * @returns {{ok: boolean, message: string}}
 */
export function checkVersionBump(before, after, shellFiles) {
  if (shellFiles.length === 0) {
    return { ok: true, message: 'No app-shell changes — CACHE_VERSION check not required.' };
  }
  if (before === null) {
    return { ok: true, message: 'sw.js is new on this branch — nothing to compare.' };
  }
  // A version we cannot parse is a hard failure, never a pass. Previously a
  // double-quoted literal made the regex miss, `after` came back null, and the
  // script cheerfully reported "moved v1 -> null. OK."
  if (after === null) {
    return {
      ok: false,
      message: 'Could not read CACHE_VERSION from sw.js at HEAD. Expected exactly: const CACHE_VERSION = \'v<number>\'',
    };
  }
  const beforeNum = parseVersion(before);
  const afterNum = parseVersion(after);
  if (beforeNum === null || afterNum === null) {
    return { ok: false, message: `CACHE_VERSION must look like 'v<number>'; got '${before}' -> '${after}'.` };
  }
  // Inequality is not enough: moving backwards to v0 reuses a cache name that
  // may still exist on a device, which is the bug this guard exists to prevent.
  if (afterNum <= beforeNum) {
    return {
      ok: false,
      message:
        `CACHE_VERSION went ${before} -> ${after}, which does not move forward.\n` +
        `Reusing an earlier cache name leaves installed devices on the stale copy.`,
    };
  }
  return { ok: true, message: `CACHE_VERSION moved ${before} -> ${after}. OK.` };
}

// stdio 'pipe' keeps git's own "fatal: path ... does not exist" chatter out of
// the CI log, where it reads like a real failure.
const quiet = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] };

function versionAt(ref) {
  try {
    const source = execSync(`git show ${ref}:sw.js`, quiet);
    return (source.match(/const CACHE_VERSION = '([^']+)'/) || [])[1] ?? null;
  } catch {
    return null; // sw.js did not exist at that ref
  }
}

function main() {
  const base = process.env.DIFF_BASE || 'origin/main';

  let files;
  try {
    files = execSync(`git diff --name-only ${base}...HEAD`, quiet)
      .split('\n').map((s) => s.trim()).filter(Boolean);
  } catch (err) {
    // A guard whose failure mode is "silently pass" is the one failure mode a
    // merge gate must not have.
    console.error(`Could not diff against ${base}, so the CACHE_VERSION guard could not run.`);
    console.error('In CI this usually means the checkout was shallow — actions/checkout needs fetch-depth: 0.');
    process.exit(1);
  }

  const shellFiles = shellFilesIn(files);
  const result = checkVersionBump(versionAt(base), versionAt('HEAD'), shellFiles);

  if (!result.ok) {
    console.error(result.message);
    console.error('\nApp-shell files changed on this branch:');
    console.error(shellFiles.map((f) => `  - ${f}`).join('\n'));
    process.exit(1);
  }
  console.log(result.message);
}

if (process.argv[1] && process.argv[1].endsWith('check-cache-version.mjs')) main();
