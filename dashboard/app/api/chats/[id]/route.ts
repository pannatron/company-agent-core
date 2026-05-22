import { NextRequest } from "next/server";
import {
  deleteChat,
  loadChatMessages,
  loadChatMeta,
  titleFor,
} from "@/lib/chatStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/chats/:id?limit=30&before=<iso>
 *
 *   limit  — return at most this many messages (default 60). Server caps at 500.
 *   before — return only messages whose timestamp < this ISO string. Used when
 *            the UI scrolls up and asks for the next page of older messages.
 *            Reads from the gzipped archive transparently if needed.
 *
 * Response also includes meta + a `has_more` flag so the UI knows whether to
 * keep paging.
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const before = url.searchParams.get("before") ?? undefined;
  const limit = Math.min(500, Math.max(1, Number(limitParam) || 60));

  const meta = await loadChatMeta(id);
  if (!meta) {
    return Response.json({
      id,
      title: titleFor(id),
      messages: [],
      created_at: null,
      updated_at: null,
      message_count: 0,
      archived_count: 0,
      has_more: false,
    });
  }

  const messages = await loadChatMessages(id, { limit, before });
  // has_more = there exists at least one message earlier than the oldest we returned
  const oldest = messages[0]?.timestamp;
  const totalLoadable = meta.message_count;
  // If we returned `limit` and total > limit, there's more; if we used `before`,
  // there's more whenever the oldest returned isn't the very first message overall.
  const has_more = oldest
    ? messages.length === limit && totalLoadable > messages.length
    : false;

  return Response.json({
    ...meta,
    messages,
    has_more,
  });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  await deleteChat(id);
  return Response.json({ ok: true });
}
