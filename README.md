# Fruit Defense

A browser tower-defense game for the family. Bugs crawl from the anthill to the apple; you plant a garden on the open
field and the plants are the towers. Bugs always take the shortest way, so every plant you put down reshapes their
trail — you build the maze yourself (the way can never be closed completely). The 14×8 field fits whole in landscape
and in portrait (turned there).

- **Planting**: the plants of the level lie on a shelf (a row under the field or a column beside it, whichever leaves
  the bigger cells). Drag one onto a cell — the new trail and the reach are shown under the finger — or tap it and
  then tap cells. Until the wave starts, a fresh plant sells for its full price, so a slip costs nothing.
- **Plants**: nine of them, three levels each. A level is seen at a glance (one, two, three blooms or cobs, bigger,
  gold on the third); the panel of a plant shows every number now and after the upgrade, and the third level adds a
  trick of its own (a rose shoots two bugs, a pumpkin grows thorns, mint freezes…). Hold a plant or a bug to read
  about it; the guide on the home screen has all of them.
- **Levels**: nine, 20–30 waves each, with their own ground: fertile beds (a stronger plant), mud (slow bugs), ponds,
  nettles (sting the bugs, nothing grows), weeds (cleared for dew), two anthills. A boss comes in the middle and at
  the end of every level: the rhino beetle runs, the queen lets ants out, the slug king splits into snails, the
  hornet flies over the maze, the spider webs the plants.
- **Balance**: a level is meant to be hard and to be won by thought. Plants that hit walkers reach only the cells
  next to them; bugs tire as they walk (every cell adds 3% to the damage they take), so a long winding trail with the
  best plants near its end does several times more than the same plants by a straight road. The first level of a
  plant is cheap — a trail is quick to shape — and the upgrades are dear: there is never dew for all of them. No
  plant makes dew (it comes from beaten bugs, finished waves and waves called early). Caterpillars bite plants, mole
  crickets eat through walls; eaten plants leave roots that grow back by themselves, faster by an aloe, or at once
  for dew. Freezes do not chain; dandelions shoot only at flyers, which cross the maze in a straight line.
- **Stars and perks**: up to three stars a level; they buy permanent perks (more dew at the start, a sturdier apple,
  a stronger plant…), which can be taken back and dealt again for free.
- A level in progress is kept between waves and can be continued from the home screen.
- Sound effects are synthesized (Web Audio), the music is four CC0 tracks; volumes are in the pause menu.
- No ads, works offline (PWA), Russian for now. On an iPhone home screen the page is laid out to the full screen
  height, as in the snake and roll games.

- `public/data.js` — plants, bugs, perks, the levels (each field is a little picture in text) and `makeWaves`, which puts
  their waves together from a short recipe.
- `public/game.js` — simulation (no DOM): distance field to the fruit, placement rules, bugs and bosses, shots, waves,
  powers, the ground, saving a level between waves.
- `public/art.js` — every picture is drawn by code (volume shading, sprites, terrain, effects, UI pieces).
- `public/audio.js` — sound effects (with a limiter on how many start at once) and the music player; `public/music/` is
  cached by the service worker when first played, in a cache that outlives the versions.
- `public/view.js` — drawing with cached sprites, input, HUD, the shelf, panels and the HTML screens. `?all` opens every level. `?dev` exposes `window.__fd` for scripted checks;
  `?dev&insets=top,right,bottom,left` fakes the safe areas (e.g. `0,59,21,59` for an iPhone on its side).
- `server/` — Node 22, no dependencies: static files and `/healthz`.
- `node --test test/*.test.js` — pathing and placement rules, economy, repairs, bosses, the ground, perks, saving, server, offline
  cache list, and the balance: the smart bot of `test/bot.mjs` (a maze through mud and nettles, plants where bugs are
  slowest and most tired, mended holes, frost and rain, the perks of two stars a level) must win every level, a fully
  grown garden beside the untouched trail must lose every level even with every perk and endless dew, and half a
  garden, no powers, no perks or no eye for the ground must do worse. The suite takes a few minutes.
  `node test/bot.mjs [levels...]` prints how the bot did, wave by wave.
- [docs/research.md](docs/research.md) — the genre study the design started from (in Russian).

When anything in `public/` changes, bump `VERSION` in both `public/game.js` and `public/sw.js`.
Release: tag `vX.Y.Z` → GitHub Actions builds `ghcr.io/zxibizz/fruit-game:X.Y.Z`, Flux rolls out 0.x tags by itself.

See [CREDITS.md](CREDITS.md) for third-party assets.
