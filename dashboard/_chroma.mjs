// Chroma-key a flat-color background out of a PNG → real transparency.
// Usage: node _chroma.mjs <in.png> <out.png> [r g b] [tol]
// Default keys magenta (255,0,255). Writes PNG with alpha via canvas.
import puppeteer from "puppeteer";
import fs from "node:fs";

const [inP, outP, rS, gS, bS, tolS] = process.argv.slice(2);
const KR = +(rS ?? 255), KG = +(gS ?? 0), KB = +(bS ?? 255);
const TOL = +(tolS ?? 70);

const b64 = fs.readFileSync(inP).toString("base64");
const br = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
const p = await br.newPage();
const outB64 = await p.evaluate(
  async (src, KR, KG, KB, TOL) => {
    const im = new Image();
    im.src = src;
    await im.decode();
    const W = im.naturalWidth, H = im.naturalHeight;
    const cv = new OffscreenCanvas(W, H);
    const ctx = cv.getContext("2d");
    ctx.drawImage(im, 0, 0);
    const img = ctx.getImageData(0, 0, W, H);
    const d = img.data;
    const tol2 = TOL * TOL * 3;
    for (let i = 0; i < d.length; i += 4) {
      const dr = d[i] - KR, dg = d[i + 1] - KG, db = d[i + 2] - KB;
      if (dr * dr + dg * dg + db * db <= tol2) {
        d[i + 3] = 0; // transparent
      }
    }
    ctx.putImageData(img, 0, 0);
    const blob = await cv.convertToBlob({ type: "image/png" });
    const buf = await blob.arrayBuffer();
    let s = "";
    const u = new Uint8Array(buf);
    for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
    return btoa(s);
  },
  "data:image/png;base64," + b64,
  KR, KG, KB, TOL,
);
await br.close();
fs.writeFileSync(outP, Buffer.from(outB64, "base64"));
console.log("CHROMA_OK " + outP + " keyed=" + KR + "," + KG + "," + KB + " tol=" + TOL);
