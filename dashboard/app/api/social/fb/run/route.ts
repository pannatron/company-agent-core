import { runFbSchedulerNow } from "@/lib/fbControl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — kick the scheduler immediately (debug/manual). Same logic the time-trigger runs. */
export async function POST() {
  try {
    return Response.json(await runFbSchedulerNow());
  } catch (e) {
    return Response.json(
      { error: (e as Error).message },
      { status: 412 },
    );
  }
}
