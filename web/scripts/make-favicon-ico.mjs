#!/usr/bin/env node
// Zero-dependency multi-size .ico packer (PNG-compressed entries, Vista+).
// Usage: node scripts/make-favicon-ico.mjs out.ico a.png=16 b.png=32 c.png=48
import { readFileSync, writeFileSync } from "node:fs";

const [outPath, ...specs] = process.argv.slice(2);
if (!outPath || specs.length === 0) {
  console.error("usage: make-favicon-ico.mjs <out.ico> <png=size> ...");
  process.exit(1);
}

const images = specs.map((spec) => {
  const [file, sizeStr] = spec.split("=");
  const size = Number(sizeStr);
  return { data: readFileSync(file), size };
});

const HEADER = 6;
const ENTRY = 16;
const dataOffset = HEADER + ENTRY * images.length;

const dir = Buffer.alloc(HEADER);
dir.writeUInt16LE(0, 0); // reserved
dir.writeUInt16LE(1, 2); // type: icon
dir.writeUInt16LE(images.length, 4);

const entries = [];
let offset = dataOffset;
for (const img of images) {
  const e = Buffer.alloc(ENTRY);
  e.writeUInt8(img.size >= 256 ? 0 : img.size, 0); // width
  e.writeUInt8(img.size >= 256 ? 0 : img.size, 1); // height
  e.writeUInt8(0, 2); // palette
  e.writeUInt8(0, 3); // reserved
  e.writeUInt16LE(1, 4); // color planes
  e.writeUInt16LE(32, 6); // bits per pixel
  e.writeUInt32LE(img.data.length, 8); // size of PNG data
  e.writeUInt32LE(offset, 12); // offset to PNG data
  entries.push(e);
  offset += img.data.length;
}

writeFileSync(
  outPath,
  Buffer.concat([dir, ...entries, ...images.map((i) => i.data)])
);
console.log(
  `wrote ${outPath} (${images.length} sizes: ${images
    .map((i) => i.size)
    .join(", ")})`
);
