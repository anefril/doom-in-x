// DOOM's Worker on Sojo hosting. Static files come from env.ASSETS; this only does what must run on a server:
// player token checks, server events (Sojo issues SOJO_SERVER_KEY; it never leaves the Worker),
// gem orders and receipt checks, CSP for the ad editor. Bundled by esbuild (build.js) into worker/dist.
import { verifySojoToken, verifySojoReceipt, sendSojoEvents } from "@sojogg/sdk/server";
// the ad editor is embedded in the Worker: Sojo serves assets itself, bypassing the Worker, so no CSP could be added to them
import { ADTOOL_HTML, ADTOOL_JS, ADTOOL_CSS } from "./adtool.gen.js";   // written by build.js from adtool/*

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

const opts = env => ({ aud: env.SOJO_GAME, allowTest: env.SOJO_ENV === "dev" });

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

async function api(path, req, env) {
  const body = await req.json().catch(() => ({}));
  const me = await player(env, body.token);

  if (path === "/api/session") {
    await events(env, [{ ev: "doom.verified", sub: me.sub }]);
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
    await events(env, [{ ev: "pay_done", sub: me.sub, props: { item: order.key, amount: rc.amount, ref: rc.ref, test: !!rc.test } }]);
    return json({ owned: list });
  }

  // speedrun: level time in tics (35/s) from the engine's memory; the client is trusted (the engine runs offline), but
  // the impossible is rejected: nobody beats E1M1 under 7 s (world record ~8 s), over an hour isn't a run
  if (path === "/api/run") {
    const map = String(body.map || ""), tics = Number(body.tics);
    if (!RUN_MAPS.has(map)) return json({ error: "bad_map" }, 400);
    if (!Number.isInteger(tics) || tics < MIN_TICS || tics > 35 * 3600) return json({ error: "bad_time" }, 400);
    const board = await readBoard(env, map);
    const prev = board.find(r => r.sub === me.sub);
    const improved = !prev || tics < prev.tics;
    if (improved) {
      const row = { sub: me.sub, handle: me.h || "", pfp: me.p || "", tics, at: Date.now() };
      const next = board.filter(r => r.sub !== me.sub).concat(row).sort((a, b) => a.tics - b.tics || a.at - b.at).slice(0, BOARD_MAX);
      await env.DATA.put("lb:" + map, JSON.stringify(next));
      await events(env, [{ ev: "doom.run", sub: me.sub, props: { map, tics } }]);
      return json({ improved, best: tics, rank: next.findIndex(r => r.sub === me.sub) + 1, top: publicTop(next) });
    }
    return json({ improved, best: prev.tics, rank: board.indexOf(prev) + 1, top: publicTop(board) });
  }

  return json({ error: "not_found" }, 404);
}

const RUN_MAPS = new Set(["e1m1"]);
const MIN_TICS = 7 * 35, BOARD_MAX = 100;
const readBoard = async (env, map) => JSON.parse((await env.DATA.get("lb:" + map)) || "[]");
// public view — without sub (the player's id in our game), only what's visible on X anyway
const publicTop = (board, n = 10) => board.slice(0, n).map((r, i) => ({ rank: i + 1, handle: r.handle, pfp: r.pfp, tics: r.tics }));

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === "/api/leaderboard" && req.method === "GET") {     // public top, no sign-in
      const map = url.searchParams.get("map") || "e1m1";
      if (!RUN_MAPS.has(map)) return json({ error: "bad_map" }, 400);
      return json({ map, top: publicTop(await readBoard(env, map)) });
    }
    if (url.pathname.startsWith("/api/")) {
      if (req.method !== "POST") return json({ error: "method" }, 405);
      try { return await api(url.pathname, req, env) }
      catch (e) { return json({ error: e.message }, e.status || 500) }
    }
    const tool = ADTOOL[url.pathname];
    if (tool) return new Response(tool[0], { headers: { "content-type": tool[1], "content-security-policy": ADTOOL_CSP, "cache-control": "no-cache" } });
    return env.ASSETS.fetch(req);
  },
};
