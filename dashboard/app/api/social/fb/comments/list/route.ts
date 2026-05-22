import { loadComments } from "@/lib/socialCommentsSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — return cached comments from data/social-comments.json. Fast, no
 * network. Use POST /comments/sync to refresh the cache from FB first.
 */
export async function GET() {
  try {
    const comments = await loadComments();
    return Response.json({ ok: true, comments });
  } catch (e) {
    return Response.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
