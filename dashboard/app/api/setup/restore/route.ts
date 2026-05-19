import { isConfigured, restoreFromDrive } from "@/lib/driveSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — pull backup files from Drive into local data/ */
export async function POST() {
  if (!(await isConfigured())) {
    return Response.json(
      { error: "Drive ยังไม่ได้เชื่อม — กด ‘เชื่อม Drive’ ก่อน" },
      { status: 412 },
    );
  }
  try {
    const result = await restoreFromDrive();
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return Response.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
