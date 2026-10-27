# DOOM in your X feed

The original DOOM (1993, shareware) running **inside an X post** as a player card, hosted on [Sojo](https://sojo.gg).

▶ **Play:** https://doom.sojo.gg — or open the [launch post](https://x.com/NukeKevDev/status/2114806567371673740) and tap the card.

## What's inside

- `doom/` — the game page: Chocolate Doom compiled to WebAssembly (from [cloudflare/doom-wasm](https://github.com/cloudflare/doom-wasm)) plus `doom1.wad` (shareware). Starts straight in E1M1, works with keyboard + mouse or on-screen sticks on a phone, saves to IndexedDB.
- `sojo-doom/` — the Sojo build:
  - `build.js` copies `doom/` into `public/`, adds the Sojo SDK and bundles the Worker (`npm i && node build.js && npx @sojogg/cli deploy`).
  - `client/sojo-client.js` — sign-in, Royal, share / follow on X, events, the sponsored poster, the title screen with the **Hall of Fame**, and the **speedrun**: a live level timer and finish times read straight from the engine's memory (`leveltime` and the intermission `wminfo` struct), no engine rebuild. Boards for every map of Episode 1 and for the whole episode in one go (the secret E1M9 route included). The ☰ button / ESC pauses through DOOM's own Pause key, so the level clock stops too.
  - `worker/src.js` — the game server: verifies player tokens, gem orders + receipts, the leaderboards (Workers KV). Anti-cheat: floors under the world records, signed level-start tickets (a run can't claim more game time than real time passed), cheat codes unrank the session.
  - `worker/share.js` — result cards for posts. X intents can't attach images, so "Post my time" links to `/r/<id>`: the same playable card, with this run's picture as its image. The Worker has no canvas: it blends glyphs onto a prepared background and encodes the PNG itself (zlib via `CompressionStream`, CRC by hand). `art/gen-share.js` renders the background and glyph strips once with Playwright.
  - `adtool/` — the ad editor Sojo shows to advertisers: turns an uploaded image into a 32×32 poster in a DOOM palette.
  - `video/` — the promo video recorder (Playwright + ffmpeg), with a route through E1M1 that aims at a barrel by reading pixels.

No keys live in this repo: the Sojo account key stays in the CLI, the server key is issued by Sojo per deploy.

## Credits & licenses

- DOOM is © id Software. `doom1.wad` is the freely redistributable shareware episode.
- Chocolate Doom (GPL-2.0) and its WebAssembly port by Cloudflare (GPL-2.0).
- Sojo SDK: [@sojogg/sdk](https://www.npmjs.com/package/@sojogg/sdk).
