import { getStatus } from "@/lib/driveSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getStatus());
}
