import { NextRequest } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/lib/repo";
import { withFileLock } from "@/lib/fileLock";
import { pushSocialPosts } from "@/lib/socialPostsSync";

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

/**
 * PATCH /api/social  body { post_id, scheduled_at, status? }
 *
 * Schedule (or reschedule) a post from the dashboard without going through the
 * chat agent. Sets scheduled_at + status (default "scheduled") on the local
 * JSON, then pushes the whole queue to Sheets so the Apps Script time-trigger
 * picks the row up and publishes it when due.
 *
 * scheduled_at must be a full ISO datetime (the UI sends `new Date(local).toISOString()`
 * so the stored instant is timezone-correct regardless of where Apps Script runs).
 * The op is atomic: if the Sheet push fails (e.g. asset not on Drive yet) the
 * local status/time is reverted and a 502 is returned, so a card never shows
 * "scheduled" while the publisher Sheet never saw it.
 */
export async function PATCH(req: NextRequest) {
  let body: { post_id?: string; scheduled_at?: string; status?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const postId = body.post_id?.trim();
  if (!postId) {
    return Response.json({ error: "post_id required" }, { status: 400 });
  }
  const scheduledAt = body.scheduled_at?.trim();
  if (!scheduledAt) {
    return Response.json({ error: "scheduled_at required" }, { status: 400 });
  }
  if (Number.isNaN(Date.parse(scheduledAt))) {
    return Response.json(
      { error: `scheduled_at "${scheduledAt}" ไม่ใช่ ISO datetime ที่ถูกต้อง` },
      { status: 400 },
    );
  }
  const nextStatus = (body.status ?? "scheduled").trim();
  if (!["scheduled", "approved", "ready_for_review", "draft"].includes(nextStatus)) {
    return Response.json(
      { error: `status "${nextStatus}" ไม่รองรับสำหรับ schedule` },
      { status: 400 },
    );
  }

  type Outcome =
    | { kind: "updated"; id: string; prevStatus: string; prevScheduledAt: string | null }
    | { kind: "not_found" }
    | { kind: "published_blocked"; status: string };
  let outcome: Outcome = { kind: "not_found" };

  interface PostRow {
    id: string;
    status: string;
    scheduled_at?: string | null;
  }

  /** Apply (or revert) a post's status + scheduled_at under the file lock. */
  const writeFields = async (id: string, status: string, when: string | null) =>
    withFileLock(SOCIAL_PATH, async () => {
      const raw = await fs.readFile(SOCIAL_PATH, "utf8");
      const data = JSON.parse(raw) as {
        updated_at: string;
        accounts: unknown[];
        posts: PostRow[];
      };
      const target = data.posts.find((p) => p.id === id);
      if (!target) return;
      target.status = status;
      target.scheduled_at = when;
      data.updated_at = new Date().toISOString().slice(0, 10);
      await fs.writeFile(SOCIAL_PATH, JSON.stringify(data, null, 2), "utf8");
    });

  await withFileLock(SOCIAL_PATH, async () => {
    let raw: string;
    try {
      raw = await fs.readFile(SOCIAL_PATH, "utf8");
    } catch {
      return;
    }
    const data = JSON.parse(raw) as {
      updated_at: string;
      accounts: unknown[];
      posts: PostRow[];
    };
    const target = data.posts.find((p) => p.id === postId);
    if (!target) {
      outcome = { kind: "not_found" };
      return;
    }
    if (target.status === "published") {
      outcome = { kind: "published_blocked", status: target.status };
      return;
    }
    outcome = {
      kind: "updated",
      id: target.id,
      prevStatus: target.status,
      prevScheduledAt: target.scheduled_at ?? null,
    };
    target.status = nextStatus;
    target.scheduled_at = scheduledAt;
    data.updated_at = new Date().toISOString().slice(0, 10);
    await fs.writeFile(SOCIAL_PATH, JSON.stringify(data, null, 2), "utf8");
  });

  const finalOutcome = outcome as Outcome;
  if (finalOutcome.kind === "not_found") {
    return Response.json(
      { ok: false, error: `ไม่พบโพสต์ id "${postId}"` },
      { status: 404 },
    );
  }
  if (finalOutcome.kind === "published_blocked") {
    return Response.json(
      { ok: false, error: "โพสต์นี้ published แล้ว — schedule ใหม่ไม่ได้" },
      { status: 409 },
    );
  }

  // Push to Sheets so Apps Script's trigger sees the new schedule. Unlike
  // DELETE, the push is the whole point here — if it fails the schedule is
  // local-only and nothing publishes. So make it atomic: on push failure,
  // revert the post to its previous status/time so the card doesn't claim
  // "scheduled" while the Sheet (and therefore the publisher) never saw it.
  try {
    await pushSocialPosts();
  } catch (e) {
    await writeFields(
      finalOutcome.id,
      finalOutcome.prevStatus,
      finalOutcome.prevScheduledAt,
    ).catch(() => {});
    return Response.json(
      {
        ok: false,
        reverted: true,
        error: `push Sheet ไม่ผ่าน จึงยังไม่ตั้งเวลา: ${(e as Error).message}`,
      },
      { status: 502 },
    );
  }
  return Response.json({
    ok: true,
    post_id: finalOutcome.id,
    prev_status: finalOutcome.prevStatus,
    status: nextStatus,
    scheduled_at: scheduledAt,
    pushed: true,
  });
}

/**
 * DELETE /api/social  body { post_id, allow_published?: boolean }
 *
 * Drop a post entry from social-posts.json + push the trimmed list back to
 * Sheets so Apps Script doesn't resurrect the row. By default we refuse to
 * delete posts whose status is "published" (those are already live on FB —
 * use /api/social/fb/delete-post for that, which hits the Graph API). The
 * UI lets the user override via `allow_published: true` after an extra
 * confirmation.
 */
export async function DELETE(req: NextRequest) {
  let body: { post_id?: string; allow_published?: boolean };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const postId = body.post_id?.trim();
  if (!postId) {
    return Response.json({ error: "post_id required" }, { status: 400 });
  }

  type Outcome =
    | { kind: "removed"; id: string; status: string }
    | { kind: "not_found" }
    | { kind: "published_blocked"; status: string };
  let outcome: Outcome = { kind: "not_found" };

  await withFileLock(SOCIAL_PATH, async () => {
    let raw: string;
    try {
      raw = await fs.readFile(SOCIAL_PATH, "utf8");
    } catch {
      return;
    }
    const data = JSON.parse(raw) as {
      updated_at: string;
      accounts: unknown[];
      posts: Array<{ id: string; status: string }>;
    };
    const idx = data.posts.findIndex((p) => p.id === postId);
    if (idx === -1) {
      outcome = { kind: "not_found" };
      return;
    }
    const target = data.posts[idx];
    if (target.status === "published" && !body.allow_published) {
      outcome = { kind: "published_blocked", status: target.status };
      return;
    }
    outcome = { kind: "removed", id: target.id, status: target.status };
    data.posts.splice(idx, 1);
    data.updated_at = new Date().toISOString().slice(0, 10);
    await fs.writeFile(SOCIAL_PATH, JSON.stringify(data, null, 2), "utf8");
  });

  // TS can't track the callback's reassignment of `outcome` through the
  // closure, so it narrows to `never` after the early returns — pin a
  // local with the union type so the final branch is typed correctly.
  const finalOutcome = outcome as Outcome;
  if (finalOutcome.kind === "not_found") {
    return Response.json(
      { ok: false, error: `ไม่พบโพสต์ id "${postId}"` },
      { status: 404 },
    );
  }
  if (finalOutcome.kind === "published_blocked") {
    return Response.json(
      {
        ok: false,
        error:
          "ไม่ลบ — โพสต์นี้ status=published แล้ว ส่ง allow_published=true ถ้ายืนยัน หรือใช้ /api/social/fb/delete-post เพื่อลบจาก Facebook ด้วย",
      },
      { status: 409 },
    );
  }
  const removed = { id: finalOutcome.id, status: finalOutcome.status };

  // Best-effort push to Sheets so Apps Script won't resurrect the row on
  // its next poll. We don't fail the delete on push errors — the local
  // JSON is the source of truth for the UI.
  let pushed = false;
  let pushError: string | undefined;
  try {
    await pushSocialPosts();
    pushed = true;
  } catch (e) {
    pushError = (e as Error).message;
  }
  return Response.json({ ok: true, removed, pushed, pushError });
}
