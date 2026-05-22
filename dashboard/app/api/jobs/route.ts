import { jobRegistry } from "@/lib/jobQueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/jobs — snapshot of active + recent jobs across all rooms. */
export async function GET() {
  return Response.json({ jobs: jobRegistry.list() });
}
