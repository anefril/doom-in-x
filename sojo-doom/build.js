// Builds DOOM for Sojo hosting: a copy of ../doom (no .br/.gz — Sojo compresses itself) + the Sojo SDK, Worker and ad editor.
// The plain version (../doom) stays untouched: Sojo isn't wired there (its origin isn't registered for the game).
//   node build.js && npx -y --prefer-online @sojogg/cli@latest deploy
const fs = require("fs"), path = require("path"), { execFileSync } = require("child_process");

const SRC = path.join(__dirname, "..", "doom"), OUT = path.join(__dirname, "public");
const FILES = ["doom1.wad", "websockets-doom.js", "websockets-doom.wasm", "default.cfg", "extra.cfg", "card.png"];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const f of FILES) fs.copyFileSync(path.join(SRC, f), path.join(OUT, f));
fs.copyFileSync(path.join(__dirname, "art", "card-x.png"), path.join(OUT, "card-x.png"));   // X card 1200×628 (gen-art.js)
fs.copyFileSync(path.join(__dirname, "client", "sojo-client.js"), path.join(OUT, "sojo-client.js"));
// result-card art for posts (art/gen-share.js), the Worker draws on it: worker/share.js
fs.cpSync(path.join(__dirname, "public-share"), path.join(OUT, "share"), { recursive: true });

let html = fs.readFileSync(path.join(SRC, "index.html"), "utf8");
const must = (from, to) => {
  if (!html.includes(from)) throw new Error("doom/index.html is missing the expected snippet: " + from);
  html = html.split(from).join(to);
};

// on Sojo the game lives at the host root, not under /doom/
must(`open("/doom/", "_blank")`, `open(location.pathname, "_blank")`);
// Sojo has no /b beacons — don't send them into a 404
must(`navigator.sendBeacon("/b",`, `false && navigator.sendBeacon("/b",`);

// top right: ☰ (in the game — pause and back to the title screen, sojo-client.js) and fullscreen, square icons.
// Save / load and the PC/phone switch are hidden (not removed — scripts use them): the mode is picked by the screen type,
// saves stay on F2 / F3
must(`<button id="full" type="button" title="Fullscreen">⤢ full</button>`,
  `<button id="menu" type="button" title="Pause · menu" aria-label="Pause and menu">☰</button><button id="full" type="button" title="Fullscreen" aria-label="Fullscreen">⤢</button>`);
must(`fullBtn.textContent = fsEl() ? "✕ exit" : "⤢ full"`, `fullBtn.textContent = fsEl() ? "✕" : "⤢"`);
must(`let mode = store.get() || (`, `let mode = (`);       // with no switch on screen a remembered mode could never be undone
must(` · 💾 / ⟲ — save / load"`, `"`);
must(`SHIFT — run · 💾 / ⟲ or F2 / F3 — save / load`, `SHIFT — run · F2 / F3 — save / load · ESC / ☰ — pause`);
must(`ShiftLeft: ["Shift", 16],`, `ShiftLeft: ["Shift", 16], Pause: ["Pause", 19],`);

// The title screen: logo, CLICK TO PLAY (the first <b> — index.html writes its text), the player, buttons, the leaderboard
// behind the gold 👑 button, the sponsored poster in the corner, controls behind ? bottom left.
// Clicks on our parts must not start the game (the screen starts it on pointerdown) — sojo-client.js stops that
must(`<div id="ov"><b>LOADING…</b><small id="hint"></small></div>`,
  `<div id="ov"><div id="logo" aria-hidden="true">DOOM</div><b>LOADING…</b><small id="hint"></small>
  <button id="help" type="button" title="Controls" aria-label="Controls">?</button>
  <div id="who"><button id="sojoin" type="button">Sign in with Sojo</button><span id="me"></span></div>
  <div id="sj" class="sj">
    <button id="lb-open" type="button">👑 LEADERBOARD</button>
    <button id="sj-idkfa" type="button" hidden>IDKFA · 100 💎</button>
    <button id="sj-royal" type="button" hidden>👑 Join Royal</button>
    <button id="sj-share" type="button">Share</button>
    <button id="sj-follow" type="button">Follow on X</button>
  </div>
  <div id="lb" class="sj" hidden role="dialog" aria-label="Leaderboard">
    <button id="lb-x" type="button" aria-label="Close">✕</button>
    <div class="lb-t">👑 HALL OF FAME</div>
    <div class="lb-h"><button id="lb-prev" type="button" aria-label="Previous board">◀</button><em id="lb-name">E1M1</em><button id="lb-next" type="button" aria-label="Next board">▶</button></div>
    <ol id="lb-list"><li class="dim">no runs yet — be first</li></ol><small id="lb-me"></small></div>
  <div id="ad" class="sj" hidden>
    <canvas id="ad-cv" width="96" height="96" aria-label="Sponsored poster"></canvas>
    <div id="ad-txt"><a id="ad-link" target="_blank" rel="noopener">Sponsored</a> <button id="ad-flag" type="button" title="Report this ad">⚑</button>
      <small id="ad-head"></small></div>
  </div></div>
<div id="tmr" hidden>⏱ 0:00.00</div>
<div id="fin" class="top" hidden><b id="fin-t"></b><span id="fin-s"></span>
  <span class="fin-b"><button id="fin-post" type="button">Post my time</button><button id="fin-in" type="button" hidden>Sign in to save</button><button id="fin-x" type="button">✕</button></span></div>`);
must(`#ov.off{display:none}`, `#ov.off{display:none}
#ov{background:radial-gradient(ellipse at 50% 45%,#2a000088 0%,#000c 75%);gap:clamp(4px,1.6vh,12px)}
#logo{font:900 clamp(44px,13vmin,110px)/.9 Impact,Haettenschweiler,"Arial Black",sans-serif;letter-spacing:.06em;
  transform:perspective(320px) rotateX(16deg);color:transparent;-webkit-text-stroke:1px #300;
  background:linear-gradient(#ffe08a 0%,#ff9a26 32%,#d81e0b 64%,#4d0502 100%);-webkit-background-clip:text;background-clip:text;
  filter:drop-shadow(0 3px 0 #000) drop-shadow(0 0 14px #f308);pointer-events:none}
#ov > b{font-size:clamp(15px,4.2vmin,26px);color:#fff;text-shadow:0 0 8px #f33,0 0 2px #f33;animation:pulse 1.3s ease-in-out infinite}
@keyframes pulse{50%{opacity:.35}}
#save,#load,#mode{display:none !important}
#full,#menu{width:40px;height:40px;padding:0;font-size:22px;line-height:1;display:flex;align-items:center;justify-content:center}
#menu{display:none}
body.playing #menu{display:flex}
#help{position:absolute;left:10px;bottom:10px;width:40px;height:40px;padding:0;font:bold 20px monospace;color:#ddd;
  background:#0009;border:1px solid #fff4;border-radius:6px;cursor:pointer}
#ov.help #help{color:#fc3;border-color:#fc3}
#hint{display:none;position:absolute;left:10px;bottom:58px;max-width:min(440px,calc(100vw - 20px));box-sizing:border-box;z-index:2;
  text-align:left;background:#000e;border:1px solid #fff3;border-radius:6px;padding:8px 12px}
#ov.help #hint{display:block}
#who{min-height:30px;display:flex;align-items:center;gap:8px;color:#ddd;font-size:13px}
#me:not(:empty){display:flex;align-items:center;gap:6px;background:#000a;border:1px solid #fff3;border-radius:999px;padding:3px 12px 3px 3px}
#who img{width:24px;height:24px;border-radius:50%}
#sojoin{font:bold 13px monospace;color:#fff;background:linear-gradient(#f44,#a11);border:1px solid #f66;border-radius:6px;padding:7px 14px;cursor:pointer;box-shadow:0 2px 0 #500}
#sojoin[hidden],.sj [hidden],.sj[hidden]{display:none}
#sj{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:6px;max-width:92vw}
#sj button{font:bold 12px monospace;color:#ccc;background:linear-gradient(#3a3a3a,#161616);border:1px solid #666;border-bottom-color:#222;
  border-radius:5px;padding:6px 10px;cursor:pointer;text-transform:uppercase;box-shadow:0 2px 0 #000}
#sj button:hover{color:#fff;border-color:#999}
#sj #lb-open{font-size:14px;color:#ffd24a;padding:8px 16px;border:2px solid #fc3;background:linear-gradient(#5c4200,#1d1400);
  text-shadow:0 0 6px #fa0a;box-shadow:0 0 12px #fc35,0 2px 0 #000;letter-spacing:1px}
#sj #lb-open:hover{box-shadow:0 0 18px #fc38,0 2px 0 #000}
#sj #sj-idkfa{border-color:#fc3;color:#fc3}
#ad{position:absolute;right:10px;bottom:10px;display:flex;align-items:center;gap:6px;padding:4px 6px;border:1px solid #fff3;border-radius:6px;background:#000a;max-width:46vw}
#ad canvas{width:48px;height:48px;image-rendering:pixelated;border:2px solid #7a0e0e}
#ad-txt{text-align:left;font-size:10px;color:#bbb;line-height:1.35}
#ad-link{color:#fc3}
#ad-flag{background:none;border:0;color:#999;cursor:pointer;font-size:11px}
#ad-head{display:block;color:#ddd}
#lb{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:3;width:min(360px,94vw);max-height:92%;overflow:auto;
  box-sizing:border-box;padding:12px 16px 10px;text-align:left;font-size:13px;cursor:default;
  background:linear-gradient(#1b1405,#070604);border:2px solid #fc3;border-radius:8px;box-shadow:0 0 30px #fc33,0 0 0 4px #000a}
.lb-t{text-align:center;font:900 20px Impact,"Arial Black",sans-serif;letter-spacing:2px;color:#ffd24a;text-shadow:0 0 10px #fa08,0 2px 0 #000}
#lb-x{position:absolute;right:6px;top:6px;background:none;border:0;color:#aaa;font-size:16px;cursor:pointer}
.lb-h{display:flex;align-items:center;justify-content:center;gap:8px;margin:8px 0 6px}
#lb-name{color:#fff;font:bold 14px monospace;min-width:96px;text-align:center;font-style:normal}
.lb-h button{font:bold 12px monospace;color:#fc3;background:#0008;border:1px solid #fc36;border-radius:4px;padding:2px 9px;cursor:pointer}
#lb ol{margin:0;padding:0;list-style:none;counter-reset:r}
#lb li{display:flex;align-items:center;gap:8px;padding:4px 6px;border-bottom:1px solid #fff1;counter-increment:r}
#lb li::before{content:counter(r);width:22px;text-align:center;color:#888}
#lb li:nth-child(1)::before{content:"🥇"}
#lb li:nth-child(2)::before{content:"🥈"}
#lb li:nth-child(3)::before{content:"🥉"}
#lb li:nth-child(1){background:#fc31}
#lb li .h{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#eee}
#lb li i{color:#fc3;font-style:normal}
#lb li img,#lb li .av{width:20px;height:20px;border-radius:50%;flex:none}
#lb li.royal .h{color:#ffd24a;text-shadow:0 0 6px #fa08}
#lb li.royal img,#lb li.royal .av{box-shadow:0 0 0 2px #fc3}
#lb li .av{display:flex;align-items:center;justify-content:center;background:#5a1a0a;color:#fc3;font-size:11px}
#lb li.dim{justify-content:center;color:#888;border:0}
#lb li.dim::before{content:none}
#lb-me{display:block;margin-top:6px;text-align:center;color:#fc3}
@media (max-height:340px){#logo{font-size:40px}#ov > b{font-size:15px}#who{min-height:0}}
#tmr{position:fixed;left:50%;top:6px;transform:translateX(-50%);z-index:6;font:bold 15px monospace;color:#fc3;
  background:#0009;border:1px solid #fff3;border-radius:4px;padding:3px 8px;pointer-events:none}
#tmr[hidden],#fin[hidden],#fin [hidden]{display:none}
#fin{left:50%;right:auto;transform:translateX(-50%);top:34px !important;flex-direction:column;align-items:center;gap:6px;
  background:#000c;border:2px solid #e33;border-radius:8px;padding:10px 14px;text-align:center;min-width:240px}
#fin b{font-size:20px;color:#fc3}
#fin span{font-size:13px;color:#ddd}
.fin-b{display:flex;gap:6px;justify-content:center}
#fin .fin-b button{font:bold 12px monospace;color:#fff;background:#e33;border:0;border-radius:5px;padding:6px 10px;cursor:pointer}
#fin #fin-x{background:#444}
#fin .fin-b button:disabled{opacity:.5;cursor:wait}`);

must(`<script src="websockets-doom.js" onerror="loadFailed('script')"></script>`,
  `<script src="websockets-doom.js" onerror="loadFailed('script')"></script>
<script src="https://id.sojo.gg/v1/sdk.js"></script>
<script src="sojo-client.js"></script>`);

fs.writeFileSync(path.join(OUT, "index.html"), html);

// the ad editor (adtool/*) is embedded into the Worker as strings — the Worker serves it with the required CSP
const txt = f => JSON.stringify(fs.readFileSync(path.join(__dirname, "adtool", f), "utf8"));
fs.writeFileSync(path.join(__dirname, "worker", "adtool.gen.js"), "// generated by build.js from adtool/* — do not edit\n" +
  `export const ADTOOL_HTML = ${txt("index.html")};\nexport const ADTOOL_JS = ${txt("adtool.js")};\nexport const ADTOOL_CSS = ${txt("adtool.css")};\n`);

// Worker: Sojo's npm imports are bundled into one module (hosting uploads only files next to main)
execFileSync(process.execPath, [require.resolve("esbuild/bin/esbuild"), path.join(__dirname, "worker", "src.js"),
  "--bundle", "--format=esm", "--platform=neutral", "--main-fields=module,main", "--minify",
  "--outfile=" + path.join(__dirname, "worker", "dist", "index.js")], { stdio: "inherit" });

console.log("public/ built:", fs.readdirSync(OUT).join(", "));
