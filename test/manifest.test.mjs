import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('manifest.webmanifest', 'utf8'));

test('declares a name and a short_name', () => {
  assert.ok(manifest.name && manifest.name.length > 0);
  assert.ok(manifest.short_name && manifest.short_name.length > 0);
});

test('short_name is short enough for a launcher label', () => {
  assert.ok(manifest.short_name.length <= 12, `"${manifest.short_name}" is ${manifest.short_name.length} chars`);
});

test('start_url and scope are RELATIVE — the app is served from a project subpath, not a domain root', () => {
  assert.doesNotMatch(manifest.start_url, /^\//, 'an absolute start_url breaks install on a GitHub project page');
  assert.doesNotMatch(manifest.scope, /^\//, 'an absolute scope breaks SW control on a GitHub project page');
});

test('display is a mode Chrome accepts as installable', () => {
  assert.ok(['fullscreen', 'standalone', 'minimal-ui'].includes(manifest.display));
});

test('prefer_related_applications is never true', () => {
  assert.notEqual(manifest.prefer_related_applications, true);
});

test('ships both required icon sizes with a relative src', () => {
  const sizes = manifest.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192'), 'Chrome requires a 192x192 icon');
  assert.ok(sizes.includes('512x512'), 'Chrome requires a 512x512 icon');
  for (const icon of manifest.icons) {
    assert.doesNotMatch(icon.src, /^\//, `icon src "${icon.src}" must be relative`);
  }
});

test('ships a maskable icon so Android adaptive shapes do not letterbox', () => {
  assert.ok(manifest.icons.some((i) => (i.purpose || '').split(/\s+/).includes('maskable')));
});

test('every icon file the manifest names actually exists', () => {
  for (const icon of manifest.icons) {
    assert.doesNotThrow(() => readFileSync(icon.src), `missing icon file: ${icon.src}`);
  }
});

test('declares background_color and theme_color for the splash screen', () => {
  assert.match(manifest.background_color, /^#[0-9a-fA-F]{6}$/);
  assert.match(manifest.theme_color, /^#[0-9a-fA-F]{6}$/);
});

test('index.html links the manifest and an apple-touch-icon', () => {
  const html = readFileSync('index.html', 'utf8');
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /rel="apple-touch-icon"/);
});

test('index.html pairs theme-color to the light and dark schemes', () => {
  const html = readFileSync('index.html', 'utf8');
  const themeColors = html.match(/<meta name="theme-color"[^>]*>/g) || [];
  assert.equal(themeColors.length, 2, 'expected one theme-color per color-scheme');
  assert.ok(themeColors.some((t) => t.includes('prefers-color-scheme: dark')));
  assert.ok(themeColors.some((t) => t.includes('prefers-color-scheme: light')));
});
