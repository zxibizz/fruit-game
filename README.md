# Fruit Defense

A browser tower-defense game for the family. Bugs crawl from the anthill to the apple; you plant a garden on the open
field and the plants are the towers. Bugs always take the shortest way, so every plant you put down reshapes their
trail — you build the maze yourself (the way can never be closed completely). The 14×8 field fits whole in landscape
and in portrait (turned there); tap a free cell to get the plant menu. No ads, works offline (PWA),
Russian for now.

- `public/data.js` — plants, bugs and the three levels with their waves.
- `public/game.js` — simulation (no DOM): distance field to the fruit, placement rules, bugs, shots, waves, powers.
- `public/art.js` — every picture is drawn by code (volume shading, sprites, terrain, effects, UI pieces).
- `public/view.js` — drawing with cached sprites, input, HUD, menus. `?dev` exposes `window.__fd` for scripted checks.
- `server/` — Node 22, no dependencies: static files and `/healthz`.
- `node --test test/*.test.js` — pathing and placement rules, economy, server, offline cache list, and a bot that must win
  every level. `node test/bot.mjs [levels...]` prints how the bot did, wave by wave.
- [docs/research.md](docs/research.md) — the genre study the design started from (in Russian).

When anything in `public/` changes, bump `VERSION` in both `public/game.js` and `public/sw.js`.
Release: tag `vX.Y.Z` → GitHub Actions builds `ghcr.io/zxibizz/fruit-game:X.Y.Z`, Flux rolls out 0.x tags by itself.

See [CREDITS.md](CREDITS.md) for third-party assets.
