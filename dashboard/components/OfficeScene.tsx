"use client";

import { useMemo } from "react";
import {
  EMPLOYEES,
  EmployeeMeta,
  EmployeeSlug,
} from "@/lib/employees";
import { ClientJob } from "@/lib/useJobStream";

/**
 * A stylised top-down view of the virtual office.
 *
 * Coordinates are expressed in a fixed 1600x900 "room" coordinate system
 * which is then scaled to fit the viewport. Each desk has a hand-picked
 * (x, y) position so they line up with the wall art / decor behind them.
 */
const ROOM_W = 1600;
const ROOM_H = 900;

interface DeskPos {
  slug: EmployeeSlug;
  x: number; // top-left of the desk unit (~140x120 footprint)
  y: number;
  /** Slight rotation in degrees so the row doesn't look like a parking lot. */
  rotate?: number;
  /** Which way the character faces — affects monitor placement. */
  facing?: "down" | "up";
}

const DESKS: DeskPos[] = [
  // Executive corner — top-left, by the window
  { slug: "ceo", x: 130, y: 170, facing: "down" },

  // Creative Studio — top-right row (4 desks)
  { slug: "marketing-lead", x: 680, y: 170, facing: "down" },
  { slug: "content-designer", x: 870, y: 170, facing: "down" },
  { slug: "copywriter", x: 1060, y: 170, facing: "down" },
  { slug: "social-media-manager", x: 1250, y: 170, facing: "down" },

  // Revenue Row — middle-left (2 desks)
  { slug: "sales-rep", x: 130, y: 460, facing: "down" },
  { slug: "finance-analyst", x: 320, y: 460, facing: "down" },

  // Ops & People — middle-right (3 desks)
  { slug: "ops-manager", x: 820, y: 460, facing: "down" },
  { slug: "hr-manager", x: 1010, y: 460, facing: "down" },
  { slug: "kpi-analyst", x: 1200, y: 460, facing: "down" },

  // Customer Front — bottom centre
  { slug: "customer-support", x: 720, y: 690, facing: "up" },
];

/** Each character gets a deterministic "look" derived from their slug
 *  so the same person always renders the same head. */
type HairStyle = "short" | "long" | "bun" | "buzz" | "cap" | "ponytail" | "afro" | "bob";
interface CharacterLook {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  glasses: boolean;
  shirtPattern?: "solid" | "stripe";
}
const LOOKS: Record<EmployeeSlug, CharacterLook> = {
  "ceo":                  { skin: "#f3c896", hair: "#1f2937", hairStyle: "short",    glasses: true,  shirtPattern: "solid" },
  "sales-rep":            { skin: "#e8b08c", hair: "#7c2d12", hairStyle: "short",    glasses: false },
  "marketing-lead":       { skin: "#f5d3a7", hair: "#dc2626", hairStyle: "long",     glasses: false },
  "content-designer":     { skin: "#d9a075", hair: "#0c1124", hairStyle: "bob",      glasses: true  },
  "copywriter":           { skin: "#eec5a0", hair: "#fbbf24", hairStyle: "cap",      glasses: false },
  "social-media-manager": { skin: "#c98a5a", hair: "#1c1917", hairStyle: "ponytail", glasses: false },
  "hr-manager":           { skin: "#a06a3f", hair: "#0f172a", hairStyle: "afro",     glasses: false },
  "finance-analyst":      { skin: "#e2b890", hair: "#374151", hairStyle: "short",    glasses: true  },
  "ops-manager":          { skin: "#cd8d5b", hair: "#0c0a09", hairStyle: "bun",      glasses: false },
  "kpi-analyst":          { skin: "#f0c7a3", hair: "#1e1b4b", hairStyle: "long",     glasses: true  },
  "customer-support":     { skin: "#d39b6c", hair: "#7f1d1d", hairStyle: "short",    glasses: false },
};

interface Props {
  jobsBySlug: Map<string, ClientJob>;
  onOpenDirect: (slug: EmployeeSlug) => void;
}

export default function OfficeScene({ jobsBySlug, onOpenDirect }: Props) {
  const bySlug = useMemo(() => {
    const m = new Map<EmployeeSlug, EmployeeMeta>();
    for (const e of EMPLOYEES) m.set(e.slug, e);
    return m;
  }, []);

  return (
    <div className="office-scene-wrap relative flex h-full w-full items-center justify-center overflow-hidden">
      <div
        className="office-scene relative"
        style={{
          // Fill the container's height; let aspect-ratio derive width.
          // max-width clamps if the parent is narrower than 16:9.
          aspectRatio: `${ROOM_W} / ${ROOM_H}`,
          height: "100%",
          maxWidth: "100%",
        }}
      >
        <RoomBackground />

        {/* Desks layer */}
        <div className="absolute inset-0">
          {DESKS.map((d) => {
            const emp = bySlug.get(d.slug);
            if (!emp) return null;
            return (
              <DeskUnit
                key={d.slug}
                pos={d}
                employee={emp}
                job={jobsBySlug.get(d.slug)}
                onClick={() => onOpenDirect(d.slug)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/*  Background — floor tiles + walls + decor                         */
/* ---------------------------------------------------------------- */

function RoomBackground() {
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox={`0 0 ${ROOM_W} ${ROOM_H}`}
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="crispEdges"
    >
      <defs>
        {/* Wood plank floor */}
        <pattern id="floor" width="80" height="40" patternUnits="userSpaceOnUse">
          <rect width="80" height="40" fill="#5b4233" />
          <rect x="0" y="0" width="80" height="2" fill="#3a2a21" />
          <rect x="0" y="38" width="80" height="2" fill="#3a2a21" />
          <rect x="0" y="0" width="2" height="40" fill="#3a2a21" />
          <rect x="40" y="0" width="2" height="40" fill="#3a2a21" />
        </pattern>
        {/* Wall brick */}
        <pattern id="wall" width="60" height="24" patternUnits="userSpaceOnUse">
          <rect width="60" height="24" fill="#2b2c40" />
          <rect width="60" height="2" y="22" fill="#1a1b2a" />
          <rect width="2" height="24" x="0" fill="#1a1b2a" />
          <rect width="2" height="24" x="30" y="0" fill="#1a1b2a" />
        </pattern>
        {/* Window glow */}
        <linearGradient id="windowGlow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffd97a" />
          <stop offset="60%" stopColor="#ff9a52" />
          <stop offset="100%" stopColor="#ff5e62" />
        </linearGradient>
        {/* Monitor glow */}
        <radialGradient id="screenGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#67e8f9" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Wall (top band) */}
      <rect x="0" y="0" width={ROOM_W} height="120" fill="url(#wall)" />
      {/* Floor */}
      <rect x="0" y="120" width={ROOM_W} height={ROOM_H - 120} fill="url(#floor)" />

      {/* Subtle floor zone shading — gives each zone a "rug" feel */}
      <g opacity="0.18">
        <rect x="80" y="130" width="280" height="280" fill="#fbbf24" />
        <rect x="640" y="130" width="800" height="280" fill="#a78bfa" />
        <rect x="80" y="420" width="400" height="240" fill="#f87171" />
        <rect x="780" y="420" width="600" height="240" fill="#34d399" />
        <rect x="640" y="680" width="320" height="180" fill="#38bdf8" />
      </g>

      {/* Windows along the top wall */}
      <Window x={60} />
      <Window x={260} />
      <Window x={1280} />
      <Window x={1480} />

      {/* Neon sign in the middle of the wall */}
      <NeonSign x={780} y={20} />

      {/* Framed pictures on the wall */}
      <FramedPic x={500} y={28} />
      <FramedPic x={580} y={28} />
      <FramedPic x={1080} y={28} />
      <FramedPic x={1180} y={28} />

      {/* Zone labels — etched into the floor like vinyl signage */}
      <ZoneLabel x={130} y={148} text="EXECUTIVE" />
      <ZoneLabel x={680} y={148} text="CREATIVE STUDIO" />
      <ZoneLabel x={130} y={438} text="REVENUE" />
      <ZoneLabel x={820} y={438} text="OPS & PEOPLE" />
      <ZoneLabel x={720} y={698} text="CUSTOMER FRONT" />

      {/* Decor scattered around */}
      <Plant x={70} y={420} size={1} />
      <Plant x={620} y={170} size={0.8} />
      <Plant x={620} y={460} size={0.9} />
      <Plant x={1450} y={460} size={1} />
      <Plant x={70} y={770} size={1.1} />
      <Plant x={1450} y={770} size={1.1} />

      <CoffeeMachine x={490} y={760} />
      <Whiteboard x={460} y={170} />
      <Whiteboard x={1100} y={460} />
      <FilingCabinet x={500} y={460} />
      <Sofa x={1100} y={760} />
      <Rug x={300} y={760} />
    </svg>
  );
}

function Window({ x }: { x: number }) {
  return (
    <g transform={`translate(${x}, 18)`}>
      {/* outer frame */}
      <rect width="160" height="84" fill="#1a1b2a" />
      {/* glow */}
      <rect x="6" y="6" width="148" height="72" fill="url(#windowGlow)" />
      {/* mullions */}
      <rect x="78" y="6" width="4" height="72" fill="#1a1b2a" />
      <rect x="6" y="40" width="148" height="4" fill="#1a1b2a" />
      {/* tiny city silhouette */}
      <g fill="#3b1f4d" opacity="0.7">
        <rect x="10" y="46" width="10" height="30" />
        <rect x="22" y="50" width="14" height="26" />
        <rect x="38" y="44" width="8" height="32" />
        <rect x="48" y="52" width="12" height="24" />
        <rect x="62" y="48" width="10" height="28" />
      </g>
    </g>
  );
}

function NeonSign({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect width="200" height="84" rx="4" fill="#0f1020" stroke="#1a1b2a" strokeWidth="2" />
      {/* "EAT SLEEP CODE REPEAT" — stacked, glowing in different colors */}
      <text x="100" y="22" textAnchor="middle" fontSize="14" fontWeight="900" fill="#f87171" fontFamily="monospace">
        EAT
      </text>
      <text x="100" y="38" textAnchor="middle" fontSize="14" fontWeight="900" fill="#fbbf24" fontFamily="monospace">
        SLEEP
      </text>
      <text x="100" y="54" textAnchor="middle" fontSize="14" fontWeight="900" fill="#34d399" fontFamily="monospace">
        CODE
      </text>
      <text x="100" y="70" textAnchor="middle" fontSize="14" fontWeight="900" fill="#67e8f9" fontFamily="monospace">
        REPEAT
      </text>
    </g>
  );
}

function FramedPic({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect width="60" height="70" fill="#8b6f47" />
      <rect x="4" y="4" width="52" height="62" fill="#a78bfa" />
      <rect x="4" y="4" width="52" height="20" fill="#67e8f9" />
      <circle cx="30" cy="48" r="10" fill="#fbbf24" />
    </g>
  );
}

function Plant({ x, y, size = 1 }: { x: number; y: number; size?: number }) {
  return (
    <g transform={`translate(${x}, ${y}) scale(${size})`}>
      <rect x="14" y="46" width="28" height="22" fill="#8b4513" />
      <rect x="14" y="46" width="28" height="4" fill="#5b2c0a" />
      <circle cx="28" cy="34" r="22" fill="#16a34a" />
      <circle cx="18" cy="28" r="14" fill="#22c55e" />
      <circle cx="38" cy="26" r="12" fill="#22c55e" />
      <circle cx="28" cy="18" r="10" fill="#4ade80" />
    </g>
  );
}

function CoffeeMachine({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect width="60" height="80" fill="#374151" />
      <rect x="6" y="8" width="48" height="20" fill="#0f172a" />
      <rect x="6" y="8" width="48" height="3" fill="#dc2626" />
      <rect x="20" y="40" width="20" height="20" fill="#1f2937" />
      <rect x="22" y="42" width="16" height="14" fill="#fbbf24" />
      <rect x="24" y="60" width="12" height="14" fill="#92400e" />
    </g>
  );
}

function Whiteboard({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect width="130" height="80" fill="#e5e7eb" stroke="#374151" strokeWidth="3" />
      {/* sticky notes */}
      <rect x="10" y="10" width="20" height="20" fill="#fbbf24" />
      <rect x="34" y="10" width="20" height="20" fill="#f87171" />
      <rect x="58" y="10" width="20" height="20" fill="#34d399" />
      <rect x="10" y="34" width="20" height="20" fill="#67e8f9" />
      <rect x="34" y="34" width="20" height="20" fill="#a78bfa" />
      {/* lines */}
      <rect x="58" y="38" width="60" height="2" fill="#9ca3af" />
      <rect x="58" y="46" width="50" height="2" fill="#9ca3af" />
      <rect x="58" y="54" width="55" height="2" fill="#9ca3af" />
    </g>
  );
}

function FilingCabinet({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect width="50" height="100" fill="#475569" />
      <rect x="4" y="6" width="42" height="20" fill="#64748b" />
      <rect x="4" y="30" width="42" height="20" fill="#64748b" />
      <rect x="4" y="54" width="42" height="20" fill="#64748b" />
      <rect x="4" y="78" width="42" height="18" fill="#64748b" />
      <circle cx="25" cy="16" r="2" fill="#cbd5e1" />
      <circle cx="25" cy="40" r="2" fill="#cbd5e1" />
      <circle cx="25" cy="64" r="2" fill="#cbd5e1" />
      <circle cx="25" cy="86" r="2" fill="#cbd5e1" />
    </g>
  );
}

function Sofa({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect width="160" height="40" fill="#7c3aed" />
      <rect x="0" y="10" width="160" height="30" fill="#a78bfa" />
      <rect x="0" y="30" width="160" height="14" fill="#6d28d9" />
      <rect x="8" y="16" width="40" height="14" rx="3" fill="#c4b5fd" />
      <rect x="60" y="16" width="40" height="14" rx="3" fill="#c4b5fd" />
      <rect x="112" y="16" width="40" height="14" rx="3" fill="#c4b5fd" />
    </g>
  );
}

function Rug({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      <rect width="160" height="80" fill="#dc2626" opacity="0.4" />
      <rect x="6" y="6" width="148" height="68" fill="none" stroke="#fbbf24" strokeWidth="2" opacity="0.6" />
      <rect x="14" y="14" width="132" height="52" fill="none" stroke="#fbbf24" strokeWidth="1" opacity="0.4" />
    </g>
  );
}

function ZoneLabel({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <text
      x={x}
      y={y}
      fontSize="11"
      fontWeight="900"
      fontFamily="monospace"
      fill="#e6eaf5"
      opacity="0.35"
      letterSpacing="2"
    >
      {text}
    </text>
  );
}

/* ---------------------------------------------------------------- */
/*  Desk unit — chair + desk + monitor + character + bubble          */
/* ---------------------------------------------------------------- */

interface DeskUnitProps {
  pos: DeskPos;
  employee: EmployeeMeta;
  job?: ClientJob;
  onClick: () => void;
}

function DeskUnit({ pos, employee, job, onClick }: DeskUnitProps) {
  const isWorking =
    job?.status === "running" || job?.status === "queued" ||
    (job?.currentActivity && job?.status !== "done");
  const isThinking =
    !!job?.currentActivity && /กำลังคิด|thinking/i.test(job.currentActivity);

  const accentColor = ACCENT_HEX[employee.accent];
  const shirtColor = SHIRT_HEX[employee.accent];

  // Render in % of the room so it scales with the parent box.
  const leftPct = (pos.x / ROOM_W) * 100;
  const topPct = (pos.y / ROOM_H) * 100;
  const widthPct = (140 / ROOM_W) * 100;
  const heightPct = (170 / ROOM_H) * 100;

  return (
    <button
      onClick={onClick}
      className="office-desk-unit group absolute"
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        width: `${widthPct}%`,
        height: `${heightPct}%`,
      }}
      title={`${employee.name} — ${employee.title}`}
    >
      <div className="relative h-full w-full">
        {/* Speech bubble — shown only when working */}
        {isWorking && (
          <div
            className="office-bubble-v2 absolute left-1/2 -top-1 z-20 -translate-x-1/2 -translate-y-full"
            style={{
              borderColor: accentColor,
              width: "180%",
              maxWidth: "180%",
            }}
          >
            <p className="font-mono text-[10px] leading-tight text-ink">
              {truncate(
                job?.currentActivity ||
                  (job?.status === "queued" ? "เข้าคิวรอ…" : "กำลังทำงาน…"),
                80,
              )}
            </p>
            <span
              className="office-bubble-v2-tail"
              style={{ borderTopColor: accentColor }}
            />
          </div>
        )}

        {/* Pulse aura when working */}
        {isWorking && (
          <span
            className="office-aura"
            style={{ background: accentColor }}
            aria-hidden
          />
        )}

        {/* SVG of desk + chair + monitor + character */}
        <svg
          viewBox="0 0 140 170"
          className="absolute inset-0 h-full w-full"
          shapeRendering="crispEdges"
        >
          {/* drop shadow */}
          <ellipse cx="70" cy="158" rx="50" ry="8" fill="#000" opacity="0.25" />

          {/* Chair back */}
          <rect x="50" y="100" width="40" height="40" fill="#1f2937" />
          <rect x="50" y="100" width="40" height="6" fill="#374151" />
          {/* Chair seat */}
          <rect x="46" y="138" width="48" height="14" fill="#374151" />

          {/* Character body (shirt) — behind desk so only top half visible */}
          <rect x="56" y="86" width="28" height="40" fill={shirtColor} />
          <rect x="56" y="86" width="28" height="4" fill="#000" opacity="0.18" />
          {/* Arms reaching forward */}
          <rect x="48" y="92" width="8" height="22" fill={shirtColor} />
          <rect x="84" y="92" width="8" height="22" fill={shirtColor} />

          {/* Avatar head — drawn natively as SVG so it always renders */}
          <Head look={LOOKS[employee.slug]} cx={70} cy={66} working={!!isWorking} />

          {/* Desk surface (in front of character) */}
          <rect x="18" y="118" width="104" height="20" fill="#8b6f47" />
          <rect x="18" y="118" width="104" height="4" fill="#5b4429" />
          {/* Desk legs */}
          <rect x="22" y="138" width="6" height="14" fill="#5b4429" />
          <rect x="112" y="138" width="6" height="14" fill="#5b4429" />

          {/* Monitor (on top of desk surface) */}
          <rect x="46" y="84" width="48" height="34" fill="#0f172a" />
          <rect x="48" y="86" width="44" height="28" fill={isWorking ? "#0ea5e9" : "#1e293b"}>
            {isWorking && (
              <animate
                attributeName="fill"
                values="#0ea5e9;#22d3ee;#0ea5e9"
                dur="2s"
                repeatCount="indefinite"
              />
            )}
          </rect>
          {/* Monitor stand */}
          <rect x="64" y="118" width="12" height="6" fill="#0f172a" />

          {/* Keyboard */}
          <rect x="42" y="126" width="56" height="6" fill="#0f172a" />
          <rect x="44" y="128" width="52" height="2" fill="#334155" />

          {/* Mouse */}
          <rect x="102" y="126" width="10" height="8" rx="3" fill="#1f2937" />

          {/* Mug on side of desk */}
          <rect x="22" y="120" width="10" height="10" fill={accentColor} />
          <rect x="32" y="122" width="3" height="6" fill={accentColor} />
        </svg>

        {/* Name plate */}
        <div className="absolute bottom-0 left-1/2 z-10 -translate-x-1/2 translate-y-1/2">
          <div
            className="border-2 bg-bg/85 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-ink"
            style={{ borderColor: accentColor }}
          >
            {employee.firstName}
          </div>
        </div>

        {/* Status dot in corner */}
        <span
          className={
            "absolute right-1 top-1 z-10 inline-block h-2 w-2 rounded-full " +
            (isWorking
              ? isThinking
                ? "bg-amber-400 animate-pulse"
                : "bg-emerald-400 animate-pulse"
              : "bg-slate-500")
          }
        />
      </div>
    </button>
  );
}

function truncate(s: string, n: number) {
  if (!s) return "";
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

/* ---------------------------------------------------------------- */
/*  Head — procedural pixel-art character head                       */
/* ---------------------------------------------------------------- */

function Head({
  look,
  cx,
  cy,
  working,
}: {
  look: CharacterLook;
  cx: number;
  cy: number;
  working: boolean;
}) {
  const { skin, hair, hairStyle, glasses } = look;
  const headR = 14;
  // Face — slightly square for pixel feel
  return (
    <g transform={`translate(${cx - headR}, ${cy - headR})`}>
      {/* neck */}
      <rect x={headR - 4} y={headR * 2 - 4} width="8" height="6" fill={skin} />
      <rect x={headR - 4} y={headR * 2 - 2} width="8" height="2" fill="#000" opacity="0.18" />

      {/* face (rectangular pixel head) */}
      <rect x="2" y="4" width="24" height="22" fill={skin} />
      {/* cheek shadow */}
      <rect x="2" y="22" width="24" height="4" fill={skin} filter="brightness(0.92)" opacity="0.4" />

      {/* hair (varies by style) */}
      <HairLayer style={hairStyle} hair={hair} />

      {/* eyes */}
      {working ? (
        // Concentration look — line eyes
        <>
          <rect x="8" y="14" width="3" height="1" fill="#000" />
          <rect x="17" y="14" width="3" height="1" fill="#000" />
        </>
      ) : (
        // Open eyes
        <>
          <rect x="8" y="13" width="2" height="3" fill="#000" />
          <rect x="18" y="13" width="2" height="3" fill="#000" />
        </>
      )}

      {/* mouth */}
      {working ? (
        <rect x="12" y="20" width="4" height="1" fill="#7f1d1d" />
      ) : (
        <rect x="12" y="20" width="4" height="2" fill="#7f1d1d" />
      )}

      {/* glasses */}
      {glasses && (
        <>
          <rect x="6" y="12" width="7" height="5" fill="none" stroke="#0f172a" strokeWidth="1.2" />
          <rect x="15" y="12" width="7" height="5" fill="none" stroke="#0f172a" strokeWidth="1.2" />
          <rect x="13" y="14" width="2" height="1" fill="#0f172a" />
        </>
      )}
    </g>
  );
}

function HairLayer({ style, hair }: { style: HairStyle; hair: string }) {
  switch (style) {
    case "short":
      return (
        <>
          <rect x="2" y="2" width="24" height="6" fill={hair} />
          <rect x="2" y="6" width="3" height="6" fill={hair} />
          <rect x="23" y="6" width="3" height="6" fill={hair} />
        </>
      );
    case "long":
      return (
        <>
          <rect x="2" y="2" width="24" height="8" fill={hair} />
          <rect x="0" y="6" width="4" height="22" fill={hair} />
          <rect x="24" y="6" width="4" height="22" fill={hair} />
        </>
      );
    case "bun":
      return (
        <>
          <rect x="2" y="4" width="24" height="6" fill={hair} />
          <rect x="2" y="6" width="2" height="8" fill={hair} />
          <rect x="24" y="6" width="2" height="8" fill={hair} />
          {/* bun on top */}
          <circle cx="14" cy="2" r="4" fill={hair} />
        </>
      );
    case "buzz":
      return <rect x="2" y="2" width="24" height="4" fill={hair} opacity="0.85" />;
    case "cap":
      return (
        <>
          {/* hair under cap */}
          <rect x="2" y="6" width="24" height="4" fill={hair} />
          {/* cap crown */}
          <rect x="2" y="0" width="24" height="8" fill="#0c4a6e" />
          {/* cap brim */}
          <rect x="14" y="6" width="14" height="2" fill="#0369a1" />
        </>
      );
    case "ponytail":
      return (
        <>
          <rect x="2" y="2" width="24" height="6" fill={hair} />
          <rect x="2" y="6" width="3" height="8" fill={hair} />
          <rect x="23" y="6" width="3" height="8" fill={hair} />
          {/* ponytail tail */}
          <rect x="26" y="6" width="3" height="16" fill={hair} />
          <rect x="29" y="10" width="2" height="10" fill={hair} />
        </>
      );
    case "afro":
      return (
        <>
          <circle cx="14" cy="4" r="12" fill={hair} />
          <circle cx="6" cy="8" r="5" fill={hair} />
          <circle cx="22" cy="8" r="5" fill={hair} />
          <rect x="2" y="2" width="24" height="6" fill={hair} />
        </>
      );
    case "bob":
      return (
        <>
          <rect x="2" y="2" width="24" height="6" fill={hair} />
          <rect x="0" y="2" width="4" height="14" fill={hair} />
          <rect x="24" y="2" width="4" height="14" fill={hair} />
        </>
      );
    default:
      return null;
  }
}

/* ---------------------------------------------------------------- */
/*  Accent color lookups (hex — SVG fill doesn't read Tailwind)      */
/* ---------------------------------------------------------------- */

const ACCENT_HEX: Record<EmployeeMeta["accent"], string> = {
  indigo: "#818cf8",
  rose: "#fb7185",
  amber: "#fbbf24",
  emerald: "#34d399",
  sky: "#38bdf8",
  violet: "#a78bfa",
  teal: "#2dd4bf",
  fuchsia: "#e879f9",
  cyan: "#22d3ee",
  pink: "#f472b6",
  orange: "#fb923c",
};

// Slightly darker / saturated shirt colors so the character pops.
const SHIRT_HEX: Record<EmployeeMeta["accent"], string> = {
  indigo: "#6366f1",
  rose: "#e11d48",
  amber: "#d97706",
  emerald: "#10b981",
  sky: "#0284c7",
  violet: "#7c3aed",
  teal: "#14b8a6",
  fuchsia: "#c026d3",
  cyan: "#06b6d4",
  pink: "#db2777",
  orange: "#ea580c",
};
