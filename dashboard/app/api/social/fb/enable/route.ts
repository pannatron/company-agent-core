import { NextRequest } from "next/server";
import { enableFbTrigger } from "@/lib/fbControl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { interval_min?: number } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* empty ok */
  }
  try {
    return Response.json(await enableFbTrigger(body.interval_min ?? 5));
  } catch (e) {
    return Response.json(
      { error: (e as Error).message },
      { status: 412 },
    );
  }
}
