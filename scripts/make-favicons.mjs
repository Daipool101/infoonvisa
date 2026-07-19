// Generates Google-friendly favicons from public/logo-icon.png:
//   favicon-96.png (48*2 — Google's recommended multiple of 48), favicon-48.png,
//   and favicon.ico (48px PNG wrapped in an ICO container — Google's default fallback).
// Rerun after a logo change: node scripts/make-favicons.mjs
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = fileURLToPath(new URL('../public/logo-icon.png', import.meta.url));
const out = (name) => fileURLToPath(new URL(`../public/${name}`, import.meta.url));

for (const size of [96, 48, 32]) {
  const buf = await sharp(src).resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
  writeFileSync(out(`favicon-${size}.png`), buf);
}

// Build favicon.ico wrapping a 48x48 PNG (ICO supports PNG-encoded entries).
const png48 = await sharp(src).resize(48, 48, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);      // reserved
header.writeUInt16LE(1, 2);      // type: icon
header.writeUInt16LE(1, 4);      // count: 1 image
const entry = Buffer.alloc(16);
entry.writeUInt8(48, 0);         // width
entry.writeUInt8(48, 1);         // height
entry.writeUInt8(0, 2);          // color palette
entry.writeUInt8(0, 3);          // reserved
entry.writeUInt16LE(1, 4);       // color planes
entry.writeUInt16LE(32, 6);      // bits per pixel
entry.writeUInt32LE(png48.length, 8); // size of image data
entry.writeUInt32LE(22, 12);     // offset (6 + 16)
writeFileSync(out('favicon.ico'), Buffer.concat([header, entry, png48]));

console.log('favicons written: favicon-96.png, favicon-48.png, favicon-32.png, favicon.ico');
