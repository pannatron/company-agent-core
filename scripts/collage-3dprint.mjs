import sharp from '/Users/songkarn/Desktop/company-agent-core/dashboard/node_modules/sharp/lib/index.js';

const UP = '/Users/songkarn/Desktop/company-agent-core/outputs/uploads';
const OUT = '/Users/songkarn/Desktop/company-agent-core/outputs/content';
const LOGO = '/Users/songkarn/Desktop/company-agent-core/data/company-logo.png';

// 4 รูปเล่าเรื่อง: hero(อุ้ม) / เด็กประกอบหัว / เด็กยกชิ้นส่วน / ทีมปรับ
const imgs = [
  `${UP}/2026-05-31T06-25-20-427Z-IMG_0858.jpg`,        // น้องโต อุ้ม Borot ทั้งตัว (hero)
  `${UP}/2026-05-31T06-24-47-766Z-Screenshot_2569-05-31_at_13.24.13.png`, // เด็กประกอบลำตัว
  `${UP}/2026-05-31T06-24-48-029Z-Screenshot_2569-05-31_at_13.24.30.png`, // เด็กยกชิ้นส่วนหัว
  `${UP}/2026-05-31T06-25-13-044Z-IMG_0853.jpg`,        // ทีมปรับ Borot บนโต๊ะ
];

const CANVAS = 1080;
const GAP = 14;          // ช่องว่างระหว่างรูป (กรอบขาว)
const PAD = 14;          // ขอบนอก
const HEADER = 0;        // ไม่มี header band แยก — ใส่ footer แทน
const FOOTER = 120;      // แถบล่างชื่อแบรนด์ (สูงขึ้นให้ logo จริงมีที่พอ)

// พื้นที่ grid
const gridTop = PAD;
const gridH = CANVAS - PAD - FOOTER - GAP;     // สูงของ grid
const gridW = CANVAS - PAD * 2;
const cellW = Math.floor((gridW - GAP) / 2);
const cellH = Math.floor((gridH - GAP) / 2);

async function run() {
  const cells = [];
  for (let i = 0; i < 4; i++) {
    const buf = await sharp(imgs[i])
      .resize(cellW, cellH, { fit: 'cover', position: 'attention' })
      .toBuffer();
    cells.push(buf);
  }

  const positions = [
    { left: PAD, top: gridTop },
    { left: PAD + cellW + GAP, top: gridTop },
    { left: PAD, top: gridTop + cellH + GAP },
    { left: PAD + cellW + GAP, top: gridTop + cellH + GAP },
  ];

  // footer band SVG: แถบส้ม + tagline (ตัวอักษร "BOROT" มาจาก logo จริง ไม่ render เอง)
  const fy = CANVAS - FOOTER;
  const LOGO_SIZE = 90;                 // ขนาด logo ในแถบ
  const logoTop = fy + (FOOTER - LOGO_SIZE) / 2;
  const logoLeft = 24;
  const textLeft = logoLeft + LOGO_SIZE + 22;
  const svg = `
  <svg width="${CANVAS}" height="${CANVAS}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#FF6B1A"/>
        <stop offset="1" stop-color="#FF9A3C"/>
      </linearGradient>
    </defs>
    <rect x="0" y="${fy}" width="${CANVAS}" height="${FOOTER}" fill="url(#bar)"/>
    <text x="${textLeft}" y="${fy + FOOTER/2 - 6}" font-family="'Sukhumvit Set','Noto Sans Thai',Helvetica,sans-serif" font-size="40" font-weight="800" fill="#ffffff">BOROT</text>
    <text x="${textLeft + 2}" y="${fy + FOOTER/2 + 32}" font-family="'Sukhumvit Set','Noto Sans Thai',Helvetica,sans-serif" font-size="24" font-weight="500" fill="#fff3e6">เรียนรู้ผ่านการลงมือทำจริง</text>
    <text x="${CANVAS - 30}" y="${fy + FOOTER/2 + 10}" font-family="'Sukhumvit Set','Noto Sans Thai',Helvetica,sans-serif" font-size="26" font-weight="700" fill="#ffffff" text-anchor="end">#3DPrinting</text>
  </svg>`;

  // logo จริง: trim ขอบโปร่งใส แล้ว resize พอดีแถบ
  const logoBuf = await sharp(LOGO)
    .trim()
    .resize(LOGO_SIZE, LOGO_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const composites = positions.map((p, i) => ({ input: cells[i], left: p.left, top: p.top }));
  composites.push({ input: Buffer.from(svg), left: 0, top: 0 });
  composites.push({ input: logoBuf, left: logoLeft, top: Math.round(logoTop) });

  const outPng = `${OUT}/content-2026-05-31-borot-3dprint-collage.png`;
  const outWeb = `${OUT}/content-2026-05-31-borot-3dprint-collage-web.jpg`;

  await sharp({ create: { width: CANVAS, height: CANVAS, channels: 3, background: '#ffffff' } })
    .composite(composites)
    .png()
    .toFile(outPng);

  await sharp(outPng)
    .resize(1080, 1080, { fit: 'inside' })
    .jpeg({ quality: 84, mozjpeg: true, chromaSubsampling: '4:2:0' })
    .toFile(outWeb);

  console.log('DONE', outWeb);
}
run().catch(e => { console.error('ERR', e); process.exit(1); });
