import { NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
// @ts-expect-error — heic-convert ships without types
import heicConvert from "heic-convert";
import { REPO_ROOT } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB (HEIC from iPhone can be large)

/** MIME types we accept directly. HEIC variants are converted to JPG before saving. */
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
  "application/pdf",
  "text/csv",
  "text/plain",
  "application/json",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const ALLOWED_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif",
  ".heic", ".heif",
  ".pdf", ".csv", ".txt", ".json", ".xls", ".xlsx", ".md",
]);

/** Extensions that we transcode to JPG on the fly (FB / most platforms don't accept HEIC). */
const HEIC_EXT = new Set([".heic", ".heif"]);
const HEIC_MIME = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);

const UPLOAD_DIR = path.join(REPO_ROOT, "outputs", "uploads");

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "expected multipart/form-data" }, 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return json({ error: "missing 'file' field" }, 400);
  }
  if (file.size > MAX_BYTES) {
    return json(
      { error: `ไฟล์ใหญ่เกิน ${Math.round(MAX_BYTES / 1024 / 1024)} MB (${file.size} bytes)` },
      413,
    );
  }
  const ext = path.extname(file.name).toLowerCase();
  const mimeOk = file.type && ALLOWED_MIME.has(file.type);
  const extOk = ext && ALLOWED_EXT.has(ext);
  if (!mimeOk && !extOk) {
    return json(
      { error: `type not allowed: ${file.type || "(empty)"} / ext: ${ext || "(none)"}` },
      415,
    );
  }

  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  const isHeic = HEIC_EXT.has(ext) || HEIC_MIME.has(file.type);

  // Strip the original extension so we can append the final one after conversion
  const baseName = file.name
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._฀-๿-]/g, "_")
    .slice(0, 80);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  let outBuf: Buffer = Buffer.from(await file.arrayBuffer());
  let finalExt = ext || ".bin";
  let finalMime = file.type || "application/octet-stream";

  if (isHeic) {
    try {
      // heic-convert returns ArrayBuffer; wrap as Buffer for fs.writeFile
      const jpgArray: ArrayBuffer = await heicConvert({
        buffer: outBuf,
        format: "JPEG",
        quality: 0.92,
      });
      outBuf = Buffer.from(jpgArray);
      finalExt = ".jpg";
      finalMime = "image/jpeg";
    } catch (e) {
      return json(
        { error: `แปลง HEIC → JPG ไม่ได้: ${(e as Error).message}` },
        500,
      );
    }
  }

  const filename = `${stamp}-${baseName || "upload"}${finalExt}`;
  const dest = path.join(UPLOAD_DIR, filename);
  await fs.writeFile(dest, outBuf);

  const relativePath = `outputs/uploads/${filename}`;
  return json({
    path: relativePath,
    url: `/api/outputs/file/uploads/${encodeURIComponent(filename)}`,
    name: file.name,
    mimeType: finalMime,
    size: outBuf.length,
    converted: isHeic ? "heic→jpg" : undefined,
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
