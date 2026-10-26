// Aims at E1M1's green barrel from a screenshot: DOOM turning by timing is unstable (one press — a different angle),
// so we nudge with short presses until the barrel sits in the crosshair.
const { PNG } = require("pngjs");
const sleep = ms => new Promise(r => setTimeout(r, ms));

// centre of green (the barrel) in its height band; below is a green corpse at your feet that pulled the aim left
function barrelX(png) {
  const { width: W, height: H, data } = PNG.sync.read(png);
  let sum = 0, n = 0;
  for (let y = Math.floor(H * 0.47); y < H * 0.66; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, r = data[i], g = data[i + 1], b = data[i + 2];
      if (g > r + 12 && g > b + 25 && g > 55 && g < 170) { sum += x; n++ }
    }
  return n > 15 ? { x: sum / n / W, n } : null;               // share of frame width, 0.5 = centre
}

// clip — the game's rectangle on the page; keyboard — page.keyboard (focus already in the game)
async function aimAtBarrel(page, clip, keyboard, { tol = 0.02, tries = 18 } = {}) {
  const tap = async (key, ms) => { await keyboard.down(key); await sleep(ms); await keyboard.up(key); await sleep(110) };
  let lost = 0;
  for (let i = 0; i < tries; i++) {
    const shot = await page.screenshot({ clip });
    const b = barrelX(shot);
    if (process.env.AIM_DEBUG) console.log("aim", i, b && b.x.toFixed(3), b && b.n);
    if (!b) {                                              // not visible — search by turning left (the barrel is left of the path)
      if (++lost > 6) return false;
      await tap("ArrowLeft", 70);
      continue;
    }
    const dx = b.x - 0.5;
    if (Math.abs(dx) <= tol) return true;
    await tap(dx > 0 ? "ArrowRight" : "ArrowLeft", Math.max(20, Math.min(160, Math.abs(dx) * 700)));
  }
  return false;
}

module.exports = { barrelX, aimAtBarrel };
