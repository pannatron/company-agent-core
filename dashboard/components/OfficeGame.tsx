"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  EMPLOYEES,
  EmployeeMeta,
  EmployeeSlug,
  getEmployee,
} from "@/lib/employees";
import { ClientJob } from "@/lib/useJobStream";

/* ================================================================== *
 *  OfficeGame — a walkable, top-down 8-bit office.
 *
 *  Control the Borot mascot with WASD / arrow keys (or click to walk).
 *  Walk up to a desk to talk to that employee, or up to a board to read
 *  live company data (KPI / sales / finance / support / content).
 *
 *  Rendering is plain <canvas> with `image-rendering: pixelated` so the
 *  generated 8-bit sprites stay crisp. The engine is tolerant of missing
 *  art: every sprite + the floor fall back to procedural pixel drawings,
 *  so the office is fully playable before any GPT-Image asset lands and
 *  only gets prettier once the PNGs are dropped into /public.
 *
 *  Asset contract (drop these in and they're picked up automatically):
 *    /public/office/floor.png      — full WORLD_W×WORLD_H top-down map
 *    /public/sprites/_player.png   — Borot walk sheet, 3 cols × 4 rows
 *                                    rows = down,left,right,up
 *    /public/sprites/<slug>.png    — employee sheet, 2 cols × 2 rows
 *                                    poses = idle,typing,talking,cheer
 * ================================================================== */

/* ---- World geometry (matches the 3:2 generated floor art) --------- */
const WORLD_W = 1536;
const WORLD_H = 1024;
const WALL_H = 150; // top wall band — not walkable

/* Player */
const PLAYER_W = 44;
const PLAYER_H = 56;
const SPEED = 3.4; // px / frame @60fps

/* How close (px, centre→rect edge) you must stand to interact */
const INTERACT_RANGE = 72;

/* ---- Desks ------------------------------------------------------- */
interface Desk {
  slug: EmployeeSlug;
  x: number;
  y: number;
  w: number;
  h: number;
  zone: string;
}
const DESK_W = 130;
const DESK_H = 96;
const DESKS: Desk[] = [
  // Executive — top-left
  { slug: "ceo", x: 150, y: 230, w: DESK_W, h: DESK_H, zone: "EXECUTIVE" },
  // Creative Studio — top-right row
  { slug: "marketing-lead", x: 760, y: 230, w: DESK_W, h: DESK_H, zone: "CREATIVE STUDIO" },
  { slug: "content-designer", x: 940, y: 230, w: DESK_W, h: DESK_H, zone: "CREATIVE STUDIO" },
  { slug: "copywriter", x: 1120, y: 230, w: DESK_W, h: DESK_H, zone: "CREATIVE STUDIO" },
  { slug: "social-media-manager", x: 1300, y: 230, w: DESK_W, h: DESK_H, zone: "CREATIVE STUDIO" },
  // Revenue — mid-left
  { slug: "sales-rep", x: 150, y: 560, w: DESK_W, h: DESK_H, zone: "REVENUE" },
  { slug: "finance-analyst", x: 340, y: 560, w: DESK_W, h: DESK_H, zone: "REVENUE" },
  // Ops & People — mid-right
  { slug: "ops-manager", x: 900, y: 560, w: DESK_W, h: DESK_H, zone: "OPS & PEOPLE" },
  { slug: "hr-manager", x: 1080, y: 560, w: DESK_W, h: DESK_H, zone: "OPS & PEOPLE" },
  { slug: "kpi-analyst", x: 1260, y: 560, w: DESK_W, h: DESK_H, zone: "OPS & PEOPLE" },
  // Customer Front — bottom centre
  { slug: "customer-support", x: 720, y: 840, w: DESK_W, h: DESK_H, zone: "CUSTOMER FRONT" },
];

/* ---- Boards: walk up + press E to read live data ----------------- */
type BoardKind = "kpi" | "sales" | "finance" | "support" | "content" | "social" | "hub";
interface Board {
  id: BoardKind;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
}
// One big central "data hub" board, centred in the open band between the top
// desks (bottom ~326) and the middle desks (top 560). Walk up + press E to open
// the dashboard, which has tabs for every department's data. The footprint box
// is the interaction/collision area; the art is drawn taller, rising above it.
const BOARD_W = 320;
const BOARD_H = 126;
const BOARDS: Board[] = [
  { id: "hub", title: "Company Data", x: (WORLD_W - 320) / 2 - 80, y: 426, w: BOARD_W, h: BOARD_H, color: "#67e8f9" },
];

// Per-person seat lift (px). 0 = sit at the default desk line like everyone
// else; Alex's portrait has extra headroom in its cell so it needs a nudge up
// to clear the desk. Only deviate for individuals who look wrong.
const SEAT_LIFT: Partial<Record<EmployeeSlug, number>> = {
  "ceo": 18,
  "ops-manager": 18,
  "customer-support": 18,
};

// Short role label shown on each desk's 8-bit nameplate (under the first name).
const ROLE_LABEL: Record<EmployeeSlug, string> = {
  "ceo": "CEO",
  "sales-rep": "Sales",
  "marketing-lead": "Marketing",
  "content-designer": "Designer",
  "copywriter": "Copywriter",
  "social-media-manager": "Social",
  "hr-manager": "HR",
  "finance-analyst": "Finance",
  "ops-manager": "Ops",
  "kpi-analyst": "Data / KPI",
  "customer-support": "Support",
};

/* ---- Sprite-sheet layout contract -------------------------------- */
const PLAYER_COLS = 3;
const PLAYER_ROWS = 4;
type Dir = "down" | "left" | "right" | "up";
const DIR_ROW: Record<Dir, number> = { down: 0, left: 1, right: 2, up: 3 };

/* ================================================================== */

interface Props {
  jobsBySlug: Map<string, ClientJob>;
  onOpenDirect: (slug: EmployeeSlug) => void;
}

interface SpriteImg {
  img: HTMLImageElement;
  ok: boolean;
}

/** Load an image; resolves {ok:false} on 404 so we can fall back. */
function loadImg(src: string): Promise<SpriteImg> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ img, ok: img.naturalWidth > 0 });
    img.onerror = () => resolve({ img, ok: false });
    img.src = src;
  });
}

/**
 * For a cols×rows sprite sheet, return per-row the fraction of each cell that is
 * transparent BELOW the lowest opaque pixel (the feet). Used to seat a sprite on
 * its shadow regardless of uneven bottom padding between poses. Returns all-0 on
 * any failure (tainted canvas, no 2d ctx) so drawing falls back to cell-bottom.
 */
function scanFootPadding(img: HTMLImageElement, cols: number, rows: number): number[] {
  try {
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    const cw = Math.floor(W / cols);
    const ch = Math.floor(H / rows);
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext("2d");
    if (!ctx) return new Array(rows).fill(0);
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, W, H).data;
    const pads: number[] = [];
    for (let r = 0; r < rows; r++) {
      const y0 = r * ch;
      let bottom = -1;
      // scan from the cell bottom up; first row with any opaque pixel = feet
      for (let y = ch - 1; y >= 0 && bottom < 0; y--) {
        for (let cxi = 0; cxi < cols; cxi++) {
          const x0 = cxi * cw;
          let opaque = false;
          for (let x = 0; x < cw; x += 2) {
            if (data[((y0 + y) * W + (x0 + x)) * 4 + 3] > 24) {
              opaque = true;
              break;
            }
          }
          if (opaque) {
            bottom = y;
            break;
          }
        }
      }
      pads.push(bottom < 0 ? 0 : (ch - 1 - bottom) / ch);
    }
    return pads;
  } catch {
    return new Array(rows).fill(0);
  }
}

export default function OfficeGame({ jobsBySlug, onOpenDirect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Mutable game state in refs so the rAF loop never restarts.
  // Spawn on clear central floor (between zones — not inside any desk/board).
  const player = useRef({ x: 620, y: 700, dir: "up" as Dir, moving: false, anim: 0 });
  const keys = useRef<Set<string>>(new Set());
  const moveTarget = useRef<{ x: number; y: number } | null>(null);
  const jobsRef = useRef(jobsBySlug);
  jobsRef.current = jobsBySlug;

  const floorRef = useRef<SpriteImg | null>(null);
  const playerSheet = useRef<SpriteImg | null>(null);
  // Fraction of each player-sheet row that is empty BELOW the feet (per
  // direction row). The "up"/back pose often has more bottom padding, which made
  // Borot float above his shadow; we shift the draw down by this much to seat
  // his feet on the shadow. Defaults to 0 until the sheet is scanned.
  const playerFootPad = useRef<number[]>([0, 0, 0, 0]);
  const empSheets = useRef<Map<string, SpriteImg>>(new Map());
  const deskSheets = useRef<Map<string, SpriteImg>>(new Map());
  const boardSheets = useRef<Map<string, SpriteImg>>(new Map());

  const camRef = useRef({ x: 0, y: 0, scale: 1 });
  const nearRef = useRef<{ kind: "desk" | "board"; id: string } | null>(null);

  // DOM overlay state (changes rarely).
  const [prompt, setPrompt] = useState<{ kind: "desk" | "board"; label: string } | null>(null);
  const [openBoard, setOpenBoard] = useState<Board | null>(null);

  /* ---- Load assets once ---- */
  useEffect(() => {
    let alive = true;
    (async () => {
      const [floor, ps] = await Promise.all([
        loadImg("/office/floor.png"),
        loadImg("/sprites/_player.png"),
      ]);
      if (!alive) return;
      floorRef.current = floor;
      playerSheet.current = ps;
      if (ps.ok) playerFootPad.current = scanFootPadding(ps.img, PLAYER_COLS, PLAYER_ROWS);
      for (const e of EMPLOYEES) {
        loadImg(`/sprites/${e.slug}.png`).then((s) => {
          if (alive) empSheets.current.set(e.slug, s);
        });
        loadImg(`/sprites/desk-${e.slug}.png`).then((s) => {
          if (alive) deskSheets.current.set(e.slug, s);
        });
      }
      for (const b of BOARDS) {
        loadImg(`/sprites/board-${b.id}.png`).then((s) => {
          if (alive) boardSheets.current.set(b.id, s);
        });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* ---- Interaction ---- */
  const interact = useCallback(() => {
    const near = nearRef.current;
    if (!near) return;
    if (near.kind === "desk") {
      onOpenDirect(near.id as EmployeeSlug);
    } else {
      const b = BOARDS.find((x) => x.id === near.id);
      if (b) setOpenBoard(b);
    }
  }, [onOpenDirect]);

  /* ---- Keyboard ---- */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
      if (k === "e" || k === "enter" || k === " ") {
        if (openBoard) setOpenBoard(null);
        else interact();
        return;
      }
      if (k === "escape") setOpenBoard(null);
      keys.current.add(k);
      moveTarget.current = null; // keyboard cancels click-to-move
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [interact, openBoard]);

  /* ---- Click-to-move ---- */
  const onCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (openBoard) return;
      const cv = canvasRef.current;
      if (!cv) return;
      const rect = cv.getBoundingClientRect();
      const cam = camRef.current;
      const wx = (e.clientX - rect.left) / cam.scale + cam.x;
      const wy = (e.clientY - rect.top) / cam.scale + cam.y;
      moveTarget.current = { x: wx, y: wy };
    },
    [openBoard],
  );

  /* ---- Main loop ---- */
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    let raf = 0;

    const SOLIDS = [
      ...DESKS.map((d) => ({ x: d.x, y: d.y, w: d.w, h: d.h })),
      ...BOARDS.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h })),
    ];

    const hits = (x: number, y: number) => {
      const half = PLAYER_W / 2;
      const footY = y + PLAYER_H / 2 - 8;
      if (x - half < 8 || x + half > WORLD_W - 8) return true;
      if (footY < WALL_H || y + PLAYER_H / 2 > WORLD_H - 8) return true;
      for (const s of SOLIDS) {
        if (x + half > s.x && x - half < s.x + s.w && footY > s.y && footY < s.y + s.h) return true;
      }
      return false;
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
    };
    resize();
    window.addEventListener("resize", resize);

    const step = () => {
      const p = player.current;
      const k = keys.current;

      let vx = 0;
      let vy = 0;
      if (k.has("a") || k.has("arrowleft")) vx -= 1;
      if (k.has("d") || k.has("arrowright")) vx += 1;
      if (k.has("w") || k.has("arrowup")) vy -= 1;
      if (k.has("s") || k.has("arrowdown")) vy += 1;

      const mt = moveTarget.current;
      if (!vx && !vy && mt) {
        const dx = mt.x - p.x;
        const dy = mt.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 6) {
          vx = dx / dist;
          vy = dy / dist;
        } else {
          moveTarget.current = null;
        }
      }

      const len = Math.hypot(vx, vy) || 1;
      vx = (vx / len) * SPEED;
      vy = (vy / len) * SPEED;
      p.moving = !!(vx || vy);

      if (p.moving) {
        if (Math.abs(vx) > Math.abs(vy)) p.dir = vx < 0 ? "left" : "right";
        else p.dir = vy < 0 ? "up" : "down";
        if (!hits(p.x + vx, p.y)) p.x += vx;
        if (!hits(p.x, p.y + vy)) p.y += vy;
        p.anim += 0.18;
      } else {
        p.anim = 0;
      }

      // nearest interactable
      let best: { kind: "desk" | "board"; id: string; label: string; d: number } | null = null;
      const consider = (
        kind: "desk" | "board",
        id: string,
        label: string,
        r: { x: number; y: number; w: number; h: number },
      ) => {
        const cx = Math.max(r.x, Math.min(p.x, r.x + r.w));
        const cy = Math.max(r.y, Math.min(p.y, r.y + r.h));
        const d = Math.hypot(p.x - cx, p.y - cy);
        if (d < INTERACT_RANGE && (!best || d < best.d)) best = { kind, id, label, d };
      };
      for (const d of DESKS) {
        const e = getEmployee(d.slug);
        consider("desk", d.slug, e ? `คุยกับ ${e.firstName}` : d.slug, d);
      }
      for (const b of BOARDS) consider("board", b.id, `ดูบอร์ด ${b.title}`, b);

      const nb = best as { kind: "desk" | "board"; id: string; label: string } | null;
      const prevId = nearRef.current?.id;
      if ((nb?.id || null) !== (prevId || null)) {
        nearRef.current = nb ? { kind: nb.kind, id: nb.id } : null;
        setPrompt(nb ? { kind: nb.kind, label: nb.label } : null);
      }

      // camera
      const viewW = cv.clientWidth;
      const viewH = cv.clientHeight;
      const scale = Math.max(viewW / WORLD_W, viewH / WORLD_H, 0.5);
      let camX = p.x - viewW / scale / 2;
      let camY = p.y - viewH / scale / 2;
      camX = Math.max(0, Math.min(camX, WORLD_W - viewW / scale));
      camY = Math.max(0, Math.min(camY, WORLD_H - viewH / scale));
      camRef.current = { x: camX, y: camY, scale };

      draw(ctx, cv, camX, camY, scale);
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- Drawing ---- */
  const draw = (
    ctx: CanvasRenderingContext2D,
    cv: HTMLCanvasElement,
    camX: number,
    camY: number,
    scale: number,
  ) => {
    const viewW = cv.clientWidth;
    const viewH = cv.clientHeight;
    ctx.clearRect(0, 0, viewW, viewH);
    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(-camX, -camY);

    const floor = floorRef.current;
    if (floor?.ok) ctx.drawImage(floor.img, 0, 0, WORLD_W, WORLD_H);
    else drawProcFloor(ctx);

    const near = nearRef.current;
    // Depth-sort desks + boards together by their baseline (y+h) so nearer
    // (lower) objects paint over farther (higher) ones. The centre board row
    // (y372) thus correctly draws in front of the top desks (y230) but behind
    // the middle desks (y560).
    type Drawable =
      | { kind: "desk"; y: number; d: Desk }
      | { kind: "board"; y: number; b: Board };
    const drawables: Drawable[] = [
      ...DESKS.map((d) => ({ kind: "desk" as const, y: d.y + d.h, d })),
      ...BOARDS.map((b) => ({ kind: "board" as const, y: b.y + b.h, b })),
    ].sort((a, z) => a.y - z.y);

    for (const it of drawables) {
      if (it.kind === "board") {
        drawBoard(ctx, it.b, near?.kind === "board" && near.id === it.b.id);
      } else {
        const e = getEmployee(it.d.slug);
        if (!e) continue;
        const job = jobsRef.current.get(it.d.slug);
        const working = !!job && (job.status === "running" || job.status === "queued");
        drawDesk(ctx, it.d, e, working, near?.kind === "desk" && near.id === it.d.slug);
        if (working && job?.currentActivity) drawBubble(ctx, it.d, job.currentActivity);
      }
    }

    drawPlayer(ctx);
    ctx.restore();
  };

  const drawProcFloor = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = "#2b2c40";
    ctx.fillRect(0, 0, WORLD_W, WALL_H);
    for (let y = WALL_H; y < WORLD_H; y += 40) {
      for (let x = 0; x < WORLD_W; x += 80) {
        ctx.fillStyle = (Math.floor(x / 80) + Math.floor(y / 40)) % 2 ? "#5b4233" : "#634a39";
        ctx.fillRect(x, y, 80, 40);
      }
    }
    const rugs: [number, number, number, number, string][] = [
      [100, 180, 320, 220, "#fbbf24"],
      [720, 180, 740, 220, "#a78bfa"],
      [100, 510, 380, 200, "#f87171"],
      [860, 510, 560, 200, "#34d399"],
      [660, 790, 320, 180, "#38bdf8"],
    ];
    ctx.globalAlpha = 0.16;
    for (const [x, y, w, h, c] of rugs) {
      ctx.fillStyle = c;
      ctx.fillRect(x, y, w, h);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(230,234,245,0.32)";
    ctx.font = "bold 18px monospace";
    const labels: [string, number, number][] = [
      ["EXECUTIVE", 130, 208],
      ["CREATIVE STUDIO", 760, 208],
      ["REVENUE", 130, 540],
      ["OPS & PEOPLE", 900, 540],
      ["CUSTOMER FRONT", 720, 818],
    ];
    for (const [t, x, y] of labels) ctx.fillText(t, x, y);
  };

  const drawBoard = (ctx: CanvasRenderingContext2D, b: Board, highlight: boolean) => {
    const cx = b.x + b.w / 2;
    // soft contact shadow on the floor
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(cx, b.y + b.h - 4, b.w / 2, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    const art = boardSheets.current.get(b.id);
    if (art?.ok) {
      // Standing board art: anchor its bottom at the footprint bottom; it rises
      // upward (taller than the box) like a sign on a stand.
      const dw = b.w + 16;
      const dh = (art.img.naturalHeight / art.img.naturalWidth) * dw;
      ctx.drawImage(art.img, cx - dw / 2, b.y + b.h - dh, dw, dh);
    } else {
      // Procedural board fallback (original whiteboard look).
      ctx.fillStyle = "#1f2430";
      ctx.fillRect(cx - 6, b.y + b.h, 12, 24);
      ctx.fillStyle = "#11131c";
      ctx.fillRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8);
      ctx.fillStyle = "#e8edf7";
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, 16);
      ctx.fillStyle = "#9aa3b2";
      for (let i = 0; i < 3; i++) ctx.fillRect(b.x + 8, b.y + 28 + i * 12, b.w - 36, 4);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x + 8, b.y + 24, 16, 16);
    }

    // 8-bit title plate at the board's base (crisp text, accent frame).
    drawBoardPlate(ctx, b);

    if (highlight) {
      ctx.strokeStyle = "#fde047";
      ctx.lineWidth = 3;
      ctx.strokeRect(b.x - 6, b.y - 116, b.w + 12, b.h + 132);
    }
  };

  // Pixel plaque under a board showing its title in the board's accent colour.
  const drawBoardPlate = (ctx: CanvasRenderingContext2D, b: Board) => {
    const cx = b.x + b.w / 2;
    const top = b.y + b.h + 2;
    const label = b.title.toUpperCase();
    ctx.font = "bold 9px monospace";
    const w = Math.max(60, ctx.measureText(label).width + 16);
    const h = 16;
    const x = cx - w / 2;
    ctx.fillStyle = "#0b0d16";
    ctx.fillRect(x - 2, top - 2, w + 4, h + 4);
    ctx.fillStyle = b.color;
    ctx.fillRect(x - 1, top - 1, w + 2, h + 2);
    ctx.fillStyle = "rgba(10,12,22,0.92)";
    ctx.fillRect(x, top, w, h);
    ctx.fillStyle = b.color;
    ctx.fillRect(x, top, w, 2);
    ctx.textAlign = "center";
    ctx.fillStyle = "#f4f7ff";
    ctx.font = "bold 9px monospace";
    ctx.fillText(label, cx, top + 11);
    ctx.textAlign = "left";
  };

  const drawDesk = (
    ctx: CanvasRenderingContext2D,
    d: Desk,
    e: EmployeeMeta,
    working: boolean,
    highlight: boolean,
  ) => {
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(d.x + d.w / 2, d.y + d.h - 6, d.w / 2, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    const sheet = empSheets.current.get(d.slug);
    const desk = deskSheets.current.get(d.slug);
    const sx = d.x + d.w / 2;
    // Seat the worker at a fixed offset inside the desk footprint — consistent
    // for everyone regardless of how tall their desk art is. SEAT_LIFT nudges
    // individual people up when their portrait sits low in its cell (e.g. Alex,
    // whose sprite has extra headroom and otherwise sinks into the desk).
    const footY = d.y + d.h - 16 - (SEAT_LIFT[d.slug] || 0);
    if (sheet?.ok) {
      const cols = 2;
      const pose = working ? 1 : 0; // typing when working, else idle
      const cw = sheet.img.naturalWidth / cols;
      const ch = sheet.img.naturalHeight / 2;
      const px = (pose % cols) * cw;
      const py = Math.floor(pose / cols) * ch;
      const dw = 88;
      const dh = (ch / cw) * dw;
      ctx.drawImage(sheet.img, px, py, cw, ch, sx - dw / 2, footY - dh, dw, dh);
    } else {
      drawProcPerson(ctx, sx, d.y + 24, e.accent, working);
    }

    // Desk + role-specific gear, drawn in front of the seated worker. The art's
    // gear sits in its lower half, so it covers only the worker's lower body.
    if (desk?.ok) {
      const deskW = d.w + 36;
      const deskH = (desk.img.naturalHeight / desk.img.naturalWidth) * deskW;
      ctx.drawImage(desk.img, sx - deskW / 2, d.y + d.h - deskH, deskW, deskH);
    } else {
      // Procedural desk fallback (original look).
      ctx.fillStyle = "#8b6f47";
      ctx.fillRect(d.x, d.y + d.h - 34, d.w, 24);
      ctx.fillStyle = "#5b4429";
      ctx.fillRect(d.x, d.y + d.h - 34, d.w, 5);
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(d.x + d.w / 2 - 22, d.y + d.h - 56, 44, 26);
      ctx.fillStyle = working ? "#22d3ee" : "#1e293b";
      ctx.fillRect(d.x + d.w / 2 - 19, d.y + d.h - 53, 38, 20);
    }

    // 8-bit nameplate: first name + role title, accent-framed plaque.
    drawNameplate(ctx, d, e, working);

    if (highlight) {
      ctx.strokeStyle = "#fde047";
      ctx.lineWidth = 3;
      ctx.strokeRect(d.x - 6, d.y - 76, d.w + 12, d.h + 96);
    }
  };

  // A small pixel-art plaque under the desk: NAME on top, role label below,
  // accent-coloured frame, and a working/idle status dot. Drawn natively so the
  // text stays crisp at any zoom (GPT-Image bakes garbled text).
  const drawNameplate = (
    ctx: CanvasRenderingContext2D,
    d: Desk,
    e: EmployeeMeta,
    working: boolean,
  ) => {
    const accent = ACCENT[e.accent] || "#fff";
    const name = e.firstName.toUpperCase();
    const role = (ROLE_LABEL[d.slug] || "").toUpperCase();
    const cx = d.x + d.w / 2;
    const top = d.y + d.h + 2;

    ctx.font = "bold 10px monospace";
    const nameW = ctx.measureText(name).width;
    ctx.font = "7px monospace";
    const roleW = role ? ctx.measureText(role).width : 0;
    const w = Math.max(54, nameW + 16, roleW + 14);
    const h = role ? 26 : 16;
    const x = cx - w / 2;

    ctx.fillStyle = "#0b0d16";
    ctx.fillRect(x - 2, top - 2, w + 4, h + 4);
    ctx.fillStyle = accent;
    ctx.fillRect(x - 1, top - 1, w + 2, h + 2);
    ctx.fillStyle = "rgba(10,12,22,0.92)";
    ctx.fillRect(x, top, w, h);
    ctx.fillStyle = accent;
    ctx.fillRect(x, top, w, 2);

    ctx.fillStyle = working ? "#34d399" : "#64748b";
    ctx.beginPath();
    ctx.arc(x + w - 5, top + 5, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.textAlign = "center";
    ctx.fillStyle = "#f4f7ff";
    ctx.font = "bold 10px monospace";
    ctx.fillText(name, cx, top + 10);
    if (role) {
      ctx.fillStyle = accent;
      ctx.font = "7px monospace";
      ctx.fillText(role, cx, top + 20);
    }
    ctx.textAlign = "left";
  };

  const drawProcPerson = (
    ctx: CanvasRenderingContext2D,
    cx: number,
    feetY: number,
    accent: EmployeeMeta["accent"],
    working: boolean,
  ) => {
    const skin = "#f3c896";
    const shirt = ACCENT[accent] || "#888";
    ctx.fillStyle = shirt;
    ctx.fillRect(cx - 12, feetY - 34, 24, 26);
    ctx.fillStyle = skin;
    ctx.fillRect(cx - 10, feetY - 52, 20, 20);
    ctx.fillStyle = "#27201a";
    ctx.fillRect(cx - 11, feetY - 54, 22, 7);
    ctx.fillStyle = "#11131c";
    if (working) {
      ctx.fillRect(cx - 6, feetY - 42, 3, 1);
      ctx.fillRect(cx + 3, feetY - 42, 3, 1);
    } else {
      ctx.fillRect(cx - 6, feetY - 43, 2, 3);
      ctx.fillRect(cx + 4, feetY - 43, 2, 3);
    }
  };

  const drawBubble = (ctx: CanvasRenderingContext2D, d: Desk, text: string) => {
    const t = text.length > 40 ? text.slice(0, 39) + "…" : text;
    ctx.font = "10px monospace";
    const w = Math.min(220, ctx.measureText(t).width + 16);
    const x = d.x + d.w / 2 - w / 2;
    const y = d.y - 98;
    ctx.fillStyle = "rgba(8,10,18,0.92)";
    ctx.fillRect(x, y, w, 26);
    ctx.fillStyle = "#67e8f9";
    ctx.fillRect(x, y, w, 3);
    ctx.fillStyle = "#e8edf7";
    ctx.fillText(t, x + 8, y + 17);
  };

  const drawPlayer = (ctx: CanvasRenderingContext2D) => {
    const p = player.current;
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + PLAYER_H / 2 - 4, PLAYER_W / 2, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    const sheet = playerSheet.current;
    if (sheet?.ok) {
      const cw = sheet.img.naturalWidth / PLAYER_COLS;
      const ch = sheet.img.naturalHeight / PLAYER_ROWS;
      const frame = p.moving ? Math.floor(p.anim) % PLAYER_COLS : 1;
      const row = DIR_ROW[p.dir];
      // Draw Borot larger than its collision box so he reads at the same scale
      // as the seated employees (~92px) instead of looking tiny next to them.
      const dw = 92;
      const dh = (ch / cw) * dw;
      // Shift down by the row's empty bottom padding so the feet (not the cell
      // edge) land on the shadow — fixes the back-facing pose floating.
      const pad = (playerFootPad.current[row] || 0) * dh;
      const top = p.y + PLAYER_H / 2 - dh + pad;
      ctx.drawImage(sheet.img, frame * cw, row * ch, cw, ch, p.x - dw / 2, top, dw, dh);
    } else {
      drawProcBorot(ctx, p.x, p.y, p.dir, p.moving, p.anim);
    }
  };

  // Procedural Borot — the half-golden-lion / half-silver-metal mascot,
  // used only until the generated sprite sheet (_player.png) loads. Left
  // side = warm lion fur, right side = chrome robot, so the fallback stays
  // on-brand if the art 404s.
  const drawProcBorot = (
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    dir: Dir,
    moving: boolean,
    anim: number,
  ) => {
    const GOLD = "#f6b53c";
    const GOLD_D = "#c8861a";
    const SILVER = "#cbd5e1";
    const SILVER_D = "#94a3b8";
    const bob = moving ? Math.sin(anim * 2) * 2 : 0;
    const top = cy - PLAYER_H / 2 + bob;
    const legPhase = moving ? Math.sin(anim * 2) * 4 : 0;

    // legs (left golden, right silver)
    ctx.fillStyle = GOLD_D;
    ctx.fillRect(cx - 10, cy + 14, 7, 12 + legPhase);
    ctx.fillStyle = SILVER_D;
    ctx.fillRect(cx + 3, cy + 14, 7, 12 - legPhase);

    // body — split down the middle
    ctx.fillStyle = GOLD;
    ctx.fillRect(cx - 14, top + 18, 14, 22);
    ctx.fillStyle = SILVER;
    ctx.fillRect(cx, top + 18, 14, 22);
    // belt / chest plate
    ctx.fillStyle = "#7c4a12";
    ctx.fillRect(cx - 14, top + 34, 14, 6);
    ctx.fillStyle = SILVER_D;
    ctx.fillRect(cx, top + 34, 14, 6);
    // chest emblem
    ctx.fillStyle = "#fde047";
    ctx.fillRect(cx - 3, top + 24, 6, 6);

    // head — golden mane left, chrome dome right
    if (dir === "up") {
      // back: full mane + tail tuft
      ctx.fillStyle = GOLD;
      ctx.fillRect(cx - 13, top - 2, 13, 22);
      ctx.fillStyle = SILVER;
      ctx.fillRect(cx, top - 2, 13, 22);
      ctx.fillStyle = GOLD_D;
      ctx.fillRect(cx + 12, top + 20, 4, 8); // tail
      ctx.fillStyle = "#5b2c0a";
      ctx.fillRect(cx + 14, top + 26, 4, 4); // tail tuft
      return;
    }
    // mane ring (left golden fluff)
    ctx.fillStyle = GOLD_D;
    ctx.fillRect(cx - 15, top - 2, 17, 24);
    ctx.fillStyle = GOLD;
    ctx.fillRect(cx - 13, top, 13, 20);
    // chrome head right half
    ctx.fillStyle = SILVER;
    ctx.fillRect(cx, top, 13, 20);
    ctx.fillStyle = SILVER_D;
    ctx.fillRect(cx, top, 13, 3);
    // ears: lion (left, round) + mech (right, square)
    ctx.fillStyle = GOLD_D;
    ctx.fillRect(cx - 13, top - 4, 5, 5);
    ctx.fillStyle = SILVER_D;
    ctx.fillRect(cx + 8, top - 4, 5, 5);
    // eyes
    const ex = dir === "left" ? -2 : dir === "right" ? 2 : 0;
    ctx.fillStyle = "#1c1006";
    ctx.fillRect(cx - 7 + ex, top + 9, 4, 4); // lion eye
    ctx.fillStyle = "#34d399";
    ctx.fillRect(cx + 4 + ex, top + 9, 4, 4); // robot eye (glowing)
    // snout
    ctx.fillStyle = "#3a2410";
    ctx.fillRect(cx - 2, top + 14, 4, 3);
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0a0b12]">
      <canvas
        ref={canvasRef}
        onClick={onCanvasClick}
        className="h-full w-full"
        style={{ imageRendering: "pixelated", cursor: prompt ? "pointer" : "default" }}
      />

      <div className="pointer-events-none absolute left-3 top-3 select-none rounded border-2 border-border bg-bg/80 px-2.5 py-1.5 font-mono text-[10px] leading-relaxed text-ink-dim backdrop-blur-sm">
        <span className="text-ink">WASD / ลูกศร</span> เดิน · <span className="text-ink">คลิก</span> เดินไปจุด ·{" "}
        <span className="text-ink">E</span> โต้ตอบ
      </div>

      {prompt && !openBoard && (
        <div className="pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 animate-pulse rounded border-2 border-yellow-400 bg-bg/90 px-3 py-1.5 font-mono text-xs font-bold text-yellow-300 shadow-lg backdrop-blur-sm">
          กด <span className="rounded bg-yellow-400 px-1 text-black">E</span> · {prompt.label}
        </div>
      )}

      {openBoard && <BoardPanel onClose={() => setOpenBoard(null)} />}
    </div>
  );
}

/* ---- Accent hex (canvas can't read Tailwind tokens) -------------- */
const ACCENT: Record<EmployeeMeta["accent"], string> = {
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

/* ================================================================== *
 *  BoardPanel — live data modal opened from a board
 * ================================================================== */

// Tabs inside the single central hub dashboard. Each maps to a data source.
const HUB_TABS: { id: Exclude<BoardKind, "hub">; label: string; color: string }[] = [
  { id: "kpi", label: "KPI / OKR", color: "#a78bfa" },
  { id: "sales", label: "Sales", color: "#fb7185" },
  { id: "finance", label: "Finance", color: "#34d399" },
  { id: "content", label: "Content", color: "#f472b6" },
  { id: "social", label: "Social", color: "#fb923c" },
  { id: "support", label: "Support", color: "#38bdf8" },
];

function BoardPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Exclude<BoardKind, "hub">>("kpi");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][] | null>(null);
  const [kpis, setKpis] = useState<
    { name: string; current: number; target: number; unit: string; status: string }[] | null
  >(null);
  const [posts, setPosts] = useState<
    { platform?: string; status?: string; scheduled_at?: string; title?: string }[] | null
  >(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    // Reset so the previous tab's data never lingers behind the new one.
    setLoading(true);
    setErr(null);
    setRows(null);
    setKpis(null);
    setPosts(null);
    setHeaders([]);
    (async () => {
      try {
        if (tab === "kpi") {
          const r = await fetch("/api/kpi");
          const j = await r.json();
          if (alive) setKpis((j.kpis ?? []).slice(0, 12));
        } else if (tab === "social") {
          const r = await fetch("/api/social");
          if (!r.ok) throw new Error(String(r.status));
          const j = await r.json();
          if (alive) setPosts(Array.isArray(j?.posts) ? j.posts : []);
        } else {
          // Live CSV mirror; server returns { headers: string[], rows: string[][] }.
          const topic = BOARD_TOPIC[tab];
          const r = await fetch(`/api/data/sheet/${topic}`);
          if (!r.ok) throw new Error(String(r.status));
          const j = await r.json();
          if (!Array.isArray(j?.rows)) {
            throw new Error(j?.error || "รูปแบบข้อมูลไม่ถูกต้อง (เซิร์ฟเวอร์ต้อง restart?)");
          }
          if (alive) {
            setHeaders(Array.isArray(j.headers) ? j.headers : []);
            setRows(j.rows as string[][]);
          }
        }
      } catch (e) {
        if (alive) setErr(String((e as Error).message || e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [tab]);

  const active = HUB_TABS.find((t) => t.id === tab) ?? HUB_TABS[0];

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[82%] w-full max-w-2xl overflow-hidden rounded-lg border-2 border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between border-b-2 border-border px-4 py-2.5"
          style={{ background: active.color + "22" }}
        >
          <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-ink">
            📊 ศูนย์ข้อมูลบริษัท
          </h3>
          <button onClick={onClose} className="font-mono text-xs text-ink-dim hover:text-ink">
            [ ปิด · ESC ]
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex flex-wrap gap-1.5 border-b-2 border-border bg-surface-2/40 px-3 py-2">
          {HUB_TABS.map((t) => {
            const on = t.id === tab;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={[
                  "border-2 px-2.5 py-1 font-mono text-[11px] font-bold uppercase tracking-wider transition",
                  on ? "text-ink" : "border-transparent text-ink-dim hover:text-ink",
                ].join(" ")}
                style={
                  on
                    ? { borderColor: t.color, background: t.color + "22" }
                    : undefined
                }
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="max-h-[58vh] overflow-auto p-4">
          {loading && <p className="font-mono text-xs text-ink-dim">กำลังโหลด…</p>}

          {!loading &&
            kpis &&
            (kpis.length === 0 ? (
              <p className="font-mono text-xs text-ink-dim">ยังไม่มีข้อมูล KPI ใน data/kpi.json</p>
            ) : (
              <table className="w-full font-mono text-xs">
                <tbody>
                  {kpis.map((k, i) => {
                    const pct = k.target ? Math.round((k.current / k.target) * 100) : 0;
                    const c =
                      k.status === "off_track" ? "#fb7185" : k.status === "at_risk" ? "#fbbf24" : "#34d399";
                    return (
                      <tr key={i} className="border-b border-border/40">
                        <td className="py-1.5 pr-2 text-ink">{k.name}</td>
                        <td className="py-1.5 pr-2 text-right text-ink-dim">
                          {k.current} / {k.target} {k.unit}
                        </td>
                        <td className="py-1.5 text-right font-bold" style={{ color: c }}>
                          {pct}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ))}

          {!loading &&
            posts &&
            (posts.length === 0 ? (
              <p className="font-mono text-xs text-ink-dim">ยังไม่มีโพสต์ใน data/social-posts.json</p>
            ) : (
              <table className="w-full font-mono text-[11px]">
                <thead>
                  <tr className="text-left text-ink-dim">
                    <th className="border-b-2 border-border px-2 py-1.5 font-bold">สถานะ</th>
                    <th className="border-b-2 border-border px-2 py-1.5 font-bold">แพลตฟอร์ม</th>
                    <th className="border-b-2 border-border px-2 py-1.5 font-bold">กำหนด</th>
                    <th className="border-b-2 border-border px-2 py-1.5 font-bold">หัวข้อ</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.slice(0, 25).map((p, i) => {
                    const sc =
                      p.status === "published"
                        ? "#34d399"
                        : p.status === "scheduled"
                          ? "#38bdf8"
                          : "#fbbf24";
                    return (
                      <tr key={i} className="border-b border-border/40 text-ink">
                        <td className="px-2 py-1 font-bold" style={{ color: sc }}>
                          {p.status || "-"}
                        </td>
                        <td className="px-2 py-1 align-top">{p.platform || "-"}</td>
                        <td className="px-2 py-1 align-top text-ink-dim">
                          {p.scheduled_at ? p.scheduled_at.slice(0, 16).replace("T", " ") : "-"}
                        </td>
                        <td className="px-2 py-1 align-top">{p.title || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ))}

          {!loading &&
            rows &&
            (rows.length === 0 ? (
              <p className="font-mono text-xs text-ink-dim">ยังไม่มีข้อมูลในไฟล์นี้</p>
            ) : (
              <table className="w-full font-mono text-[11px]">
                <thead>
                  <tr className="text-left text-ink-dim">
                    {headers.map((h, i) => (
                      <th key={i} className="border-b-2 border-border px-2 py-1.5 font-bold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 25).map((r, i) => (
                    <tr key={i} className="border-b border-border/40 text-ink">
                      {headers.map((_, j) => (
                        <td key={j} className="px-2 py-1 align-top">
                          {r[j]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}

          {!loading && err && (
            <div className="font-mono text-xs text-ink-dim">
              <p className="mb-2 text-rose-300">โหลดข้อมูลไม่ได้ ({err})</p>
              <p>เปิดดูใน Dashboard แทนได้</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Board → data/*.csv filename served by /api/data/sheet/[name].
// The route matches REVIEWABLE_FILES names, so the .csv suffix is required.
// kpi (uses /api/kpi) and social (uses /api/social) are handled separately.
const BOARD_TOPIC: Record<Exclude<BoardKind, "kpi" | "social" | "hub">, string> = {
  sales: "sales-pipeline.csv",
  finance: "finance.csv",
  support: "tickets.csv",
  content: "content-calendar.csv",
};
