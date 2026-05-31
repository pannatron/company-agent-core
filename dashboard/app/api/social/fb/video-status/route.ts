import { NextRequest } from "next/server";
import { videoStatus } from "@/lib/fbControl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { video_id } — check a Facebook video's processing state + real feed
 * permalink. `video_id` is the numeric id from a /videos/<id> external_url.
 */
export async function POST(req: NextRequest) {
  let body: { video_id?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.video_id) {
    return Response.json({ error: "video_id required" }, { status: 400 });
  }
  try {
    const r = await videoStatus(body.video_id);
    return Response.json({ ok: true, ...r });
  } catch (e) {
    return Response.json(
      { ok: false, error: (e as Error).message },
      { status: 412 },
    );
  }
}
