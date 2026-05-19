import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOCIAL_PATH = path.join(DATA_DIR, "social-posts.json");

export async function GET() {
  try {
    const raw = await fs.readFile(SOCIAL_PATH, "utf8");
    return new Response(raw, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch {
    return Response.json(
      {
        updated_at: new Date().toISOString().slice(0, 10),
        accounts: [],
        posts: [],
      },
      { status: 200 },
    );
  }
}
