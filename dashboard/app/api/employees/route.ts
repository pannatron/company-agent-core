import { EMPLOYEES } from "@/lib/employees";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({ employees: EMPLOYEES });
}
