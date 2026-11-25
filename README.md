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
- **Plants**: five of them, four levels each. Levels 1 and 2 are the plant itself; at level 3 every plant on the field
  takes one of its two branches (two cards in its panel, one tap), and level 4 is the top of that branch. The pumpkin
  defends (a guard to the plants around, thorns on the free cells around; Shell / Thorny vines), the rose hits one bug
  (Hunter marks / Far shot at flyers), the chili throws fire (Heat burns all around / Burn-through takes armor off),
  mint is the only plant that slows (Cold slows all around / Icicle hits the thickest hard), the flytrap swallows the
  worn bugs (Glutton / Lure turns flyers to its nectar). A branch opens on the level where the bugs it answers first
  come. A branch and a top are seen at a glance (a look of their own, gold at the top); the panel shows every number
  now and after the upgrade. Hold a plant or a bug to read about it; the guide on the home screen has all of them.
- **Levels**: twelve. The first three teach (15–18 waves, one boss at the end). The first two are lawns set with
  wooden boxes, the plants grow in them and the bugs crawl the grass between: on «Развилка» a strip of grass is the
  short way to the fruit and one plant on it sends the bugs round the whole hook; on «Поляна» three rows of boxes with
  a way round each end, shut one end of a row and the other end of the next and the bugs zigzag along all of them;
  then a meadow in the middle is the first open maze. Plants and branches open there, each with the bugs it answers. Then nine open fields, 20–30 waves each, with their own ground: fertile beds (a stronger plant), mud (slow bugs), ponds,
  nettles (sting the bugs, nothing grows), weeds (cleared for dew), two anthills. A boss comes in the middle and at
  the end of every level: the rhino beetle runs, the queen lets ants out, the slug king splits into snails, the
  hornet flies over the maze, the spider webs the plants.
- **Balance** (0.31): a level is tuned by its perfect party, played with the perks of three stars on every level
  before it (what a player of perfect parties has). The best party known of every level (`balance/party.mjs`, on
  eight seeds of the game) gets through with the fruit never bitten against bugs 1.41–1.48 times healthier than they
  are (the target 1/0.7 = 1.43), so a garden of 67–70% of its strength is the least that keeps the fruit whole, and no
  plant alone keeps it whole on any level (the best, roses on «Развилка», holds 58% of the best). Every branch is
  needed on three levels at least and none on every level. The levels are hard: the learnt strategy with the perks of
  two stars wins «Развилка» alone. The health of a level's bugs (`hp`) sets
  that; the size of every wave (`swell`) is set so that no one or two waves are all the difficulty: a big wave, an
  ordinary one and a breather stand at 1.15, 1.3 and 1.6 times the margin of the hardest boss wave. Thorns, spikes and
  nettles together take no more than a quarter of a bug's health (`PRICK_CAP`): with no cap a thorny trail, cold mints
  and flytraps held bugs of any health. The numbers and how they were found: [docs/studio.md](docs/studio.md); what
  is wrong with the way they are found (the mazes come from a few templates, the clean edge jumps, nothing bounds a
  plain win): [docs/balance-issues.md](docs/balance-issues.md).
  A level is meant to be hard and to be won by thought. Plants that hit walkers reach only the cells
  next to them, and bugs come in tight packs: a long winding trail has twice the cells beside it and keeps a pack
  under the plants several times longer than a straight road. The health of every bug, bosses too, grows by one rule on
  every level (`TUNE.hpGrowth` of its own health a wave). Since 0.32 the first level of
  a shooter is dear and growing pays: a few grown plants hold a level about a tenth better than many cheap ones (the
  owner's call; `balance/tallwide.mjs` measures it), while a pumpkin stays cheap — the maze is built of pumpkins.
  There is never dew for all of it. Most of
  the dew is the pay for every wave got through, growing evenly over a level (`pay` of the level); a bug gives its own
  small reward, the same everywhere. Bosses are strong but a grown garden kills them. No
  plant makes dew (it comes from finished waves, beaten bugs and waves called early). Caterpillars bite plants, mole
  crickets eat through walls. **No plant is healed in a wave**: its health is all it has for the wave, an eaten plant
  leaves roots — a hole the bugs walk through, where nothing can be planted — till the wave is over; then the whole
  garden grows back for nothing, at its levels and in full health. The rain (rare: it comes back every tenth wave)
  grows the roots back at once and washes the webs off, and heals no bitten plant. A plant elsewhere that would shut
  the bugs in once the roots grow back cannot go in. Freezes do not chain; flyers cross the maze in a straight line.
- **Every plant has its place**, and every branch: who answers what is in `docs/redesign.md` (3.6) — crowds of small
  bugs: Heat; armor: Burn-through, Icicle; the thick and bosses: Icicle and a flytrap for the worn ones; flyers: roses
  and mint by the fruit, the Far shot, Cold, the Lure; fast bugs and snails: Cold (its top freezes snails too); the
  walls: pumpkins. `node balance/lab.mjs` measures each plant and branch apart from the levels (a fixed maze, a garden
  of one kind — 'rose.a', or 'rose.a3' for level 3 — for a sum of dew, a pack of one kind of bug), and the matrix fails
  when a plant is not planted by the bot or when no level goes worse without it.
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
- `node --test test/*.test.js` — pathing and placement rules, economy, eaten plants and roots, bosses, the ground, perks, saving, server, offline
  cache list, no sudden walls of flyers in the waves, the two copies of the simulation against each other (see `sim/`
  below), and the balance on one seed: the kept perfect party of every level gets through with the fruit whole against bugs 15% healthier and not against bugs 75% healthier, and one plant alone does not; the learnt strategy wins the first level and gets through a third of the waves of every level; the smart bot (`sim/src/bot.rs`: a maze through mud and nettles; it values a
  garden by the bugs it stops — walkers and flyers apart, a crowd sharing a single shooter while chili, heat and thorns hit
  many; frost and rain, the perks of two stars a level) must win every level; a garden beside the
  untouched trail must lose every level with the most perks there can be by then (three stars on every level before),
  planted any of four ways; half a garden or no powers must do worse. The suite takes half a minute and needs `cargo`
  (the bot is native); the full picture is the balance matrix below.
- Party analytics: `public/telemetry.js` records every party wave by wave — the garden when a wave is called
  (every plant, its level and cell, the roots of eaten ones), the trail through it, the dew and the fruit, the early
  call, what was built, grown, sold and grown back before and during the wave, frost and rain, the bugs killed and the
  bugs that bit the fruit by kind, the plants eaten, the time (game and real, paused, at what speed), and how the
  party ended (won, lost, left). Nothing personal: a random id of the device, the version. The records wait in
  localStorage until the server takes them (`POST /api/telemetry`), so offline parties are sent later; a dev page
  (`?dev`) or a copy run at home sends nothing (`?t=1` records anyway, to check the recording). The server appends
  them to `$TELEMETRY_DIR/<day>.jsonl` (off without it), with limits on size and rate since the page is public, and
  gives them back only with `Authorization: Bearer $TELEMETRY_TOKEN` (`GET /api/telemetry?from=&to=`).
  `node balance/players.mjs` fetches them (token in `$FRUIT_TELEMETRY_TOKEN` or
  `~/.config/homelab/fruit-game/telemetry-token`) and sums them up level by level and wave by wave
  (`--party ID` for one party, wave by wave). `node balance/owner.mjs [FILE]` replays the owner's parties as plans on
  the sim and gives their margins beside the kept perfect party (the parties worth keeping are in `balance/owner/`).
- Tall against wide (the measures of [docs/rebalance-tall.md](docs/rebalance-tall.md)): `node balance/tiers.mjs` —
  damage per dew of every tier of a shooter and what a tier needs under other prices (`--prices FILE`); with `--sim`,
  the same asked of the game in the plant lab (`balance/labcore.mjs`): a garden of every tier against one of the same
  plant at level 1, for the same dew, on a fixed maze whose walls the garden may take;
  `node balance/tallwide.mjs [--levels 1,4,8] [--secs 120] [--runs 2] [--out DIR] [--from DIR]` — the best party the
  search finds of every kind of garden: free, tall K (`balance/party.mjs --tall K`: K shooters at most, pumpkins free)
  and flat L (`--flat L`: no shooter grown past level L), the bot keeping to the bounds too;
  `node balance/tall.mjs` — the kept perfect party against gardens of its first N plants grown to the top;
  `node balance/cap.mjs` — the smart bot with a cap on its plants; `node balance/econ.mjs` — the dew and the garden
  of every level's perfect party.
- `balance/` — the balance matrix (dev only, not in the image): `node balance/run.mjs [quick|full|routes] [--margin] [--levels 5,6-8]
  [--set L5.dew=500,FLY_SHARE=.2] [--grid 'L5.budget=12/5.8|12/6.4;L5.pay=150/270|170/300']`. For every level it plays many
  scenarios in parallel (the native bot of `sim/` on a snapshot of the code, a batch per variant of the data; half the
  cores by default at the lowest priority — `--jobs N` for more; the full matrix, some 480 parties, takes under a
  minute; results cached
  per level, so tuning one level reruns only it): the smart bot on several seeds and on other draws of the waves; lazy
  gardens beside the untouched trail with real dew and the most perks of their time, planted best, by the end, by the
  start or at random (they must lose; with every perk at once — a replay — only a warning); "exploits" — the same with all the dew of the level at once (an upper bound, a warning
  only); the smart bot with one skill off (ground, frost and rain, early calls, upgrades), with fewer or more
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
- `node balance/studio.mjs [--port 8737] [--jobs N] [--nice]` — **the balance studio**, a page at http://localhost:8737
  that answers, as the numbers change, what the matrix answers in minutes: for every level and every wave, the
  gardens that hold that wave best for the dew a player has by then (the start, the pay of every wave before it and
  the reward of every bug in them, all of it standing: the meta of the wave, an upper bound, not a plan of a party).
  The native engine (`fruit-sim studio`, `sim/src/studio.rs`) searches on the real rules: a garden is a maze of the
  pool of `routes.rs` (or its first walls) and a plant of some tier on every wall and on any free cell off the trail;
  its worth is its **margin** on that wave played alone (how many times healthier every bug may be and nothing bites
  the fruit; `∞` — 30 and more — is a garden that kills by shares of health: thorns, spikes, nettles and a flytrap
  for the worn, no health of the bugs beats it). One best garden is kept for every composition (MAP-Elites: the
  families of plants — a plant, or a plant on a branch — that take 15% of its dew or more), and the best garden of
  one plant alone beside them, so the page shows the best *different* gardens of a wave and how far the best mix is
  above the best monoculture (no further is the red flag: the meta is one plant everywhere). Mutations change a
  plant or its tier, swap, move, add and take out plants, turn a whole family into another, change the maze; two
  gardens are crossed along a column or a row; the waves next to each other lend their gardens. A garden is tried
  against the elite of its niche first — a party at that margin, and only one that holds is measured on (by halving,
  to 2%) — so most of the work goes into the few that do better. The page: the overview of every level and wave
  (margin, the premium of the mix over one plant, the leading plant, the change against a pinned baseline), the
  level wave by wave (which plants and branches the best gardens are made of), the wave (its bugs, its top gardens on
  the field with their mazes, the best of one plant of each kind), and an editor of the overrides of `run.mjs --set`
  (plants tier by tier, bugs, a level's dew, pay, waves and its field, `TUNE`). An override or a change of
  `public/data.js` has every garden found played again on the new game first — the wave looked at in a few seconds,
  their old margins shown as stale till then — and the search goes on from them; a change of the rules in `sim/src`
  is rebuilt by cargo and the engine restarted with what was found. The wave looked at gets most of the work, its
  level next, the rest a little (`/api/caps`). What it found is kept in `balance/.studio/` between runs. Some 1000
  waves a second on four cores; a level of 20 waves gets good gardens in a minute or two and better ones the longer it
  runs. The search is a search: the best it shows is the best it has found, a lower bound of what the wave allows.
  A wave where something is drawn by the game (flyers, a boss's brood) is judged on three seeds: on one, the search
  fitted the gardens to its draw. `node balance/meta.mjs [--levels 6] [--secs 60] [--verify]` prints the same as a
  table per level with what stands out (a monoculture as good as the mix, `∞`, no garden that holds, a plant or branch
  no best garden uses). `node balance/campaign.mjs --level 6` (or «Проверить полной партией» on the page) is the slow
  check: the best gardens of the last and the hardest waves become plans the smart bot plays over the whole level
  (the economy, eaten plants, frost and rain), refined step by step, and the margin of the level is set beside the
  expert's — whether the meta of single waves carries over to a party, and how much easier a level is for a player
  who plays it that way. How far all this can be trusted: [docs/studio.md](docs/studio.md).
  `node balance/party.mjs --level 6 [--from a.json,b.json] [--mono] [--out FILE]` looks for the best perfect party of a
  level (on eight seeds, from the archives of earlier reports), measures every make it found against it, and searches
  the game with each branch closed and each plant gone to say what the level cannot do without; it says the `hp` at
  which the best holds the target. The levels are tuned with three more: `node balance/shape.mjs --levels 6` finds the `swell` of a level (the size of
  every wave that puts its margin in its place under the boss waves); `node balance/campaign.mjs --level 6 --clean`
  looks for the best perfect party (the fruit never bitten, the game's own waves; it starts from the studio's gardens
  and from the parties of the bots), measures a garden of one plant alone against it and says the `hp` of the level at
  which the best holds the target; `node balance/perfect.mjs` plays the parties kept in `balance/perfect/` on the game
  as it is — with no perks, two stars a level, three (what the levels are tuned for), every perk — beside the two
  bots, and says the `hp` again (after a change of a plant: the same parties, a minute for all the levels);
  `node balance/keep.mjs DIR` keeps the better of the party kept and a new campaign's.
- `sim/` — the simulation once more, in Rust, and the bot that plays it (dev only, not in the image; `cargo` builds
  it, no dependencies). The balance matrix and the balance tests run on it: a party takes a tenth of a second where
  the JS simulation with a JS bot took three.
  - `src/game.rs` is `public/game.js` rule for rule, and **a rule changed in one is changed in the other** — the
    only thing kept twice. The numbers of the game stay in `public/data.js` alone: `sim/js/export.mjs` hands them
    over as JSON with the overrides of a scenario applied and the waves put together, and a key the native side does
    not know is an error. The bot (`src/bot.rs`) lives here only. What the native side leaves out: what only the
    screen needs, saving, and the player's actions the bot never takes (weeding, planting over
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
