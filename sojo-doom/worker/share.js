// Result cards for posts. "Post my time" links to /r/<id>: the game page itself (the X card stays playable), but with
// this run's picture /r/<id>.png as the card image. X intents can't attach an image — the link card is the way.
// The Worker has no canvas: art/gen-share.js prepared the background and glyph strips (public/share/*.z, zlib),
// here they are blended and encoded as PNG.
import FONT from "./share-font.json";

const { W, H } = FONT;
export const MAP_NAMES = {
  e1m1: "HANGAR", e1m2: "NUCLEAR PLANT", e1m3: "TOXIN REFINERY", e1m4: "COMMAND CONTROL", e1m5: "PHOBOS LAB",
  e1m6: "CENTRAL PROCESSING", e1m7: "COMPUTER STATION", e1m8: "PHOBOS ANOMALY", e1m9: "MILITARY BASE", e1: "KNEE-DEEP IN THE DEAD",
};
export const fmt = t => { const s = t / 35, m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(2).padStart(5, "0")}` };
export const runTitle = map => map === "e1" ? "EPISODE 1" : map.toUpperCase();

const inflate = async buf => new Uint8Array(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer());
const deflate = async buf => new Uint8Array(await new Response(new Blob([buf]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());

let assets = null;                                        // kept between requests of one Worker instance
async function load(env, origin) {
  if (assets) return assets;
  const get = async f => inflate(await (await env.ASSETS.fetch(new Request(origin + "/share/" + f))).arrayBuffer());
  const [bg, big, small] = await Promise.all([get("bg.z"), get("big.z"), get("small.z")]);
  return (assets = { bg, big: { ...FONT.big, a: big }, small: { ...FONT.small, a: small } });
}

const textWidth = (f, s) => [...s].reduce((w, ch) => w + (f.glyphs[ch] || f.glyphs["?"])[2], 0);
// color: [r,g,b] or a function of the row inside the glyph (0..1) for a vertical gradient
const spacing = 1;
function drawText(img, f, s, x0, y0, color, maxW = W) {
  let scale = 1, x = x0;
  const tw = textWidth(f, s);
  if (tw > maxW) scale = maxW / tw;                       // a long handle shrinks to fit, nearest-neighbour
  for (const ch of s) {
    const [gx, gw, adv] = f.glyphs[ch] || f.glyphs["?"];
    const dw = Math.round(gw * scale), dh = Math.round(f.h * scale);   // the whole slot is blended, the pen moves by the advance
    for (let y = 0; y < dh; y++) {
      const py = y0 + y; if (py < 0 || py >= H) continue;
      const c = typeof color === "function" ? color(y / dh) : color, sy = Math.floor(y / scale);
      for (let xx = 0; xx < dw; xx++) {
        const px = x + xx; if (px < 0 || px >= W) continue;
        const a = f.a[sy * f.w + gx + Math.floor(xx / scale)] / 255;
        if (!a) continue;
        const i = (py * W + px) * 3;
        for (let k = 0; k < 3; k++) img[i + k] = img[i + k] * (1 - a) + c[k] * a;
      }
    }
    x += Math.round(adv * scale) + spacing;
  }
  return x;
}
const shadow = (img, f, s, x, y, color, maxW) => { drawText(img, f, s, x + 3, y + 4, [0, 0, 0], maxW); return drawText(img, f, s, x, y, color, maxW) };
const gold = t => t < .5 ? [255, 236 - t * 60, 150 - t * 200] : [255, 206 - (t - .5) * 160, 50 - (t - .5) * 60];

const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 });
const crc = b => { let c = ~0; for (let i = 0; i < b.length; i++) c = crcT[(c ^ b[i]) & 255] ^ (c >>> 8); return ~c >>> 0 };
function chunk(type, data) {
  const out = new Uint8Array(12 + data.length), dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)));
  return out;
}
async function png(rgb) {
  const raw = new Uint8Array(H * (1 + W * 3));            // filter byte 0 + the row
  for (let y = 0; y < H; y++) raw.set(rgb.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer);
  dv.setUint32(0, W); dv.setUint32(4, H); ihdr.set([8, 2, 0, 0, 0], 8);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", await deflate(raw)), chunk("IEND", new Uint8Array())];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { out.set(p, o); o += p.length }
  return out;
}

// run = {map, tics, rank (0 — not ranked by this run), handle, royal}
export async function sharePng(env, origin, run) {
  const { bg, big, small } = await load(env, origin);
  const img = bg.slice();
  // rows: map 140 · time 170–400 · rank 392 · handle 450 · (background: CAN YOU BEAT IT? from ~540)
  shadow(img, small, `${runTitle(run.map)} · ${MAP_NAMES[run.map] || ""}`, 64, 134, [255, 90, 42], 1070);
  shadow(img, big, fmt(run.tics), 56, 164, gold);
  const rank = run.rank === 1 ? "WORLD #1 ON THE LEADERBOARD" : run.rank ? `#${run.rank} ON THE LEADERBOARD` : "";
  if (rank) shadow(img, small, rank, 64, 388, run.rank === 1 ? [255, 210, 74] : [255, 255, 255]);
  shadow(img, small, `${run.royal ? "ROYAL · " : ""}@${run.handle || "anon"}`, 64, rank ? 448 : 388, run.royal ? [255, 210, 74] : [200, 200, 200], 680);
  return png(img);
}

// /r/<id>: the game page with this run in the card. Relative paths of index.html resolve against the root via <base>
export async function sharePage(env, origin, id, run) {
  let html = await (await env.ASSETS.fetch(new Request(origin + "/"))).text();
  html = html.replace(/<meta (name|property)="(twitter|og):[^>]*>\s*/g, "");
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const title = `@${run.handle || "anon"} — ${runTitle(run.map)} in ${fmt(run.tics)}`;
  const desc = run.rank ? `#${run.rank} on the DOOM speedrun board. Play the original DOOM right here.` : "Play the original DOOM right here.";
  const img = `${origin}/r/${id}.png`;
  const meta = `<base href="/">
<meta name="twitter:card" content="player"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${img}"><meta name="twitter:player" content="${origin}/"><meta name="twitter:player:width" content="480"><meta name="twitter:player:height" content="300">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${img}"><meta property="og:url" content="${origin}/r/${id}">`;
  return html.replace("<head>", "<head>\n" + meta);
}
