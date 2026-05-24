import { EMPLOYEES, EmployeeMeta, EmployeeSlug } from "./employees";

/**
 * A "next-step" suggestion derived from an agent's reply. We pattern-match
 * the result preview for @mentions, first-name mentions, and Thai
 * delegation phrases ("delegate ให้ X", "ส่งต่อ X", "ให้ทีม Y ทำ"). The
 * meeting room renders these inline so the user can fire the follow-up
 * without jumping into a sub-room first.
 *
 * This is a heuristic — we err on the side of recall (better to suggest
 * something the user can dismiss than miss a delegation hint).
 */
export interface FollowUpHint {
  slug: EmployeeSlug;
  firstName: string;
  name: string;
  /** Short phrase from the source text explaining why this person came up. */
  reason: string;
}

// Verbs/phrases that signal "I'm about to hand this off" in both Thai and
// English. Order matters only for the reason snippet — first match wins.
const DELEGATION_VERBS_TH = [
  "delegate ให้",
  "delegate ไปให้",
  "delegate ไป",
  "ส่งต่อให้",
  "ส่งต่อไป",
  "ส่งให้",
  "มอบหมายให้",
  "ขอให้",
  "ให้ทีม",
  "ฝาก",
  "ประสานกับ",
  "ขอเช็คกับ",
  "ขอเช็คจาก",
  "รอ",
];
const DELEGATION_VERBS_EN = [
  "delegate to",
  "hand off to",
  "hand this off to",
  "loop in",
  "ping",
  "ask",
  "assign to",
];

const ALL_VERBS = [...DELEGATION_VERBS_TH, ...DELEGATION_VERBS_EN];

/**
 * Extract follow-up hints from an agent's free-text reply.
 *
 * @param text  Result preview / message text (Thai or English)
 * @param self  The agent who produced this text — skipped from suggestions
 *              so we don't loop them back to themselves.
 */
export function extractFollowUpHints(
  text: string | undefined | null,
  self?: EmployeeSlug,
): FollowUpHint[] {
  if (!text) return [];
  const seen = new Set<EmployeeSlug>();
  const hints: FollowUpHint[] = [];

  // Strategy 1: explicit @mention (e.g. "@Sarah" or "@Sarah Mitchell")
  // Strategy 2: bare first-name preceded by a delegation verb within ~30 chars.
  // We run both and merge — same person mentioned both ways collapses to one.
  for (const emp of EMPLOYEES) {
    if (emp.slug === self) continue;
    if (seen.has(emp.slug)) continue;
    const hit = findMention(text, emp);
    if (hit) {
      hints.push({
        slug: emp.slug,
        firstName: emp.firstName,
        name: emp.name,
        reason: hit,
      });
      seen.add(emp.slug);
    }
  }

  return hints;
}

function findMention(text: string, emp: EmployeeMeta): string | null {
  // @Sarah or @Sarah Mitchell — pretty unambiguous, always counts.
  const atRe = new RegExp(`@${escapeRe(emp.firstName)}\\b`, "i");
  if (atRe.test(text)) {
    return snippetAround(text, atRe);
  }

  // Department/team mention: matches the first word of the department so
  // "ทีม Creator" hits anyone in "Creator Team", and "ทีม Marketing" hits
  // anyone in "Marketing". We also accept English "<dept> team".
  if (emp.department) {
    const firstWord = emp.department.split(/\s+/)[0];
    if (firstWord && firstWord.length >= 3) {
      const w = escapeRe(firstWord);
      // "ทีม Creator" / "ทีม Marketing" / "creator team" / bare "Creator"
      // preceded by ทีม or "team".
      const teamRe = new RegExp(`(ทีม\\s*${w}|${w}\\s*team)\\b`, "i");
      if (teamRe.test(text)) {
        return snippetAround(text, teamRe);
      }
    }
  }

  // Bare first-name needs context — too risky otherwise ("Alex" appears in
  // many places). We accept it only when within ~40 chars of a delegation
  // verb. Skip names that double as common words ("Lin" in some locales).
  const nameRe = new RegExp(`\\b${escapeRe(emp.firstName)}\\b`, "i");
  const m = nameRe.exec(text);
  if (m) {
    const before = text.slice(Math.max(0, m.index - 40), m.index).toLowerCase();
    const after = text.slice(m.index, Math.min(text.length, m.index + 40)).toLowerCase();
    const window = before + " " + after;
    if (ALL_VERBS.some((v) => window.includes(v.toLowerCase()))) {
      return snippetAround(text, nameRe);
    }
  }

  return null;
}

function snippetAround(text: string, re: RegExp): string {
  const m = re.exec(text);
  if (!m) return "";
  const start = Math.max(0, m.index - 30);
  const end = Math.min(text.length, m.index + m[0].length + 50);
  let s = text.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) s = "…" + s;
  if (end < text.length) s = s + "…";
  return s;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
