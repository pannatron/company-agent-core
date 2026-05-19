import { NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/csv",
  "text/plain",
  "application/json",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
const ALLOWED_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".webp", ".gif",
  ".pdf", ".csv", ".txt", ".json", ".xls", ".xlsx", ".md",
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
    return json({ error: `ไฟล์ใหญ่เกิน 10 MB (${file.size} bytes)` }, 413);
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

  const safeName = file.name
    .replace(/[^a-zA-Z0-9._฀-๿-]/g, "_")
    .slice(0, 80);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${stamp}-${safeName || "upload"}`;
  const dest = path.join(UPLOAD_DIR, filename);

  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(dest, buf);

  const relativePath = `outputs/uploads/${filename}`;
  return json({
    path: relativePath,
    url: `/api/outputs/file/uploads/${encodeURIComponent(filename)}`,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}
