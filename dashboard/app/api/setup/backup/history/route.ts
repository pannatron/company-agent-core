import { NextRequest } from "next/server";
import {
  listSnapshots,
  restoreSnapshot,
  deleteSnapshot,
  snapshotDataDir,
} from "@/lib/driveSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — list local snapshots (newest first) */
export async function GET() {
  return Response.json({ ok: true, snapshots: await listSnapshots() });
}

/**
 * POST — operate on snapshots:
 *   body { action: "restore", timestamp }  → restore that snapshot into data/
 *   body { action: "delete",  timestamp }  → remove a snapshot
 *   body { action: "snapshot" }            → take a manual snapshot now
 */
export async function POST(req: NextRequest) {
  let body: { action?: string; timestamp?: string };
  try {
    body = (await req.json()) as { action?: string; timestamp?: string };
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const action = body.action;

  if (action === "snapshot") {
    try {
      const snap = await snapshotDataDir("manual");
      if (!snap) {
        return Response.json({
          ok: false,
          error: "ไม่มีไฟล์ใน data/ ให้ snapshot",
        });
      }
      return Response.json({ ok: true, snapshot: snap });
    } catch (e) {
      return Response.json(
        { ok: false, error: (e as Error).message },
        { status: 500 },
      );
    }
  }

  if (!body.timestamp) {
    return Response.json(
      { ok: false, error: "timestamp required" },
      { status: 400 },
    );
  }

  if (action === "restore") {
    try {
      const result = await restoreSnapshot(body.timestamp);
      return Response.json({ ok: true, ...result });
    } catch (e) {
      return Response.json(
        { ok: false, error: (e as Error).message },
        { status: 500 },
      );
    }
  }

  if (action === "delete") {
    try {
      await deleteSnapshot(body.timestamp);
      return Response.json({ ok: true });
    } catch (e) {
      return Response.json(
        { ok: false, error: (e as Error).message },
        { status: 500 },
      );
    }
  }

  return Response.json(
    { ok: false, error: `unknown action: ${action}` },
    { status: 400 },
  );
}
