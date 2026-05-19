import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Repo root = parent of dashboard/.
 * lib/repo.ts → dashboard/lib → dashboard → REPO_ROOT
 */
export const REPO_ROOT = path.resolve(process.cwd(), "..");
export const DATA_DIR = path.join(REPO_ROOT, "data");
export const AGENTS_DIR = path.join(REPO_ROOT, ".claude", "agents");
export const CLAUDE_MD = path.join(REPO_ROOT, ".claude", "CLAUDE.md");

export async function readDataFile(filename: string): Promise<string> {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "");
  return fs.readFile(path.join(DATA_DIR, safe), "utf8");
}

export async function readAgentFile(slug: string): Promise<string> {
  const safe = slug.replace(/[^a-z0-9-]/g, "");
  return fs.readFile(path.join(AGENTS_DIR, `${safe}.md`), "utf8");
}

export async function readClaudeMd(): Promise<string> {
  try {
    return await fs.readFile(CLAUDE_MD, "utf8");
  } catch {
    return "";
  }
}

export async function readKpiJson(): Promise<unknown> {
  const raw = await readDataFile("kpi.json");
  return JSON.parse(raw);
}
