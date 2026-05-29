import { NextRequest } from "next/server";
import {
  getReviewSummary,
  getReviewPreview,
  acceptReview,
  revertReview,
  backupSetup,
  syncAll,
  isConfigured,
} from "@/lib/driveSync";
import { pushTopic, TOPICS } from "@/lib/sheetSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — current pending-review diff (or pending=false if none).
 * `?file=<name>` returns the before/after preview for one file instead.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const file = url.searchParams.get("file");
  if (file) {
    return Response.json(await getReviewPreview(file));
  }
  return Response.json(await getReviewSummary());
}

interface ReviewPostBody {
  action?: string;
  /** When action="accept", optional list of data/ files to push to Sheets/Drive. */
  push_files?: string[];
  /** When action="accept", optional list of outputs/-relative paths to upload to Drive. */
  push_outputs?: string[];
}

/**
 * POST — operate on the pending review:
 *   body { action: "accept" }                              → mark approved (no cloud push)
 *   body { action: "accept", push_files: ["a.csv", ...] }  → push data files + mark approved
 *   body { action: "accept", push_outputs: ["foo.png"] }   → upload outputs/foo.png
 *   body { action: "revert" }                              → restore the checkpoint snapshot
 */
export async function POST(req: NextRequest) {
  let body: ReviewPostBody;
  try {
    body = (await req.json()) as ReviewPostBody;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "accept") {
    const pushFiles = Array.isArray(body.push_files) ? body.push_files : [];
    const pushOutputs = Array.isArray(body.push_outputs) ? body.push_outputs : [];
    if (pushFiles.length === 0 && pushOutputs.length === 0) {
      await acceptReview();
      return Response.json({ ok: true, pushed: [], errors: [] });
    }

    if (!(await isConfigured())) {
      return Response.json(
        {
          ok: false,
          error: "Drive ยังไม่ได้เชื่อม — ติ๊ก confirm ไม่ได้ ต้องตั้ง Drive ก่อน",
        },
        { status: 412 },
      );
    }

    const pushed: {
      file: string;
      target: "sheets" | "drive_backup" | "drive_outputs";
    }[] = [];
    const errors: { file: string; message: string }[] = [];

    // 1) data/ CSVs → Sheets via pushTopic
    const sheetTopics = pushFiles
      .map((f) => TOPICS.find((t) => t.localFile === f))
      .filter((t): t is NonNullable<typeof t> => !!t);
    const otherFiles = pushFiles.filter(
      (f) => !TOPICS.some((t) => t.localFile === f),
    );

    for (const t of sheetTopics) {
      try {
        await pushTopic(t.id);
        pushed.push({ file: t.localFile, target: "sheets" });
      } catch (e) {
        errors.push({ file: t.localFile, message: (e as Error).message });
      }
    }

    // 2) data/ JSONs → Drive backup folder
    if (otherFiles.length > 0) {
      try {
        const r = await backupSetup({ files: otherFiles, force: true });
        for (let i = 0; i < r.uploaded && i < otherFiles.length; i++) {
          pushed.push({ file: otherFiles[i], target: "drive_backup" });
        }
        for (const e of r.errors) {
          errors.push({ file: e.file, message: e.message });
        }
      } catch (e) {
        for (const f of otherFiles) {
          errors.push({ file: f, message: (e as Error).message });
        }
      }
    }

    // 3) outputs/ → Drive (per-category folders) via syncAll(paths)
    if (pushOutputs.length > 0) {
      try {
        const r = await syncAll({ paths: pushOutputs });
        for (const f of r.uploaded) {
          pushed.push({ file: f.file, target: "drive_outputs" });
        }
        for (const f of r.updated) {
          pushed.push({ file: f.file, target: "drive_outputs" });
        }
        for (const e of r.errors) {
          errors.push({ file: e.file, message: e.message });
        }
      } catch (e) {
        for (const f of pushOutputs) {
          errors.push({ file: `outputs/${f}`, message: (e as Error).message });
        }
      }
    }

    // Only clear pending state if everything succeeded — otherwise leave it so
    // the user can retry the failures.
    if (errors.length === 0) {
      await acceptReview();
    }

    return Response.json({
      ok: errors.length === 0,
      pushed,
      errors,
    });
  }

  if (body.action === "revert") {
    try {
      const result = await revertReview();
      return Response.json({ ok: true, ...result });
    } catch (e) {
      return Response.json(
        { ok: false, error: (e as Error).message },
        { status: 400 },
      );
    }
  }

  return Response.json(
    { ok: false, error: `unknown action: ${body.action}` },
    { status: 400 },
  );
}
