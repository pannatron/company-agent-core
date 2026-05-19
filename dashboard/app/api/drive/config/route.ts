import { NextRequest } from "next/server";
import {
  buildAppsScriptTemplate,
  clearConnection,
  detectUrlKind,
  extractFolderId,
  testAndSaveUrl,
} from "@/lib/driveSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET → return Apps Script template that user pastes into script.google.com.
 *   Optional ?folder_id=<id> bakes a target folder into the script, so
 *   uploads land in that specific Drive folder instead of "Virtual AI Company/".
 *   Also returns the detected url kind if ?url= is supplied (for live preview).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const folderId = url.searchParams.get("folder_id") || undefined;
  const probe = url.searchParams.get("url") || "";

  return Response.json({
    apps_script: buildAppsScriptTemplate(folderId),
    folder_id: folderId || null,
    detected: probe ? detectUrlKind(probe) : null,
    detected_folder_id: probe ? extractFolderId(probe) : null,
  });
}

/** POST { url } — test the URL, save config if it works */
export async function POST(req: NextRequest) {
  let body: { url?: string };
  try {
    body = (await req.json()) as { url?: string };
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.url || typeof body.url !== "string") {
    return Response.json({ ok: false, error: "ต้องส่ง url" }, { status: 400 });
  }
  const result = await testAndSaveUrl(body.url.trim());
  return Response.json(result, { status: result.ok ? 200 : 400 });
}

/** DELETE — disconnect Drive */
export async function DELETE() {
  await clearConnection();
  return Response.json({ ok: true });
}
