// One-shot compose: Mentor Moment v2 designed asset
// Matches EP.01-04 Future Skills / Classroom Life series treatment.
// Pipeline: sharp resize/cover -> SVG overlay (gradient + brand bar + badge + headline + footer + logo) -> JPEG q85.
import sharp from '/Users/songkarn/Desktop/company-agent-core/dashboard/node_modules/sharp/lib/index.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const SRC = '/Users/songkarn/Desktop/company-agent-core/outputs/content/content-2026-05-24-mentor-moment-master.jpg';
const LOGO = '/Users/songkarn/Desktop/company-agent-core/data/company-logo.png';
const OUT = '/Users/songkarn/Desktop/company-agent-core/outputs/content/content-2026-05-24-mentor-moment-v2-web.jpg';
const SIZE = 1080;

const ORANGE = '#FF6B1A';

// 1. Base: cover-crop master to 1080x1080 (object-position: center)
const base = await sharp(SRC)
  .resize(SIZE, SIZE, { fit: 'cover', position: 'attention' }) // attention = focus on salient region (faces/laptop)
  .toBuffer();

// 2. Prepare logo: resize as-is to 72px. Keep original colors (logo already has white face).
const logoSize = 72;
const logoBuf = await sharp(LOGO)
  .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

// 3. SVG overlay (gradient + brand bar + badge + headline + footer hashtags)
//    Thai text needs a font that supports Thai glyphs; rely on system 'Sukhumvit Set' / 'Noto Sans Thai'.
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgb(0,0,0)" stop-opacity="0"/>
      <stop offset="100%" stop-color="rgb(0,0,0)" stop-opacity="0.88"/>
    </linearGradient>
    <linearGradient id="topShade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgb(0,0,0)" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="rgb(0,0,0)" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <!-- top subtle shade for badge/logo legibility -->
  <rect x="0" y="0" width="${SIZE}" height="180" fill="url(#topShade)"/>

  <!-- bottom gradient (top 50% -> bottom 100%) -->
  <rect x="0" y="${SIZE / 2}" width="${SIZE}" height="${SIZE / 2}" fill="url(#bottomFade)"/>

  <!-- 6px orange brand bar at very top -->
  <rect x="0" y="0" width="${SIZE}" height="6" fill="${ORANGE}"/>

  <!-- Right-top capsule badge: "Classroom Life" -->
  <g transform="translate(${SIZE - 32}, 36)">
    <!-- right-anchored, build leftward. Approx width: text 'Classroom Life' @14px ~ 110, padding 16+16 => ~142 -->
    <g transform="translate(-168, 0)">
      <rect x="0" y="0" width="168" height="36" rx="18" ry="18" fill="${ORANGE}" fill-opacity="0.92"/>
      <text x="84" y="23" text-anchor="middle"
        font-family="'Sukhumvit Set','Noto Sans Thai','Helvetica Neue',Helvetica,Arial,sans-serif"
        font-size="14" font-weight="600" letter-spacing="0.6" fill="#FFFFFF">Classroom Life</text>
    </g>
  </g>

  <!-- Headline block, bottom-left, margin-bottom 60px -->
  <!-- Sub line above main? EP.01 has small kicker above headline. Spec says Main + Sub. We'll put Main then Sub. -->
  <g transform="translate(56, ${SIZE - 60})">
    <!-- small kicker above main (matches EP series 'FUTURE SKILLS x AI + 3D PRINTING' pattern) -->
    <text x="0" y="-130"
      font-family="'Helvetica Neue',Helvetica,Arial,sans-serif"
      font-size="14" font-weight="700" letter-spacing="3" fill="${ORANGE}"
      opacity="0.95">CLASSROOM LIFE  &#8226;  PEER LEARNING</text>

    <!-- Main headline -->
    <text x="0" y="-70"
      font-family="'Sukhumvit Set','Noto Sans Thai','Helvetica Neue',Helvetica,Arial,sans-serif"
      font-size="56" font-weight="800" fill="#FFFFFF" letter-spacing="-0.5">Mentor Moment</text>

    <!-- Sub headline (Thai) -->
    <text x="0" y="-20"
      font-family="'Sukhumvit Set','Noto Sans Thai','Helvetica Neue',Helvetica,Arial,sans-serif"
      font-size="28" font-weight="400" fill="#FFFFFF" opacity="0.95">ที่ Borot ไม่มีคำว่า &#8216;เด็กไป&#8217;</text>
  </g>

  <!-- Footer hashtags bottom-right -->
  <text x="${SIZE - 32}" y="${SIZE - 28}" text-anchor="end"
    font-family="'Helvetica Neue',Helvetica,Arial,sans-serif"
    font-size="16" font-weight="500" fill="#FFFFFF" opacity="0.7" letter-spacing="0.4">#Borot   #PeerLearning</text>
</svg>
`;

// 4. Composite: base + svg overlay + logo (top-left, margin 32)
const composed = await sharp(base)
  .composite([
    { input: Buffer.from(svg), top: 0, left: 0 },
    { input: logoBuf, top: 32, left: 32 },
  ])
  .jpeg({ quality: 85, mozjpeg: true, chromaSubsampling: '4:2:0' })
  .toBuffer();

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, composed);

const stat = await fs.stat(OUT);
const meta = await sharp(OUT).metadata();
console.log(JSON.stringify({
  out: OUT,
  bytes: stat.size,
  kb: +(stat.size / 1024).toFixed(1),
  width: meta.width,
  height: meta.height,
  format: meta.format,
}, null, 2));
