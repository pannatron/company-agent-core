import { getFbStatus } from "@/lib/fbControl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getFbStatus());
  } catch (e) {
    return Response.json(
      { error: (e as Error).message },
      { status: 412 },
    );
  }
}
