import { NextRequest } from "next/server";
import {
  generateGeminiImage,
  GeminiApiError,
  GeminiConfigError,
} from "@/lib/geminiImage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Image gen can take 5-20s.
export const maxDuration = 60;

interface RequestBody {
  /** Text prompt for image generation (required). */
  prompt: string;
  /** Filename to save under outputs/<subdir>/. Auto-suffixed with .png if missing. */
  filename: string;
  /** Subdir under outputs/, default "content". */
  subdir?: string;
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.prompt) return Response.json({ error: "prompt required" }, { status: 400 });
  if (!body.filename) return Response.json({ error: "filename required" }, { status: 400 });

  try {
    const result = await generateGeminiImage({
      prompt: body.prompt,
      filename: body.filename,
      subdir: body.subdir,
    });
    return Response.json({
      ok: true,
      path: result.path,
      size: result.size,
      mimeType: result.mimeType,
    });
  } catch (e) {
    if (e instanceof GeminiConfigError) {
      return Response.json({ error: e.message }, { status: 412 });
    }
    if (e instanceof GeminiApiError) {
      return Response.json(
        { error: e.message, gemini_status: e.status },
        { status: 502 },
      );
    }
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
