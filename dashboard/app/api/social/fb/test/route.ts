import { NextRequest } from "next/server";
import { testFbPost } from "@/lib/fbControl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { message?: string; image_url?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.message) {
    return Response.json({ error: "message required" }, { status: 400 });
  }
  try {
    return Response.json(
      await testFbPost({ message: body.message, image_url: body.image_url }),
    );
  } catch (e) {
    return Response.json(
      { error: (e as Error).message },
      { status: 412 },
    );
  }
}
