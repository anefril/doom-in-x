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

let html = fs.readFileSync(path.join(SRC, "index.html"), "utf8");
const must = (from, to) => {
  if (!html.includes(from)) throw new Error("doom/index.html is missing the expected snippet: " + from);
  html = html.split(from).join(to);
};

// on Sojo the game lives at the host root, not under /doom/
must(`open("/doom/", "_blank")`, `open(location.pathname, "_blank")`);
// Sojo has no /b beacons — don't send them into a 404
must(`navigator.sendBeacon("/b",`, `false && navigator.sendBeacon("/b",`);

// on the title screen: sign-in, Sojo buttons and the sponsored poster. Clicks on them must not start the game (the screen
// starts it on pointerdown) — sojo-client.js stops that
must(`<div id="ov"><b>LOADING…</b><small id="hint"></small></div>`,
  `<div id="ov"><b>LOADING…</b><small id="hint"></small>
  <div id="who"><button id="sojoin" type="button">Sign in with Sojo</button><span id="me"></span></div>
  <div id="sj" class="sj">
    <button id="sj-idkfa" type="button" hidden>IDKFA · 100 💎</button>
    <button id="sj-royal" type="button" hidden>👑 Join Royal</button>
    <button id="sj-share" type="button">Share</button>
    <button id="sj-follow" type="button">Follow on X</button>
  </div>
  <div id="lb" class="sj"><b>🏁 E1M1 SPEEDRUN</b><ol id="lb-list"><li class="dim">no runs yet — be first</li></ol><small id="lb-me"></small></div>
  <div id="ad" class="sj" hidden>
    <canvas id="ad-cv" width="96" height="96" aria-label="Sponsored poster"></canvas>
    <div id="ad-txt"><a id="ad-link" target="_blank" rel="noopener">Sponsored</a> <button id="ad-flag" type="button" title="Report this ad">⚑</button>
      <small id="ad-head"></small></div>
  </div></div>
<div id="tmr" hidden>⏱ 0:00.00</div>
<div id="fin" class="top" hidden><b id="fin-t"></b><span id="fin-s"></span>
  <span class="fin-b"><button id="fin-post" type="button">Post my time</button><button id="fin-in" type="button" hidden>Sign in to save</button><button id="fin-x" type="button">✕</button></span></div>`);
must(`#ov.off{display:none}`, `#ov.off{display:none}
#who{margin-top:6px;min-height:30px;display:flex;align-items:center;gap:8px;color:#ddd;font-size:13px}
#who img{width:24px;height:24px;border-radius:50%}
#sojoin{font:bold 13px monospace;color:#fff;background:#e33;border:0;border-radius:6px;padding:7px 12px;cursor:pointer}
#sojoin[hidden],.sj [hidden],.sj[hidden]{display:none}
#sj{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;max-width:92vw}
#sj button{font:bold 12px monospace;color:#ddd;background:#0008;border:1px solid #fff4;border-radius:6px;padding:6px 10px;cursor:pointer}
#sj-idkfa{border-color:#fc3 !important;color:#fc3 !important}
#ad{display:flex;align-items:center;gap:8px;margin-top:6px;padding:6px 8px;border:1px solid #fff3;border-radius:6px;background:#0008;max-width:92vw}
#ad canvas{width:64px;height:64px;image-rendering:pixelated;border:2px solid #7a0e0e}
#ad-txt{text-align:left;font-size:11px;color:#bbb;line-height:1.4}
#ad-link{color:#fc3}
#ad-flag{background:none;border:0;color:#999;cursor:pointer;font-size:12px}
#ad-head{display:block;color:#ddd}
#lb{margin-top:6px;padding:6px 12px;border:1px solid #fff3;border-radius:6px;background:#0008;font-size:12px;min-width:220px;text-align:left}
#lb b{color:#e33;letter-spacing:1px}
#lb ol{margin:4px 0;padding-left:22px}
#lb li{line-height:1.6}
#lb li i{color:#fc3;font-style:normal;float:right;margin-left:12px}
#lb .dim{color:#888;list-style:none;margin-left:-22px}
#lb-me{color:#bbb}
#tmr{position:fixed;left:50%;top:6px;transform:translateX(-50%);z-index:6;font:bold 15px monospace;color:#fc3;
  background:#0009;border:1px solid #fff3;border-radius:4px;padding:3px 8px;pointer-events:none}
#tmr[hidden],#fin[hidden],#fin [hidden]{display:none}
#fin{left:50%;right:auto;transform:translateX(-50%);top:34px !important;flex-direction:column;align-items:center;gap:6px;
  background:#000c;border:2px solid #e33;border-radius:8px;padding:10px 14px;text-align:center;min-width:240px}
#fin b{font-size:20px;color:#fc3}
#fin span{font-size:13px;color:#ddd}
.fin-b{display:flex;gap:6px;justify-content:center}
#fin .fin-b button{font:bold 12px monospace;color:#fff;background:#e33;border:0;border-radius:5px;padding:6px 10px;cursor:pointer}
#fin #fin-x{background:#444}`);

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
