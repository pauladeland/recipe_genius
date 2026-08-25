#!/usr/bin/env node
// Generates the PWA icon set with no image library — raw RGBA pixels, a
// hand-rolled PNG encoder over node:zlib, and geometry only (no font
// rendering). Run by hand when the mark changes; output is committed.
//
//   node scripts/make-icons.mjs
//
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const INK = [0x17, 0x18, 0x1a];   // --ink, Direction B
const CREAM = [0xfa, 0xfa, 0xf7]; // --bg, Direction B

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  // A PNG chunk is [length of DATA][type][data][crc over type+data].
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

/** @param {Buffer} rgba - width*height*4 bytes, RGBA order */
export function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // Each scanline is prefixed with a filter-type byte; 0 = None.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * The mark: a fork over a plate. `maskable` makes the ground full-bleed ink
 * and keeps the cream fork inside the central 80% safe zone, so an OS crop
 * to a circle, squircle, or rounded square neither letterboxes nor clips.
 */
export function drawIcon(size, { maskable }) {
  const rgba = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;

  // The mark occupies a smaller share of a maskable canvas so the OS crop
  // can never reach it.
  const discR = maskable ? size * 0.34 : size * 0.38;

  const unit = discR * 2;
  const tineW = unit * 0.075;
  const tineGap = unit * 0.115;
  const tineTop = cy - unit * 0.36;
  const tineBottom = cy - unit * 0.04;
  const neckBottom = cy + unit * 0.04;
  // The neck spans exactly the outer edges of the outer tines. Anything wider
  // reads as a crossbar and the whole mark turns into a letter T.
  const neckW = tineGap * 2 + tineW;
  const handleW = unit * 0.085;
  const handleBottom = cy + unit * 0.36;

  const inDisc = (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= discR ** 2;
  const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x < x1 && y >= y0 && y < y1;

  const inFork = (x, y) => {
    for (let t = -1; t <= 1; t++) {
      const tx = cx + t * tineGap - tineW / 2;
      if (inRect(x, y, tx, tineTop, tx + tineW, tineBottom)) return true;
    }
    if (inRect(x, y, cx - neckW / 2, tineBottom, cx + neckW / 2, neckBottom)) return true;
    if (inRect(x, y, cx - handleW / 2, neckBottom, cx + handleW / 2, handleBottom)) return true;
    return false;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Sample at pixel centers so the disc edge lands predictably.
      const px = x + 0.5;
      const py = y + 0.5;
      let color;
      if (inFork(px, py)) {
        color = CREAM;
      } else if (maskable) {
        color = INK;
      } else {
        color = inDisc(px, py) ? INK : CREAM;
      }
      const i = (y * size + x) * 4;
      rgba[i] = color[0];
      rgba[i + 1] = color[1];
      rgba[i + 2] = color[2];
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

function main() {
  mkdirSync('assets/icons', { recursive: true });
  const targets = [
    ['assets/icons/icon-192.png', 192, false],
    ['assets/icons/icon-512.png', 512, false],
    ['assets/icons/icon-512-maskable.png', 512, true],
  ];
  for (const [path, size, maskable] of targets) {
    writeFileSync(path, encodePng(size, size, drawIcon(size, { maskable })));
    console.log(`Wrote ${path} (${size}x${size}${maskable ? ', maskable' : ''})`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('make-icons.mjs')) main();
