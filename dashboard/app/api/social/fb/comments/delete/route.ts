import { NextRequest } from "next/server";
import { deleteComment, fetchCommentsFromSheet } from "@/lib/fbControl";
import { rowsToComments, saveComments } from "@/lib/socialCommentsSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { comment_id, replied_by? } — DELETE on FB + update local cache. */
export async function POST(req: NextRequest) {
  let body: { comment_id?: string; replied_by?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.comment_id) {
    return Response.json({ error: "comment_id required" }, { status: 400 });
  }
  try {
    await deleteComment({
      comment_id: body.comment_id,
      replied_by: body.replied_by,
    });
    try {
      const { headers, rows } = await fetchCommentsFromSheet();
      await saveComments(rowsToComments(headers, rows));
    } catch {
      /* ignore — delete already succeeded */
    }
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { ok: false, error: (e as Error).message },
      { status: 412 },
    );
  }
}
