// DOOM poster editor for Sojo Ads. Lives in a sojo.gg iframe (CSP: only its own scripts, no network).
// Protocol (from Sojo's simulator code, sim-ads-art.js): we send {v:1,type:"ready"} → Sojo answers "init"
// (palette, sizes, upload.png) → edits send "change" → on "finish" we answer "done" with art = {"32x32": [palette indices]}.
(() => {
  const PARENT = "https://sojo.gg";
  const cv = document.getElementById("cv"), ctx = cv.getContext("2d");
  const palEl = document.getElementById("pal"), sizesEl = document.getElementById("sizes");
  let palette = [], sizes = [], size = "", color = 0, art = {};

  const post = (type, x = {}) => parent.postMessage({ v: 1, type, ...x }, PARENT);
  const side = s => Number(s.split("x")[0]);
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

  // nearest palette colour (weighted distance — the eye is more sensitive to green)
  function nearest(r, g, b) {
    let best = 0, bd = Infinity;
    palette.forEach((hex, i) => {
      const [pr, pg, pb] = rgb(hex), d = 2 * (r - pr) ** 2 + 4 * (g - pg) ** 2 + 3 * (b - pb) ** 2;
      if (d < bd) { bd = d; best = i }
    });
    return best;
  }

  // advertiser image → N×N grid: each cell = the average colour of its pixels → nearest palette colour
  function quantize(img, n) {
    const c = document.createElement("canvas"); c.width = c.height = n;
    const x = c.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(img, 0, 0, n, n);
    const d = x.getImageData(0, 0, n, n).data, out = [];
    for (let i = 0; i < n * n; i++) {
      const a = d[i * 4 + 3] / 255;      // transparent → onto black
      out.push(nearest(d[i * 4] * a, d[i * 4 + 1] * a, d[i * 4 + 2] * a));
    }
    return out;
  }

  function draw() {
    const n = side(size), px = art[size] || [], k = cv.width / n;
    for (let i = 0; i < n * n; i++) { ctx.fillStyle = palette[px[i] || 0] || "#000"; ctx.fillRect((i % n) * k, Math.floor(i / n) * k, k, k) }
  }

  function buildPalette() {
    palEl.replaceChildren(...palette.map((hex, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.style.background = hex; b.title = hex; b.setAttribute("role", "option");
      b.className = i === color ? "on" : "";
      b.addEventListener("click", () => { color = i; buildPalette() });
      return b;
    }));
  }

  function buildSizes() {
    sizesEl.replaceChildren(...(sizes.length > 1 ? sizes : []).map(s => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = s; b.className = s === size ? "on" : "";
      b.addEventListener("click", () => { size = s; buildSizes(); draw() });
      return b;
    }));
  }

  // painting cells with mouse/finger
  let painting = false;
  function paint(e) {
    const r = cv.getBoundingClientRect(), n = side(size);
    const cx = Math.floor((e.clientX - r.left) / r.width * n), cy = Math.floor((e.clientY - r.top) / r.height * n);
    if (cx < 0 || cy < 0 || cx >= n || cy >= n) return;
    const i = cy * n + cx;
    if (art[size][i] === color) return;
    art[size][i] = color; draw(); post("change");
  }
  cv.addEventListener("pointerdown", e => { painting = true; cv.setPointerCapture(e.pointerId); paint(e) });
  cv.addEventListener("pointermove", e => painting && paint(e));
  addEventListener("pointerup", () => { painting = false });

  function start(m) {
    palette = m.palette || []; sizes = m.sizes || []; size = sizes[0] || "";
    document.body.classList.toggle("light", m.theme === "light");
    color = Math.min(1, palette.length - 1);
    art = {};
    for (const s of sizes) {
      const saved = m.art && m.art[s];
      art[s] = Array.isArray(saved) && saved.length === side(s) ** 2 ? saved.slice() : new Array(side(s) ** 2).fill(0);
    }
    buildPalette(); buildSizes(); draw();
    post("resize", { h: Math.ceil(document.documentElement.scrollHeight) });
    const png = m.upload && m.upload.png;
    if (!png) return;
    const img = new Image();
    img.onload = () => {
      for (const s of sizes) if (!(m.art && m.art[s])) art[s] = quantize(img, side(s));
      draw();
    };
    img.src = png;     // data: — CSP allows img-src data:
  }

  addEventListener("message", e => {
    if (e.origin !== PARENT || e.source !== parent) return;
    const m = e.data;
    if (!m || m.v !== 1) return;
    if (m.type === "init") start(m);
    else if (m.type === "finish") post("done", { art });
  });

  post("ready");
})();
