import { getSheetsStatus } from "@/lib/sheetSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getSheetsStatus());
}
