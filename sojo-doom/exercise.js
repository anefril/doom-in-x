// Runs the dev build signed out: custom events (save/load), share, X follow, ad loading — so Sojo's checks
// see them in a live session. What needs sign-in (spend, Royal, server token) is done by hand in the simulator.
// Visible window: headless draws WebGL as a white screen.
const { chromium } = require("playwright");
const URL = process.argv[2] || "https://doom-dev.sojo.gg/";

(async () => {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ viewport: { width: 960, height: 600 } });
  const page = await ctx.newPage();
  const log = [];
  page.on("console", m => /sojo|error/i.test(m.text()) && log.push(m.type() + ": " + m.text().slice(0, 200)));
  ctx.on("page", p => log.push("popup: " + p.url().slice(0, 120)));
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => /CLICK|TAP/.test(document.querySelector("#ov b").textContent), null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  for (const id of ["sj-share", "sj-follow"]) { await page.click("#" + id); await page.waitForTimeout(1500) }
  for (const p of ctx.pages()) if (p !== page) await p.close();
  await page.mouse.click(480, 120);                       // into the game
  await page.waitForTimeout(2500);
  await page.click("#save"); await page.waitForTimeout(2500);
  await page.click("#load"); await page.waitForTimeout(2500);
  const st = await page.evaluate(() => ({ ad: !document.getElementById("ad").hidden }));
  console.log(JSON.stringify(st));
  console.log(log.slice(0, 20).join("\n"));
  await page.waitForTimeout(3000);
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1) });
