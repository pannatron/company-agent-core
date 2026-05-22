import { promises as fs } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./repo";

/**
 * Gemini 2.5 Flash Image ("Nano Banana") generation.
 *
 * Generates a single image from a text prompt and writes it to outputs/content/
 * as PNG. The categorizer will move it into the right subfolder after the
 * agent turn finishes, but we save it directly to outputs/content/ since
 * social posts almost always live there.
 */

const MODEL = "gemini-2.5-flash-image";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export class GeminiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiConfigError";
  }
}

export class GeminiApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Gemini API ${status}: ${body.slice(0, 300)}`);
    this.name = "GeminiApiError";
    this.status = status;
    this.body = body;
  }
}

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
        inlineData?: { mimeType?: string; data?: string };
      }>;
    };
    finishReason?: string;
    safetyRatings?: unknown;
  }>;
  promptFeedback?: { blockReason?: string };
}

export interface GeneratedImage {
  /** Relative path from REPO_ROOT, e.g., "outputs/content/foo.png" */
  path: string;
  /** Absolute filesystem path */
  absolutePath: string;
  /** Bytes written */
  size: number;
  mimeType: string;
}

function ensureSafeFilename(name: string): string {
  // Strip path separators and weird chars — keep extension intact.
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  if (!cleaned) throw new Error("filename empty after sanitisation");
  // Force .png suffix — Gemini Flash Image returns PNG.
  return cleaned.endsWith(".png") ? cleaned : `${cleaned}.png`;
}

/**
 * Generate one image from a prompt. Saves to outputs/content/<filename> by
 * default. Caller picks the filename — use a descriptive slug so the auto
 * categorizer doesn't have to guess.
 */
export async function generateGeminiImage(args: {
  prompt: string;
  filename: string;
  /** Optional subdir under outputs/, default "content" */
  subdir?: string;
}): Promise<GeneratedImage> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiConfigError(
      "GEMINI_API_KEY not set — เพิ่มใน dashboard/.env.local แล้ว restart dev server",
    );
  }
  if (!args.prompt || !args.prompt.trim()) {
    throw new Error("prompt required");
  }
  const filename = ensureSafeFilename(args.filename);
  const subdir = args.subdir ?? "content";

  const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: args.prompt }] }],
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new GeminiApiError(res.status, text);
  }
  let data: GeminiResponse;
  try {
    data = JSON.parse(text) as GeminiResponse;
  } catch {
    throw new GeminiApiError(res.status, `non-JSON response: ${text.slice(0, 300)}`);
  }

  if (data.promptFeedback?.blockReason) {
    throw new Error(
      `Gemini blocked prompt: ${data.promptFeedback.blockReason}. ปรับ prompt แล้วลองใหม่`,
    );
  }

  const inline = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)
    ?.inlineData;
  if (!inline?.data) {
    const finish = data.candidates?.[0]?.finishReason ?? "unknown";
    const textPart = data.candidates?.[0]?.content?.parts?.find((p) => p.text)?.text;
    throw new Error(
      `Gemini returned no image (finishReason=${finish})${textPart ? ` — text: ${textPart.slice(0, 200)}` : ""}`,
    );
  }

  const buffer = Buffer.from(inline.data, "base64");
  const relativePath = path.posix.join("outputs", subdir, filename);
  const absolutePath = path.join(REPO_ROOT, "outputs", subdir, filename);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);

  return {
    path: relativePath,
    absolutePath,
    size: buffer.byteLength,
    mimeType: inline.mimeType || "image/png",
  };
}
