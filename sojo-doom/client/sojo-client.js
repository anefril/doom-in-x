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
  for (const el of [btnIn, $("sj"), $("ad"), $("lb"), $("help")]) el.addEventListener("pointerdown", e => e.stopPropagation());
  const onClick = (el, fn) => el.addEventListener("click", e => { e.stopPropagation(); fn(e) });
  onClick($("help"), () => ov.classList.toggle("help"));   // controls: shown while toggled on
  // Emscripten asks for pointer lock on any click once the game wants the mouse. A click on our buttons must not lock it:
  // locked, every next click goes to the game, not to the buttons
  const OURS = "#who, #sj, #lb, #ad, #fin, #help, #menu, #full";
  const lock = cv.requestPointerLock;
  cv.requestPointerLock = function (...a) {
    const t = window.event && window.event.target;
    if (t && t.closest && t.closest(OURS)) return;
    return lock.apply(this, a);
  };

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
    if (owned.includes("idkfa")) { cheated = true; cheat("idkfa"); sojo.track("doom.cheat", { code: "idkfa" }); return }
    if (!order) return;
    const r = await sojo.spend({ amount: order.amount, item: order.item, ref: order.ref });
    if (!r) return;                                       // not confirmed or closed
    try {
      const g = await api("/api/receipt", { receipt: r.receipt });
      owned = g.owned || []; order = null; drawMe();
      cheated = true; cheat("idkfa"); sojo.track("doom.cheat", { code: "idkfa" });
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
    document.body.classList.toggle("playing", playing);   // shows ☰ (build.js CSS)
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

  // --- speedrun: the timer and the finish are read from the engine's memory ---
  // Addresses are for this websockets-doom.wasm build (found with wasm-dis): G_DoCompleted writes into wminfo
  // (946036) the episode (+0, zero-based), the map (+8, zero-based) and player 0's stime (+56) = leveltime (955996), 35 tics/s.
  // Swap the engine build — re-check the addresses.
  const LEVELTIME = 955996, WM_EPSD = 946036, WM_LAST = 946044, WM_STIME = 946092;
  const heap = () => (window.Module && Module.HEAP32) || null;
  const fmt = t => { const s = t / 35, m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(2).padStart(5, "0")}` };
  const tmr = $("tmr"), fin = $("fin"), finT = $("fin-t"), finS = $("fin-s"), finPost = $("fin-post"), finIn = $("fin-in");
  const lbList = $("lb-list"), lbMe = $("lb-me"), lbName = $("lb-name");
  // boards: every map of Episode 1 and "e1" — the whole episode in one go (worker/src.js, RUN_MAPS)
  const BOARDS = ["e1m1", "e1m2", "e1m3", "e1m4", "e1m5", "e1m6", "e1m7", "e1m8", "e1m9", "e1"];
  const title = m => m === "e1" ? "Episode 1" : m.toUpperCase();
  // the episode route: E1M3 may exit to the secret E1M9, which leads back to E1M4
  const NEXT = { 1: [2], 2: [3], 3: [4, 9], 4: [5], 5: [6], 6: [7], 7: [8], 9: [4] };
  let lastStime = 0, lastLt = 0, ep = null;               // ep = {last, tics, ticket} of the episode run in progress
  let ticket = null;                                      // the server's signed start time of the current level (worker: checkTicket)
  // a ticket is only as early as its request: a failed one is retried at once, not left empty (bad_ticket on finish)
  const getTicket = async (tries = 3) => {
    for (let i = 0; i < tries; i++) {
      try { const j = await (await fetch("/api/ticket")).json(); if (j.ticket) return j.ticket } catch {}
      await new Promise(r => setTimeout(r, 300));
    }
    return null;
  };
  // the first level starts with the page (-warp): a ticket taken now is no later than its start
  getTicket().then(t => { ticket = ticket || t });

  // cheats: once one is typed (or IDKFA bought), runs of this session aren't ranked — god mode and the rest stay on
  // through the next levels, and only a reload is surely clean. Our own macros dispatch on window too, so they're caught
  const CHEATS = ["iddqd", "idkfa", "idfa", "idclip", "idspispopd", "idclev", "idbehold", "idchoppers"];
  let cheated = false, typed = "";
  addEventListener("keydown", e => {
    if (!e.key || e.key.length !== 1) return;
    typed = (typed + e.key.toLowerCase()).slice(-12);
    if (CHEATS.some(c => typed.includes(c))) cheated = true;
  }, true);
  let runs = [], saved = false;                           // runs = [{map, tics}] of the last finish (+ the episode on E1M8)
  let shown = "e1m1";
  const tops = {}, mine = {};                             // map → public top / this player's {best, rank}

  function drawBoard() {
    lbName.textContent = title(shown).toUpperCase();
    const top = tops[shown];
    lbList.innerHTML = !top ? '<li class="dim">…</li>' : !top.length ? '<li class="dim">no runs yet — be first</li>' :
      top.slice(0, 10).map(r => {
        const h = r.handle || "anon", av = r.pfp ? `<img src="${esc(r.pfp)}" alt="">` : `<span class="av">${esc(h[0].toUpperCase())}</span>`;
        return `<li${r.royal ? ' class="royal"' : ""}>${av}<span class="h">${r.royal ? "👑 " : ""}@${esc(h)}</span><i>${fmt(r.tics)}</i></li>`;
      }).join("");
    const m = mine[shown];
    lbMe.textContent = m ? `your best: ${fmt(m.best)} · #${m.rank}` : "";
  }
  const showBoard = map => {
    shown = map; drawBoard();
    fetch("/api/leaderboard?map=" + map).then(r => r.json()).then(j => { if (j.top) { tops[map] = j.top; drawBoard() } }).catch(() => {});
  };
  const step = d => showBoard(BOARDS[(BOARDS.indexOf(shown) + d + BOARDS.length) % BOARDS.length]);
  onClick($("lb-prev"), () => step(-1));
  onClick($("lb-next"), () => step(1));
  const lbBox = $("lb");
  onClick($("lb-open"), () => { lbBox.hidden = false; showBoard(shown) });
  onClick($("lb-x"), () => { lbBox.hidden = true });
  // a click past the open leaderboard closes it instead of starting the game (capture runs before index.html's listener)
  ov.addEventListener("pointerdown", e => { if (!lbBox.hidden) { lbBox.hidden = true; e.stopImmediatePropagation() } }, true);
  showBoard("e1m1");

  // --- ☰ in the game, or ESC letting the mouse go: pause and back to the title screen; a click into the game resumes.
  // DOOM's Pause key freezes the world and its clock, so a speedrun loses nothing while the menu is up
  let pausedByUs = false;
  const openMenu = () => {
    if (!ready || !ov.classList.contains("off")) return;
    if (!pausedByUs) { pausedByUs = true; press("Pause") }
    ov.classList.remove("off");
  };
  onClick($("menu"), openMenu);
  ov.addEventListener("pointerdown", () => { if (pausedByUs) { pausedByUs = false; lbBox.hidden = true; press("Pause") } });
  document.addEventListener("pointerlockchange", () => { if (!document.pointerLockElement) openMenu() });

  async function submit() {
    if (!runs.length || saved) return;
    if (cheated) { finS.textContent = "cheats were on — not ranked (reload for a clean run)"; return }
    if (!me) { finS.textContent = "sign in to put it on the leaderboard"; finIn.hidden = false; return }
    finIn.hidden = true; finS.textContent = "saving…";
    saved = true;                                         // sign-in fires submit twice — send once
    // the post links to this run's card (/r/<id>), which exists only once the run is saved: wait for it
    finPost.disabled = true; finPost.textContent = "saving…";
    try {
      for (const run of runs) {
        const r = await api("/api/run", run);
        mine[run.map] = r; tops[run.map] = r.top;
      }
      const head = runs[runs.length - 1], r = mine[head.map];
      finS.textContent = r.improved ? `new personal best · rank #${r.rank}` : `best ${fmt(r.best)} · rank #${r.rank}`;
      showBoard(head.map);
    } catch (e) { saved = false; finS.textContent = "couldn't save: " + e.message }
    finally { finPost.disabled = false; finPost.textContent = "Post my time" }
  }

  $("load").addEventListener("click", () => { ep = null });   // a loaded save isn't a run in one go
  // the engine starts E1M1 (-warp) as soon as it loads and its clock runs behind the title screen: the time before
  // the first click into the game is the player's waiting, not the run — it's taken off that level's time
  let idle = 0, clicked = false;
  new MutationObserver(() => {
    const H = heap();
    if (clicked || !H || !ov.classList.contains("off")) return;
    clicked = true;
    if (!H[WM_STIME >> 2]) idle = H[LEVELTIME >> 2];      // still in the first level
  }).observe(ov, { attributes: true, attributeFilter: ["class"] });

  setInterval(() => {
    const H = heap();
    if (!H) return;
    const playing = ov.classList.contains("off");
    const lt = H[LEVELTIME >> 2];
    tmr.hidden = !playing;
    if (playing) tmr.textContent = "⏱ " + fmt(Math.max(0, lt - idle));
    // the clock jumped back to a later point than a restart after death — a save was loaded from DOOM's own menu
    if (lt < lastLt - 35 && lt > 70) ep = null;
    // the clock went back — a level began (or restarted after death, or a save was loaded): a ticket for its start.
    // No "just started" window: a slow tab samples rarely and would miss it. A ticket taken late only makes the
    // run look faster than real time if it was a loaded save — then the server rejects it, which is right
    if (lt < lastLt) {
      idle = 0;                                           // a new level (or a restart) — the title-screen wait is behind
      ticket = null; getTicket().then(t => { ticket = t });
    }
    lastLt = lt;
    let st = H[WM_STIME >> 2];
    if (st && st !== lastStime) {                         // G_DoCompleted filled in new results — level finished
      lastStime = st;
      st = Math.max(1, st - idle); idle = 0;
      const e = H[WM_EPSD >> 2] + 1, n = H[WM_LAST >> 2] + 1, map = `e${e}m${n}`;
      sojo.track("doom.level_done", { map, tics: st });
      if (e !== 1) return;                                // the shareware WAD has only Episode 1; boards are for it
      if (n === 1) ep = { last: 1, tics: st, ticket };
      else if (ep && NEXT[ep.last].includes(n)) { ep.last = n; ep.tics += st }
      else ep = null;
      runs = [{ map, tics: st, ticket }]; saved = false;
      if (n === 8 && ep) { runs.push({ map: "e1", tics: ep.tics, ticket: ep.ticket }); ep = null }
      const head = runs[runs.length - 1];
      finPost.hidden = cheated;
      finT.textContent = runs.length > 1 ? `🏁 Episode 1 — ${fmt(head.tics)}` : `🏁 ${title(map)} — ${fmt(st)}`;
      fin.hidden = false;
      submit();
    }
  }, 100);

  for (const b of [finPost, finIn, $("fin-x")]) b.addEventListener("pointerdown", e => e.stopPropagation());
  const backToGame = () => { if (ov.classList.contains("off")) cv.focus({ preventScroll: true }) };
  onClick($("fin-x"), () => { fin.hidden = true; backToGame() });
  onClick(finIn, async () => { await sojo.signIn(); setTimeout(submit, 1500); backToGame() });
  onClick(finPost, () => {
    if (!runs.length) return;
    const head = runs[runs.length - 1], r = mine[head.map];
    // saved: the post (and its card) shows the player's best and place, even after a slower run
    const what = head.map === "e1" ? "all of Episode 1" : head.map.toUpperCase(), t = fmt(r && r.best ? r.best : head.tics);
    const text = r && r.rank === 1
      ? `👑 WORLD #1: ${what} in ${t} on the DOOM speedrun board.\n\nThe original 1993 DOOM, playable right inside this post. Come take my crown 👇`
      : r && r.rank
      ? `🩸 ${what} in ${t} — #${r.rank} on the DOOM speedrun board.\n\nThe original 1993 DOOM, playable right inside this post. Think you're faster? 👇`
      : `🔥 Just ripped through ${what} in ${t} in the original DOOM — right inside an X post.\n\nYour turn 👇`;
    // the share link carries this run's picture as the card (worker/share.js); not signed in — the plain game link
    sojo.x.post({ text, url: r && r.share ? location.origin + "/r/" + r.share : location.origin });
    sojo.track("doom.run_posted", { map: head.map, tics: head.tics });
  });
  // signed in after finishing — save the run already shown
  sojo.onChange(next => { if (next && runs.length && !fin.hidden) setTimeout(submit, 1500) });

  sync();
})();
