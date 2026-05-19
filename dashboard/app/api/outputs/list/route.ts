import { NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "@/lib/repo";
import { CATEGORIES, getCategory, MISC_CATEGORY } from "@/lib/categorizer";
import { getSyncedMap } from "@/lib/driveSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OUTPUTS_DIR = path.join(REPO_ROOT, "outputs");

export async function GET(req: NextRequest) {
  await fs.mkdir(OUTPUTS_DIR, { recursive: true });
  const since = Number(new URL(req.url).searchParams.get("since")) || 0;
  const includeUploads =
    new URL(req.url).searchParams.get("includeUploads") === "1";

  const all = await walk(OUTPUTS_DIR, OUTPUTS_DIR);
  const syncedMap = await getSyncedMap();

  const filtered = all
    .filter((f) => f.mtime > since)
    .filter((f) => includeUploads || !f.path.startsWith("uploads/"))
    .map((f) => {
      const synced = syncedMap[`outputs/${f.path}`];
      return {
        ...f,
        synced: !!synced,
        web_link: synced?.web_link,
      };
    })
    .sort((a, b) => b.mtime - a.mtime);

  // Compose category list (only categories with files, plus all defined ones for empty state)
  const categoryMeta = [...CATEGORIES, MISC_CATEGORY].map((c) => ({
    id: c.id,
    label: c.label,
    icon: c.icon,
    description: c.description,
  }));

  return Response.json({
    files: filtered,
    categories: categoryMeta,
  });
}

interface Entry {
  path: string;
  name: string;
  size: number;
  mtime: number;
  mimeType: string;
  category: string;
}

async function walk(root: string, dir: string): Promise<Entry[]> {
  let items: import("node:fs").Dirent[] = [];
  try {
    items = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: Entry[] = [];
  for (const it of items) {
    if (it.name.startsWith(".")) continue;
    const full = path.join(dir, it.name);
    if (it.isDirectory()) {
      out.push(...(await walk(root, full)));
    } else if (it.isFile()) {
      const stat = await fs.stat(full);
      const rel = path.relative(root, full).split(path.sep).join("/");
      const parts = rel.split("/");
      const cat =
        parts.length > 1
          ? getCategory(parts[0]).id
          : MISC_CATEGORY.id;
      out.push({
        path: rel,
        name: it.name,
        size: stat.size,
        mtime: stat.mtimeMs,
        mimeType: mimeForExt(path.extname(it.name)),
        category: cat,
      });
    }
  }
  return out;
}

export function mimeForExt(ext: string): string {
  const map: Record<string, string> = {
    ".md": "text/markdown; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".html": "text/html; charset=utf-8",
  };
  return map[ext.toLowerCase()] || "application/octet-stream";
}
