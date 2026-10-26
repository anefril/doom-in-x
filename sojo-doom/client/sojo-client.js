// Sojo in DOOM (only the doom.sojo.gg build): sign-in, account pill on the title screen, buying IDKFA for gems,
// Royal (subscribe + perk), share and follow on X, custom events, the sponsored poster on the title screen.
// Loads after the engine: KEYS, press, macro are globals from the main script of doom/index.html.
(() => {
  if (!window.Sojo) return;                               // SDK didn't load — play without it
  const sojo = Sojo.init({ game: "doom", ui: { corner: "top-left", inset: 8 } });
  const $ = id => document.getElementById(id);
  const ov = $("ov"), btnIn = $("sojoin"), meEl = $("me");
  const bIdkfa = $("sj-idkfa"), bRoyal = $("sj-royal"), bShare = $("sj-share"), bFollow = $("sj-follow");
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const X_HANDLE = "NukeKevDev";

  // clicks on our title-screen buttons must not start the game: the screen starts it on pointerdown
  for (const el of [btnIn, $("sj"), $("ad")]) el.addEventListener("pointerdown", e => e.stopPropagation());
  const onClick = (el, fn) => el.addEventListener("click", e => { e.stopPropagation(); fn(e) });

  // --- game server (worker/src.js): the player token is verified there ---
  const api = async (path, body = {}) => {
    const token = await sojo.token();
    if (!token) throw new Error("signed out");
    const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, ...body }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "HTTP " + r.status);
    return j;
  };

  // --- who's playing; Royal perk: gold name and a crown ---
  let me = null, royal = false, owned = [], order = null;
  function drawMe() {
    btnIn.hidden = !!me;
    meEl.style.color = royal ? "#fc3" : "";
    meEl.innerHTML = me ? (me.pfp ? '<img src="' + esc(me.pfp) + '" alt="">' : "") + (royal ? "👑 " : "") + "Playing as @" + esc(me.handle) : "";
    bRoyal.hidden = royal;
    const has = owned.includes("idkfa");
    bIdkfa.hidden = !me || (!has && !order);
    bIdkfa.textContent = has ? "IDKFA ✓ use" : order ? `IDKFA · ${order.amount} 💎` : "IDKFA";
  }
  if (sojo.cached) { me = sojo.cached; drawMe() }
  sojo.onChange(async next => {
    me = next; royal = !!(me && me.perks && me.perks.includes("supporter")); owned = []; order = null;
    drawMe();
    if (!me) return;
    try {
      const st = await sojo.supporter();                  // Royal from the SDK (on the server — from the token's perks)
      royal = royal || !!(st && st.status === "yes");
      const s = await api("/api/session");                // the server verifies the token and sends doom.verified
      owned = s.owned || []; royal = royal || !!s.royal;
      if (!owned.includes("idkfa")) order = await api("/api/order", { item: "idkfa" });   // order ahead: spend runs straight from the click
    } catch (e) { console.warn("sojo session:", e.message) }
    drawMe();
  });
  onClick(btnIn, () => sojo.signIn());

  // --- IDKFA for gems: order on the server → spend from a click → receipt verified on the server → grant ---
  Object.assign(KEYS, { KeyI: ["i", 73], KeyK: ["k", 75], KeyF: ["f", 70] });
  const cheat = word => macro([...word].map(ch => () => press("Key" + ch.toUpperCase())));
  onClick(bIdkfa, async () => {
    if (owned.includes("idkfa")) { cheat("idkfa"); sojo.track("doom.cheat", { code: "idkfa" }); return }
    if (!order) return;
    const r = await sojo.spend({ amount: order.amount, item: order.item, ref: order.ref });
    if (!r) return;                                       // not confirmed or closed
    try {
      const g = await api("/api/receipt", { receipt: r.receipt });
      owned = g.owned || []; order = null; drawMe();
      cheat("idkfa"); sojo.track("doom.cheat", { code: "idkfa" });
    } catch (e) { console.warn("receipt:", e.message) }
  });

  // --- Royal, share, X ---
  onClick(bRoyal, async () => { const s = await sojo.subscribe(); if (s) { royal = true; drawMe() } });
  onClick(bShare, () => sojo.share({ text: "I'm playing the original DOOM right inside an X post", url: location.origin }));
  onClick(bFollow, () => sojo.x.follow(X_HANDLE));

  // --- custom events ---
  $("save").addEventListener("click", () => sojo.track("doom.save"));
  $("load").addEventListener("click", () => sojo.track("doom.load"));

  // --- Sojo pill only on the title screen; first time into the game = play_start ---
  let started = false;
  const sync = () => {
    const playing = ov.classList.contains("off");
    sojo.ui(!playing);
    if (playing && !started) { started = true; sojo.track("play_start") }
    adVisibility();
  };
  new MutationObserver(sync).observe(ov, { attributes: true, attributeFilter: ["class"] });

  // --- ads: a 32×32 poster on the title screen (slot menu-poster, format doom_poster) ---
  const adBox = $("ad"), adCv = $("ad-cv"), adLink = $("ad-link"), adHead = $("ad-head");
  const VIEW = { ratio: 0.5, ms: 1000 };                  // = the format's view_rule
  let fill = null, shownAt = 0, seenFor = null, viewT = null;
  function drawFill(f) {
    fill = f && f.fill && f.pixels && f.pixels.length ? f : null;   // no pixels, nothing to draw — don't show an empty frame
    adBox.hidden = !fill;
    if (!fill) return;
    const n = fill.w, k = adCv.width / n, x = adCv.getContext("2d");
    (fill.pixels || []).forEach((v, i) => { x.fillStyle = (fill.palette || [])[v] || "#000"; x.fillRect((i % n) * k, Math.floor(i / n) * k, k, k) });
    adLink.textContent = fill.label || ("Sponsored · " + (fill.brand || ""));
    adHead.textContent = fill.headline || "";
    $("ad-flag").hidden = !fill.clickable;
    adLink.removeAttribute("href");
    if (fill.clickable) refreshLink();
    seenFor = null; adVisibility();
  }
  async function refreshLink() { try { const l = await sojo.ads.link(fill); if (l) adLink.href = l.url } catch {} }
  adLink.addEventListener("click", e => { e.stopPropagation(); if (!adLink.href) e.preventDefault(); setTimeout(refreshLink) });
  onClick($("ad-flag"), () => fill && sojo.ads.report(fill));
  // a view counts once the poster is on screen (title screen visible, tab active) for VIEW.ms in a row
  function adVisibility() {
    clearTimeout(viewT);
    const visible = fill && !adBox.hidden && !ov.classList.contains("off") && document.visibilityState === "visible";
    if (!visible || seenFor === fill.fill) { shownAt = 0; return }
    shownAt = shownAt || performance.now();
    viewT = setTimeout(() => {
      if (!fill || seenFor === fill.fill) return;
      sojo.ads.seen(fill, { ratio: 1, ms: Math.round(performance.now() - shownAt) });
      seenFor = fill.fill;
    }, VIEW.ms + 50);
  }
  document.addEventListener("visibilitychange", adVisibility);
  const pick = f => (f && f.fills || []).find(x => x.slot === "menu-poster") || null;
  const loadFills = async () => { try { drawFill(pick(await sojo.ads.fills())) } catch {} };
  sojo.ads.onChange(f => drawFill(pick(f)));
  loadFills();
  setInterval(loadFills, 60000);                          // onChange doesn't hear an ad pulled mid-hour

  // --- E1M1 speedrun: the timer and the finish are read from the engine's memory ---
  // Addresses are for this websockets-doom.wasm build (found with wasm-dis): G_DoCompleted writes into wminfo
  // (946036) the episode (+0, zero-based), the map (+8, zero-based) and player 0's stime (+56) = leveltime (955996), 35 tics/s.
  // Swap the engine build — re-check the addresses.
  const LEVELTIME = 955996, WM_EPSD = 946036, WM_LAST = 946044, WM_STIME = 946092;
  const heap = () => (window.Module && Module.HEAP32) || null;
  const fmt = t => { const s = t / 35, m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(2).padStart(5, "0")}` };
  const tmr = $("tmr"), fin = $("fin"), finT = $("fin-t"), finS = $("fin-s"), finPost = $("fin-post"), finIn = $("fin-in");
  const lbList = $("lb-list"), lbMe = $("lb-me");
  let lastStime = 0, run = null;                          // run = {map, tics} of the last finish

  function drawBoard(top, mine) {
    if (top && top.length) lbList.innerHTML = top.slice(0, 5).map(r =>
      `<li>@${esc(r.handle || "anon")}<i>${fmt(r.tics)}</i></li>`).join("");
    if (mine) lbMe.textContent = `your best: ${fmt(mine.best)} · #${mine.rank}`;
  }
  const loadBoard = () => fetch("/api/leaderboard?map=e1m1").then(r => r.json()).then(j => drawBoard(j.top)).catch(() => {});
  loadBoard();

  async function submit() {
    if (!run) return;
    if (!me) { finS.textContent = "sign in to put it on the leaderboard"; finIn.hidden = false; return }
    finIn.hidden = true; finS.textContent = "saving…";
    try {
      const r = await api("/api/run", run);
      finS.textContent = r.improved ? `new personal best · rank #${r.rank}` : `best ${fmt(r.best)} · rank #${r.rank}`;
      drawBoard(r.top, r);
    } catch (e) { finS.textContent = "couldn't save: " + e.message }
  }

  setInterval(() => {
    const H = heap();
    if (!H) return;
    const playing = ov.classList.contains("off");
    tmr.hidden = !playing;
    if (playing) tmr.textContent = "⏱ " + fmt(H[LEVELTIME >> 2]);
    const st = H[WM_STIME >> 2];
    if (st && st !== lastStime) {                         // G_DoCompleted filled in new results — level finished
      lastStime = st;
      const map = `e${H[WM_EPSD >> 2] + 1}m${H[WM_LAST >> 2] + 1}`;
      sojo.track("doom.level_done", { map, tics: st });
      if (map === "e1m1") {
        run = { map, tics: st };
        finT.textContent = `🏁 E1M1 — ${fmt(st)}`;
        fin.hidden = false;
        submit();
      }
    }
  }, 100);

  for (const b of [finPost, finIn, $("fin-x")]) b.addEventListener("pointerdown", e => e.stopPropagation());
  const backToGame = () => { if (ov.classList.contains("off")) cv.focus({ preventScroll: true }) };
  onClick($("fin-x"), () => { fin.hidden = true; backToGame() });
  onClick(finIn, async () => { await sojo.signIn(); setTimeout(submit, 1500); backToGame() });
  onClick(finPost, () => {
    if (!run) return;
    sojo.x.post({ text: `I beat E1M1 in ${fmt(run.tics)} in DOOM — played right inside an X post 🏁 Can you beat it?`, url: location.origin });
    sojo.track("doom.run_posted", { tics: run.tics });
  });
  // signed in after finishing — save the run already shown
  sojo.onChange(next => { if (next && run && !fin.hidden) setTimeout(submit, 1500) });

  sync();
})();
