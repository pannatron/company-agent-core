import { NextRequest } from "next/server";
import { backupSetup, getBackupStatus, isConfigured } from "@/lib/driveSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — show last backup time + count on Drive */
export async function GET() {
  return Response.json(await getBackupStatus());
}

/**
 * POST — upload setup files to "⚙ Setup Backup" folder on Drive.
 * Pass `?force=1` (or JSON body `{ force: true }`) to bypass safety guards
 * (empty file, header-only CSV, > 50% shrink).
 */
export async function POST(req: NextRequest) {
  if (!(await isConfigured())) {
    return Response.json(
      { error: "Drive ยังไม่ได้เชื่อม — กด ‘เชื่อม Drive’ ก่อน" },
      { status: 412 },
    );
  }

  const url = new URL(req.url);
  let force = url.searchParams.get("force") === "1";
  if (!force) {
    try {
      const body = await req.json();
      if (body && typeof body === "object" && body.force === true) force = true;
    } catch {
      /* no body — that's fine */
    }
  }

  try {
    const result = await backupSetup({ force });
    return Response.json({ ok: true, forced: force, ...result });
  } catch (e) {
    return Response.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
