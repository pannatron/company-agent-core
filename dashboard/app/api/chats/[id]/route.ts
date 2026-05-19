import { NextRequest } from "next/server";
import { deleteChat, loadChat, titleFor } from "@/lib/chatStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const rec = await loadChat(id);
  if (!rec) {
    return Response.json({
      id,
      title: titleFor(id),
      messages: [],
      created_at: null,
      updated_at: null,
    });
  }
  return Response.json(rec);
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  await deleteChat(id);
  return Response.json({ ok: true });
}
