import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TASKS_PATH = path.join(DATA_DIR, "tasks.json");

export async function GET() {
  try {
    const raw = await fs.readFile(TASKS_PATH, "utf8");
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
        boards: [
          {
            id: "default",
            name: "งานทั้งหมด",
            columns: [
              { id: "backlog", name: "Backlog" },
              { id: "doing", name: "กำลังทำ" },
              { id: "review", name: "รอตรวจ" },
              { id: "done", name: "เสร็จ" },
            ],
          },
        ],
        tasks: [],
      },
      { status: 200 },
    );
  }
}
