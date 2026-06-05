import { NextRequest } from "next/server";
import {
  getOutputsPullReview,
  pullOutputsFromDrive,
  isConfigured,
} from "@/lib/driveSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — reverse diff: which media files on Drive is this server missing (or has
 * at a different size)? Junk (logs/intermediates) is filtered out.
 */
export async function GET() {
  if (!(await isConfigured())) {
    return Response.json(
      { ok: false, error: "Drive ยังไม่ได้เชื่อม — กด ‘เชื่อม Drive’ ก่อน" },
      { status: 412 },
    );
  }
  const review = await getOutputsPullReview();
  return Response.json(review, { status: review.ok ? 200 : 412 });
}

interface PullBody {
  file_ids?: string[];
}

/** POST { file_ids } — download the selected Drive files into local outputs/. */
export async function POST(req: NextRequest) {
  if (!(await isConfigured())) {
    return Response.json(
      { ok: false, error: "Drive ยังไม่ได้เชื่อม — กด ‘เชื่อม Drive’ ก่อน" },
      { status: 412 },
    );
  }
  let body: PullBody;
  try {
    body = (await req.json()) as PullBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const ids = Array.isArray(body.file_ids) ? body.file_ids.filter(Boolean) : [];
  if (ids.length === 0) {
    return Response.json(
      { ok: false, error: "ต้องส่ง file_ids อย่างน้อย 1 รายการ" },
      { status: 400 },
    );
  }
  try {
    const result = await pullOutputsFromDrive(ids);
    return Response.json({ ok: result.errors.length === 0, ...result });
  } catch (e) {
    return Response.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
