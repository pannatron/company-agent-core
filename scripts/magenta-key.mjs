#!/usr/bin/env node
// magenta-key.mjs — chroma-key a flat #FF00FF magenta background to transparent.
//
// Why: GPT-Image-2 bakes a fake grey checkerboard when asked for "transparent",
// which needs a fragile flood-fill. Generating on a SOLID FLAT MAGENTA bg instead
// gives a single, far-from-content color we can key in one clean pass — magenta
// (high R, high B, low G) never collides with Borot's chrome (R≈G≈B), the orange
// lion (B<G), blue overalls (R<G) or the hazard yellow.
//
// Usage: node scripts/magenta-key.mjs <in.png> <out.png>
//
// Algorithm per pixel:  m = min(R,B) - G  (magentaness)
//   m >= HARD  AND R,B bright  -> background, alpha 0
//   SOFT < m < HARD            -> edge fringe: fade alpha + despill toward G
//   else                       -> keep, but mild despill if a faint magenta cast
// Uses the dashboard's sharp (this repo has no global sharp/imagemagick).

import sharp from "/Users/songkarn/Desktop/company-agent-core/dashboard/node_modules/sharp/lib/index.js";

const [, , INP, OUTP] = process.argv;
if (!INP || !OUTP) {
  console.error("usage: node scripts/magenta-key.mjs <in.png> <out.png>");
  process.exit(2);
}

const HARD = 55; // m at/above this with bright R,B = pure background
const SOFT = 18; // m below this = treat as content (no keying)

const img = sharp(INP).ensureAlpha();
const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info; // channels === 4 after ensureAlpha
let cleared = 0,
  faded = 0;

for (let i = 0; i < data.length; i += channels) {
  const R = data[i],
    G = data[i + 1],
    B = data[i + 2];
  const m = Math.min(R, B) - G; // high for magenta
  if (m <= 0) continue; // G is the max channel → not magenta (lion/yellow/etc.)

  if (m >= HARD && R > 110 && B > 110) {
    data[i + 3] = 0; // full background
    cleared++;
    continue;
  }
  if (m > SOFT && R > 90 && B > 90) {
    // anti-aliased fringe ring: fade alpha as it approaches pure magenta…
    const t = (m - SOFT) / (HARD - SOFT); // 0→keep .. 1→clear
    data[i + 3] = Math.round(data[i + 3] * (1 - t));
    faded++;
  }
  // …and despill: pull R,B down toward G to remove the purple halo. Scaled by
  // magentaness so chrome/coloured pixels (small m) are barely touched.
  const cut = Math.min(m - SOFT > 0 ? m - SOFT : 0, m) * 0.6;
  if (cut > 0) {
    data[i] = Math.max(G, R - cut);
    data[i + 2] = Math.max(G, B - cut);
  }
}

await sharp(data, { raw: { width, height, channels } })
  .png()
  .toFile(OUTP);

const total = width * height;
console.log(
  `MAGENTA_KEY_OK ${OUTP} ${width}x${height} cleared=${cleared} (${(
    (cleared / total) *
    100
  ).toFixed(1)}%) faded=${faded}`
);
