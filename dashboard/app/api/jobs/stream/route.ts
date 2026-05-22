import { NextRequest } from "next/server";
import { jobRegistry, type JobEvent } from "@/lib/jobQueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/jobs/stream — Server-Sent Events feed of every job lifecycle
 * event across all chat rooms. Clients in any tab can subscribe and learn
 * when work in another room starts/finishes without polling.
 *
 * Wire format: standard SSE. Each event is a single `data: <json>\n\n`
 * line. Snapshot of current jobs is emitted on connect.
 */
export async function GET(req: NextRequest) {
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (evt: JobEvent) => {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(evt)}\n\n`),
          );
        } catch {
          /* controller closed — cleanup handled by abort listener */
        }
      };

      unsubscribe = jobRegistry.subscribe(send);

      // Comment lines keep proxies/CDNs from buffering the stream closed.
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          /* ignore */
        }
      }, 25_000);
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  // If the client disconnects, the runtime aborts the request — we mirror
  // that into the stream's cancel() above by listening on the signal too.
  req.signal.addEventListener("abort", () => {
    unsubscribe?.();
    if (heartbeat) clearInterval(heartbeat);
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
