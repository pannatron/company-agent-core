import { NextRequest } from "next/server";
import { pullAllTopics, pullTopic } from "@/lib/sheetSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST { topic?: string }
 *  - no body / no topic → pull every topic
 *  - topic="sales-pipeline" → pull just that one
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
      const r = await pullTopic(body.topic);
      return Response.json({ pulled: [r], errors: [] });
    }
    return Response.json(await pullAllTopics());
  } catch (e) {
    return Response.json(
      { error: (e as Error).message },
      { status: 412 },
    );
  }
}
