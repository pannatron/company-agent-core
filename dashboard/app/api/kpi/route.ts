import { readKpiJson } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await readKpiJson();
    return Response.json(data);
  } catch (err) {
    return Response.json(
      { error: `ไม่สามารถอ่าน data/kpi.json: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
