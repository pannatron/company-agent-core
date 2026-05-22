import { NextRequest } from "next/server";
import { deletePost } from "@/lib/fbControl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST {post_id} — delete a published FB post (accepts ext URL or "pageId_postId"). */
export async function POST(req: NextRequest) {
  let body: { post_id?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.post_id) {
    return Response.json({ error: "post_id required" }, { status: 400 });
  }
  try {
    const r = await deletePost(body.post_id);
    return Response.json({ ok: true, ...r });
  } catch (e) {
    return Response.json(
      { ok: false, error: (e as Error).message },
      { status: 412 },
    );
  }
}
