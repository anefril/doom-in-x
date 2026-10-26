# DOOM in your X feed

The original DOOM (1993, shareware) running **inside an X post** as a player card, hosted on [Sojo](https://sojo.gg).

▶ **Play:** https://doom.sojo.gg — or open the [launch post](https://x.com/NukeKevDev/status/2114806567371673740) and tap the card.

## What's inside

- `doom/` — the game page: Chocolate Doom compiled to WebAssembly (from [cloudflare/doom-wasm](https://github.com/cloudflare/doom-wasm)) plus `doom1.wad` (shareware). Starts straight in E1M1, works with keyboard + mouse or on-screen sticks on a phone, saves to IndexedDB.
- `sojo-doom/` — the Sojo build:
  - `build.js` copies `doom/` into `public/`, adds the Sojo SDK and bundles the Worker (`npm i && node build.js && npx @sojogg/cli deploy`).
  - `client/sojo-client.js` — sign-in, account pill, Royal, share / follow on X, events, the sponsored poster on the start screen, and the **E1M1 speedrun**: a live level timer and the finish time read straight from the engine's memory (`leveltime` and the intermission `wminfo` struct), no engine rebuild.
  - `worker/src.js` — the game server: verifies player tokens, gem orders + receipts, the speedrun leaderboard (Workers KV).
  - `adtool/` — the ad editor Sojo shows to advertisers: turns an uploaded image into a 32×32 poster in a DOOM palette.
  - `video/` — the promo video recorder (Playwright + ffmpeg), with a route through E1M1 that aims at a barrel by reading pixels.

No keys live in this repo: the Sojo account key stays in the CLI, the server key is issued by Sojo per deploy.

## Credits & licenses

- DOOM is © id Software. `doom1.wad` is the freely redistributable shareware episode.
- Chocolate Doom (GPL-2.0) and its WebAssembly port by Cloudflare (GPL-2.0).
- Sojo SDK: [@sojogg/sdk](https://www.npmjs.com/package/@sojogg/sdk).
