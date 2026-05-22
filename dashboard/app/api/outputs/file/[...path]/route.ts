import { NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@/lib/repo";
import { mimeForExt } from "@/lib/mime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OUTPUTS_DIR = path.join(REPO_ROOT, "outputs");

interface RouteParams {
  params: Promise<{ path: string[] }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { path: parts } = await params;
  if (!parts?.length) {
    return new Response("missing path", { status: 400 });
  }

  // Resolve and verify the file is inside outputs/
  const target = path.resolve(OUTPUTS_DIR, ...parts.map(decodeURIComponent));
  if (!target.startsWith(OUTPUTS_DIR + path.sep) && target !== OUTPUTS_DIR) {
    return new Response("forbidden", { status: 403 });
  }

  let buf: Buffer;
  try {
    buf = await fs.readFile(target);
  } catch {
    return new Response("not found", { status: 404 });
  }

  const ext = path.extname(target);
  const ct = mimeForExt(ext);
  const inlineable = /^(image|text|application\/(pdf|json))/.test(ct);
  const filename = path.basename(target);

  return new Response(buf, {
    headers: {
      "content-type": ct,
      "content-disposition": `${inlineable ? "inline" : "attachment"}; filename="${encodeURIComponent(filename)}"`,
      "cache-control": "no-store",
    },
  });
}
