// Smoke test of the dev build on Sojo: the page loads, the SDK is there, the sign-in button shows, the engine starts.
// A visible window is required: headless Chrome draws WebGL as a white screen.
//   node smoke.js [url]   → shot-*.png next to it
const path = require("path");
const { chromium } = require("playwright");
const URL = process.argv[2] || "https://doom-dev.sojo.gg/";

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const logs = [];
  page.on("console", m => logs.push(m.type() + ": " + m.text()));
  page.on("pageerror", e => logs.push("pageerror: " + e.message));
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => /CLICK|TAP|FAILED/.test(document.querySelector("#ov b").textContent), null, { timeout: 60000 });
  const st = await page.evaluate(() => ({
    title: document.querySelector("#ov b").textContent,
    sdk: !!window.Sojo,
    signInVisible: !document.getElementById("sojoin").hidden,
  }));
  await page.screenshot({ path: path.join(__dirname, "shot-menu.png") });
  await page.mouse.click(480, 200);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(__dirname, "shot-play.png") });
  console.log(JSON.stringify(st));
  console.log(logs.filter(l => /sojo|error|warn/i.test(l)).slice(0, 15).join("\n"));
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1) });
