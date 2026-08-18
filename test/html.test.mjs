import { test } from 'node:test';
import assert from 'node:assert/strict';
import { html } from '../js/ui/html.js';

test('escapes a plain interpolated value', () => {
  const result = html`<p>${'<script>alert(1)</script>'}</p>`;
  assert.equal(result.toString(), '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
});

test('does not double-escape a nested html() result', () => {
  const inner = html`<b>bold</b>`;
  const outer = html`<div>${inner}</div>`;
  assert.equal(outer.toString(), '<div><b>bold</b></div>');
});

test('joins an array of nested html() results without escaping', () => {
  const items = [html`<li>a</li>`, html`<li>b</li>`];
  const result = html`<ul>${items}</ul>`;
  assert.equal(result.toString(), '<ul><li>a</li><li>b</li></ul>');
});

test('null and undefined interpolate as empty string', () => {
  const result = html`<span>${null}${undefined}</span>`;
  assert.equal(result.toString(), '<span></span>');
});

test('numbers interpolate as their string form, unescaped-safe', () => {
  const result = html`<span>${42}</span>`;
  assert.equal(result.toString(), '<span>42</span>');
});

test('escapes ampersands and quotes in attribute-like text', () => {
  const result = html`<a title="${'Tom & Jerry "friends"'}">x</a>`;
  assert.equal(result.toString(), '<a title="Tom &amp; Jerry &quot;friends&quot;">x</a>');
});
