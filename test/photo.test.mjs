import { test } from 'node:test';
import assert from 'node:assert/strict';
import { photoSrc, photoAlt } from '../js/ui/photo.js';

test('a local assets/photos path is returned as-is', () => {
  assert.equal(photoSrc({ image: 'assets/photos/salmon-risotto.jpg' }), 'assets/photos/salmon-risotto.jpg');
});

test('a recipe with no image returns null', () => {
  assert.equal(photoSrc({ image: null }), null);
  assert.equal(photoSrc({}), null);
});

test('an external http(s) URL is refused — the image column holds source URLs on some rows', () => {
  assert.equal(photoSrc({ image: 'https://www.instagram.com/modhippiehabits/' }), null);
  assert.equal(photoSrc({ image: 'http://example.com/photo.jpg' }), null);
});

test('free text in the image column is refused rather than rendered as a broken src', () => {
  assert.equal(photoSrc({ image: 'A Cozy Van Life Morning (YouTube video)' }), null);
});

test('a protocol-relative URL is refused', () => {
  assert.equal(photoSrc({ image: '//evil.example.com/x.jpg' }), null);
});

test('a path traversal attempt is refused', () => {
  assert.equal(photoSrc({ image: 'assets/photos/../../../etc/passwd' }), null);
});

test('a javascript: or data: value is refused', () => {
  assert.equal(photoSrc({ image: 'javascript:alert(1)' }), null);
  assert.equal(photoSrc({ image: 'data:image/svg+xml,<svg onload=alert(1)>' }), null);
});

test('only real image extensions are accepted', () => {
  assert.equal(photoSrc({ image: 'assets/photos/notes.txt' }), null);
  assert.equal(photoSrc({ image: 'assets/photos/x.jpg' }), 'assets/photos/x.jpg');
  assert.equal(photoSrc({ image: 'assets/photos/x.jpeg' }), 'assets/photos/x.jpeg');
  assert.equal(photoSrc({ image: 'assets/photos/x.png' }), 'assets/photos/x.png');
  assert.equal(photoSrc({ image: 'assets/photos/x.webp' }), 'assets/photos/x.webp');
});

test('surrounding whitespace from a Sheet cell is tolerated', () => {
  assert.equal(photoSrc({ image: '  assets/photos/x.jpg  ' }), 'assets/photos/x.jpg');
});

test('photoAlt passes through populated alt text', () => {
  assert.equal(photoAlt({ imageAlt: 'A bowl of risotto' }), 'A bowl of risotto');
});

test('photoAlt is an empty string when no alt is set — decorative, not invented from the title', () => {
  assert.equal(photoAlt({ imageAlt: null, title: 'Salmon Risotto' }), '');
  assert.equal(photoAlt({ title: 'Salmon Risotto' }), '');
});
