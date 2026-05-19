import { NextRequest } from "next/server";
import { dumpTranscript } from "@/lib/chatStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const rel = await dumpTranscript(id);
  if (!rel) {
    return Response.json(
      { ok: false, error: "ยังไม่มีข้อความให้บันทึก" },
      { status: 400 },
    );
  }
  return Response.json({ ok: true, path: rel });
}
