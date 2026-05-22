import { NextRequest } from "next/server";
import { postNow } from "@/lib/fbControl";
import { pullSocialPosts } from "@/lib/socialPostsSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST {post_id} — publish immediately, then auto-pull so local JSON reflects the new status/external_url without a separate "Pull" click. */
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
    const r = await postNow(body.post_id);
    // Auto-pull so the dashboard immediately reflects status=published +
    // external_url without the user needing to click Pull. Best-effort —
    // the FB post already succeeded if we got here, so don't fail the
    // request if pull errors.
    let pulled: number | undefined;
    try {
      const p = await pullSocialPosts();
      pulled = p.posts;
    } catch {
      /* pull is informational only */
    }
    return Response.json({ ok: true, ...r, auto_pulled: pulled });
  } catch (e) {
    return Response.json(
      { ok: false, error: (e as Error).message },
      { status: 412 },
    );
  }
}
