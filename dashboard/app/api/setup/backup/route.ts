import { backupSetup, getBackupStatus, isConfigured } from "@/lib/driveSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — show last backup time + count on Drive */
export async function GET() {
  return Response.json(await getBackupStatus());
}

/** POST — upload setup files to "⚙ Setup Backup" folder on Drive */
export async function POST() {
  if (!(await isConfigured())) {
    return Response.json(
      { error: "Drive ยังไม่ได้เชื่อม — กด ‘เชื่อม Drive’ ก่อน" },
      { status: 412 },
    );
  }
  try {
    const result = await backupSetup();
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return Response.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
