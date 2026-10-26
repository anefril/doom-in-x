// Tunes the E1M1 route for the video: the game on doom.sojo.gg, steps from route.json, a frame every ~0.5 s → out/route.png.
//   node video/route-test.js
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const { chromium } = require("playwright");
const ffmpeg = require("ffmpeg-static");
const OUT = path.join(__dirname, "out", "route"), sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
  const steps = JSON.parse(fs.readFileSync(path.join(__dirname, "route.json"), "utf8"));
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  await page.goto("https://doom.sojo.gg/");
  await page.waitForFunction(() => /CLICK/.test(document.querySelector("#ov b").textContent), null, { timeout: 60000 });
  await page.mouse.click(320, 120);
  await sleep(600);
  let n = 0;
  const snap = async () => page.screenshot({ path: path.join(OUT, String(n++).padStart(3, "0") + ".png") });
  const shooter = setInterval(() => snap().catch(() => {}), 500);
  const { aimAtBarrel } = require("./aim");
  for (const [key, ms, pause = 0] of steps) {
    if (key === "wait") await sleep(ms);
    else if (key === "aim") console.log("aim:", await aimAtBarrel(page, { x: 0, y: 0, width: 640, height: 400 }, page.keyboard));
    else { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key) }
    if (pause) await sleep(pause);
  }
  await sleep(500);
  clearInterval(shooter);
  await browser.close();
  const files = fs.readdirSync(OUT).filter(f => f.endsWith(".png")).sort();
  // contact sheet: 6 per row, small, with the frame number
  execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-framerate", "1", "-i", path.join(OUT, "%03d.png"),
    "-vf", "scale=213:-1,drawtext=text='%{n}':x=4:y=4:fontsize=18:fontcolor=yellow:box=1:boxcolor=black,tile=6x" + Math.ceil(files.length / 6),
    "-frames:v", "1", path.join(__dirname, "out", "route.png")]);
  console.log("frames:", files.length, "→ out/route.png");
})().catch(e => { console.error(e.message); process.exit(1) });
