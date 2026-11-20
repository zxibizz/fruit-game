# Fruit Defense

A browser tower-defense game for the family. Bugs crawl from the anthill to the apple; you plant a garden on the open
field and the plants are the towers. Bugs always take the shortest way, so every plant you put down reshapes their
trail — you build the maze yourself (the way can never be closed completely). The 14×8 field fits whole in landscape
and in portrait (turned there); tap a free cell to get the plant menu, hold a plant or a bug to read about it.
Levels are long (20–30 waves). Plants reach only the cells next to them, and no plant makes dew: it comes from beaten
bugs, finished waves and waves called early. A straight trail has room for some 26 shooters; the dew of a level buys
about twice that, and the last third of a level needs it — so the trail has to wind through the whole field.
Some bugs break the maze: caterpillars bite the plants by the trail, mole crickets go straight for the apple and eat
through the walls in their way (they pick the weak plants), and the whole wave runs into the hole. An eaten plant
leaves its roots: they grow back by themselves in a while, faster next to an aloe, or at once for a third of the
plant's price (a tap; it works with bugs on the cell too). A bitten plant can be healed for dew, an aloe heals for free.
After the first wave the waves come by themselves; the ▶ plate next to the anthill, off the grid (it also shows who comes next), calls the next one early for extra dew.
On an iPhone home screen the page is laid out to the full screen height, as in the snake and roll games. No ads, works offline (PWA),
Russian for now.

- `public/data.js` — plants, bugs, the three levels and `makeWaves`, which puts their waves together from a short recipe.
- `public/game.js` — simulation (no DOM): distance field to the fruit, placement rules, bugs, shots, waves, powers.
- `public/art.js` — every picture is drawn by code (volume shading, sprites, terrain, effects, UI pieces).
- `public/view.js` — drawing with cached sprites, input, HUD, menus. `?dev` exposes `window.__fd` for scripted checks;
  `?dev&insets=top,right,bottom,left` fakes the safe areas (e.g. `0,59,21,59` for an iPhone on its side).
- `server/` — Node 22, no dependencies: static files and `/healthz`.
- `node --test test/*.test.js` — pathing and placement rules, economy, repairs, server, offline cache list, and a bot that must win
  every level with a maze over the whole field and lose with a garden on half of it or without a maze (`test/zone.mjs`: a kill zone by the anthill). `node test/bot.mjs [levels...]` prints how the bot did, wave by wave.
- [docs/research.md](docs/research.md) — the genre study the design started from (in Russian).

When anything in `public/` changes, bump `VERSION` in both `public/game.js` and `public/sw.js`.
Release: tag `vX.Y.Z` → GitHub Actions builds `ghcr.io/zxibizz/fruit-game:X.Y.Z`, Flux rolls out 0.x tags by itself.

See [CREDITS.md](CREDITS.md) for third-party assets.
