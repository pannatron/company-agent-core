import { organize } from "@/lib/categorizer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const result = await organize();
  return Response.json(result);
}
