import { syncComments, fetchCommentsFromSheet } from "@/lib/fbControl";
import { rowsToComments, saveComments } from "@/lib/socialCommentsSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — kick FB → Sheet → local JSON sync.
 *   1. Apps Script polls FB for new comments on every published post
 *   2. New rows appended to "comments" tab
 *   3. Pull the whole tab → data/social-comments.json
 *
 * Returns: { new_count, polled, total } where total is the local file count
 * after the pull. The dashboard panel uses this to badge the inbox.
 */
export async function POST() {
  try {
    const sync = await syncComments();
    const { headers, rows } = await fetchCommentsFromSheet();
    const comments = rowsToComments(headers, rows);
    await saveComments(comments);
    return Response.json({
      ok: true,
      new_count: sync.new_count,
      polled: sync.polled,
      total: comments.length,
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: (e as Error).message },
      { status: 412 },
    );
  }
}
