import { NextRequest } from "next/server";
import { pushAllTopics, pushTopic } from "@/lib/sheetSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { topic?: string }
 *  - no body / no topic → push every topic
 *  - topic="sales-pipeline" → push just that one
 */
export async function POST(req: NextRequest) {
  let body: { topic?: string } = {};
  try {
    body = (await req.json()) as { topic?: string };
  } catch {
    /* empty body ok */
  }
  try {
    if (body.topic) {
      const r = await pushTopic(body.topic);
      return Response.json({ pushed: [r], errors: [] });
    }
    return Response.json(await pushAllTopics());
  } catch (e) {
    return Response.json(
      { error: (e as Error).message },
      { status: 412 },
    );
  }
}
