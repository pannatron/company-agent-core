import { NextRequest } from "next/server";
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { avatarUrl, getEmployee, EmployeeMeta } from "@/lib/employees";
import { detectExplicitMention, routeMessage } from "@/lib/router";
import { buildSystemPrompt } from "@/lib/buildSystemPrompt";
import { REPO_ROOT, DATA_DIR } from "@/lib/repo";
import { organize } from "@/lib/categorizer";
import { promises as fsPromises } from "node:fs";
import nodePath from "node:path";
import { pushSocialPosts } from "@/lib/socialPostsSync";
import {
  ChatAttachment,
  ChatBlock,
  ChatMessage,
  ChatRespondent,
  deriveChatId,
  loadChat,
  upsertChatMessages,
} from "@/lib/chatStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ClientMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequest {
  employee: string;
  /** Explicit conversation id; if omitted server derives from employee. */
  chatId?: string;
  messages: ClientMessage[];
  attachments?: ChatAttachment[];
  /**
   * Slug of the last assistant who replied in this conversation. When
   * employee === "auto", we use this as a sticky default so the speaker
   * doesn't ping-pong on every message — keyword routing only kicks in
   * if there's no prior respondent. Explicit @mentions always win.
   */
  last_respondent?: string;
}

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-7";

export async function POST(req: NextRequest) {
  let body: ChatRequest;
  try {
    body = (await req.json()) as ChatRequest;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages array is empty" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // Pick employee — explicit slug or auto-route (mention → sticky → keyword)
  let employee: EmployeeMeta | undefined;
  let routeReason = "";
  if (body.employee === "auto" || !body.employee) {
    const last = messages[messages.length - 1];
    const explicit = detectExplicitMention(last.content);
    if (explicit) {
      employee = getEmployee(explicit);
      routeReason = `@mention ${employee?.firstName ?? explicit}`;
    } else if (body.last_respondent) {
      // Sticky — continue the same conversation unless user explicitly switches
      const sticky = getEmployee(body.last_respondent);
      if (sticky) {
        employee = sticky;
        routeReason = `คุยต่อกับ ${sticky.firstName}`;
      }
    }
    if (!employee) {
      const r = routeMessage(last.content);
      employee = getEmployee(r.slug);
      routeReason = r.reason;
    }
  } else {
    employee = getEmployee(body.employee);
  }
  if (!employee) {
    return new Response(
      JSON.stringify({ error: `Unknown employee: ${body.employee}` }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const chatId = deriveChatId(body.employee, body.chatId);
  const respondentInfo: ChatRespondent = {
    slug: employee.slug,
    name: employee.name,
    title: employee.title,
    department: employee.department,
    accent: employee.accent,
    avatarUrl: avatarUrl(employee.avatarSeed, 96),
    reason: routeReason || "ทำหน้าที่ของแผนกนี้",
  };

  const system = await buildSystemPrompt(employee);

  const history = messages.slice(0, -1);
  const current = messages[messages.length - 1];
  const attachmentBlock = formatAttachments(body.attachments);
  const turnStart = Date.now();

  // BUG-001 — snapshot mtime so we can auto-push social-posts after the turn
  // if (and only if) the agent edited it during the turn.
  const socialPostsPath = nodePath.join(DATA_DIR, "social-posts.json");
  let socialMtimeAtStart: number | null = null;
  try {
    socialMtimeAtStart = (await fsPromises.stat(socialPostsPath)).mtimeMs;
  } catch {
    /* file doesn't exist yet — that's fine, treat as no prior state */
  }

  const prompt =
    history.length === 0
      ? attachmentBlock + current.content
      : [
          "บทสนทนาก่อนหน้า (เก่า → ใหม่):",
          ...history.map(
            (m) =>
              `\n[${m.role === "user" ? "ผู้ใช้" : "คุณ"}]\n${m.content}`,
          ),
          "",
          "ข้อความล่าสุดจากผู้ใช้:",
          attachmentBlock + current.content,
        ].join("\n");

  // Server-side accumulation of this turn's assistant blocks (mirrors client UI shape).
  const orderedBlocks: ChatBlock[] = [];
  const toolBlockById = new Map<string, Extract<ChatBlock, { kind: "tool" }>>();
  let lastTurnDurationMs = 0;
  let turnErrored = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const emit = (evt: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(evt) + "\n"));
      };

      emit({
        type: "respondent",
        slug: employee.slug,
        name: employee.name,
        title: employee.title,
        department: employee.department,
        accent: employee.accent,
        avatarUrl: respondentInfo.avatarUrl,
        reason: respondentInfo.reason,
        chat_id: chatId,
      });

      try {
        const iterator = query({
          prompt,
          options: {
            systemPrompt: system,
            model: MODEL,
            cwd: REPO_ROOT,
            allowedTools: ["Read", "Grep", "Glob", "Write", "Edit", "WebSearch"],
            settingSources: [],
            permissionMode: "bypassPermissions",
          },
        });

        for await (const msg of iterator as AsyncIterable<SDKMessage>) {
          if (msg.type === "assistant") {
            const blocks =
              (msg as { message?: { content?: unknown[] } }).message?.content ?? [];
            for (const raw of blocks) {
              const b = raw as {
                type: string;
                text?: string;
                id?: string;
                name?: string;
                input?: unknown;
                thinking?: string;
              };
              if (b.type === "text" && typeof b.text === "string") {
                emit({ type: "text", text: b.text });
                orderedBlocks.push({ kind: "text", text: b.text });
              } else if (b.type === "thinking" && typeof b.thinking === "string") {
                emit({ type: "thinking", text: b.thinking });
                orderedBlocks.push({ kind: "thinking", text: b.thinking });
              } else if (b.type === "tool_use") {
                const summary = summarizeToolInput(b.name ?? "", b.input ?? {});
                const toolBlock: Extract<ChatBlock, { kind: "tool" }> = {
                  kind: "tool",
                  id: b.id ?? "",
                  name: b.name ?? "tool",
                  summary,
                  status: "running",
                };
                orderedBlocks.push(toolBlock);
                toolBlockById.set(toolBlock.id, toolBlock);
                emit({
                  type: "tool_use",
                  id: toolBlock.id,
                  name: toolBlock.name,
                  input: b.input ?? {},
                  summary,
                });
              }
            }
          } else if (msg.type === "user") {
            const content = (msg as { message?: { content?: unknown } }).message
              ?.content;
            if (Array.isArray(content)) {
              for (const raw of content) {
                const b = raw as {
                  type?: string;
                  tool_use_id?: string;
                  is_error?: boolean;
                  content?: unknown;
                };
                if (b.type === "tool_result") {
                  const preview = previewToolResult(b.content);
                  const ok = !b.is_error;
                  emit({
                    type: "tool_result",
                    id: b.tool_use_id ?? "",
                    ok,
                    preview,
                  });
                  const tb = toolBlockById.get(b.tool_use_id ?? "");
                  if (tb) {
                    tb.status = ok ? "ok" : "error";
                    tb.preview = preview;
                  }
                }
              }
            }
          } else if (msg.type === "result") {
            const r = msg as {
              subtype?: string;
              is_error?: boolean;
              duration_ms?: number;
              num_turns?: number;
            };
            lastTurnDurationMs = r.duration_ms ?? Date.now() - turnStart;
            if (r.is_error) turnErrored = true;
            emit({
              type: "done",
              subtype: r.subtype ?? "success",
              error: !!r.is_error,
              duration_ms: lastTurnDurationMs,
              num_turns: r.num_turns ?? 0,
            });
          }
        }
      } catch (err) {
        turnErrored = true;
        emit({ type: "error", message: (err as Error).message });
      } finally {
        // 1) Auto-organize outputs/
        try {
          await organize();
        } catch {
          /* best-effort */
        }
        // 2) Persist conversation to disk for tab-switch & Drive export
        try {
          await persistTurn({
            chatId,
            user: current,
            attachments: body.attachments,
            respondent: respondentInfo,
            blocks: orderedBlocks,
            durationMs: lastTurnDurationMs || Date.now() - turnStart,
            errored: turnErrored,
          });
        } catch {
          /* best-effort */
        }
        // 3) BUG-001 — if the agent modified data/social-posts.json during the
        //    turn, push to Sheet so Apps Script sees the change next cron pass.
        //    Best-effort: Drive may not be configured; validation may fail —
        //    surface neither (the client-side useAutoSync already shows errors
        //    when toggled on). Skip when file unchanged to avoid a wasted RPC.
        try {
          const stat = await fsPromises.stat(socialPostsPath);
          if (socialMtimeAtStart === null || stat.mtimeMs > socialMtimeAtStart) {
            await pushSocialPosts();
          }
        } catch {
          /* best-effort */
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-employee": employee.slug,
      "x-chat-id": chatId,
    },
  });
}

async function persistTurn(opts: {
  chatId: string;
  user: ClientMessage;
  attachments?: ChatAttachment[];
  respondent: ChatRespondent;
  blocks: ChatBlock[];
  durationMs: number;
  errored: boolean;
}): Promise<void> {
  const existing = await loadChat(opts.chatId);
  const prior = existing?.messages ?? [];

  const now = new Date().toISOString();
  const userMsg: ChatMessage = {
    role: "user",
    content: opts.user.content,
    attachments: opts.attachments && opts.attachments.length > 0 ? opts.attachments : undefined,
    timestamp: now,
  };
  const assistantMsg: ChatMessage = {
    role: "assistant",
    respondent: opts.respondent,
    blocks: opts.blocks,
    status: opts.errored ? "error" : "done",
    durationMs: opts.durationMs,
    timestamp: new Date().toISOString(),
  };
  await upsertChatMessages(opts.chatId, [...prior, userMsg, assistantMsg]);
}

function formatAttachments(atts?: ChatAttachment[]): string {
  if (!atts?.length) return "";
  const lines = atts.map(
    (a) => `  • ${a.path}  (${a.mimeType}, ชื่อเดิม: "${a.name}")`,
  );
  return [
    "ผู้ใช้แนบไฟล์มาด้วย — ใช้ Read tool เพื่ออ่าน/ดูเนื้อหา (รูปจะถูกแสดงเป็น visual content, PDF/CSV จะได้ text กลับมา):",
    ...lines,
    "",
    "---",
    "",
  ].join("\n");
}

function summarizeToolInput(name: string, input: unknown): string {
  const i = (input as Record<string, unknown>) || {};
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  switch (name) {
    case "Read":
    case "Write":
    case "Edit":
      return str(i.file_path);
    case "Glob":
      return str(i.pattern);
    case "Grep":
      return `${str(i.pattern)}${i.path ? `  in ${str(i.path)}` : ""}`;
    case "WebSearch":
      return str(i.query);
    case "Bash":
      return truncate(str(i.command), 80);
    default: {
      for (const k of ["path", "file_path", "query", "pattern", "command"]) {
        if (typeof i[k] === "string") return str(i[k]);
      }
      return "";
    }
  }
}

function previewToolResult(content: unknown): string {
  if (typeof content === "string") return truncate(content, 200);
  if (Array.isArray(content)) {
    const text = content
      .map((b) => {
        if (typeof b === "string") return b;
        const block = b as { type?: string; text?: string };
        return block?.type === "text" ? block.text || "" : "";
      })
      .join("\n");
    return truncate(text, 200);
  }
  return "";
}

function truncate(s: string, max: number): string {
  if (!s) return "";
  const t = s.trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}
