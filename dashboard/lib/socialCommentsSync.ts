import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./repo";

/**
 * Facebook comments — local JSON cache mirrored from Apps Script "comments"
 * tab in the Social Posts workbook. The Apps Script side is authoritative;
 * this file is what agents read when looking up "what's in the inbox?".
 *
 * Sync direction:
 *   FB Graph  →  Apps Script (fb_sync_comments)  →  Sheet "comments" tab
 *                                              ↓ (fb_list_comments)
 *                                  data/social-comments.json (here)
 *
 * Reply / delete / ignore flow goes the other way through fbControl.ts
 * directly — Apps Script writes back to the Sheet row, then a subsequent
 * pull refreshes this file.
 */

const COMMENTS_PATH = path.join(DATA_DIR, "social-comments.json");

export const COMMENT_STATUSES = [
  "new",
  "replied",
  "deleted",
  "ignored",
] as const;
export type CommentStatus = (typeof COMMENT_STATUSES)[number];

export interface FbComment {
  /** FB comment id, e.g. "959857560283523_123456789" */
  comment_id: string;
  /** Graph API post id (pageId_postPkId) */
  fb_post_id: string;
  /** Our internal post id (post-2026-05-20-wordplay-a), if matched */
  local_post_id?: string;
  from_name: string;
  from_id?: string;
  message: string;
  /** ISO datetime from FB created_time */
  created_at: string;
  /** Empty for top-level, otherwise the parent comment id */
  parent_comment_id?: string;
  status: CommentStatus | string;
  reply_text?: string;
  replied_at?: string;
  replied_by?: string;
  last_synced_at?: string;
}

interface CommentsFile {
  updated_at: string;
  comments: FbComment[];
}

async function readCommentsFile(): Promise<CommentsFile> {
  try {
    const raw = await fs.readFile(COMMENTS_PATH, "utf8");
    return JSON.parse(raw) as CommentsFile;
  } catch {
    return {
      updated_at: new Date().toISOString().slice(0, 10),
      comments: [],
    };
  }
}

async function writeCommentsFile(data: CommentsFile): Promise<void> {
  await fs.mkdir(path.dirname(COMMENTS_PATH), { recursive: true });
  data.updated_at = new Date().toISOString().slice(0, 10);
  await fs.writeFile(COMMENTS_PATH, JSON.stringify(data, null, 2), "utf8");
}

/** Public read — agents and the dashboard panel both use this. */
export async function loadComments(): Promise<FbComment[]> {
  const data = await readCommentsFile();
  return data.comments;
}

/** Used by the pull route after fetching from Apps Script. */
export async function saveComments(comments: FbComment[]): Promise<void> {
  await writeCommentsFile({
    updated_at: new Date().toISOString().slice(0, 10),
    comments,
  });
}

/** Rebuild FbComment[] from Apps Script's {headers, rows} response. */
export function rowsToComments(headers: string[], rows: string[][]): FbComment[] {
  const idx = (name: string) => headers.indexOf(name);
  const col = (row: string[], name: string) => {
    const i = idx(name);
    return i >= 0 && i < row.length ? row[i] : "";
  };
  const out: FbComment[] = [];
  for (const row of rows) {
    const commentId = col(row, "comment_id");
    if (!commentId) continue;
    out.push({
      comment_id: commentId,
      fb_post_id: col(row, "fb_post_id"),
      local_post_id: col(row, "local_post_id") || undefined,
      from_name: col(row, "from_name"),
      from_id: col(row, "from_id") || undefined,
      message: col(row, "message"),
      created_at: col(row, "created_at"),
      parent_comment_id: col(row, "parent_comment_id") || undefined,
      status: col(row, "status") || "new",
      reply_text: col(row, "reply_text") || undefined,
      replied_at: col(row, "replied_at") || undefined,
      replied_by: col(row, "replied_by") || undefined,
      last_synced_at: col(row, "last_synced_at") || undefined,
    });
  }
  return out;
}
