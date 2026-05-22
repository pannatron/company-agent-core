import { promises as fs } from "node:fs";
import path from "node:path";
import puppeteer, { type Browser } from "puppeteer";
import { REPO_ROOT } from "./repo";
import { getLogoDataUri } from "./brandAssets";

/**
 * HTML → PNG renderer for content-designer (Lin).
 *
 * Lin writes HTML+Tailwind for a post asset; this renders it at a fixed
 * viewport using headless Chrome and writes a PNG into outputs/.
 * The categorizer/auto-organize then routes it into outputs/content/ based on
 * the filename prefix (must start with `content-` to land in the right folder).
 */

const OUTPUTS_DIR = path.join(REPO_ROOT, "outputs");

export interface RenderOptions {
  /** HTML body OR full document. If body fragment, we wrap with Tailwind + sensible defaults. */
  html: string;
  /** Image width in CSS pixels (defaults to 1080) */
  width?: number;
  /** Image height in CSS pixels (defaults to 1080) */
  height?: number;
  /** Output filename (must end with .png). Saved to outputs/ root; categorizer moves to outputs/content/ if name starts with `content-`. */
  filename: string;
  /** Inject Tailwind via CDN (default true). Set false if you provide your own CSS in HTML. */
  tailwind?: boolean;
  /** Google Fonts spec, e.g. "Sarabun:wght@400;700" or "IBM+Plex+Sans+Thai:wght@400;500;700" */
  fonts?: string;
  /** Device scale factor for high-DPI export (default 2) — produces sharper PNG */
  scale?: number;
}

export interface RenderResult {
  /** Path relative to repo root, e.g. "outputs/content-2026-05-21-launch.png" */
  path: string;
  /** Bytes on disk */
  size: number;
  width: number;
  height: number;
}

/* ---------- HTML wrapper ---------- */

function wrapHtml(opts: {
  body: string;
  width: number;
  height: number;
  tailwind: boolean;
  fonts?: string;
}): string {
  const fontLink = opts.fonts
    ? `<link rel="preconnect" href="https://fonts.googleapis.com">
       <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
       <link href="https://fonts.googleapis.com/css2?family=${opts.fonts}&display=swap" rel="stylesheet">`
    : "";
  const tailwindScript = opts.tailwind
    ? `<script src="https://cdn.tailwindcss.com"></script>`
    : "";
  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  ${fontLink}
  ${tailwindScript}
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: ${opts.width}px;
      height: ${opts.height}px;
      overflow: hidden;
      box-sizing: border-box;
    }
    body {
      font-family: ${opts.fonts ? `'${opts.fonts.split(":")[0].replaceAll("+", " ")}', ` : ""}-apple-system, 'IBM Plex Sans Thai', 'Sarabun', system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
    * { box-sizing: border-box; }
  </style>
</head>
<body>${opts.body}</body>
</html>`;
}

/* ---------- Render ---------- */

/** Singleton browser — Puppeteer launch is ~1s; keep alive across requests for speed */
let browserPromise: Promise<Browser> | null = null;
async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"],
    });
  }
  return browserPromise;
}

export async function renderHtmlToImage(opts: RenderOptions): Promise<RenderResult> {
  const width = opts.width ?? 1080;
  const height = opts.height ?? 1080;
  const tailwind = opts.tailwind ?? true;
  const scale = opts.scale ?? 2;

  // sanitize filename — only safe chars, must end with .png
  const safeName = opts.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!safeName.toLowerCase().endsWith(".png")) {
    throw new Error("filename must end with .png");
  }

  // Replace {{LOGO}} / {{LOGO_URL}} placeholders with the company logo data URI.
  // Lin uses these in templates so every rendered asset can carry the brand mark.
  const logoUri = await getLogoDataUri();
  let body = opts.html;
  if (logoUri) {
    body = body.replaceAll("{{LOGO}}", logoUri).replaceAll("{{LOGO_URL}}", logoUri);
  } else {
    // No logo set — replace with transparent 1×1 PNG so <img> doesn't 404
    const fallback =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    body = body.replaceAll("{{LOGO}}", fallback).replaceAll("{{LOGO_URL}}", fallback);
  }

  const fullHtml = body.includes("<!DOCTYPE")
    ? body
    : wrapHtml({ body, width, height, tailwind, fonts: opts.fonts });

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width, height, deviceScaleFactor: scale });
    await page.setContent(fullHtml, { waitUntil: "networkidle0", timeout: 15000 });
    // Wait for fonts (Google Fonts may load after networkidle)
    await page.evaluate(() => (document as Document & { fonts: { ready: Promise<unknown> } }).fonts.ready);
    const buffer = (await page.screenshot({
      type: "png",
      omitBackground: false,
      fullPage: false,
    })) as Buffer;

    const outRel = `outputs/${safeName}`;
    const outAbs = path.join(REPO_ROOT, outRel);
    await fs.mkdir(path.dirname(outAbs), { recursive: true });
    await fs.writeFile(outAbs, buffer);

    return {
      path: outRel,
      size: buffer.length,
      width,
      height,
    };
  } finally {
    await page.close().catch(() => {});
  }
}

/** Common preset sizes for social platforms */
export const PRESETS = {
  fb_square: { width: 1080, height: 1080 },
  fb_landscape: { width: 1200, height: 630 },
  fb_portrait: { width: 1080, height: 1350 },
  fb_story: { width: 1080, height: 1920 },
  ig_square: { width: 1080, height: 1080 },
  ig_portrait: { width: 1080, height: 1350 },
  ig_story: { width: 1080, height: 1920 },
  linkedin: { width: 1200, height: 627 },
  x_post: { width: 1600, height: 900 },
} as const;

export type PresetName = keyof typeof PRESETS;

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    try {
      const b = await browserPromise;
      await b.close();
    } catch {
      /* ignore */
    }
    browserPromise = null;
  }
}
