import { NextRequest } from "next/server";
import {
  deleteOutputs,
  undoDelete,
  getTrashStatus,
} from "@/lib/driveSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — is there a deleted batch waiting to be undone? */
export async function GET() {
  return Response.json(await getTrashStatus());
}

/**
 * POST
 *   { action: "delete", paths: string[] }  → move to outputs/.trash + trash on Drive
 *   { action: "undo" }                     → restore the last deleted batch
 */
export async function POST(req: NextRequest) {
  let body: { action?: string; paths?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  try {
    if (body.action === "undo") {
      const result = await undoDelete();
      return Response.json({ ok: true, ...result });
    }

    if (body.action === "delete") {
      const paths = Array.isArray(body.paths)
        ? body.paths.filter((p): p is string => typeof p === "string")
        : [];
      if (paths.length === 0) {
        return Response.json(
          { ok: false, error: "ไม่มีไฟล์ที่จะลบ" },
          { status: 400 },
        );
      }
      const result = await deleteOutputs(paths, new Date().toISOString());
      return Response.json({ ok: true, ...result });
    }

    return Response.json(
      { ok: false, error: `unknown action: ${body.action}` },
      { status: 400 },
    );
  } catch (e) {
    return Response.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
