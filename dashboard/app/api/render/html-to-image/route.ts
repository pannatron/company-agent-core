import { NextRequest } from "next/server";
import {
  PRESETS,
  PresetName,
  renderHtmlToImage,
  type RenderOptions,
} from "@/lib/htmlRender";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Puppeteer launch can take a few seconds; allow generous timeout
export const maxDuration = 60;

interface RequestBody {
  /** HTML body or full document. Required. */
  html: string;
  /** Filename to save (must end with .png). Saved to outputs/<filename>; categorizer moves later. */
  filename: string;
  /** Pixel width (defaults 1080). Ignored if `preset` is given. */
  width?: number;
  /** Pixel height (defaults 1080). Ignored if `preset` is given. */
  height?: number;
  /** Convenience preset: "fb_square" | "fb_landscape" | "ig_story" | ... */
  preset?: PresetName;
  /** Auto-inject Tailwind CDN (default true) */
  tailwind?: boolean;
  /** Google Fonts spec, e.g. "Sarabun:wght@400;700" */
  fonts?: string;
  /** Device scale factor for high-DPI export (default 2) */
  scale?: number;
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.html) return Response.json({ error: "html required" }, { status: 400 });
  if (!body.filename) return Response.json({ error: "filename required" }, { status: 400 });

  const opts: RenderOptions = {
    html: body.html,
    filename: body.filename,
    tailwind: body.tailwind,
    fonts: body.fonts,
    scale: body.scale,
  };
  if (body.preset && PRESETS[body.preset]) {
    opts.width = PRESETS[body.preset].width;
    opts.height = PRESETS[body.preset].height;
  } else {
    opts.width = body.width;
    opts.height = body.height;
  }

  try {
    const result = await renderHtmlToImage(opts);
    return Response.json(result);
  } catch (e) {
    return Response.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}

export async function GET() {
  return Response.json({
    presets: PRESETS,
    usage: "POST { html, filename, [preset|width,height], [tailwind], [fonts], [scale] }",
  });
}
