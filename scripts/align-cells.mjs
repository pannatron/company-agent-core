#!/usr/bin/env node
// align-cells.mjs — stabilize an animated cols×rows sprite sheet so it doesn't
// wobble when cycled. GPT-Image-2 renders each cell of a 2x2 sheet a few px
// off-register (the big mass drifts cell to cell); cycling them looks jittery.
// Fix: per cell, find a STABLE anchor = horizontal center of the opaque pixels
// in the bottom band (the platform base — peripheral motion like the crane arm
// or floating gears never touches it), plus the bottom-most opaque row. Shift
// every cell so its anchor matches cell 0's. Translation only.
//
// Usage: node scripts/align-cells.mjs <in.png> <out.png> [cols] [rows]
// Input must already be RGBA (transparent bg). Output recomposed same size.

import sharp from "/Users/songkarn/Desktop/company-agent-core/dashboard/node_modules/sharp/lib/index.js";

const [, , INP, OUTP, COLS = "2", ROWS = "2"] = process.argv;
if (!INP || !OUTP) {
  console.error("usage: node scripts/align-cells.mjs <in.png> <out.png> [cols] [rows]");
  process.exit(2);
}
const cols = +COLS, rows = +ROWS;
const A_TH = 24; // alpha above this = opaque content
const BAND = 0.12; // bottom fraction of the cell's content height used for X anchor

const { data, info } = await sharp(INP).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: ch } = info;
const cw = Math.floor(W / cols), chh = Math.floor(H / rows);
const A = (x, y) => data[(y * W + x) * ch + 3];

// anchor of one cell whose top-left is (ox,oy)
function anchorOf(ox, oy) {
  let minY = chh, maxY = -1;
  for (let y = 0; y < chh; y++)
    for (let x = 0; x < cw; x++)
      if (A(ox + x, oy + y) > A_TH) { if (y < minY) minY = y; if (y > maxY) maxY = y; break; }
  // (break only exits x-loop early on first hit per row; minY/maxY still scan all rows)
  if (maxY < 0) return null;
  const bandTop = Math.max(minY, maxY - Math.round((maxY - minY) * BAND));
  let sx = 0, n = 0;
  for (let y = bandTop; y <= maxY; y++)
    for (let x = 0; x < cw; x++)
      if (A(ox + x, oy + y) > A_TH) { sx += x; n++; }
  return { ax: n ? sx / n : cw / 2, ay: maxY };
}

const out = Buffer.alloc(W * H * ch, 0); // transparent canvas
const cells = [];
for (let r = 0; r < rows; r++)
  for (let c = 0; c < cols; c++)
    cells.push({ c, r, ox: c * cw, oy: r * chh });

const anchors = cells.map((cell) => anchorOf(cell.ox, cell.oy));
const ref = anchors[0];
if (!ref) { console.error("cell 0 empty — abort"); process.exit(1); }

for (let i = 0; i < cells.length; i++) {
  const { ox, oy } = cells[i];
  const a = anchors[i] || ref;
  const dx = Math.round(ref.ax - a.ax); // shift to match cell 0
  const dy = Math.round(ref.ay - a.ay);
  for (let y = 0; y < chh; y++) {
    const ny = y + dy; if (ny < 0 || ny >= chh) continue;
    for (let x = 0; x < cw; x++) {
      const nx = x + dx; if (nx < 0 || nx >= cw) continue;
      const s = ((oy + y) * W + (ox + x)) * ch;
      const d = ((oy + ny) * W + (ox + nx)) * ch;
      out[d] = data[s]; out[d + 1] = data[s + 1]; out[d + 2] = data[s + 2]; out[d + 3] = data[s + 3];
    }
  }
  console.log(`cell ${i}: anchor=(${a.ax.toFixed(1)},${a.ay}) shift=(${dx},${dy})`);
}

await sharp(out, { raw: { width: W, height: H, channels: ch } }).png().toFile(OUTP);
console.log(`ALIGN_OK ${OUTP} ${W}x${H} cols=${cols} rows=${rows}`);
