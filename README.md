# Fruit Defense

A browser tower-defense game for the family. Bugs crawl from the anthill to the apple; you plant a garden on the open
field and the plants are the towers. Bugs always take the shortest way, so every plant you put down reshapes their
trail — you build the maze yourself (the way can never be closed completely). The 14×8 field fits whole in landscape
and in portrait (turned there).

- **Planting**: the plants of the level lie on a shelf (a row under the field or a column beside it, whichever leaves
  the bigger cells). Drag one onto a cell — the new trail and the reach are shown under the finger — or tap it and
  then tap a cell (one plant per pick: the shelf lets go once it is planted). A plant of another kind can go right over
  an old one: the old one is sold first and its dew counts. Until the wave starts, a fresh plant sells for its full
  price, so a slip costs nothing.
- **Plants**: nine of them, three levels each. A level is seen at a glance (one, two, three blooms or cobs, bigger,
  gold on the third); the panel of a plant shows every number now and after the upgrade, and the third level adds a
  trick of its own (a rose shoots two bugs, a pumpkin grows thorns, mint freezes…). Hold a plant or a bug to read
  about it; the guide on the home screen has all of them.
- **Levels**: nine, 20–30 waves each, with their own ground: fertile beds (a stronger plant), mud (slow bugs), ponds,
  nettles (sting the bugs, nothing grows), weeds (cleared for dew), two anthills. A boss comes in the middle and at
  the end of every level: the rhino beetle runs, the queen lets ants out, the slug king splits into snails, the
  hornet flies over the maze, the spider webs the plants.
- **Balance**: a level is meant to be hard and to be won by thought. Plants that hit walkers reach only the cells
  next to them, and bugs come in tight packs: a long winding trail has twice the cells beside it and keeps a pack
  under the plants several times longer than a straight road. The health of every bug, bosses too, grows by one rule on
  every level (`TUNE.hpGrowth` of its own health a wave). The first level of a
  plant is cheap — a trail is quick to shape — and the upgrades are dear: there is never dew for all of them. Most of
  the dew is the pay for every wave got through, growing evenly over a level (`pay` of the level); a bug gives its own
  small reward, the same everywhere. Bosses are strong but a grown garden kills them. No
  plant makes dew (it comes from finished waves, beaten bugs and waves called early). Caterpillars bite plants, mole
  crickets eat through walls; eaten plants leave roots that grow back by themselves, faster by an aloe, or at once
  for dew. Freezes do not chain; flyers cross the maze in a straight line.
- **Every plant has its place**: the pumpkin is the wall; corn is the all-rounder for packs (a cob hits a few bugs);
  the pepper burns every bug around it, a little each — for dense crowds of small ones; the rose marks the bugs it
  pricks (they take more from every plant) and reaches flyers; the flytrap bites through armor and swallows whole a
  bug the others have worn down — for the few thick ones; the dandelion is the far shot at flyers; mint slows, the
  bell makes neighbours shoot faster, the aloe mends what is eaten. `node balance/lab.mjs` measures each plant apart
  from the levels (a fixed maze, a garden of one kind for a sum of dew, a pack of one kind of bug), and the matrix
  fails when a plant is not planted by the bot or when no level goes worse without it.
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
  cache list, no sudden walls of flyers in the waves, the two copies of the simulation against each other (see `sim/`
  below), and the balance on one seed: the smart bot (`sim/src/bot.rs`: a maze through mud and nettles; it values a
  garden by the bugs it stops — walkers and flyers apart, a crowd sharing a single shooter while corn and pepper hit
  many; mended holes, frost and rain, the perks of two stars a level) must win every level; a garden beside the
  untouched trail must lose every level with the most perks there can be by then (three stars on every level before),
  planted any of four ways; half a garden or no powers must do worse. The suite takes half a minute and needs `cargo`
  (the bot is native); the full picture is the balance matrix below.
- Party analytics: `public/telemetry.js` records every party wave by wave — the garden when a wave is called
  (every plant, its level and cell, the roots of eaten ones), the trail through it, the dew and the fruit, the early
  call, what was built, grown, sold and mended before and during the wave, frost and rain, the bugs killed and the
  bugs that bit the fruit by kind, the plants eaten, the time (game and real, paused, at what speed), and how the
  party ended (won, lost, left). Nothing personal: a random id of the device, the version. The records wait in
  localStorage until the server takes them (`POST /api/telemetry`), so offline parties are sent later; a dev page
  (`?dev`) or a copy run at home sends nothing (`?t=1` records anyway, to check the recording). The server appends
  them to `$TELEMETRY_DIR/<day>.jsonl` (off without it), with limits on size and rate since the page is public, and
  gives them back only with `Authorization: Bearer $TELEMETRY_TOKEN` (`GET /api/telemetry?from=&to=`).
  `node balance/players.mjs` fetches them (token in `$FRUIT_TELEMETRY_TOKEN` or
  `~/.config/homelab/fruit-game/telemetry-token`) and sums them up level by level and wave by wave
  (`--party ID` for one party, wave by wave).
- `balance/` — the balance matrix (dev only, not in the image): `node balance/run.mjs [quick|full|routes] [--margin] [--levels 5,6-8]
  [--set L5.dew=500,FLY_SHARE=.2] [--grid 'L5.budget=12/5.8|12/6.4;L5.pay=150/270|170/300']`. For every level it plays many
  scenarios in parallel (the native bot of `sim/` on a snapshot of the code, a batch per variant of the data; half the
  cores by default at the lowest priority — `--jobs N` for more; the full matrix, some 480 parties, takes under a
  minute; results cached
  per level, so tuning one level reruns only it): the smart bot on several seeds and on other draws of the waves; lazy
  gardens beside the untouched trail with real dew and the most perks of their time, planted best, by the end, by the
  start or at random (they must lose; with every perk at once — a replay — only a warning); "exploits" — the same with all the dew of the level at once (an upper bound, a warning
  only); the smart bot with one skill off (ground, frost and rain, early calls, repairs, upgrades), with fewer or more
  perks, without one kind of plant, and on mazes of every length of the trail — straight (no maze), min (a fifth of
  the way to the longest maze found on the level), mid (half), above (three quarters), max — each length in every
  shape it can be built in (`sim/src/routes.rs`: upright walls bunched by the anthill, by the fruit, or spread wide,
  walls along the field behind a door, serpentines on other columns than the bot's; `node balance/routes.mjs` draws
  them, `run.mjs routes` plays this group alone). `rules.mjs` reads the results (the smart bot wins on every
  seed and draw, every boss dies, lazy gardens lose, no dew piles up once the garden is grown, skills and perks pay, a
  longer route pays (by the median over the shapes of a length), mazes of one length do about as well however they
  wind, the longest wins in every shape, no wave does most of the damage),
  `lint.mjs` looks at the waves alone for sudden walls of bugs (also in the tests). It prints the findings and writes
  `report.html` (level × scenario, coloured by how much fruit was left or how early it was lost) and `results.json`.
  `--grid` compares variants of the data side by side — the way to tune a level.
  A win or a loss says on which side of the edge a scenario stands, and on a level tuned to its edge that flips with
  every small thing. **The margin** says how far from the edge it is: how many times healthier every bug may be
  before the scenario stops winning (118%: it still wins against bugs 18% healthier; 87%: it loses, and would win
  against bugs 13% weaker). `balance/margin.mjs` finds it by halving, for the smart bot, the lazy gardens and the
  routes — always in the `routes` plan, in the others with `--margin` (some seven more parties for each scenario:
  three minutes for all the levels from scratch, and only the levels touched since are played again). With the
  margins there, the rules of the route are read off them, and the table of the margins — level × smart, the best
  lazy garden, the trail at every length — is printed and put in the report: the place to see whether a level is
  tight or loose, what a maze is worth on it, and how much the shape of the maze decides.
  `node balance/design.mjs --level 3 [--rounds 60]` is the designer: it looks for the strongest garden a level
  allows, the trail and the plants around it together. It takes the smart bot's own party as a plan (the plants to
  put and to grow, cell by cell, in order — the bot's option `plan`), tries changes on it (two plants trade cells,
  a plant becomes another kind or moves, steps come earlier or later, a pumpkin goes on the trail or out of a
  wall), plays each against bugs a little healthier than the garden holds now and keeps what lasts longer. It
  prints the margin of the bot and of the design side by side: what the bot leaves on the table is how far the
  matrix, played by the bot, is from a player who lays the garden out well.
  `node balance/strategy.mjs` is the strategist. The smart bot is a careful player of one simple plan: the
  longest of a few serpentines, and every step the one its own model of the damage likes best for the dew. It
  does not see that a trail winding round a pepper feeds it more, or that a mint pays where the damage is. A
  strategy (`sim/src/bot.rs`, the option `policy`) gives it eyes: for every kind of plant, weights on what is seen
  in a cell (the cells of the trail in reach, the times the trail comes by, the plants already reaching those
  cells, mint over them, shooters around, how far along the trail, fertile ground, a wall of the maze), a weight
  on growing every kind, and weights on what is seen in a maze that pick the bot's maze from every maze the
  generator builds (`routes::pool`: length, wall cells, the best cells for a pepper, turns). All zeros is the
  smart bot. The weights are found by the cross-entropy method on whole levels, all the levels at once (so the
  strategy plays every map, not one), against bugs a little healthier than it holds; written to
  `balance/strategy.json`, they are the **expert** of the matrix (`plans.mjs`: three seeds and three other draws
  of the waves, with margins). `node balance/explain.mjs` shows what the strategy is made of: its weights, and
  the margin on every level of the strategy, of the strategy with one thing it sees taken away, with the smart
  bot's maze, of the smart bot and of the designer's gardens.
  The players the levels are for are in `plans.mjs` (`PLAYERS`): the novice and the ordinary player, each on
  every maze of the length such a player builds; the rules ask the ordinary one to win with one or two stars,
  the expert with three, the novice to lose in the last third of the waves. They are a guess until parties of
  real players are looked at.
  `node balance/tune.mjs [--levels 1-9] [--dry] [--at 2=9.4/4.7]` tunes the waves: for every level it measures
  the margins of the novice, the ordinary player, the smart bot, the expert and the lazy gardens (on the game's own
  waves and three other draws of them, each margin the median over the draws: the seed of the game changes nothing
  for the bot, but a bug more or less in a group does) and, for each health of the bugs of `--hp` (a level's `hp`: how healthy its bugs are against their own health),
  scales the level's `budget` until the ordinary player
  holds 110% (it wins, and against bugs a tenth healthier it is on the edge); a budget where a lazy garden wins is
  never taken, and a novice out before the last third tilts the budget towards the later waves. The waves of the
  game are one draw, so the numbers it finds are checked on that draw too: the smart bot wins, every lazy garden
  loses, the ordinary player wins on most of its mazes (the tests hold the first two). A level where a lazy garden
  does as well as the ordinary player is said so: no budget makes the maze pay there, the map or the rules must.
  Of the healths tried it takes the one where the maze pays most (the ordinary player furthest above the best lazy
  garden) with the hard rules kept on the game's own waves. A moderate 1.4 (fewer bugs, healthier) made the maze pay
  more on four levels; twice as healthy never did (the bosses grow too).
- `sim/` — the simulation once more, in Rust, and the bot that plays it (dev only, not in the image; `cargo` builds
  it, no dependencies). The balance matrix and the balance tests run on it: a party takes a tenth of a second where
  the JS simulation with a JS bot took three.
  - `src/game.rs` is `public/game.js` rule for rule, and **a rule changed in one is changed in the other** — the
    only thing kept twice. The numbers of the game stay in `public/data.js` alone: `sim/js/export.mjs` hands them
    over as JSON with the overrides of a scenario applied and the waves put together, and a key the native side does
    not know is an error. The bot (`src/bot.rs`) lives here only. What the native side leaves out: what only the
    screen needs, saving, and the player's actions the bot never takes (weeding, healing a plant, planting over
    another).
  - The two copies must agree to the last bit, or a tuned level means nothing. `node sim/js/verify.mjs` (also
    `npm run parity`, and one of the tests) checks it in ten seconds: the native bot plays parts of five levels four
    different ways, players with no plan at all (random actions, often impossible ones) play every level, each
    party is written down with every action and the hash of the state after every step, and `public/game.js` replays
    it: every hash must be the same. `--coverage` lists the lines of `game.js` the parties never ran (today: only
    what the native side leaves out). When the copies part, it says where: the party, the step, and the numbers of
    the state that differ ("bug 539 caterpillar chewCd: 5 in game.js, 4 in game.rs"); `fruit-sim replay <party>
    --dump-at K` and `node sim/js/replay.mjs <party> --dump-at K` print the whole state after any action.
    `verify.mjs full` replays every scenario of the full matrix (minutes; the `Parity` workflow runs it once a
    night and by hand, never in the way of a push or a release): rare
    coincidences of numbers — a bug exactly on the edge of a plant's reach — take that many parties to come up.
  - For the two to agree, distances on the JS side are `Math.sqrt(dx*dx + dy*dy)`, never `Math.hypot` (rounded
    differently from engine to engine), and the bot has `exp` and `log` of its own (`src/jsmath.rs`), the same on
    every machine.
- [docs/research.md](docs/research.md) — the genre study the design started from (in Russian).

When anything in `public/` changes, bump `VERSION` in both `public/game.js` and `public/sw.js`.
Release: tag `vX.Y.Z` → GitHub Actions builds `ghcr.io/zxibizz/fruit-game:X.Y.Z`, Flux rolls out 0.x tags by itself.

See [CREDITS.md](CREDITS.md) for third-party assets.
