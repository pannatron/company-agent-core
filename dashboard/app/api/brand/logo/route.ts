import { NextRequest } from "next/server";
import {
  deleteLogo,
  findLogo,
  readLogoBytes,
  saveLogo,
} from "@/lib/brandAssets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — logos shouldn't be huge

/** GET — serve the logo file inline (for <img src="/api/brand/logo">). Status info if ?info=1. */
export async function GET(req: NextRequest) {
  const wantInfo = new URL(req.url).searchParams.get("info") === "1";
  if (wantInfo) {
    return Response.json(await findLogo());
  }
  const data = await readLogoBytes();
  if (!data) {
    return new Response("no logo set", { status: 404 });
  }
  return new Response(data.buffer, {
    headers: {
      "content-type": data.mimeType,
      "cache-control": "no-store",
    },
  });
}

/** POST multipart with `file` field — saves as data/company-logo.<ext>. */
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "expected multipart/form-data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "missing 'file' field" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: `ไฟล์ใหญ่เกิน ${Math.round(MAX_BYTES / 1024 / 1024)} MB` },
      { status: 413 },
    );
  }
  const buf = Buffer.from(await file.arrayBuffer());
  try {
    const info = await saveLogo(buf, file.type || "image/png");
    return Response.json({ ok: true, ...info });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 415 });
  }
}

/** DELETE — remove logo file(s). */
export async function DELETE() {
  await deleteLogo();
  return Response.json({ ok: true });
}
