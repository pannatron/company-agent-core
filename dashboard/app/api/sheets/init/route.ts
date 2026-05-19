import { initAllSheets } from "@/lib/sheetSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST — create every topic's Sheet on Drive (idempotent). */
export async function POST() {
  try {
    const r = await initAllSheets();
    return Response.json(r);
  } catch (e) {
    return Response.json(
      { error: (e as Error).message },
      { status: 412 },
    );
  }
}
