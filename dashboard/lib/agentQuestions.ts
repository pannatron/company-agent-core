/**
 * Detect whether an agent's reply is *asking the user something* rather than
 * reporting completed work. The meeting room uses this to surface a yellow
 * "❓ ต้องการคำตอบ" banner with an inline reply box, so the user knows the
 * agent is stuck waiting and doesn't have to dive into the direct room to
 * find out.
 *
 * Heuristic: anchor on a curated list of explicit ask-for-info phrases
 * (Thai + English). Fall back to "ends with a question mark" only when no
 * stronger signal hits — bare `?` is noisy because agents narrate steps
 * with rhetorical questions inside completed work.
 *
 * Designed to err on the side of recall: a false positive shows a banner
 * the user can dismiss; a false negative leaves them blind. Tuned against
 * the company CLAUDE.md guidance that agents should explicitly ask for
 * missing data ("ขอข้อมูล", "ยังไม่มีข้อมูล", …).
 */

export interface AgentQuestion {
  /** Short snippet of the actual question (one sentence-ish, ≤260 chars). */
  question: string;
  /** Why we flagged it — shown in a small badge for transparency. */
  reason: string;
  /** Multi-choice options parsed out of the reply (Option A/B/C, ทาง 1/2/3 etc.).
   *  Empty when the question is open-ended. */
  options: AgentQuestionOption[];
}

export interface AgentQuestionOption {
  /** Short label the user clicks — e.g. "A", "B", "1". */
  label: string;
  /** One-line description after the label — used as button title text. */
  title: string;
  /** Phrase the inline-reply will send when the user picks this option,
   *  e.g. "ขอเลือก Option A" — picked so the agent recognizes the choice. */
  answerText: string;
}

// Phrases that strongly indicate the agent is asking the user for missing
// info or confirmation. Each entry is matched case-insensitively as a
// substring; we extract the surrounding sentence for display.
const STRONG_PHRASES = [
  // Thai — ask for info
  "ขอข้อมูล",
  "ขอรายละเอียด",
  "ขอ confirm",
  "ขอคอนเฟิร์ม",
  "ขอยืนยัน",
  "ขอเช็คก่อน",
  "ขอเช็คกับ",
  "ช่วยระบุ",
  "ช่วยบอก",
  "ช่วยส่ง",
  "ช่วยให้รายละเอียด",
  "ช่วยให้ข้อมูล",
  "ช่วยแจ้ง",
  "กรุณาระบุ",
  "กรุณาแจ้ง",
  "กรุณาส่ง",
  "ฝากระบุ",
  "ฝากแจ้ง",
  "ฝากส่ง",
  "อยากทราบ",
  // Thai — flag missing data (matches the CLAUDE.md convention agents use)
  "ยังไม่มีข้อมูล",
  "ข้อมูลไม่ครบ",
  "ขาดข้อมูล",
  "ยังไม่ได้ระบุ",
  "ต้องการข้อมูลเพิ่ม",
  "ต้องการรายละเอียดเพิ่ม",
  "ต้องการเพิ่ม",
  // English
  "please provide",
  "please clarify",
  "please confirm",
  "please share",
  "please let me know",
  "could you provide",
  "could you clarify",
  "could you confirm",
  "could you share",
  "could you let me know",
  "can you provide",
  "can you clarify",
  "can you confirm",
  "can you share",
  "let me know",
  "need more info",
  "need more details",
  "more details",
  "missing the",
  "i need to know",
  "what is the",
  "what should",
  "how much",
  "how many",
];

export function detectAgentQuestion(
  text: string | undefined | null,
): AgentQuestion | null {
  if (!text) return null;
  const t = text.trim();
  if (!t) return null;
  const lower = t.toLowerCase();

  const options = extractOptions(t);

  for (const p of STRONG_PHRASES) {
    const idx = lower.indexOf(p.toLowerCase());
    if (idx !== -1) {
      return {
        question: extractContext(t, idx, p.length),
        reason: `พบ "${p}"`,
        options,
      };
    }
  }

  // Fallback: a question mark inside a reasonably-substantial sentence.
  // We require ≥3 chars before the mark to avoid catching stray "?" tokens.
  if (/[?？]/.test(t)) {
    const q = lastQuestionSentence(t);
    if (q) return { question: q, reason: "ลงท้ายด้วยคำถาม", options };
  }

  // If we found options but no question marker, that's still actionable —
  // the agent laid out choices and is implicitly asking the user to pick.
  if (options.length >= 2) {
    return {
      question: "เอเจ้นต์เสนอตัวเลือกให้คุณเลือก",
      reason: `พบ ${options.length} ตัวเลือก`,
      options,
    };
  }

  return null;
}

/**
 * Parse multi-choice options out of the reply. Supports several formats
 * agents naturally produce:
 *
 *   **Option A — แก้ใหม่ ตามจังหวะ ...**
 *   **ทางเลือก B: ปล่อยโพสต์เดิม ...**
 *   - Option C: ปล่อยผ่าน เก็บไว้เป็นบทเรียน
 *   ตัวเลือก 1) ลบโพสต์เดิม ...
 *
 * Returns at most 6 options (more than that is usually a numbered list
 * inside an option, not options themselves). De-dupes by label.
 */
function extractOptions(text: string): AgentQuestionOption[] {
  // Greedy on the title group so we don't stop after 2 chars. `[^\n*]`
  // bounds the title at the next markdown bold marker or newline, which
  // matches how agents structure "**Option A — Title**\n".
  const re =
    /(?:^|\n)\s*(?:[-*•]\s*)?(?:\*\*|__)?\s*(?:Option|ทางเลือก|ตัวเลือก|ทาง|ข้อ)\s+([A-Z0-9]{1,2})\s*(?:\*\*|__)?\s*[—–\-:.)]\s*([^\n*]{2,140})(?:\*\*|__)?\s*(?:\n|$)/gi;
  const out: AgentQuestionOption[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const label = m[1].toUpperCase();
    if (seen.has(label)) continue;
    seen.add(label);
    const title = m[2]
      .replace(/\*+/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    out.push({
      label,
      title,
      // Send a clear, polite Thai sentence the agent will recognize as the
      // chosen option. Including the title helps when the agent has
      // forgotten its own option list by the next turn.
      answerText: `ขอเลือก Option ${label}${title ? ` — ${title}` : ""}`,
    });
    if (out.length >= 6) break;
  }
  return out;
}

/**
 * Pick a useful snippet around a match. Two strategies, picked by
 * detecting whether the match line is a markdown header:
 *
 *   • Header line (e.g. "## ขอข้อมูลก่อนเริ่มทำโพสต์"): the *content*
 *     the agent is asking about lives in the lines below — usually
 *     bullets. We collect the header plus subsequent non-empty lines
 *     until the next header or a paragraph gap, then strip markdown so
 *     the meeting-room banner reads like clean text.
 *
 *   • Inline match: fall back to single-sentence extraction (closer to
 *     what the user reads in a chat bubble) — the question is usually
 *     one sentence anyway.
 *
 * Capped at ~420 chars total — long enough for header + 3-4 bullets,
 * short enough that the banner stays one screen.
 */
function extractContext(
  text: string,
  idx: number,
  phraseLen: number,
): string {
  const lines = text.split("\n");
  let cumulative = 0;
  let lineIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const end = cumulative + lines[i].length + 1; // +1 for the newline
    if (idx < end) {
      lineIdx = i;
      break;
    }
    cumulative = end;
  }
  const matchLine = lines[lineIdx];
  const isHeader = /^\s*#+\s/.test(matchLine);
  const isListLine = (l: string) =>
    /^\s*([-*•·]|\d+[.)]|[a-zA-Z][.)]|☐|\[\s?\])\s+/.test(l);

  // Decide whether to expand into following lines. Header always does;
  // a regular line expands only when a list marker appears in the next
  // few lines (i.e. the agent did "intro: …\n- foo\n- bar"). Otherwise
  // we'd pad the banner with unrelated prose, which is worse than the
  // tight single-sentence fallback.
  let shouldExpand = isHeader;
  if (!shouldExpand) {
    for (let i = lineIdx + 1; i < Math.min(lines.length, lineIdx + 5); i++) {
      const trimmed = lines[i].trim();
      if (trimmed === "") continue;
      if (isListLine(lines[i])) {
        shouldExpand = true;
        break;
      }
      break; // non-list, non-blank line — no list follows
    }
  }

  if (!shouldExpand) {
    return extractSentenceAround(text, idx, phraseLen);
  }

  // Collect matched line + following content. Stop at the next header, two
  // consecutive blank lines, 8 lines total, or the 420-char cap.
  const collected: string[] = [matchLine];
  let consecutiveBlanks = 0;
  for (let i = lineIdx + 1; i < lines.length && collected.length < 9; i++) {
    const l = lines[i];
    if (/^\s*#+\s/.test(l)) break;
    if (l.trim() === "") {
      consecutiveBlanks++;
      if (consecutiveBlanks >= 2 && collected.length > 1) break;
      continue;
    }
    consecutiveBlanks = 0;
    collected.push(l);
  }
  return cleanMarkdown(collected.join("\n")).slice(0, 420);
}

/**
 * Strip just enough markdown that the banner doesn't show raw syntax
 * (`##`, `**`, leading `-`). Keep inline code and links intact — they're
 * usually short and meaningful as-is.
 */
function cleanMarkdown(s: string): string {
  return s
    .replace(/^\s*#+\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/^\s*>\s+/gm, "")
    .trim();
}

/**
 * Slice out the sentence containing `text[idx..idx+len]`. Boundaries we
 * treat as sentence-end: `.` `!` `?` `？` `ฯ` and newline. Used because the
 * Thai agent replies usually pack the question into one sentence.
 */
function extractSentenceAround(
  text: string,
  idx: number,
  phraseLen: number,
): string {
  const before = text.slice(0, idx);
  const startMatch = /[.!?？ฯ\n][^.!?？ฯ\n]*$/.exec(before);
  const start = startMatch
    ? before.length - startMatch[0].length + 1
    : 0;
  const after = text.slice(idx + phraseLen);
  const endMatch = /[.!?？ฯ\n]/.exec(after);
  const end = endMatch
    ? idx + phraseLen + endMatch.index + 1
    : Math.min(text.length, idx + phraseLen + 200);
  return text.slice(start, end).replace(/\s+/g, " ").trim().slice(0, 260);
}

/** Last `<text>?` sentence in the reply. */
function lastQuestionSentence(text: string): string {
  const re = /([^.!?？ฯ\n]{3,}[?？])/g;
  let last = "";
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    last = match[1];
  }
  return last.replace(/\s+/g, " ").trim().slice(0, 260);
}
