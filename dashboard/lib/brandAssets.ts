import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./repo";

/**
 * Company brand assets — currently just a single logo.
 *
 * Stored at `data/company-logo.<ext>` where ext is one of: png, jpg, jpeg, webp, svg.
 * Lin (content-designer) saves the file directly via Bash `cp` from the
 * uploaded attachment, OR the dashboard UI POSTs to /api/brand/logo.
 *
 * Used by htmlRender.ts to auto-inject the logo into any HTML that contains
 * `{{LOGO}}` or `{{LOGO_URL}}` placeholders.
 */

const LOGO_BASENAME = "company-logo";
const LOGO_EXTS = [".png", ".webp", ".jpg", ".jpeg", ".svg"] as const;
const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

export interface LogoInfo {
  exists: boolean;
  path?: string;
  ext?: string;
  mimeType?: string;
  size?: number;
  updated_at?: string;
}

/** Locate the current logo file. First extension found wins; null if none. */
export async function findLogo(): Promise<LogoInfo> {
  for (const ext of LOGO_EXTS) {
    const p = path.join(DATA_DIR, `${LOGO_BASENAME}${ext}`);
    try {
      const stat = await fs.stat(p);
      return {
        exists: true,
        path: p,
        ext,
        mimeType: MIME_BY_EXT[ext] ?? "application/octet-stream",
        size: stat.size,
        updated_at: stat.mtime.toISOString(),
      };
    } catch {
      // try next ext
    }
  }
  return { exists: false };
}

/** Read logo bytes if it exists, else null. */
export async function readLogoBytes(): Promise<{
  buffer: Buffer;
  mimeType: string;
  ext: string;
} | null> {
  const info = await findLogo();
  if (!info.exists || !info.path) return null;
  const buffer = await fs.readFile(info.path);
  return { buffer, mimeType: info.mimeType!, ext: info.ext! };
}

/** Read logo and return as a data URI for inline HTML embedding. */
export async function getLogoDataUri(): Promise<string | null> {
  const data = await readLogoBytes();
  if (!data) return null;
  if (data.mimeType === "image/svg+xml") {
    // SVG: encode as utf8 data URI (smaller + readable in dev tools)
    const encoded = encodeURIComponent(data.buffer.toString("utf8"))
      .replace(/'/g, "%27")
      .replace(/"/g, "%22");
    return `data:image/svg+xml;utf8,${encoded}`;
  }
  return `data:${data.mimeType};base64,${data.buffer.toString("base64")}`;
}

/** Save (or replace) the logo. Removes other-extension copies so there's only one source of truth. */
export async function saveLogo(buffer: Buffer, mimeType: string): Promise<LogoInfo> {
  let ext: string;
  switch (mimeType) {
    case "image/png":
      ext = ".png";
      break;
    case "image/webp":
      ext = ".webp";
      break;
    case "image/jpeg":
    case "image/jpg":
      ext = ".jpg";
      break;
    case "image/svg+xml":
      ext = ".svg";
      break;
    default:
      throw new Error(`unsupported logo mime type: ${mimeType}`);
  }
  // Remove any existing logo files with other extensions
  for (const otherExt of LOGO_EXTS) {
    if (otherExt === ext) continue;
    const p = path.join(DATA_DIR, `${LOGO_BASENAME}${otherExt}`);
    try {
      await fs.unlink(p);
    } catch {
      /* not present */
    }
  }
  const dest = path.join(DATA_DIR, `${LOGO_BASENAME}${ext}`);
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(dest, buffer);
  return findLogo();
}

export async function deleteLogo(): Promise<void> {
  for (const ext of LOGO_EXTS) {
    const p = path.join(DATA_DIR, `${LOGO_BASENAME}${ext}`);
    try {
      await fs.unlink(p);
    } catch {
      /* not present */
    }
  }
}
