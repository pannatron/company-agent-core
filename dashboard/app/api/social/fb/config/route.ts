import { NextRequest } from "next/server";
import { setFbConfig } from "@/lib/fbControl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: {
    page_id?: string;
    page_token?: string;
    poll_interval_min?: number;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  try {
    await setFbConfig(body);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: (e as Error).message },
      { status: 412 },
    );
  }
}
