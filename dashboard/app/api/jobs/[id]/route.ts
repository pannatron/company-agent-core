import { NextRequest } from "next/server";
import { jobRegistry } from "@/lib/jobQueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/jobs/:id — fetch a single job's current state. */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const job = jobRegistry.get(id);
  if (!job) {
    return Response.json({ error: "job not found" }, { status: 404 });
  }
  return Response.json({ job });
}

/** DELETE /api/jobs/:id — abort a running job. Idempotent. */
export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const ok = jobRegistry.abort(id);
  if (!ok) {
    return Response.json(
      { error: "job not running or already finished" },
      { status: 409 },
    );
  }
  return Response.json({ ok: true });
}
