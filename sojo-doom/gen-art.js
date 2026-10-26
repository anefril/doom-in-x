// Sojo images from ../doom/card.png (TITLEPIC 960×600): X card 1200×628, catalog cover 960×540, icon 512.
// Rendered with headless Chromium (a static image without WebGL — no white screen).
//   node gen-art.js  → art/*.png (in git), the card is copied into public/ by the build
const fs = require("fs"), path = require("path");
const { chromium } = require("playwright");

const SRC = path.join(__dirname, "..", "doom", "card.png"), OUT = path.join(__dirname, "art");
const img = "data:image/png;base64," + fs.readFileSync(SRC).toString("base64");
const SIZES = { "card-x": [1200, 628], cover: [960, 540], icon: [512, 512] };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const [name, [w, h]] of Object.entries(SIZES)) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    // icon — the centre of the title picture, large (DOOM logo); the rest — the whole frame on black
    const fit = name === "icon" ? "cover" : "contain";
    await page.setContent(`<body style="margin:0;background:#000"><img src="${img}"
      style="width:${w}px;height:${h}px;object-fit:${fit};image-rendering:pixelated;display:block"></body>`);
    await page.waitForFunction(() => document.images[0].complete);
    await page.screenshot({ path: path.join(OUT, name + ".png") });
    await page.close();
    console.log(name, `${w}x${h}`);
  }
  // icon-own / cover-own: our own art without id Software images (Sojo's moderation blocked/held TITLEPIC)
  for (const [name, w, h, big, small] of [["icon-own", 512, 512, 150, 34], ["cover-own", 960, 540, 200, 40]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.setContent(`<body style="margin:0;width:${w}px;height:${h}px;display:flex;flex-direction:column;align-items:center;
      justify-content:center;background:radial-gradient(circle at 50% 40%,#5a0a0a,#120000 70%);font-family:Impact,'Arial Black',sans-serif">
      <div style="font-size:${big}px;line-height:1;color:#e33;letter-spacing:6px;text-shadow:0 8px 0 #600,0 0 40px #f30">DOOM</div>
      <div style="margin-top:28px;font:bold ${small}px monospace;color:#fc3;letter-spacing:3px">IN YOUR FEED</div></body>`);
    await page.screenshot({ path: path.join(OUT, name + ".png") });
    await page.close();
    console.log(name, `${w}x${h}`);
  }
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1) });
