import { isConfigured, syncAll } from "@/lib/driveSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await isConfigured())) {
    return Response.json(
      { error: "Drive ยังไม่ได้เชื่อม — กด ‘เชื่อม Drive’ ก่อน" },
      { status: 412 },
    );
  }
  const result = await syncAll();
  return Response.json(result);
}
