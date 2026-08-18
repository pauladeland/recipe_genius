import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTheme } from '../js/ui/theme.js';

function fakeRoot() {
  const attrs = {};
  return {
    attrs,
    setAttribute(name, value) { attrs[name] = value; },
    removeAttribute(name) { delete attrs[name]; },
  };
}

test('applyTheme("light") sets data-theme to light', () => {
  const root = fakeRoot();
  applyTheme('light', root);
  assert.equal(root.attrs['data-theme'], 'light');
});

test('applyTheme("dark") sets data-theme to dark', () => {
  const root = fakeRoot();
  applyTheme('dark', root);
  assert.equal(root.attrs['data-theme'], 'dark');
});

test('applyTheme("system") removes data-theme so the media query decides', () => {
  const root = fakeRoot();
  root.setAttribute('data-theme', 'dark');
  applyTheme('system', root);
  assert.equal('data-theme' in root.attrs, false);
});
