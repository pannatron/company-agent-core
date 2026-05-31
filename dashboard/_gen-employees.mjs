// Generate 11 employee sprite sheets via GPT-Image-2 (EvoLink), chroma-key the
// magenta background to real transparency, install to public/sprites/<slug>.png.
//
// Self-contained: submit + poll the EvoLink task API directly (so a slow poll
// never kills the job, unlike gen-image.sh), download, chroma-key in a shared
// puppeteer canvas, write the PNG. Concurrency-limited; retries transient fails.
//
// Run from dashboard/:  node _gen-employees.mjs [slug ...]
//   no args → all 11.  args → only those slugs (for re-rolls).
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";

const ROOT = path.resolve("..");
const SPRITES = path.join(ROOT, "dashboard/public/sprites");
const STAGE = path.join(ROOT, "outputs/office-gen/employees");
fs.mkdirSync(STAGE, { recursive: true });
fs.mkdirSync(SPRITES, { recursive: true });

const API = "https://api.evolink.ai";
const CONCURRENCY = 3;
const POLL_MAX_S = 360;

function key() {
  const env = fs.readFileSync(path.join(ROOT, "dashboard/.env.local"), "utf8");
  const m = env.match(/^[ \t]*Evolink_API_KEY[ \t]*=[ \t]*["']?([^"'\r\n]+)/im);
  if (!m) throw new Error("Evolink_API_KEY not found");
  return m[1].trim();
}
const KEY = key();
const H = { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

// Per-person appearance: matches LOOKS + accent shirt colour + a role prop.
const PEOPLE = [
  { slug: "ceo", name: "Alex", accent: "#6366f1", role: "the CEO in a smart indigo blazer over a white shirt", hair: "short neat black hair", skin: "medium", extra: "thin glasses, confident smile" },
  { slug: "sales-rep", name: "Jordan", accent: "#e11d48", role: "a friendly account executive in a rose-red dress shirt", hair: "short brown hair", skin: "tan", extra: "holding a tiny phone, upbeat" },
  { slug: "marketing-lead", name: "Sarah", accent: "#c026d3", role: "a creative marketing lead in a magenta-fuchsia top", hair: "long wavy red hair", skin: "light", extra: "energetic expression" },
  { slug: "content-designer", name: "Lin", accent: "#06b6d4", role: "a content designer in a cyan hoodie", hair: "short black bob haircut", skin: "medium", extra: "round glasses, holding a stylus" },
  { slug: "copywriter", name: "Noah", accent: "#db2777", role: "a casual copywriter in a pink t-shirt", hair: "blonde hair under a backwards cap", skin: "light", extra: "relaxed grin" },
  { slug: "social-media-manager", name: "Zara", accent: "#ea580c", role: "a trendy social media manager in an orange jacket", hair: "black hair in a high ponytail", skin: "brown", extra: "phone in hand, lively" },
  { slug: "hr-manager", name: "Maya", accent: "#d97706", role: "a warm head of people in an amber-gold blouse", hair: "natural afro hair", skin: "dark brown", extra: "kind welcoming smile" },
  { slug: "finance-analyst", name: "Daniel", accent: "#10b981", role: "a tidy finance lead in an emerald-green shirt and vest", hair: "short grey hair", skin: "light", extra: "rectangular glasses, neat" },
  { slug: "ops-manager", name: "Priya", accent: "#14b8a6", role: "a practical operations lead in a teal shirt", hair: "black hair in a bun", skin: "medium brown", extra: "holding a clipboard" },
  { slug: "kpi-analyst", name: "Mei", accent: "#7c3aed", role: "a data and KPI analyst in a violet-purple cardigan", hair: "long straight dark hair", skin: "light", extra: "glasses, focused" },
  { slug: "customer-support", name: "Rafael", accent: "#0284c7", role: "a customer success lead in a sky-blue shirt", hair: "short dark red hair", skin: "medium", extra: "wearing a headset" },
];

function prompt(p) {
  return [
    `8-bit / 16-bit pixel-art SPRITE SHEET of a single cute chibi office worker character: ${p.role}, with ${p.hair}, ${p.skin} skin, ${p.extra}.`,
    `Lay out exactly a 2 columns by 2 rows grid, 4 poses of the SAME character seen from a top-down FRONT view (facing the viewer, upper body and head clearly visible as if sitting at a desk):`,
    `top-left = idle sitting calm; top-right = typing on a keyboard (hands forward, focused); bottom-left = talking and gesturing; bottom-right = cheering with one arm raised happily.`,
    `Keep identical face, hair, outfit colours and chibi proportions in all 4 cells. Big readable head, simple friendly face, thick dark pixel outline.`,
    `CRITICAL BACKGROUND: one SOLID FLAT pure MAGENTA background hex #FF00FF filling the ENTIRE image behind and between the characters — absolutely NO transparency checkerboard, NO grey-white squares, NO floor, NO desk, NO shadow, NO gradient. Just flat magenta #FF00FF everywhere except the character.`,
    `Each pose centered in its cell, NO text, NO labels, NO grid lines. Crisp sharp pixels, no anti-aliasing, vibrant saturated colours, retro SNES JRPG overworld NPC sprite style.`,
  ].join(" ");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function submit(p, attempt = 1) {
  const body = JSON.stringify({
    model: "gpt-image-2",
    prompt: prompt(p),
    size: "1024x1024",
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
  if (!id) throw new Error(`submit ${p.slug} no task id: ${t.slice(0, 160)}`);
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
      continue; // network hiccup — retry next cycle (this is the bug office-gen.sh had)
    }
    let j;
    try { j = JSON.parse(t); } catch { continue; }
    const st = j.status;
    if (st === "completed" || st === "succeed" || st === "success" || st === "done") {
      const url =
        (JSON.stringify(j).match(/https:\/\/files\.evolink\.ai\/[^"\\]+\.(?:png|jpg|jpeg)/) || [])[0];
      if (!url) throw new Error(`${p.slug} completed but no url`);
      return url;
    }
    if (st === "failed") throw new Error(`${p.slug} failed: ${JSON.stringify(j.error || j).slice(0, 160)}`);
  }
  throw new Error(`${p.slug} poll timeout`);
}

async function download(url, out) {
  const r = await fetch(url);
  const buf = Buffer.from(await r.arrayBuffer());
  if (!(buf[0] === 0x89 && buf[1] === 0x50)) throw new Error(`bad png download`);
  fs.writeFileSync(out, buf);
}

// chroma-key magenta → transparent, write to outPath. Uses a shared page.
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
  const list = only.length ? PEOPLE.filter((p) => only.includes(p.slug)) : PEOPLE;
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();

  const results = [];
  let idx = 0;
  async function worker(wid) {
    while (idx < list.length) {
      const p = list[idx++];
      const raw = path.join(STAGE, `${p.slug}-raw.png`);
      const dest = path.join(SPRITES, `${p.slug}.png`);
      try {
        console.log(`[${p.slug}] submit…`);
        const id = await submit(p);
        console.log(`[${p.slug}] task=${id} polling…`);
        const url = await poll(p, id);
        await download(url, raw);
        await chroma(page, raw, dest);
        const sz = fs.statSync(dest).size;
        console.log(`[${p.slug}] DONE installed ${dest} (${sz}B)`);
        results.push({ slug: p.slug, ok: true });
      } catch (e) {
        console.log(`[${p.slug}] ERROR ${e.message}`);
        results.push({ slug: p.slug, ok: false, err: e.message });
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));
  await browser.close();

  const ok = results.filter((r) => r.ok).map((r) => r.slug);
  const bad = results.filter((r) => !r.ok);
  console.log(`\nRESULT ok=${ok.length}/${list.length}`);
  if (bad.length) console.log("FAILED: " + bad.map((b) => `${b.slug}(${b.err})`).join("; "));
}

main().catch((e) => {
  console.error("FATAL " + e.message);
  process.exit(1);
});
