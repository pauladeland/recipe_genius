import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodePng, drawIcon } from '../scripts/make-icons.mjs';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function pixelAt(rgba, size, x, y) {
  const i = (y * size + x) * 4;
  return [rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]];
}

test('encodePng emits a valid PNG signature and IHDR dimensions', () => {
  const size = 8;
  const rgba = Buffer.alloc(size * size * 4, 0xff);
  const png = encodePng(size, size, rgba);
  assert.deepEqual(png.subarray(0, 8), PNG_SIGNATURE);
  assert.equal(png.readUInt32BE(16), size);
  assert.equal(png.readUInt32BE(20), size);
});

test('encodePng output ends with an IEND chunk', () => {
  const png = encodePng(4, 4, Buffer.alloc(64, 0));
  assert.equal(png.subarray(png.length - 8, png.length - 4).toString('ascii'), 'IEND');
});

test('drawIcon produces a fully opaque canvas of the requested size', () => {
  const size = 64;
  const rgba = drawIcon(size, { maskable: false });
  assert.equal(rgba.length, size * size * 4);
  for (let i = 3; i < rgba.length; i += 4) assert.equal(rgba[i], 255, 'every pixel must be opaque');
});

test('drawIcon is not a blank canvas — it contains both ink and cream', () => {
  const size = 64;
  const rgba = drawIcon(size, { maskable: false });
  const seen = new Set();
  for (let i = 0; i < rgba.length; i += 4) seen.add(`${rgba[i]},${rgba[i + 1]},${rgba[i + 2]}`);
  assert.ok(seen.size >= 2, `expected at least two distinct colors, got ${seen.size}`);
});

test('the maskable icon is full-bleed — every corner pixel is ink, never cream', () => {
  const size = 64;
  const rgba = drawIcon(size, { maskable: true });
  const corners = [[0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1]];
  for (const [x, y] of corners) {
    assert.deepEqual(pixelAt(rgba, size, x, y), [0x17, 0x18, 0x1a, 255], `corner ${x},${y} must be ink`);
  }
});

test('the maskable mark stays inside the central 80% safe zone', () => {
  const size = 100;
  const rgba = drawIcon(size, { maskable: true });
  const pad = size * 0.1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const outside = x < pad || y < pad || x >= size - pad || y >= size - pad;
      if (!outside) continue;
      const [r] = pixelAt(rgba, size, x, y);
      assert.notEqual(r, 0xfa, `mark pixel at ${x},${y} escapes the maskable safe zone`);
    }
  }
});

test('the non-maskable icon has cream at its corners — a disc on a light ground', () => {
  const size = 64;
  const rgba = drawIcon(size, { maskable: false });
  assert.deepEqual(pixelAt(rgba, size, 0, 0), [0xfa, 0xfa, 0xf7, 255]);
});
