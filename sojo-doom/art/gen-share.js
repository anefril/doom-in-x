// Assets for result cards in posts (worker/share.js draws on them): a 1200×628 background and two glyph strips.
// Run once after changing the look: node art/gen-share.js → public-share/{bg,big,small}.z (zlib) + worker/share-font.json.
// The Worker has no canvas, so the picture is prepared here and it only blends text and encodes PNG.
const fs = require("fs"), path = require("path"), zlib = require("zlib");
const { chromium } = require("playwright");

const W = 1200, H = 628;
const OUT = path.join(__dirname, "..", "public-share");
const BIG = { font: "190px Impact, 'Arial Black', sans-serif", size: 190, chars: "0123456789:." };
const SMALL = { font: "52px Impact, 'Arial Black', sans-serif", size: 52, chars: Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join("") + "·" };

const bgHtml = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;width:${W}px;height:${H}px;overflow:hidden;background:#000}
#bg{position:absolute;inset:0;background:url(data:image/png;base64,${fs.readFileSync(path.join(__dirname, "cover-play.png")).toString("base64")}) -150px -60px/1500px auto no-repeat;filter:saturate(1.15)}
#sh{position:absolute;inset:0;background:linear-gradient(90deg,#000f 0%,#000d 42%,#0007 75%,#0004 100%),
  radial-gradient(ellipse at 20% 110%,#a0100099 0%,#0000 60%)}
#logo{position:absolute;left:60px;top:34px;font:900 84px/1 Impact,sans-serif;letter-spacing:5px;color:transparent;
  transform:perspective(320px) rotateX(14deg);transform-origin:left;-webkit-text-stroke:1px #300;
  background:linear-gradient(#ffe08a 0%,#ff9a26 32%,#d81e0b 64%,#4d0502 100%);-webkit-background-clip:text;background-clip:text;
  filter:drop-shadow(0 3px 0 #000) drop-shadow(0 0 14px #f308)}
#tag{position:absolute;left:300px;top:58px;font:900 30px Impact,sans-serif;letter-spacing:6px;color:#ff3b1f;text-shadow:0 2px 0 #000}
#cta{position:absolute;left:60px;bottom:40px;font:900 42px Impact,sans-serif;letter-spacing:2px;color:#ffd24a;text-shadow:0 0 12px #fa08,0 3px 0 #000}
#play{position:absolute;right:56px;bottom:46px;font:900 30px Impact,sans-serif;letter-spacing:2px;color:#fff;
  padding:10px 20px;border:3px solid #ff3b1f;border-radius:8px;background:#000a;box-shadow:0 0 18px #f305}
</style><div id="bg"></div><div id="sh"></div><div id="logo">DOOM</div><div id="tag">SPEEDRUN</div>
<div id="cta">CAN YOU BEAT IT?</div><div id="play">▶ PLAY IT IN THIS POST</div>`;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: W, height: H } });
  await p.setContent(bgHtml);
  await p.waitForTimeout(300);
  const png = await p.screenshot();
  // PNG → raw RGB through a canvas in the page
  const rgb = await p.evaluate(async b64 => {
    const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode();
    const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
    const x = c.getContext("2d"); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data, out = [];
    for (let i = 0; i < d.length; i += 4) out.push(d[i], d[i + 1], d[i + 2]);
    return out;
  }, png.toString("base64"));

  // glyph strips: alpha only, one row of glyphs; metrics go to the Worker as JSON
  const strip = f => p.evaluate(f => {
    const c = document.createElement("canvas"), x = c.getContext("2d");
    x.font = f.font;
    const h = Math.ceil(f.size * 1.25), glyphs = {};
    let wTotal = 0;
    // [x in the strip, slot width (with room for overhang), advance]
    for (const ch of f.chars) { const adv = x.measureText(ch).width, w = Math.ceil(adv) + 4; glyphs[ch] = [wTotal, w, Math.round(adv)]; wTotal += w }
    c.width = wTotal; c.height = h;
    x.font = f.font; x.fillStyle = "#fff"; x.textBaseline = "alphabetic";
    for (const ch of f.chars) x.fillText(ch, glyphs[ch][0] + 2, f.size);
    const d = x.getImageData(0, 0, wTotal, h).data, a = [];
    for (let i = 3; i < d.length; i += 4) a.push(d[i]);
    return { w: wTotal, h, glyphs, a };
  }, f);
  const big = await strip(BIG), small = await strip(SMALL);
  await b.close();

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "bg.z"), zlib.deflateSync(Buffer.from(rgb), { level: 9 }));
  fs.writeFileSync(path.join(OUT, "big.z"), zlib.deflateSync(Buffer.from(big.a), { level: 9 }));
  fs.writeFileSync(path.join(OUT, "small.z"), zlib.deflateSync(Buffer.from(small.a), { level: 9 }));
  const meta = f => ({ w: f.w, h: f.h, glyphs: f.glyphs });
  fs.writeFileSync(path.join(__dirname, "..", "worker", "share-font.json"), JSON.stringify({ W, H, big: meta(big), small: meta(small) }));
  for (const f of ["bg.z", "big.z", "small.z"]) console.log(f, fs.statSync(path.join(OUT, f)).size, "bytes");
})();
