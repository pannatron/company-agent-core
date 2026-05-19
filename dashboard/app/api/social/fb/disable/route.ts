import { disableFbTrigger } from "@/lib/fbControl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await disableFbTrigger();
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: (e as Error).message },
      { status: 412 },
    );
  }
}
