import { NextRequest } from "next/server";
import { replyComment, fetchCommentsFromSheet } from "@/lib/fbControl";
import { rowsToComments, saveComments } from "@/lib/socialCommentsSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { comment_id, message, replied_by? } — reply to a FB comment via
 * Apps Script + refresh local cache so the panel reflects the new status.
 */
export async function POST(req: NextRequest) {
  let body: { comment_id?: string; message?: string; replied_by?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.comment_id) {
    return Response.json({ error: "comment_id required" }, { status: 400 });
  }
  if (!body.message || !body.message.trim()) {
    return Response.json({ error: "message required" }, { status: 400 });
  }
  try {
    const r = await replyComment({
      comment_id: body.comment_id,
      message: body.message,
      replied_by: body.replied_by,
    });
    // Refresh local cache (best-effort — reply already succeeded on FB)
    try {
      const { headers, rows } = await fetchCommentsFromSheet();
      await saveComments(rowsToComments(headers, rows));
    } catch {
      /* ignore — reply still succeeded */
    }
    return Response.json({ ok: true, ...r });
  } catch (e) {
    return Response.json(
      { ok: false, error: (e as Error).message },
      { status: 412 },
    );
  }
}
