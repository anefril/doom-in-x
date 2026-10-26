// Speedrun check on dev: the timer runs ~35 tics/s, the title screen shows the top, finishing E1M1 shows the banner.
// The finish is simulated by writing to wminfo (a real E1M1 run by script takes long); addresses checked with wasm-dis.
//   node speedrun-test.js [url]  → shot-run.png, shot-fin.png, shot-menu-lb.png
const path = require("path");
const { chromium } = require("playwright");
const URL = process.argv[2] || "https://doom-dev.sojo.gg/";
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  await page.goto(URL);
  await page.waitForFunction(() => /CLICK/.test(document.querySelector("#ov b").textContent), null, { timeout: 60000 });
  await page.screenshot({ path: path.join(__dirname, "shot-menu-lb.png") });
  await page.mouse.click(480, 120);
  await sleep(1000);
  const lt = () => page.evaluate(() => Module.HEAP32[955996 >> 2]);
  const a = await lt(); await sleep(2000); const b = await lt();
  console.log("leveltime over 2 s:", b - a, "(expect ~70)");
  await page.keyboard.down("ArrowUp"); await sleep(800); await page.keyboard.up("ArrowUp");
  await page.screenshot({ path: path.join(__dirname, "shot-run.png") });
  // simulate G_DoCompleted for E1M1: episode 0, map 0, stime = current leveltime
  await page.evaluate(() => { const H = Module.HEAP32; H[946036 >> 2] = 0; H[946044 >> 2] = 0; H[946092 >> 2] = H[955996 >> 2] });
  await sleep(1500);
  const fin = await page.evaluate(() => ({ shown: !document.getElementById("fin").hidden, t: document.getElementById("fin-t").textContent, s: document.getElementById("fin-s").textContent }));
  console.log("finish:", JSON.stringify(fin));
  await page.screenshot({ path: path.join(__dirname, "shot-fin.png") });
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1) });
