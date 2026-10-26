// DOOM-on-Sojo promo video: stage.html (a mock of the real @NukeKevDev post) with the live doom.sojo.gg game in the card.
// Recorded with Playwright (visible window — headless draws WebGL white) and re-encoded to MP4 (H.264) with ffmpeg-static.
//   node video/record.js   → video/out/doom-sojo.mp4
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");
const { chromium } = require("playwright");
const ffmpeg = require("ffmpeg-static");

const HERE = __dirname, OUT = path.join(HERE, "out");
const W = 1080, H = 1350;
const STAGE = "https://stage.promo.invalid/";
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: false, args: ["--autoplay-policy=no-user-gesture-required"] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: OUT, size: { width: W, height: H } } });

  // the stage comes from a made-up host (files from disk); frame-ancestors is lifted for the game: live, only x.com embeds it
  await ctx.route(STAGE + "**", r => {
    const f = new URL(r.request().url()).pathname.slice(1) || "stage.html";
    const p = path.join(HERE, f);
    if (!fs.existsSync(p)) return r.fulfill({ status: 404 });
    r.fulfill({ body: fs.readFileSync(p), contentType: f.endsWith(".html") ? "text/html" : f.endsWith(".jpg") ? "image/jpeg" : "application/octet-stream" });
  });
  await ctx.route(/https:\/\/(doom\.sojo\.gg|id\.sojo\.gg)\//, async r => {
    const res = await r.fetch();
    const headers = { ...res.headers() };
    delete headers["content-security-policy"]; delete headers["x-frame-options"];
    r.fulfill({ response: res, headers });
  });

  const page = await ctx.newPage();
  const t0 = Date.now();                                   // ≈ video start
  await page.goto(STAGE + "stage.html");
  const frame = () => page.frames().find(f => f.url().startsWith("https://doom.sojo.gg/"));

  // the intro stays up while the game loads in the card; the extra start is trimmed later, keeping a 3 s intro
  for (let i = 0; i < 120 && !(await frame()?.evaluate(() => /CLICK|TAP/.test(document.querySelector("#ov b").textContent)).catch(() => false)); i++) await sleep(500);
  await sleep(500);
  const trim = Math.max(0, Date.now() - t0 - 3000) / 1000;
  await page.evaluate(() => stage.intro(false));
  await sleep(1200);

  // the cursor moves to the card and clicks — the game starts inside the post
  const box = await page.evaluate(() => stage.cardBox());
  const cx = box.x + box.w / 2, cy = box.y + box.h * 0.38;
  await page.evaluate(([x, y]) => stage.cursor(x, y, true), [W - 120, H - 160]);
  await sleep(400);
  await page.evaluate(([x, y]) => stage.cursor(x, y, true), [cx, cy]);
  await sleep(1300);
  await page.evaluate(() => stage.click());
  await page.mouse.click(cx, cy);
  await sleep(300);
  await page.evaluate(([x, y]) => stage.cursor(x, y, false), [cx, cy]);
  await page.evaluate(() => stage.tag(true));

  // E1M1 gameplay along route.json (tuned with route-test.js): hall → barrel (aimed from pixels) → back to the hall.
  // Keys go to the focused element — the game canvas in the iframe.
  const { aimAtBarrel } = require("./aim");
  const clip = { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.w), height: Math.round(box.h) };
  await sleep(700);
  for (const [key, ms, pause = 0] of JSON.parse(fs.readFileSync(path.join(HERE, "route.json"), "utf8"))) {
    if (key === "wait") await sleep(ms);
    else if (key === "aim") await aimAtBarrel(page, clip, page.keyboard);
    else { await page.keyboard.down(key); await sleep(ms); await page.keyboard.up(key) }
    if (pause) await sleep(pause);
  }
  await sleep(900);

  // ending
  await page.evaluate(() => { stage.tag(false); stage.outro(true) });
  await sleep(3800);

  const video = page.video();
  await ctx.close();
  await browser.close();
  const webm = await video.path();
  const mp4 = path.join(OUT, "doom-sojo.mp4");
  execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-ss", trim.toFixed(2), "-i", webm, "-c:v", "libx264", "-preset", "slow", "-crf", "20",
    "-pix_fmt", "yuv420p", "-r", "30", "-movflags", "+faststart", mp4]);
  console.log("done:", mp4, (fs.statSync(mp4).size / 1e6).toFixed(1) + " MB");
})().catch(e => { console.error(e.message); process.exit(1) });
