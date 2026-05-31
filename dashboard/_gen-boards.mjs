// Generate 6 standing BOARD assets (KPI / Sales / Finance / Content / Social /
// Support) via GPT-Image-2, chroma-key the magenta bg → transparency, install to
// public/sprites/board-<id>.png. Same robust pipeline as _gen-desks.mjs.
//
// Each is a freestanding 8-bit display board on a stand, themed by topic, with
// NO text (the title plate is drawn crisply in-canvas). Run from dashboard/:
//   node _gen-boards.mjs [id ...]
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";

const ROOT = path.resolve("..");
const SPRITES = path.join(ROOT, "dashboard/public/sprites");
const STAGE = path.join(ROOT, "outputs/office-gen/boards");
fs.mkdirSync(STAGE, { recursive: true });

const API = "https://api.evolink.ai";
const CONCURRENCY = 3;
const POLL_MAX_S = 420;

function key() {
  const env = fs.readFileSync(path.join(ROOT, "dashboard/.env.local"), "utf8");
  const m = env.match(/^[ \t]*Evolink_API_KEY[ \t]*=[ \t]*["']?([^"'\r\n]+)/im);
  if (!m) throw new Error("Evolink_API_KEY not found");
  return m[1].trim();
}
const KEY = key();
const H = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

const BOARDS = [
  { id: "kpi", art: "a large glowing dashboard display screen on a sleek metal stand, the screen showing colourful KPI widgets: a circular gauge, green and red bar charts, an upward line graph, and percentage dials in purple and violet tones" },
  { id: "sales", art: "a standing presentation board on a tripod stand showing a sales funnel diagram with descending stages, a big upward green arrow, and a few stacked gold coins, in rose-red and pink tones" },
  { id: "finance", art: "a standing finance board on a stand showing a money bag with a coin symbol, stacks of gold coins, and a green balance line chart going up, in emerald-green tones" },
  { id: "content", art: "a standing content-calendar board on a stand showing a monthly grid calendar with colourful sticky notes pinned on some days and a pen, in pink and magenta tones" },
  { id: "social", art: "a standing social-media board on a stand showing a phone-like screen with a heart icon, a like thumbs-up, a play button and small speech bubbles floating, in warm orange tones" },
  { id: "support", art: "a standing customer-support board on a stand showing a headset icon, two chat speech bubbles, a support ticket and a green checkmark, in sky-blue tones" },
];

function prompt(p) {
  return [
    `8-bit / 16-bit pixel-art game asset of ${p.art}.`,
    `It is a single freestanding object viewed from a slightly-above FRONT angle (top-down JRPG office view), standing upright on the floor with a visible base/stand at the bottom. Centered in the frame.`,
    `NO person, NO character, NO desk, NO text, NO letters, NO numbers, NO words, NO labels, NO floor tiles, NO wall.`,
    `BACKGROUND: one SOLID FLAT pure MAGENTA background hex #FF00FF filling the ENTIRE image behind and around the board — absolutely NO transparency checkerboard, NO grey-white squares, NO gradient, NO shadow box. Just flat magenta #FF00FF everywhere except the board.`,
    `Crisp sharp pixels, no anti-aliasing, thick dark pixel outline, vibrant saturated colours, retro SNES JRPG signage sprite style.`,
  ].join(" ");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function submit(p, attempt = 1) {
  const body = JSON.stringify({
    model: "gpt-image-2",
    prompt: prompt(p),
    size: "1024x1536", // tall standing board
    quality: "high",
    n: 1,
  });
  const r = await fetch(`${API}/v1/images/generations`, { method: "POST", headers: H, body });
  const t = await r.text();
  if (!r.ok) {
    if ((r.status === 429 || r.status >= 500) && attempt <= 4) {
      await sleep(8000 * attempt);
      return submit(p, attempt + 1);
    }
    throw new Error(`submit ${p.id} HTTP ${r.status}: ${t.slice(0, 160)}`);
  }
  const j = JSON.parse(t);
  const id = j.id || j.task_id;
  if (!id) throw new Error(`submit ${p.id} no id: ${t.slice(0, 160)}`);
  return id;
}

async function poll(p, id) {
  const start = Date.now();
  while ((Date.now() - start) / 1000 < POLL_MAX_S) {
    await sleep(8000);
    let r, t;
    try {
      r = await fetch(`${API}/v1/tasks/${id}`, { headers: H });
      t = await r.text();
    } catch {
      continue;
    }
    let j;
    try { j = JSON.parse(t); } catch { continue; }
    const st = j.status;
    if (st === "completed" || st === "succeed" || st === "success" || st === "done") {
      const url = (JSON.stringify(j).match(/https:\/\/files\.evolink\.ai\/[^"\\]+\.(?:png|jpg|jpeg)/) || [])[0];
      if (!url) throw new Error(`${p.id} completed no url`);
      return url;
    }
    if (st === "failed") throw new Error(`${p.id} failed: ${JSON.stringify(j.error || j).slice(0, 160)}`);
  }
  throw new Error(`${p.id} poll timeout`);
}

async function download(url, out) {
  const r = await fetch(url);
  const buf = Buffer.from(await r.arrayBuffer());
  if (!(buf[0] === 0x89 && buf[1] === 0x50)) throw new Error("bad png");
  fs.writeFileSync(out, buf);
}

async function chroma(page, inPath, outPath) {
  const b64 = fs.readFileSync(inPath).toString("base64");
  const outB64 = await page.evaluate(async (src) => {
    const im = new Image();
    im.src = src;
    await im.decode();
    const W = im.naturalWidth, H = im.naturalHeight;
    const cv = new OffscreenCanvas(W, H);
    const ctx = cv.getContext("2d");
    ctx.drawImage(im, 0, 0);
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    const tol2 = 95 * 95 * 3;
    for (let i = 0; i < d.length; i += 4) {
      const dr = d[i] - 255, dg = d[i + 1] - 0, db = d[i + 2] - 255;
      if (dr * dr + dg * dg + db * db <= tol2) d[i + 3] = 0;
    }
    ctx.putImageData(img, 0, 0);
    const blob = await cv.convertToBlob({ type: "image/png" });
    const u = new Uint8Array(await blob.arrayBuffer());
    let s = "";
    for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s);
  }, "data:image/png;base64," + b64);
  fs.writeFileSync(outPath, Buffer.from(outB64, "base64"));
}

async function main() {
  const only = process.argv.slice(2);
  const list = only.length ? BOARDS.filter((p) => only.includes(p.id)) : BOARDS;
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < list.length) {
      const p = list[idx++];
      const raw = path.join(STAGE, `${p.id}-raw.png`);
      const dest = path.join(SPRITES, `board-${p.id}.png`);
      try {
        console.log(`[${p.id}] submit…`);
        const id = await submit(p);
        console.log(`[${p.id}] task=${id} polling…`);
        const url = await poll(p, id);
        await download(url, raw);
        await chroma(page, raw, dest);
        console.log(`[${p.id}] DONE installed ${dest} (${fs.statSync(dest).size}B)`);
        results.push({ id: p.id, ok: true });
      } catch (e) {
        console.log(`[${p.id}] ERROR ${e.message}`);
        results.push({ id: p.id, ok: false, err: e.message });
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  await browser.close();
  const ok = results.filter((r) => r.ok).map((r) => r.id);
  const bad = results.filter((r) => !r.ok);
  console.log(`\nRESULT ok=${ok.length}/${list.length}`);
  if (bad.length) console.log("FAILED: " + bad.map((b) => `${b.id}(${b.err})`).join("; "));
}

main().catch((e) => { console.error("FATAL " + e.message); process.exit(1); });
