// Generate 11 per-role DESK assets (desk + role-specific equipment) via
// GPT-Image-2, chroma-key the magenta bg → transparency, install to
// public/sprites/desk-<slug>.png.
//
// The desk gear sits in the LOWER HALF of the frame (upper half transparent) so
// when drawn in front of the seated employee it only covers the lower body —
// the head + shoulders stay visible. No text baked in (the position nameplate is
// drawn crisply in-canvas).
//
// Run from dashboard/:  node _gen-desks.mjs [slug ...]
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";

const ROOT = path.resolve("..");
const SPRITES = path.join(ROOT, "dashboard/public/sprites");
const STAGE = path.join(ROOT, "outputs/office-gen/desks");
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

// Role-specific desk gear. Kept low so it doesn't rise over the worker's face.
const DESKS = [
  { slug: "ceo", gear: "an executive office desk with a slim laptop, a coffee mug, a small gold trophy, a tidy stack of papers and a tiny succulent plant" },
  { slug: "sales-rep", gear: "a sales desk with a desk telephone with a headset, a small upward green sales line-chart on a little stand, and a few stacked gold coins" },
  { slug: "marketing-lead", gear: "a marketing desk with a laptop, a megaphone, a small colourful campaign poster on a mini easel, and bright sticky notes" },
  { slug: "content-designer", gear: "a designer desk with a graphics drawing tablet and stylus, a monitor showing a pen-tool curve, a round colour-swatch palette and a couple of paint cups" },
  { slug: "copywriter", gear: "a writer desk with a retro typewriter, a neat stack of papers, a mug of coffee and a cup of pens" },
  { slug: "social-media-manager", gear: "a social-media desk with a smartphone on a small stand showing red heart and like icons, a little ring light, and two small glowing screens" },
  { slug: "hr-manager", gear: "an HR desk with a stack of resume papers, a clipboard, a coffee mug, a small potted plant and a name badge" },
  { slug: "finance-analyst", gear: "a finance desk with a calculator, neat stacks of gold coins, a monitor showing a spreadsheet with a small bar chart, and a closed ledger book" },
  { slug: "ops-manager", gear: "an operations desk with a clipboard checklist, a couple of metal gears, a small kanban sticky-note board on a stand, and a label printer" },
  { slug: "kpi-analyst", gear: "a data-analyst desk with a monitor showing colourful bar and line charts, a small second dashboard screen, and a printed pie-chart sheet" },
  { slug: "customer-support", gear: "a support desk with a headset resting on a small stand, a few floating chat speech bubbles, and a stack of support tickets" },
];

function prompt(p) {
  return [
    `8-bit / 16-bit pixel-art game asset: ${p.gear}, seen from a slightly-above FRONT view (top-down JRPG office view).`,
    `COMPOSITION IS CRITICAL: the desk and all its equipment occupy ONLY THE LOWER HALF of the image. The ENTIRE UPPER HALF of the image must be completely empty. Keep the gear low and spread horizontally across the desk surface — nothing tall that would stick up into the upper half.`,
    `NO person, NO character, NO chair, NO text, NO letters, NO numbers, NO labels, NO floor, NO wall.`,
    `BACKGROUND: one SOLID FLAT pure MAGENTA background hex #FF00FF filling the ENTIRE image (including the empty upper half) behind and around the desk — absolutely NO transparency checkerboard, NO grey-white squares, NO gradient, NO shadow box. Just flat magenta #FF00FF everywhere except the desk and its gear.`,
    `Crisp sharp pixels, no anti-aliasing, thick dark pixel outline, vibrant saturated colours, warm wooden desk top, retro SNES JRPG furniture sprite style.`,
  ].join(" ");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function submit(p, attempt = 1) {
  const body = JSON.stringify({
    model: "gpt-image-2",
    prompt: prompt(p),
    size: "1536x1024", // 3:2 wide desk
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
    throw new Error(`submit ${p.slug} HTTP ${r.status}: ${t.slice(0, 160)}`);
  }
  const j = JSON.parse(t);
  const id = j.id || j.task_id;
  if (!id) throw new Error(`submit ${p.slug} no id: ${t.slice(0, 160)}`);
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
      if (!url) throw new Error(`${p.slug} completed no url`);
      return url;
    }
    if (st === "failed") throw new Error(`${p.slug} failed: ${JSON.stringify(j.error || j).slice(0, 160)}`);
  }
  throw new Error(`${p.slug} poll timeout`);
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
  const list = only.length ? DESKS.filter((p) => only.includes(p.slug)) : DESKS;
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < list.length) {
      const p = list[idx++];
      const raw = path.join(STAGE, `${p.slug}-raw.png`);
      const dest = path.join(SPRITES, `desk-${p.slug}.png`);
      try {
        console.log(`[${p.slug}] submit…`);
        const id = await submit(p);
        console.log(`[${p.slug}] task=${id} polling…`);
        const url = await poll(p, id);
        await download(url, raw);
        await chroma(page, raw, dest);
        console.log(`[${p.slug}] DONE installed ${dest} (${fs.statSync(dest).size}B)`);
        results.push({ slug: p.slug, ok: true });
      } catch (e) {
        console.log(`[${p.slug}] ERROR ${e.message}`);
        results.push({ slug: p.slug, ok: false, err: e.message });
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  await browser.close();
  const ok = results.filter((r) => r.ok).map((r) => r.slug);
  const bad = results.filter((r) => !r.ok);
  console.log(`\nRESULT ok=${ok.length}/${list.length}`);
  if (bad.length) console.log("FAILED: " + bad.map((b) => `${b.slug}(${b.err})`).join("; "));
}

main().catch((e) => { console.error("FATAL " + e.message); process.exit(1); });
