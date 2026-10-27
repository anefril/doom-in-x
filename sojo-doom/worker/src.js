// DOOM's Worker on Sojo hosting. Static files come from env.ASSETS; this only does what must run on a server:
// player token checks, server events (Sojo issues SOJO_SERVER_KEY; it never leaves the Worker),
// gem orders and receipt checks, CSP for the ad editor. Bundled by esbuild (build.js) into worker/dist.
import { verifySojoToken, verifySojoReceipt, sendSojoEvents } from "@sojogg/sdk/server";
// the ad editor is embedded in the Worker: Sojo serves assets itself, bypassing the Worker, so no CSP could be added to them
import { ADTOOL_HTML, ADTOOL_JS, ADTOOL_CSS } from "./adtool.gen.js";   // written by build.js from adtool/*
import { sharePng, sharePage } from "./share.js";

// What we sell for gems. Prices come only from here: the client is never trusted.
const ITEMS = {
  idkfa: { item: "IDKFA: all weapons, ammo and keys", amount: 100 },
};

// Sojo checks the ad editor with exactly this header (docs/ads.md, How Sojo checks your tool).
const ADTOOL_CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; " +
  "connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors https://sojo.gg";

const ADTOOL = {
  "/adtool/": [ADTOOL_HTML, "text/html; charset=utf-8"],
  "/adtool/adtool.js": [ADTOOL_JS, "text/javascript; charset=utf-8"],
  "/adtool/adtool.css": [ADTOOL_CSS, "text/css; charset=utf-8"],
};

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" },
});

// Sojo's hosting couldn't reach id.sojo.gg from inside the Worker (522, 27.10.2026): every sign-in check failed with
// jwks_unavailable. Their public keys are fetched as usual first; if that fails, a copy taken from
// https://id.sojo.gg/jwks.json and /jwks-test.json the same day is used. If Sojo rotates keys, refresh the copy.
const JWKS_COPY = {
  "https://id.sojo.gg/jwks.json": { keys: [{ kty: "OKP", crv: "Ed25519", x: "Uc5kPIH5lfCGb3kFnjUzTEm6nEMngFS8YE9HuHFTO1o", kid: "k1", alg: "EdDSA", use: "sig" }] },
  "https://id.sojo.gg/jwks-test.json": { keys: [{ kty: "OKP", crv: "Ed25519", x: "-4scZhaMI3I98OFvP7HZegdkV6w86BdpzX8iHod4kRA", kid: "t-1", alg: "EdDSA", use: "sig" }] },
};
async function jwksFetch(u, init) {
  try { const r = await fetch(u, { ...init, signal: AbortSignal.timeout(1500) }); if (r.ok) return r } catch {}
  if (JWKS_COPY[u]) return new Response(JSON.stringify(JWKS_COPY[u]), { headers: { "content-type": "application/json" } });
  throw new Error("jwks unreachable");
}
const opts = env => ({ aud: env.SOJO_GAME, allowTest: env.SOJO_ENV === "dev", fetch: jwksFetch });

async function player(env, token) {
  if (typeof token !== "string" || !token) throw Object.assign(new Error("no token"), { status: 401 });
  try { return await verifySojoToken(token, opts(env)) }
  catch (e) { throw Object.assign(new Error("bad token: " + (e.code || e.message)), { status: 401 }) }
}

// events must never break the player's response: Sojo may blink
async function events(env, list) {
  try { await sendSojoEvents(list, { serverKey: env.SOJO_SERVER_KEY }) } catch (e) { console.warn("events:", e.message) }
}

const owned = async (env, sub) => JSON.parse((await env.DATA.get("owned:" + sub)) || "[]");

async function api(path, req, env, ctx) {
  const body = await req.json().catch(() => ({}));
  const me = await player(env, body.token);

  if (path === "/api/session") {
    ctx.waitUntil(events(env, [{ ev: "doom.verified", sub: me.sub }]));
    return json({ sub: me.sub, owned: await owned(env, me.sub), royal: (me.perks || []).includes("supporter") });
  }

  if (path === "/api/order") {
    const it = ITEMS[body.item];
    if (!it) return json({ error: "unknown_item" }, 400);
    if ((await owned(env, me.sub)).includes(body.item)) return json({ error: "owned" }, 409);
    const id = "ord_" + crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    await env.DATA.put("order:" + id, JSON.stringify({ sub: me.sub, key: body.item, ...it, status: "open" }), { expirationTtl: 86400 });
    return json({ ref: id, item: it.item, amount: it.amount });
  }

  if (path === "/api/receipt") {
    let rc;
    try { rc = await verifySojoReceipt(String(body.receipt || ""), opts(env)) }
    catch (e) { return json({ error: "bad_receipt", detail: e.code || e.message }, 400) }
    const raw = await env.DATA.get("order:" + rc.ref);
    const order = raw && JSON.parse(raw);
    // the receipt must belong to this player, match our open order and its exact price
    if (!order || rc.sub !== me.sub || order.sub !== me.sub || rc.amount !== order.amount) return json({ error: "mismatch" }, 400);
    if (order.status === "done") return json({ owned: await owned(env, me.sub) });     // same ref again — never grant twice
    const list = await owned(env, me.sub);
    if (!list.includes(order.key)) list.push(order.key);
    await env.DATA.put("owned:" + me.sub, JSON.stringify(list));
    await env.DATA.put("order:" + rc.ref, JSON.stringify({ ...order, status: "done", lid: rc.lid }));
    ctx.waitUntil(events(env, [{ ev: "pay_done", sub: me.sub, props: { item: order.key, amount: rc.amount, ref: rc.ref, test: !!rc.test } }]));
    return json({ owned: list });
  }

  // speedrun: level time in tics (35/s) from the engine's memory. The engine runs in the browser, so the time can't be
  // proven; what is rejected: times under the floors in RUN_MAPS, and a run that took less real time than it claims —
  // the client takes a signed ticket when the level (for "e1" — E1M1) starts, and the server knows when that was
  if (path === "/api/run") {
    const map = String(body.map || ""), tics = Number(body.tics);
    if (!RUN_MAPS.has(map)) return json({ error: "bad_map" }, 400);
    const [min, max] = RUN_MAPS.get(map);
    if (!Number.isInteger(tics) || tics < min * 35 || tics > max * 35) return json({ error: "bad_time" }, 400);
    const started = await checkTicket(env, body.ticket);
    if (!started) return json({ error: "bad_ticket" }, 400);
    const took = Date.now() - started;
    if (took < tics / 35 * 1000 - TICKET_SLACK_MS || took > (max + 600) * 1000) return json({ error: "bad_time" }, 400);
    const board = await readBoard(env, map);
    const prev = board.find(r => r.sub === me.sub);
    const improved = !prev || tics < prev.tics;
    const royal = (me.perks || []).includes("supporter");  // Royal: crown and a gold name on the board
    if (prev && !improved && !!prev.royal !== royal) {     // subscribed or left since the best run — the row follows
      prev.royal = royal;
      await env.DATA.put("lb:" + map, JSON.stringify(board));
    }
    if (improved) {
      const row = { sub: me.sub, handle: me.h || "", pfp: me.p || "", royal, tics, at: Date.now() };
      const next = board.filter(r => r.sub !== me.sub).concat(row).sort((a, b) => a.tics - b.tics || a.at - b.at).slice(0, BOARD_MAX);
      await env.DATA.put("lb:" + map, JSON.stringify(next));
      ctx.waitUntil(events(env, [{ ev: "doom.run", sub: me.sub, props: { map, tics } }]));
      const rank = next.findIndex(r => r.sub === me.sub) + 1;
      const share = await saveShare(env, { map, tics, rank, handle: me.h || "", royal });
      return json({ improved, best: tics, rank, top: publicTop(next), share });
    }
    // not a new best: the card shows the player's best and place — a slower run never makes the post weaker
    const rank = board.indexOf(prev) + 1;
    const share = await saveShare(env, { map, tics: prev.tics, rank, handle: me.h || "", royal });
    return json({ improved, best: prev.tics, rank, top: publicTop(board), share });
  }

  return json({ error: "not_found" }, 404);
}

// board → [floor, ceiling] in seconds. Floors are ~70% of the UV-speed world records (DSDA via doomwiki.org/wiki/UV_speed):
// E1M1 0:09, E1M2 0:22, E1M3 0:40 (secret exit 0:45), E1M4 0:12, E1M5 0:55, E1M6 0:56, E1M7 1:15, E1M8 0:23, E1M9 0:29.
// "e1" is the whole of Episode 1 in one go (E1M1 → E1M8, the secret E1M9 allowed), the sum of the level times; TAS 3:23
const RUN_MAPS = new Map([
  ["e1m1", [6, 3600]], ["e1m2", [15, 3600]], ["e1m3", [28, 3600]], ["e1m4", [8, 3600]], ["e1m5", [38, 3600]],
  ["e1m6", [39, 3600]], ["e1m7", [52, 3600]], ["e1m8", [16, 3600]], ["e1m9", [20, 3600]],
  ["e1", [150, 4 * 3600]],
]);
const BOARD_MAX = 100, TICKET_SLACK_MS = 1500;

// ticket = "<ms>.<hmac>": the moment a level started, signed with the Worker's secret so the client can't backdate it
const enc = new TextEncoder();
async function sign(env, msg) {
  const key = await crypto.subtle.importKey("raw", enc.encode(env.SOJO_SERVER_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode("doom-run:" + msg)));
  return btoa(String.fromCharCode(...sig)).replace(/[+/=]/g, "");
}
const newTicket = async env => { const t = String(Date.now()); return t + "." + await sign(env, t) };
async function checkTicket(env, ticket) {
  const [t, sig] = String(ticket || "").split(".");
  if (!/^\d{13}$/.test(t || "") || sig !== await sign(env, t)) return 0;
  return Number(t);
}
// a finished run for its post card (worker/share.js): /r/<id>
async function saveShare(env, run) {
  const id = [...crypto.getRandomValues(new Uint8Array(10))].map(b => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
  await env.DATA.put("share:" + id, JSON.stringify(run));
  return id;
}
const readBoard = async (env, map) => JSON.parse((await env.DATA.get("lb:" + map)) || "[]");
// public view — without sub (the player's id in our game), only what's visible on X anyway
const publicTop = (board, n = 10) => board.slice(0, n).map((r, i) => ({ rank: i + 1, handle: r.handle, pfp: r.pfp, royal: !!r.royal, tics: r.tics }));

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === "/api/leaderboard" && req.method === "GET") {     // public top, no sign-in
      const map = url.searchParams.get("map") || "e1m1";
      if (!RUN_MAPS.has(map)) return json({ error: "bad_map" }, 400);
      return json({ map, top: publicTop(await readBoard(env, map)) });
    }
    const card = url.pathname.match(/^\/r\/([a-z0-9]{10})(\.png)?$/);
    if (card && req.method === "GET") {
      // /r/demo000000 on dev only: a sample card to check the look without a signed-in run
      const run = card[1] === "demo000000" && env.SOJO_ENV === "dev" ? { map: "e1m1", tics: 399, rank: 1, handle: "NukeKevDev", royal: true }
        : JSON.parse((await env.DATA.get("share:" + card[1])) || "null");
      if (!run) return Response.redirect(url.origin + "/", 302);
      if (card[2]) return new Response(await sharePng(env, url.origin, run), { headers: { "content-type": "image/png", "cache-control": "public, max-age=604800, immutable" } });
      return new Response(await sharePage(env, url.origin, card[1], run), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" } });
    }
    if (url.pathname === "/api/ticket" && req.method === "GET") return json({ ticket: await newTicket(env) });   // no sign-in: players sign in after the finish too
    if (url.pathname.startsWith("/api/")) {
      if (req.method !== "POST") return json({ error: "method" }, 405);
      try { return await api(url.pathname, req, env, ctx) }
      catch (e) { return json({ error: e.message }, e.status || 500) }
    }
    const tool = ADTOOL[url.pathname];
    if (tool) return new Response(tool[0], { headers: { "content-type": tool[1], "content-security-policy": ADTOOL_CSP, "cache-control": "no-cache" } });
    return env.ASSETS.fetch(req);
  },
};
