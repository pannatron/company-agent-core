// Generate a pixel-art office scene via Gemini 2.5 Flash Image ("Nano Banana").
// Saves the result to dashboard/public/office/scene.png so it can be served
// as a static background by the /office page.
//
// Run:  node scripts/gen-office-scene.mjs
import fs from 'node:fs/promises';
import path from 'node:path';

// Load env from dashboard/.env.local — same place Next.js reads.
const ENV_FILE = path.resolve(
  process.cwd(),
  process.cwd().endsWith('dashboard') ? '.env.local' : 'dashboard/.env.local',
);
const envText = await fs.readFile(ENV_FILE, 'utf8');
for (const line of envText.split('\n')) {
  const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) throw new Error('GEMINI_API_KEY not found in dashboard/.env.local');

const MODEL = 'gemini-2.5-flash-image';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

// The prompt — describes the layout we want so we can overlay HTML on top.
// We deliberately place 11 desks in clear zones so the overlay can match.
const PROMPT = `
A wide pixel art illustration of a cozy modern tech startup office, top-down isometric
2.5D view, 16-bit retro game style (like Stardew Valley or Habbo Hotel), warm interior
lighting at golden hour.

The room is a single open-plan office split into FIVE clearly visible zones, arranged
left-to-right and top-to-bottom:

1. EXECUTIVE corner (top-left): one larger executive desk by a tall window showing
   a city skyline at sunset. A potted plant beside it.
2. CREATIVE STUDIO zone (top-right): four desks in a row, with monitors showing
   colourful design tools, sketches, and social media UI. A whiteboard with sticky
   notes on the wall.
3. REVENUE row (middle-left): two desks side by side, monitors showing charts and
   spreadsheets. A small filing cabinet beside them.
4. OPS & PEOPLE zone (middle-right): three desks in a U-shape, monitors showing
   dashboards, kanban boards, and an HR portal. Coffee machine on a side table.
5. CUSTOMER FRONT (bottom-center): a single desk with a comfortable chair and
   headset, facing the viewer slightly.

Every desk has a small pixel-art character (employee) actually sitting and working —
diverse, friendly-looking, varied hair colors and outfits. Each desk has a glowing
monitor. Wooden floor with subtle grid pattern. Brick walls with framed pixel-art
posters. Plants in every zone. A neon "EAT • SLEEP • CODE • REPEAT" sign on one wall.

Style: crisp pixel art, limited palette of warm browns + cool blues + neon accents,
no anti-aliasing, sharp pixel edges, like a SNES JRPG office level. 16:9 aspect ratio
if possible. Vibrant but cozy. No text labels on the image itself.
`.trim();

console.log('[gen-office-scene] calling Gemini…');
const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(KEY)}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    contents: [{ parts: [{ text: PROMPT }] }],
  }),
});
const text = await res.text();
if (!res.ok) {
  console.error('[gen-office-scene] HTTP', res.status, text.slice(0, 500));
  process.exit(1);
}
const data = JSON.parse(text);
if (data.promptFeedback?.blockReason) {
  console.error('[gen-office-scene] BLOCKED:', data.promptFeedback.blockReason);
  process.exit(1);
}
const inline = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
if (!inline?.data) {
  console.error('[gen-office-scene] no image in response', JSON.stringify(data).slice(0, 500));
  process.exit(1);
}

const OUT_DIR = path.resolve(
  process.cwd(),
  process.cwd().endsWith('dashboard') ? 'public/office' : 'dashboard/public/office',
);
await fs.mkdir(OUT_DIR, { recursive: true });
const OUT = path.join(OUT_DIR, 'scene.png');
const buffer = Buffer.from(inline.data, 'base64');
await fs.writeFile(OUT, buffer);
console.log(`[gen-office-scene] saved ${OUT} (${(buffer.byteLength / 1024).toFixed(1)} KB, ${inline.mimeType})`);
