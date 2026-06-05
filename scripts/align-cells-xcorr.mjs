#!/usr/bin/env node
// align-cells-xcorr.mjs — stabilize an animated cols×rows sprite sheet by
// registering each cell to cell 0 via opaque-mask overlap (IoU) maximization,
// instead of a single anchor point. Robust when the prop has a large STATIC
// body (printer frame, machine chassis) plus small moving parts (a print head,
// a growing printed object, sparkles): the best-overlap shift is dominated by
// the static mass, so the moving bits don't skew it the way a centroid does.
//
// Usage: node scripts/align-cells-xcorr.mjs <in.png> <out.png> [cols] [rows] [searchPx]
// Input must be RGBA. Translation only. Output recomposed, same size.

import sharp from "/Users/songkarn/Desktop/company-agent-core/dashboard/node_modules/sharp/lib/index.js";

const [, , INP, OUTP, COLS = "2", ROWS = "2", SEARCH = "72"] = process.argv;
if (!INP || !OUTP) {
  console.error("usage: node scripts/align-cells-xcorr.mjs <in.png> <out.png> [cols] [rows] [searchPx]");
  process.exit(2);
}
const cols = +COLS, rows = +ROWS, SEARCH_PX = +SEARCH;
const A_TH = 24;
const D = 6; // downsample factor for the search masks

const { data, info } = await sharp(INP).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: ch } = info;
const cw = Math.floor(W / cols), chh = Math.floor(H / rows);
const A = (x, y) => data[(y * W + x) * ch + 3];

const mW = Math.ceil(cw / D), mH = Math.ceil(chh / D);
// subsampled opaque mask for the cell at (ox,oy)
function maskOf(ox, oy) {
  const m = new Uint8Array(mW * mH);
  for (let my = 0; my < mH; my++)
    for (let mx = 0; mx < mW; mx++) {
      const x = ox + mx * D, y = oy + my * D;
      if (x < W && y < H) m[my * mW + mx] = A(x, y) > A_TH ? 1 : 0;
    }
  return m;
}

const cells = [];
for (let r = 0; r < rows; r++)
  for (let c = 0; c < cols; c++) cells.push({ ox: c * cw, oy: r * chh });

const masks = cells.map((c) => maskOf(c.ox, c.oy));
const ref = masks[0];
const R = Math.round(SEARCH_PX / D);

function bestShift(m) {
  let best = -1, bdx = 0, bdy = 0;
  for (let ddy = -R; ddy <= R; ddy++)
    for (let ddx = -R; ddx <= R; ddx++) {
      let inter = 0, uni = 0;
      for (let my = 0; my < mH; my++) {
        const sy = my + ddy; if (sy < 0 || sy >= mH) { // ref rows with no cell counterpart count toward union
          for (let mx = 0; mx < mW; mx++) if (ref[my * mW + mx]) uni++;
          continue;
        }
        for (let mx = 0; mx < mW; mx++) {
          const a = ref[my * mW + mx];
          const sx = mx + ddx;
          const b = sx >= 0 && sx < mW ? m[sy * mW + sx] : 0;
          if (a || b) uni++;
          if (a && b) inter++;
        }
      }
      const iou = uni ? inter / uni : 0;
      if (iou > best) { best = iou; bdx = ddx; bdy = ddy; }
    }
  // ref[mx] matched cell[mx+ddx] ⇒ shift to apply = -ddx*D
  return { sx: -bdx * D, sy: -bdy * D, iou: best };
}

const out = Buffer.alloc(W * H * ch, 0);
for (let i = 0; i < cells.length; i++) {
  const { ox, oy } = cells[i];
  const { sx, sy, iou } = i === 0 ? { sx: 0, sy: 0, iou: 1 } : bestShift(masks[i]);
  for (let y = 0; y < chh; y++) {
    const ny = y + sy; if (ny < 0 || ny >= chh) continue;
    for (let x = 0; x < cw; x++) {
      const nx = x + sx; if (nx < 0 || nx >= cw) continue;
      const s = ((oy + y) * W + (ox + x)) * ch;
      const d = ((oy + ny) * W + (ox + nx)) * ch;
      out[d] = data[s]; out[d + 1] = data[s + 1]; out[d + 2] = data[s + 2]; out[d + 3] = data[s + 3];
    }
  }
  console.log(`cell ${i}: shift=(${sx},${sy}) iou=${iou.toFixed(3)}`);
}

await sharp(out, { raw: { width: W, height: H, channels: ch } }).png().toFile(OUTP);
console.log(`ALIGN_XCORR_OK ${OUTP} ${W}x${H} cols=${cols} rows=${rows}`);
