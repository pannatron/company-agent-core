import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./repo";

/**
 * Thin wrapper around the Apps Script Facebook endpoints. Same Apps Script
 * URL we already use for Drive/Sheets — different `action` payloads.
 */

const CONFIG_PATH = path.join(DATA_DIR, ".drive-config.json");

async function loadDriveUrl(): Promise<string> {
  const raw = await fs.readFile(CONFIG_PATH, "utf8");
  const cfg = JSON.parse(raw) as { url?: string };
  if (!cfg.url) throw new Error("Drive ยังไม่ได้เชื่อม");
  return cfg.url;
}

async function callScript<T>(url: string, body: object): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    redirect: "follow",
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Apps Script ไม่ตอบเป็น JSON (status ${res.status}) — ต้องใช้ v6 ขึ้นไป`,
    );
  }
}

export interface FbConfigStatus {
  page_id: string;
  page_token_set: boolean;
  page_token_preview: string;
  poll_interval_min: number;
  trigger_installed: boolean;
  last_run_at: string;
  last_error: string;
  last_result: string;
  script_version?: string;
  needs_v6_upgrade: boolean;
}

interface AppsScriptResponse {
  ok: boolean;
  error?: string;
}

export async function getFbStatus(): Promise<FbConfigStatus> {
  const url = await loadDriveUrl();
  // Ping to learn the version
  const ping = await callScript<{ ok: boolean; script_version?: string }>(url, {
    action: "ping",
  });
  const version = ping.ok ? ping.script_version : undefined;
  const needs_v6_upgrade = !version || parseInt(version, 10) < 6;

  if (needs_v6_upgrade) {
    return {
      page_id: "",
      page_token_set: false,
      page_token_preview: "",
      poll_interval_min: 5,
      trigger_installed: false,
      last_run_at: "",
      last_error: "",
      last_result: "",
      script_version: version,
      needs_v6_upgrade: true,
    };
  }

  const cfg = await callScript<FbConfigStatus & AppsScriptResponse>(url, {
    action: "get_fb_config",
  });
  if (!cfg.ok) throw new Error(cfg.error || "get_fb_config failed");
  return { ...cfg, script_version: version, needs_v6_upgrade: false };
}

export async function setFbConfig(args: {
  page_id?: string;
  page_token?: string;
  poll_interval_min?: number;
}): Promise<void> {
  const url = await loadDriveUrl();
  const r = await callScript<AppsScriptResponse>(url, {
    action: "set_fb_config",
    ...args,
  });
  if (!r.ok) throw new Error(r.error || "set_fb_config failed");
}

export async function testFbPost(args: {
  message: string;
  image_url?: string;
}): Promise<{ external_url: string }> {
  const url = await loadDriveUrl();
  const r = await callScript<{ ok: boolean; external_url?: string; error?: string }>(url, {
    action: "fb_test_post",
    ...args,
  });
  if (!r.ok) throw new Error(r.error || "test post failed");
  return { external_url: r.external_url || "" };
}

export async function enableFbTrigger(intervalMin = 5): Promise<{ interval_min: number }> {
  const url = await loadDriveUrl();
  const r = await callScript<{ ok: boolean; interval_min?: number; error?: string }>(url, {
    action: "install_fb_trigger",
    interval_min: intervalMin,
  });
  if (!r.ok) throw new Error(r.error || "install_fb_trigger failed");
  return { interval_min: r.interval_min ?? intervalMin };
}

export async function disableFbTrigger(): Promise<void> {
  const url = await loadDriveUrl();
  const r = await callScript<AppsScriptResponse>(url, {
    action: "uninstall_fb_trigger",
  });
  if (!r.ok) throw new Error(r.error || "uninstall_fb_trigger failed");
}

export async function runFbSchedulerNow(): Promise<{
  published: number;
  errors: number;
  skipped: number;
}> {
  const url = await loadDriveUrl();
  const r = await callScript<{
    ok: boolean;
    result?: { published: number; errors: number; skipped: number };
    error?: string;
  }>(url, { action: "run_fb_scheduler_now" });
  if (!r.ok) throw new Error(r.error || "run_fb_scheduler_now failed");
  return r.result ?? { published: 0, errors: 0, skipped: 0 };
}

/**
 * Publish a single queued post right now, bypassing the 5-min cron (BUG-004).
 * The Apps Script side does the actual Graph API call + writes back the
 * external_url / status / diagnostics to the Sheet row.
 */
export async function postNow(post_id: string): Promise<{
  external_url: string;
  post_id: string;
}> {
  const url = await loadDriveUrl();
  const r = await callScript<{
    ok: boolean;
    external_url?: string;
    post_id?: string;
    error?: string;
  }>(url, { action: "fb_post_now", post_id });
  if (!r.ok) {
    const msg = r.error || "fb_post_now failed";
    if (/unknown action/i.test(msg)) {
      throw new Error(
        "Apps Script ของคุณยังไม่ใช่ v8 — ก๊อปสคริปต์ใหม่จาก Files tab แล้ว redeploy",
      );
    }
    throw new Error(msg);
  }
  return {
    external_url: r.external_url || "",
    post_id: r.post_id || post_id,
  };
}

/**
 * Reset a failed row back to status=scheduled with attempt_count=0 so the
 * next scheduler pass will retry it (BUG-003 retry helper).
 */
export async function retryPost(post_id: string): Promise<{ post_id: string }> {
  const url = await loadDriveUrl();
  const r = await callScript<{ ok: boolean; post_id?: string; error?: string }>(
    url,
    { action: "fb_retry_post", post_id },
  );
  if (!r.ok) {
    const msg = r.error || "fb_retry_post failed";
    if (/unknown action/i.test(msg)) {
      throw new Error(
        "Apps Script ของคุณยังไม่ใช่ v8 — ก๊อปสคริปต์ใหม่จาก Files tab แล้ว redeploy",
      );
    }
    throw new Error(msg);
  }
  return { post_id: r.post_id || post_id };
}

/* ============================================================
 *   v9 — Post delete + Comments inbox
 *   (Apps Script must have v9 patch applied — see
 *    outputs/misc/apps-script-v9-comments-patch.gs)
 * ============================================================ */

function throwV9IfUnknown(err: string, fallback: string): never {
  if (/unknown action/i.test(err)) {
    throw new Error(
      "Apps Script ของคุณยังไม่ใช่ v9 — paste outputs/misc/apps-script-v9-comments-patch.gs แล้ว redeploy",
    );
  }
  throw new Error(err || fallback);
}

/** Delete a published FB post. Accepts either "pageId_postId" or the external_url. */
export async function deletePost(post_id_or_url: string): Promise<{ fb_post_id: string }> {
  const url = await loadDriveUrl();
  const r = await callScript<{ ok: boolean; fb_post_id?: string; error?: string }>(
    url,
    { action: "fb_delete_post", post_id: post_id_or_url },
  );
  if (!r.ok) throwV9IfUnknown(r.error || "", "fb_delete_post failed");
  return { fb_post_id: r.fb_post_id || "" };
}

/** Trigger Apps Script to poll FB for new comments on all published posts. */
export async function syncComments(): Promise<{
  new_count: number;
  polled: number;
}> {
  const url = await loadDriveUrl();
  const r = await callScript<{
    ok: boolean;
    new_count?: number;
    polled?: number;
    error?: string;
  }>(url, { action: "fb_sync_comments" });
  if (!r.ok) throwV9IfUnknown(r.error || "", "fb_sync_comments failed");
  return { new_count: r.new_count ?? 0, polled: r.polled ?? 0 };
}

/** Pull the canonical "comments" tab from Sheets — returns headers + rows. */
export async function fetchCommentsFromSheet(): Promise<{
  headers: string[];
  rows: string[][];
}> {
  const url = await loadDriveUrl();
  const r = await callScript<{
    ok: boolean;
    headers?: string[];
    rows?: string[][];
    error?: string;
  }>(url, { action: "fb_list_comments" });
  if (!r.ok) throwV9IfUnknown(r.error || "", "fb_list_comments failed");
  return { headers: r.headers || [], rows: r.rows || [] };
}

/** Post a reply to a FB comment. The Apps Script side updates the Sheet row. */
export async function replyComment(args: {
  comment_id: string;
  message: string;
  replied_by?: string;
}): Promise<{ reply_id: string }> {
  const url = await loadDriveUrl();
  const r = await callScript<{ ok: boolean; reply_id?: string; error?: string }>(
    url,
    { action: "fb_reply_comment", ...args },
  );
  if (!r.ok) throwV9IfUnknown(r.error || "", "fb_reply_comment failed");
  return { reply_id: r.reply_id || "" };
}

/** Delete a FB comment via Graph API DELETE /{comment_id}. */
export async function deleteComment(args: {
  comment_id: string;
  replied_by?: string;
}): Promise<void> {
  const url = await loadDriveUrl();
  const r = await callScript<AppsScriptResponse>(url, {
    action: "fb_delete_comment",
    ...args,
  });
  if (!r.ok) throwV9IfUnknown(r.error || "", "fb_delete_comment failed");
}

/** Mark a comment as ignored locally (no FB call). */
export async function ignoreComment(args: {
  comment_id: string;
  replied_by?: string;
}): Promise<void> {
  const url = await loadDriveUrl();
  const r = await callScript<AppsScriptResponse>(url, {
    action: "fb_ignore_comment",
    ...args,
  });
  if (!r.ok) throwV9IfUnknown(r.error || "", "fb_ignore_comment failed");
}
