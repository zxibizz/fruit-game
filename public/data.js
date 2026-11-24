// Game data: plants (towers), bugs (enemies), permanent perks and levels. Distances are in grid cells, times in seconds.

export const COLS = 14;
export const ROWS = 8;
export const FRUIT_HP = 20;
// After the first wave the next one comes by itself after BREAK seconds; calling it early pays EARLY_DEW per second left.
export const BREAK = 20, EARLY_DEW = 1;

// The first level of a plant is cheap, so a trail is quick to shape; the upgrades are dear and there is never dew for
// all of them: which plants to grow, and which way, is the choice of the level.
// A plant has four levels: 1 and 2 are the plant itself, at 3 it takes one of its two branches (a or b, every plant
// on the field its own) and 4 is the top of that branch. Stats are pairs: [level 1, level 2] on the plant, [level 3,
// level 4] on a branch; a single number is the same on both. A branch lists everything it has: what it leaves out, it
// does not do. up: the dew for level 2 (the plant), for levels 3 and 4 (a branch); from: the first level of the
// campaign (1-based) where the branch can be taken (a branch comes where the bugs it answers first do).
// There is no plant that makes dew: dew comes from finished waves (most of it), beaten bugs and waves called early.
// Walkers are reached only on the cells next to a plant (range ~1.5), or a maze would not matter.
export const PLANTS = {
  // Defence. guard: the plants within GUARD_R of it take that share less damage; thorns: a walker on a free cell
  // within its range loses that share of its health a second (a boss THORN_BOSS of it). Guards and thorns of several
  // pumpkins do not add up: the strongest counts.
  // a, Shell: spikes — a bug biting a plant it guards (or itself) loses that share of its health a bite (a second of
  //   gnawing); ward (top) — once a wave the bite that would eat a plant it guards leaves it 1 health.
  // b, Thorny vines: thorns further and stronger; thornAir (top) — they reach the flyers over those cells too.
  pumpkin: { cost: 25, up: [60], hp: [150, 220], range: 1.5, guard: [.15, .2], thorns: [.003, .004],
    a: { from: 2, up: [100, 180], hp: [260, 340], range: 1.5, guard: [.45, .55], thorns: .004, spikes: [.05, .08], ward: [0, 1] },
    b: { from: 3, up: [150, 250], hp: [200, 250], range: 2.5, guard: .2, thorns: [.008, .01], thornAir: [0, 1] } },
  // One target, walkers and flyers.
  // a, Hunter: mark — a bug it has pricked takes that much more damage from everything for MARK_T seconds (it pricks
  //   the bugs not marked yet first; marks do not add up); multi: how many bugs it shoots at once; chain (top) — a
  //   marked bug dying passes its mark to that many bugs next to it.
  // b, Far shot (the dandelion that was): far at flyers and them first; walkers only on the cells next to it
  //   (groundRange) and for the `ground` share of the damage; down (top) — a flyer (not a boss) left with no more
  //   than that share of its health falls onto the trail and walks on; a boss hangs still for a moment.
  rose: { cost: 25, up: [60], hp: [60, 80], range: 1.5, rate: [1.3, 1.5], dmg: [8, 11], air: 1, shot: 'thorn', speed: 9,
    a: { from: 1, up: [120, 200], hp: [90, 100], range: [1.5, 1.6], rate: [1.6, 1.7], dmg: [11, 13], multi: 2, mark: .45, chain: [0, 2], air: 1, shot: 'thorn', speed: 9 },
    b: { from: 3, up: [120, 200], hp: [70, 80], range: [3.5, 3.8], rate: [.8, .9], dmg: [40, 55], ground: .35, groundRange: 1.5, down: [0, .5], air: 1, shot: 'fluff', speed: 11 } },
  // Fire (the pepper is the chili now). Lobs a pepper that bursts where it lands: it hits up to `hits` walkers within
  // `splash` of it and sets them burning (burn a second for burnT seconds). Fire is weak against armor: a burning bug's
  // armor comes off every second of the burn.
  // a, Heat: throws no more; burns every walker around it, however many, a little each (dense crowds of small bugs);
  //   spread (top) — a bug it set burning sets the next bug it touches burning too (one link).
  // b, Burn-through: throws at the armored and the thick first; melt — a bug it set burning has no armor while it
  //   burns, against every plant; crack (top) — every hit takes a point of armor off for good.
  pepper: { cost: 35, up: [90], hp: [60, 80], range: [1.6, 1.7], rate: [.6, .65], dmg: [8, 12], splash: .8, hits: [3, 4], burn: [3, 4.5], burnT: 2, shot: 'pepper', speed: 5,
    a: { from: 1, up: [180, 280], hp: [80, 100], range: 1.7, rate: [.5, .55], dmg: [12, 16], burn: [9, 13], burnT: [2.5, 3], blaze: 1, spread: [0, 1] },
    b: { from: 1, up: [180, 280], hp: [80, 100], range: 1.7, rate: [.65, .7], dmg: [24, 32], splash: [1, 1.1], hits: [5, 6], burn: [6, 9], burnT: [2.5, 3], melt: 1, crack: [0, 1], shot: 'pepper', speed: 5 } },
  // Ice: the only plant that slows. Throws an icicle at one bug, walkers and flyers: frost — the bug it hits is that
  // much slower for frostT seconds (slows do not add up; snails do not slow).
  // a, Cold: throws no more; every bug around it is `slow` slower, flyers too; rime (top) — every so many seconds the
  //   bugs around freeze for a second (snails too; a boss for half of it), and then cannot freeze again for a while.
  // b, Icicle: a heavy icicle from above on the thickest walker next to it, rare and hard (armor hardly matters to
  //   such a hit, bosses take it whole); stack (top) — every next hit on the same bug that much harder, up to twice.
  mint: { cost: 35, up: [80], hp: [60, 80], range: [1.5, 1.6], rate: [.9, 1], dmg: [9, 12], frost: [.3, .4], frostT: 1.5, air: 1, shot: 'icicle', speed: 8,
    a: { from: 1, up: [130, 220], hp: [80, 100], range: [2, 2.2], slow: .5, rime: [0, 5], air: 1 },
    b: { from: 2, up: [130, 220], hp: [80, 100], range: 1.6, rate: [.4, .45], dmg: [120, 160], frost: .15, frostT: .6, heavy: 1, stack: [0, .25], shot: 'icicleBig', speed: 7 } },
  // Finishing off. Every `eat` seconds swallows whole a walker (not a boss) with no more than `gulp` of its full health
  // left; a healthier bug it does not touch at all: its job is to make sure, not to deal damage.
  // a, Glutton: weaker bugs too and quicker; heads (top) — two at once.
  // b, Lure: nectar — a flyer within `lure` turns to it, sniffs it a moment and flies on to the fruit (every flyer
  //   once): into the reach of the plants around; it swallows worn flyers too (eatAir); lureBoss (top) — the hornet too
  //   (it is not swallowed).
  flytrap: { cost: 60, up: [140], hp: [70, 90], range: 1.5, eat: [3, 2.5], gulp: [.4, .5],
    a: { from: 2, up: [250, 350], hp: [100, 120], range: [1.5, 1.6], eat: [1.8, 1.6], gulp: .6, heads: [1, 2] },
    b: { from: 3, up: [150, 250], hp: [90, 110], range: 1.5, eat: [2.5, 2.2], gulp: .5, eatAir: 1, lure: [3, 5], lureBoss: [0, 1] } },
};
export const BRANCHES = ['a', 'b'];
// A stat of a plant of type P at level lvl on branch br (levels 3 and 4): null when it has no such stat.
export function statOf(P, name, lvl, br) {
  const T = lvl <= 2 ? P : P[br]; if (!T) return null;
  const v = T[name]; return Array.isArray(v) ? v[(lvl - 1) % 2] : v ?? null;
}
// What growing a plant from level lvl costs (to level 3: on branch br), null at the top.
export function upCost(P, lvl, br) { return lvl === 1 ? P.up[0] : lvl === 2 ? P[br]?.up[0] ?? null : lvl === 3 ? P[br].up[1] : null; }
export const MARK_T = 3, GUARD_R = 1.5, THORN_BOSS = .3, SNIFF = .3, FALL_T = .5;
// Thorns, spikes and nettles take a share of a bug's health a second, the same in the first wave and in the last. All
// of them together take no more than this share of the health of one bug: without it a long thorny trail with cold
// mints (twice the time on it) took all the health of any bug, and with flytraps for the worn a garden held bugs of
// any health at all — the balance studio found such gardens on most late waves, whatever the health of the bugs.
export const PRICK_CAP = .25;
export const PLANT_ORDER = ['pumpkin', 'rose', 'pepper', 'mint', 'flytrap'];
// No plant is healed or grown back in a wave: its health is all it has for the wave. An eaten plant leaves its roots,
// a hole the bugs walk through till the wave is over (nothing can be planted there meanwhile); after the wave every
// plant grows back as it was, at its level and in full health, for nothing. Only the rain grows the roots back at once.
// A plant sold later than the build phase it was planted in gives this share of the dew spent on it back.
export const REFUND = .5;
// Plants get no stronger from wave to wave, so the bite of the plant eaters grows much slower than the bugs' health.
export const CHEW_GROWTH = .04;
// Flyers cross the field in a straight line, past far fewer plants than a walker on a winding trail, so their health
// grows with the waves only by this share.
export const FLY_HP = .4;
// What the matrix may turn (balance/run.mjs --set TUNE.hpGrowth=1.2). hpGrowth: the health of every bug, bosses too,
// is its own health times 1 + hpGrowth * (wave - 1), on every level alike: with 3, a bug of wave 7 has 19 times the
// health in the table. bossEscort: the share of a wave's budget that comes along with a boss. gap: how tight the
// bugs of a group walk (a multiplier of the seconds between them): they come in packs, not in an even stream. Against
// a stream every plant always has a bug to shoot and a garden is worth the sum of its plants wherever they stand;
// a pack has to be worn down while it walks, and that takes a long trail with many cells beside it.
// Bosses shrug off the special tricks of the plants: thorns and freezes work on them by a part, flytraps do not eat them.
export const TUNE = { hpGrowth: 3, bossEscort: .4, gap: .4 };
// Frost and rain come back (up to POWER_MAX of each) after every POWER_EVERY-th wave.
export const POWER_EVERY = 10, POWER_MAX = 2;
// Most of the dew of a level is the pay for every wave got through: it grows evenly from pay[0] after the first wave
// to pay[1] after the last but one (the last wave ends the level). A bug gives its own small reward, the same on
// every level and in every wave: bugs grow in number wave by wave, and when they were the main income, dew was short
// while the maze was being built and piled up by the end, and what a bug gave had to be scaled level by level and
// faded wave by wave.
export const wavePay = (L, wave) => Math.round(L.pay[0] + (L.pay[1] - L.pay[0]) * Math.min(1, Math.max(0, wave - 1) / Math.max(1, L.count - 2)));

// Ground that changes the game. fertile: a plant on it is FERTILE times stronger (damage, health) and its
// aura FERTILE_ADD wider in effect; mud: walkers crawl at MUD of their speed; nettle: nothing can be planted, and a
// walker loses NETTLE of its health a second on it (a boss NETTLE_BOSS).
export const FERTILE = 1.3, FERTILE_ADD = .05, MUD = .55, NETTLE = .07, NETTLE_BOSS = .012;
// Weeds are obstacles that can be cleared for dew.
export const WEED_COST = 30;

// Permanent perks bought for the stars of the levels (they can be taken back for free). cost and v are per tier.
// A plant's perk changes some of its stats (on every level and branch): mul multiplies them, add adds to them.
export const PERKS = {
  dew: { cost: [1, 2, 3], v: [25, 50, 80] }, // more dew at the start
  heart: { cost: [1, 2, 3], v: [3, 6, 10] }, // a sturdier fruit
  clouds: { cost: [2, 3], v: [1, 2] }, // extra frost and rain at the start
  refund: { cost: [1, 2], v: [.7, .9] }, // selling gives more back
  pumpkin: { cost: [1, 2], v: [1.25, 1.5], stat: ['hp'], mul: true },
  rose: { cost: [1, 2], v: [1.1, 1.2], stat: ['dmg'], mul: true },
  pepper: { cost: [1, 2], v: [1.25, 1.5], stat: ['burn'], mul: true },
  mint: { cost: [1, 2], v: [.03, .06], stat: ['slow', 'frost'] },
  flytrap: { cost: [1, 2], v: [.88, .76], stat: ['eat'], mul: true },
};
export const PERK_ORDER = ['dew', 'heart', 'clouds', 'refund', ...PLANT_ORDER];

// w: the weight of a bug when a wave is put together. chew: bites the plants next to the trail in passing.
// dig: goes straight for the fruit and eats through the plants in its way (damage per second).
// mend: heals the bugs around by that share of their health a second.
// Bosses: charge [every, for, speed multiplier]; brood [bug, how many, every]; web [every, radius, how many plants,
// for how long]; split [bug, how many] on death.
export const BUGS = {
  ant: { hp: 12, speed: 1.0, bite: 1, reward: 2, w: 1 },
  aphid: { hp: 6, speed: 1.25, bite: 1, reward: 1, w: .5 },
  beetle: { hp: 44, armor: 2, speed: .7, bite: 2, reward: 5, w: 5 },
  caterpillar: { hp: 34, speed: .65, bite: 2, reward: 5, chew: 4, w: 4 }, // chew 8 while the eaten grew back in a wave
  grasshopper: { hp: 18, speed: 1.7, bite: 1, reward: 3, w: 1.6 },
  snail: { hp: 70, speed: .42, bite: 2, reward: 8, noSlow: true, w: 8 },
  pillbug: { hp: 32, armor: 5, speed: .6, bite: 2, reward: 7, w: 6 },
  butterfly: { hp: 14, speed: 1.05, bite: 1, reward: 3, fly: true, w: 2 },
  wasp: { hp: 26, speed: 1.35, bite: 1, reward: 4, fly: true, w: 3.2 },
  firefly: { hp: 30, speed: .8, bite: 1, reward: 6, mend: .06, w: 5.5 },
  cricket: { hp: 45, armor: 1, speed: .6, bite: 2, reward: 8, dig: 5, w: 8 },
  rhino: { hp: 50, armor: 3, speed: .4, bite: 5, reward: 40, boss: true, w: 60, charge: [9, 2.2, 2.6] },
  queen: { hp: 70, armor: 1, speed: .38, bite: 5, reward: 40, boss: true, w: 60, brood: ['ant', 2, 5] },
  slugking: { hp: 65, speed: .36, bite: 6, reward: 40, boss: true, noSlow: true, w: 60, split: ['snail', 2] },
  hornet: { hp: 55, speed: .5, bite: 6, reward: 45, boss: true, fly: true, w: 60, brood: ['wasp', 1, 7] },
  spider: { hp: 50, armor: 1, speed: .5, bite: 5, reward: 45, boss: true, w: 60, web: [7, 2.4, 3, 4] },
};
// Bugs a boss lets out pay this share of their usual dew.
export const BROOD_REWARD = .34;

// Levels are long, and the balance stands on these things:
// - plants that hit walkers reach only the cells next to them, so a trail left as it is has room for some 30 of them;
// - bugs come in tight packs, and a winding trail has twice as many cells beside it and keeps a pack under the
//   plants several times longer;
// - the first level of a plant is cheap and the upgrades are dear: the field fills fast, and the dew of a level
//   (pay sets most of it) grows most plants, never all of them at once;
// - a hole in a wall lets the whole wave through, and an eaten plant is a hole till the wave is over: walls are kept
//   whole by pumpkins (guard, ward) and by thick walls.
// The health of the bugs grows with every wave (TUNE.hpGrowth, the same on every level), so a garden beside the
// untouched trail starts to let bugs through by the middle of a level and is lost well before its end, while a
// thought-out maze with the perks of two stars a level gets through (sim/src/bot.rs). The dew at the start is enough to
// lay the first walls at once.
// A level's field is a picture of 8 rows of 14 cells: . free, A the fruit, E an anthill (last column only),
// R rock, S stump, L log, W water, X weeds (can be cleared), B bushes, f fertile soil (чернозём), m mud, n nettles,
// _ a stone path (bugs walk it, nothing is planted on it), + a bed (plants grow on it, bugs never walk it); a free cell
// (.) is grass: both.
// The waves are put together by makeWaves from a short recipe:
// count, budget [first wave, added per wave] in bug weights, roster [bug, first wave it comes in],
// boss [wave, boss, how many]. How hard a level is comes from its field, its waves and its pay, not from the
// health of the bugs: that follows one rule everywhere.
// pay: the dew for a wave got through [after the first wave, after the last but one], see wavePay.
// swell: how many times bigger each wave is than its budget says, wave by wave (none: 1). The draw of a wave decides
// how hard it is as much as its budget does (a pack of snails is not a pack of ants of the same weight), and left alone
// one or two waves of a level were all its difficulty; balance/shape.mjs finds the swell that brings every wave to its
// place under the boss waves: a breather, an ordinary wave, a big one (a boss wave is left as it is).
export const LEVELS = [
  // The first three levels teach the game: the bugs keep to a stone path and the plants grow on the beds beside it,
  // and a grass cell sends them the long way round (1), then a meadow in the middle is the first maze (2–3).
  // Plants and branches open here, each with the bugs it answers; from «Лужайка» on everything is open.
  // (Two levels of a stone path and beds alone, «Тропинка» and «Грядки», came before these till 0.29: with two or
  // three plants and no maze a garden of one plant got through them as well as any, and the owner took them out.)
  {
    name: 'Развилка', theme: 'orchard', feature: 'fork',
    map: [
      'S++++++++BSBBB',
      'B+......oBBBBR',
      'B+.oooo.oBWWBB',
      'B+.oWA..oRWWSB',
      'B+.oWWB.oBBBBB',
      'B+.oooo.oooooo',
      'B+...........E',
      'B+++++++++++++',
    ],
    dew: 280, pay: [210, 400],
    plants: ['pumpkin', 'rose', 'pepper', 'mint'],
    swell: [1, 1, .75, 1.85, .95, .7, 1, 1.4, .75, .6, 1.95, 1.2, .8, .6, 1],
    hp: .98, count: 15, budget: [4.3, 2.3], roster: [['ant', 1], ['beetle', 3], ['grasshopper', 5], ['aphid', 7], ['caterpillar', 9]], boss: [[15, 'rhino', 1]],
  },
  {
    name: 'Поляна', theme: 'meadow', feature: 'meadow',
    map: [
      'WW+++++++++BRB',
      'WW+.......+BBB',
      'BS+.o.o.o....E',
      'BB+.o.o.o.+BSB',
      'BBA.o.o.o.+BBB',
      'BB+.o.o.o.+WWB',
      'SB+.......+WWB',
      'BB+++++++++BRB',
    ],
    dew: 320, pay: [250, 500],
    plants: ['pumpkin', 'rose', 'pepper', 'mint', 'flytrap'],
    swell: [1, 1, 1.95, 1.6, 1.3, 1.7, 1.4, 1.75, 1.4, 2.5, .75, 1.8, 2.5, 2.5, 1.1, 2.5, 1.05, 1],
    hp: .99, count: 18, budget: [5.6, 3.2], roster: [['ant', 1], ['snail', 3], ['beetle', 4], ['caterpillar', 6], ['butterfly', 8], ['pillbug', 9], ['cricket', 12]], boss: [[18, 'slugking', 1]],
  },
  {
    name: 'Большая поляна', theme: 'sunset',
    map: [
      'BB++++++++++BB',
      'B++........+WB',
      'BA_........+WB',
      'B++........+BB',
      'BB+........__E',
      'SB+........+BB',
      'BB+........+BB',
      'BB++++++++++RB',
    ],
    dew: 340, pay: [290, 580],
    plants: ['pumpkin', 'rose', 'pepper', 'mint', 'flytrap'],
    swell: [1, 1, 1, 1.05, 1.05, .85, 1.25, 2.1, 2, 1.45, .65, 1.8, .65, 2.5, 1.4, 2.05, 2.2, 1],
    hp: 1.15, count: 18, budget: [5.2, 2.9], roster: [['ant', 1], ['butterfly', 2], ['beetle', 3], ['snail', 5], ['wasp', 6], ['caterpillar', 8], ['cricket', 12]], boss: [[18, 'hornet', 3]],
  },
  {
    name: 'Лужайка', theme: 'meadow',
    map: [
      '.....R........',
      '..R........S..',
      '........R.....',
      '.............E',
      '.A............',
      '..........R...',
      '....R.........',
      '..LL..........',
    ],
    dew: 370, pay: [380, 680],
    plants: ['pumpkin', 'rose', 'pepper', 'mint', 'flytrap'],
    swell: [1, 1, 1.1, 1.2, 1.15, 1.6, 1.35, 1.1, 1.65, 1, 2.3, 1.25, 1.45, 1.4, 1.95, 2.5, 2.5, 1.9, 1.8, 1],
    hp: 1.73, count: 20, budget: [5.6, 3.6], roster: [['ant', 1], ['beetle', 3], ['grasshopper', 6], ['caterpillar', 9], ['cricket', 13]], boss: [[10, 'rhino', 1], [20, 'rhino', 1]],
  },
  {
    name: 'Опушка', theme: 'forest', feature: 'fertile',
    map: [
      '....S.........',
      '..f...R.f.....',
      '......R......E',
      '...R......LL..',
      '........f.....',
      '.A..f....R..f.',
      '.........R.R..',
      '.....f..S.....',
    ],
    dew: 380, pay: [380, 660],
    plants: ['pumpkin', 'rose', 'pepper', 'mint', 'flytrap'],
    swell: [1, 1, 1.75, 1.15, 1, 1.15, 2.5, 2, 2.5, 1.95, 1, 2.5, 2.5, .6, 1.3, 1, 1.55, 1.45, 1.35, 1.45, .65, 1],
    hp: 1.01, count: 22, budget: [10.5, 5.3], roster: [['ant', 1], ['aphid', 2], ['grasshopper', 3], ['beetle', 4], ['butterfly', 5], ['snail', 6], ['caterpillar', 8], ['cricket', 11], ['wasp', 14]], boss: [[11, 'queen', 1], [22, 'queen', 2]],
  },
  {
    name: 'Старый сад', theme: 'orchard', feature: 'mud',
    map: [
      '......R..R..m.',
      '....LL..m...m.',
      '.A....R.m.....',
      '..m...R....LL.',
      '..m...........',
      '..............',
      '...S.m....S...',
      '.............E',
    ],
    dew: 400, pay: [390, 690],
    plants: ['pumpkin', 'rose', 'pepper', 'mint', 'flytrap'],
    swell: [1, 1, 1.45, 1.65, 1.8, 1.3, 1.7, 2.5, 1.3, 1.5, 2.05, 1, .75, 1.35, 1.4, .65, 1.25, 1.2, 1.85, 1.35, 1.25, 2.15, 1.2, 1],
    hp: 1.14, count: 24, budget: [5.9, 2.8], roster: [['ant', 1], ['snail', 2], ['aphid', 3], ['pillbug', 5], ['butterfly', 6], ['caterpillar', 7], ['cricket', 9], ['grasshopper', 12], ['beetle', 15], ['wasp', 17]], boss: [[12, 'slugking', 1], [24, 'slugking', 1]],
  },
  {
    name: 'Пруд', theme: 'marsh', feature: 'water',
    map: [
      '..........WW..',
      '....R.....WW..',
      '.............E',
      '.....WWW......',
      '.....WW....S..',
      '.A............',
      '..S......WW...',
      '.........W....',
    ],
    dew: 410, pay: [415, 930],
    plants: ['pumpkin', 'rose', 'pepper', 'mint', 'flytrap'],
    swell: [1, 1, 1.1, .6, 1, .6, .9, 1, .9, .95, .85, 1, 1.25, 1.4, 2.2, .95, .9, 1.5, 1.85, .85, 1, .75, .5, 1],
    hp: 2.01, count: 24, budget: [6.5, 3], roster: [['ant', 1], ['butterfly', 3], ['beetle', 4], ['caterpillar', 6], ['cricket', 10], ['snail', 13], ['aphid', 16]], boss: [[12, 'hornet', 1], [24, 'hornet', 2]],
  },
  {
    name: 'Крапивный лог', theme: 'forest', feature: 'nettle',
    map: [
      '...R......n...',
      '.......n......',
      '.A..n.....R...',
      '..........n...',
      '......R......E',
      '...n....n.....',
      '..LL.......S..',
      '......n.......',
    ],
    dew: 420, pay: [300, 475],
    plants: ['pumpkin', 'rose', 'pepper', 'mint', 'flytrap'],
    swell: [1, 1, 1.5, 1.9, 2.5, 1.6, 1, 2.25, 1.25, 1, 1.65, 1, 1.15, 1, .9, 1.3, 2.5, 1.3, .5, 1.4, .7, 2.5, 1.25, 1.2, 1],
    hp: .92, count: 25, budget: [8.9, 4.3], roster: [['ant', 1], ['pillbug', 2], ['firefly', 4], ['grasshopper', 6], ['caterpillar', 8], ['butterfly', 10], ['cricket', 12], ['snail', 15]], boss: [[12, 'spider', 1], [25, 'spider', 2]],
  },
  {
    name: 'Два муравейника', theme: 'sunset', feature: 'twin',
    map: [
      '......S......E',
      '...........R..',
      '...R.....f....',
      '.A......R.....',
      '....f.........',
      '.......LL.....',
      '...........R..',
      '...S.........E',
    ],
    dew: 440, pay: [470, 835],
    plants: ['pumpkin', 'rose', 'pepper', 'mint', 'flytrap'],
    swell: [1, 1, 1.25, 1.25, .8, .95, .75, .9, .5, .95, .7, .45, 1, .75, 1.7, 1.35, .55, 1, .65, .45, 2.2, 1.4, .85, 1.65, .75, 1],
    hp: 1.2, count: 26, budget: [10.7, 5.1], roster: [['ant', 1], ['aphid', 2], ['beetle', 3], ['wasp', 5], ['caterpillar', 7], ['firefly', 9], ['cricket', 11], ['pillbug', 14], ['snail', 17]], boss: [[13, 'queen', 1], [26, 'rhino', 2]],
  },
  {
    name: 'Заросли', theme: 'orchard', feature: 'weed',
    map: [
      '..X....X....X.',
      '....X.....X...',
      '.A.....f.....E',
      '...X..X...X...',
      '.........X....',
      '..X..f......X.',
      '.....X..X.....',
      '.X.........R..',
    ],
    dew: 440, pay: [330, 610],
    plants: ['pumpkin', 'rose', 'pepper', 'mint', 'flytrap'],
    swell: [1, 1, 1.15, 1.8, 2.25, 2.1, 1.35, 1.65, 1, .9, 1.15, 1.35, .8, 1.8, 1.15, 1, .45, 1, 1, .9, 1.05, .7, .55, .85, 1.5, 1.25, .35, 1],
    hp: 1.17, count: 28, budget: [5.1, 2.3], roster: [['ant', 1], ['grasshopper', 2], ['pillbug', 3], ['caterpillar', 5], ['butterfly', 7], ['cricket', 9], ['firefly', 11], ['snail', 13], ['wasp', 16], ['aphid', 19]], boss: [[9, 'rhino', 1], [18, 'slugking', 1], [28, 'spider', 2]],
  },
  {
    name: 'Болото', theme: 'marsh', feature: 'mud',
    map: [
      '...WW.....m...',
      '...W...n..m...',
      '........m.....',
      '.....m.....WW.',
      '.A...m.....W.E',
      '..n......n....',
      '......WW......',
      '..m...W.......',
    ],
    dew: 450, pay: [340, 730],
    plants: ['pumpkin', 'rose', 'pepper', 'mint', 'flytrap'],
    swell: [1, 1, 1.55, 1.85, 1.95, 1.35, 1.15, 1.45, 1, 1.85, 1, 2, .5, .85, 2.3, 2.1, .55, 1, .85, 1.1, .9, .95, 1, 1, .4, .85, 2.3, 1],
    hp: 1.08, count: 28, budget: [15.5, 6.7], roster: [['ant', 1], ['snail', 2], ['wasp', 3], ['aphid', 5], ['pillbug', 6], ['caterpillar', 8], ['firefly', 10], ['cricket', 12], ['beetle', 15], ['butterfly', 18]], boss: [[9, 'hornet', 1], [18, 'spider', 1], [28, 'slugking', 2]],
  },
  {
    name: 'Закат', theme: 'sunset', feature: 'twin',
    map: [
      '....X.....W..E',
      '.......f..W...',
      '..R......n....',
      '......m.......',
      '......m...f...',
      '...n.......X..',
      '.A...S........',
      '..f.....LL...E',
    ],
    dew: 460, pay: [290, 640],
    plants: ['pumpkin', 'rose', 'pepper', 'mint', 'flytrap'],
    swell: [1, 1, 1.6, 1.3, 1.15, 2.2, 1, 1.55, 2.5, 1, 2.5, .95, 2.5, 1.25, 2.15, 2.5, 2.5, 2.5, 2.15, 1, 1.5, .95, 1.5, 1.55, .8, 1.9, 1, 2.1, 2.5, 1],
    hp: .9, count: 30, budget: [5, 2.6], roster: [['ant', 1], ['beetle', 2], ['butterfly', 3], ['pillbug', 4], ['caterpillar', 6], ['cricket', 8], ['firefly', 10], ['snail', 12], ['wasp', 14], ['grasshopper', 17], ['aphid', 20]], boss: [[10, 'queen', 1], [20, 'hornet', 1], [30, 'rhino', 2]],
  },
];

const OBSTACLE = { R: 'rock', S: 'stump', L: 'log', W: 'water', X: 'weed', B: 'bush' }, TILE = { f: 'fertile', m: 'mud', n: 'nettle', _: 'stone', '+': 'bed', o: 'bed' };
function readMap(L) {
  L.obstacles = []; L.tiles = []; L.entries = []; L.fruit = null; L.holes = []; // holes: beds drawn as boxes standing on a lawn ('o'), the same bed in play
  L.map.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === 'o') L.holes.push([i, j]);
    if (OBSTACLE[ch]) L.obstacles.push([i, j, OBSTACLE[ch]]);
    else if (TILE[ch]) L.tiles.push([i, j, TILE[ch]]);
    else if (ch === 'A') L.fruit = [i, j];
    else if (ch === 'E') L.entries.push(j);
  }));
}

function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// A wave is a list of groups: [bug, count, seconds between bugs (TUNE.gap makes them packs), delay before the group].
// Every fifth wave is a big one and the wave after it is a breather; a bug new to the level first comes as a small group.
export const FLY_SHARE = .18; // the most of a wave's budget that flyers take (before a new bug's quarter)
export function makeWaves(L, seed, { flyShare = FLY_SHARE } = {}) {
  const R = rng(seed), out = [];
  for (let w = 1; w <= L.count; w++) {
    let budget = (L.budget[0] + L.budget[1] * (w - 1)) * (w % 5 === 0 ? 1.35 : w % 5 === 1 && w > 1 ? .8 : 1) * (L.swell?.[w - 1] ?? 1);
    const groups = [], fresh = L.roster.filter(([, from]) => from === w && w > 1).map(([k]) => k);
    const pool = L.roster.filter(([k, from]) => from <= w && !fresh.includes(k)).map(([k]) => k);
    for (const [at, kind, n] of L.boss) if (at === w) { groups.push([kind, n, 8, 0]); budget *= TUNE.bossEscort; }
    // a new bug takes a quarter of the wave, the bugs already known share the rest
    const picks = [], n = w < 3 ? 1 : w < 8 ? 2 : 3;
    while (picks.length < n && pool.length) picks.push(pool.splice(Math.floor(R() * pool.length), 1)[0]);
    // never flyers alone while the level has walkers to send: a walker takes the last pick's place
    if (picks.length && picks.every((k) => BUGS[k].fly)) { const w = pool.find((k) => !BUGS[k].fly); if (w) picks[picks.length - 1] = w; }
    const rest = 1 - .25 * fresh.length, shares = [[1], [.6, .4], [.45, .33, .22]][picks.length - 1].map((v) => v * rest);
    // flyers cross the maze in a straight line: they stay a side threat, never most of a wave (a wall of them out of
    // nowhere was a loss whatever the maze); what they would have taken goes to the walkers of the wave
    // (with no walker among the picks the wave is just smaller)
    const walker = picks.findIndex((k) => !BUGS[k].fly);
    picks.forEach((k, idx) => { if (BUGS[k].fly && shares[idx] > flyShare * rest) { if (walker >= 0) shares[walker] += shares[idx] - flyShare * rest; shares[idx] = flyShare * rest; } });
    picks.unshift(...fresh); shares.unshift(...fresh.map(() => .25));
    // diggers come last: first in a wave, they ate holes in the walls and the whole wave ran through them
    const order = picks.map((k, idx) => idx).sort((a, b) => (BUGS[picks[a]].dig ? 1 : 0) - (BUGS[picks[b]].dig ? 1 : 0));
    order.forEach((idx) => { const k = picks[idx];
      let count = Math.max(fresh.includes(k) ? 2 : 1, Math.round(budget * shares[idx] / BUGS[k].w));
      if (BUGS[k].dig) count = Math.min(count, 1 + Math.floor(w / 5));
      if (BUGS[k].mend) count = Math.min(count, 1 + Math.floor(w / 6));
      const gap = Math.max(.05, Math.round(Math.min(2.6, Math.max(.4, 14 / count)) * TUNE.gap * 20) / 20);
      groups.push([k, count, gap, groups.length ? 3 : 0]);
    });
    out.push(groups);
  }
  return out;
}
// hp: how healthy the bugs of a level are against their own health (BUGS), on top of their growth wave by wave;
// fewer and healthier bugs make a long maze pay more against a garden by the trail as it is
// seed: the draw of a level's waves, its own (the levels put in before «Лужайка» did not change the waves of those after)
const OPEN = LEVELS.findIndex((L) => L.name === 'Лужайка');
LEVELS.forEach((L, n) => { L.hp ??= 1; L.seed ??= n < OPEN ? 203 + n : 101 + n - OPEN; readMap(L); L.waves = makeWaves(L, L.seed); });
