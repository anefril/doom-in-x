// Wrapper around the Sojo CLI from the npx cache: commands with JSON input and the full health list.
//   node sojo-cli.mjs ads           — formats, slots and the editor from ads.json
//   node sojo-cli.mjs health [dev]  — every check that isn't passing (the CLI itself shows only the next one)
// The key stays inside the CLI: it's never read or printed here.
import { readdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const cache = join(process.env.LOCALAPPDATA, "npm-cache", "_npx");
const tools = readdirSync(cache).map(d => join(cache, d, "node_modules", "@sojogg", "cli", "dist", "cli", "tools.js"))
  .find(p => { try { readdirSync(dirname(p)); return true } catch { return false } });
if (!tools) throw new Error("Sojo CLI not found in the npx cache — run any `npx @sojogg/cli` command once");
const { runTool } = await import(pathToFileURL(tools).href);
const GAME = "doom";

const show = r => { const x = r.reply || {}; console.log(x.say || r.text.slice(0, 400)); return r };

const [cmd, arg] = process.argv.slice(2);
if (cmd === "ads") {
  const cfg = JSON.parse(readFileSync(join(here, "ads.json"), "utf8"));
  for (const section of ["formats", "slots", "tools"])
    show(await runTool("ads", { game: GAME, action: "set", section, [section]: cfg[section] }));
} else if (cmd === "health") {
  let body = null;
  const orig = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const res = await orig(url, init);
    if (String(url).includes("/v1/dev/health")) body = await res.clone().json().catch(() => null);
    return res;
  };
  await runTool("check", { game: GAME, source: arg || "dev" });
  if (!body) throw new Error("no /v1/dev/health response");
  console.log(body.summary);
  for (const g of body.groups || [])
    for (const c of g.checks || []) {
      if (c.status === "pass") continue;
      console.log(`${String(c.status).padEnd(7)} ${(g.title || g.name || g.id || "").padEnd(8)} ${c.check || c.id}`);
      if (c.fix) console.log(`        ${c.fix}`);
    }
} else console.log("node sojo-cli.mjs ads | health [dev|live]");
