// Game data: plants (towers), bugs (enemies), permanent perks and levels. Distances are in grid cells, times in seconds.

export const COLS = 14;
export const ROWS = 8;
export const FRUIT_HP = 20;
// After the first wave the next one comes by itself after BREAK seconds; calling it early pays EARLY_DEW per second left.
export const BREAK = 20, EARLY_DEW = 1;

// The first level of a plant is cheap, so a trail is quick to shape; the upgrades are dear and there is never dew for
// all of them: which plants to grow is the choice of the level.
// Stats with three values are per plant level 1..3. The third level also brings a trick of its own (the last line
// of every plant): thorns, multi, wide splash, guard, chill, long burn, stun, eating flyers, a wider aura.
// There is no plant that makes dew: dew comes from finished waves (most of it), beaten bugs and waves called early.
export const PLANTS = {
  // thorns: a bug that bites or gnaws it loses this share of its health (per bite / per second of gnawing)
  pumpkin: { cost: 10, up: [30, 60], hp: [120, 200, 300], thorns: [0, 0, .08] },
  // mark: a bug it has pricked takes that much more damage from everything for MARK_T seconds (it pricks the bugs
  // not marked yet first); multi: how many bugs it shoots at once
  rose: { cost: 25, up: [70, 140], hp: [60, 80, 100], range: [1.5, 1.5, 1.6], rate: [1.25, 1.45, 1.65], dmg: [7, 10, 10], mark: [.3, .45, .6], multi: [1, 1, 2], air: true, shot: 'thorn', speed: 9 },
  // hits: how many bugs the kernels of one cob can hit (the closest to where it lands): against a tight pack a
  // splash with no such limit was worth as much as the pack was big
  corn: { cost: 35, up: [90, 180], hp: [60, 80, 100], range: [1.8, 1.9, 1.95], rate: [.6, .65, .7], dmg: [12, 18, 26], splash: [.8, .8, 1.15], hits: [3, 4, 5], shot: 'kernel', speed: 5 },
  // heals the plants around and grows the eaten ones back (regrow: seconds for one); guard: plants around take that much less damage
  aloe: { cost: 30, up: [70, 130], hp: [70, 90, 110], range: [2.2, 2.6, 3.2], heal: [3, 5, 8], regrow: [6, 4, 2.5], guard: [0, 0, .3] },
  // chill: every so many seconds the bugs around freeze for a second
  mint: { cost: 30, up: [80, 150], hp: [60, 80, 100], range: [1.5, 1.6, 1.7], slow: [.3, .4, .5], chill: [0, 0, 6], air: true },
  // burns every bug around it, however many: little to each, so it is for dense crowds of small bugs
  pepper: { cost: 50, up: [120, 220], hp: [60, 80, 100], range: [1.5, 1.6, 1.7], rate: [.4, .45, .5], dmg: [6, 9, 13], burn: [4.5, 7, 10.5], burnT: [2, 2, 3] },
  // shoots far at flyers and takes them first; walkers, like every plant, only on the cells next to it (groundRange)
  // and for the `ground` share of the damage, never stunned; stun: the flyer it hits hangs still that long
  dandelion: { cost: 55, up: [130, 240], hp: [50, 65, 80], range: [3, 3.5, 4], rate: [.8, .9, 1], dmg: [32, 50, 75], stun: [0, 0, .5], ground: .12, groundRange: 1.5, air: true, shot: 'fluff', speed: 11 },
  // bites one bug every `eat` seconds for `chomp`, whatever its armor; a bug (not a boss) with less health than that,
  // or with no more than `gulp` of its full health left, is swallowed whole, and it looks for such a bug first: the
  // answer to the few thick bugs the others have worn down; eatAir: the third level catches flyers too
  flytrap: { cost: 60, up: [140, 250], hp: [70, 90, 110], range: [1.5, 1.5, 1.6], eat: [3.5, 3, 2.5], chomp: [90, 170, 280], gulp: [.35, .45, .55], eatAir: [0, 0, 1] },
  // the plants around shoot that much more often
  bell: { cost: 45, up: [110, 200], hp: [50, 65, 80], range: [1.5, 1.5, 2.9], buff: [.3, .45, .6] },
};
export const MARK_T = 3;
export const PLANT_ORDER = ['pumpkin', 'rose', 'corn', 'aloe', 'mint', 'pepper', 'dandelion', 'flytrap', 'bell'];
// An eaten plant leaves its roots: growing it back at once costs this share of the dew spent on it, healing costs
// the same share of the missing health.
export const REPAIR = 1 / 3;
// Left alone, the roots grow back by themselves in REGROW seconds; an aloe nearby adds its own speed to that.
export const REGROW = 15;
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
// bossBite: the share of its bite a flytrap gets into a boss (bosses shrug off the special tricks of the plants:
// thorns, stuns and frost work on them by a part too; a row of grown flytraps ate any boss in its first steps).
export const TUNE = { hpGrowth: 3, bossEscort: .4, gap: .4, bossBite: .4 };
// Frost and rain come back (up to POWER_MAX of each) after every POWER_EVERY-th wave.
export const POWER_EVERY = 10, POWER_MAX = 2;
// Most of the dew of a level is the pay for every wave got through: it grows evenly from pay[0] after the first wave
// to pay[1] after the last but one (the last wave ends the level). A bug gives its own small reward, the same on
// every level and in every wave: bugs grow in number wave by wave, and when they were the main income, dew was short
// while the maze was being built and piled up by the end, and what a bug gave had to be scaled level by level and
// faded wave by wave.
export const wavePay = (L, wave) => Math.round(L.pay[0] + (L.pay[1] - L.pay[0]) * Math.min(1, Math.max(0, wave - 1) / Math.max(1, L.count - 2)));

// Ground that changes the game. fertile: a plant on it is FERTILE times stronger (damage, healing, health) and its
// aura FERTILE_ADD wider in effect; mud: walkers crawl at MUD of their speed; nettle: nothing can be planted, and a
// walker loses NETTLE of its health a second on it (a boss NETTLE_BOSS).
export const FERTILE = 1.3, FERTILE_ADD = .05, MUD = .55, NETTLE = .07, NETTLE_BOSS = .012;
// Weeds are obstacles that can be cleared for dew.
export const WEED_COST = 30;

// Permanent perks bought for the stars of the levels (they can be taken back for free). cost and v are per tier.
// A plant's perk changes one of its stats: mul multiplies it, add adds to it.
export const PERKS = {
  dew: { cost: [1, 2, 3], v: [25, 50, 80] }, // more dew at the start
  heart: { cost: [1, 2, 3], v: [3, 6, 10] }, // a sturdier fruit
  roots: { cost: [1, 2], v: [.7, .45] }, // roots grow back faster (time multiplier)
  clouds: { cost: [2, 3], v: [1, 2] }, // extra frost and rain at the start
  refund: { cost: [1, 2], v: [.7, .9] }, // selling gives more back
  pumpkin: { cost: [1, 2], v: [1.25, 1.5], stat: 'hp', mul: true },
  rose: { cost: [1, 2], v: [1.1, 1.2], stat: 'dmg', mul: true },
  corn: { cost: [1, 2], v: [1.1, 1.2], stat: 'dmg', mul: true },
  aloe: { cost: [1, 2], v: [1.3, 1.6], stat: 'heal', mul: true },
  mint: { cost: [1, 2], v: [.03, .06], stat: 'slow' },
  pepper: { cost: [1, 2], v: [1.25, 1.5], stat: 'burn', mul: true },
  dandelion: { cost: [1, 2], v: [1.1, 1.2], stat: 'dmg', mul: true },
  flytrap: { cost: [1, 2], v: [.88, .76], stat: 'eat', mul: true },
  bell: { cost: [1, 2], v: [.05, .1], stat: 'buff' },
};
export const PERK_ORDER = ['dew', 'heart', 'roots', 'clouds', 'refund', ...PLANT_ORDER];

// w: the weight of a bug when a wave is put together. chew: bites the plants next to the trail in passing.
// dig: goes straight for the fruit and eats through the plants in its way (damage per second).
// mend: heals the bugs around by that share of their health a second.
// Bosses: charge [every, for, speed multiplier]; brood [bug, how many, every]; web [every, radius, how many plants,
// for how long]; split [bug, how many] on death.
export const BUGS = {
  ant: { hp: 12, speed: 1.0, bite: 1, reward: 2, w: 1 },
  aphid: { hp: 6, speed: 1.25, bite: 1, reward: 1, w: .5 },
  beetle: { hp: 44, armor: 2, speed: .7, bite: 2, reward: 5, w: 5 },
  caterpillar: { hp: 34, speed: .65, bite: 2, reward: 5, chew: 8, w: 4 },
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
// - a hole in a wall lets the whole wave through, so holes are to be closed: by dew at once, by an aloe, or by time.
// The health of the bugs grows with every wave (TUNE.hpGrowth, the same on every level), so a garden beside the
// untouched trail starts to let bugs through by the middle of a level and is lost well before its end, while a
// thought-out maze with the perks of two stars a level gets through (sim/src/bot.rs). The dew at the start is enough to
// lay the first walls at once.
// A level's field is a picture of 8 rows of 14 cells: . free, A the fruit, E an anthill (last column only),
// R rock, S stump, L log, W water, X weeds (can be cleared), f fertile soil, m mud, n nettles.
// The waves are put together by makeWaves from a short recipe:
// count, budget [first wave, added per wave] in bug weights, roster [bug, first wave it comes in],
// boss [wave, boss, how many]. How hard a level is comes from its field, its waves and its pay, not from the
// health of the bugs: that follows one rule everywhere.
// pay: the dew for a wave got through [after the first wave, after the last but one], see wavePay.
export const LEVELS = [
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
    plants: ['pumpkin', 'rose', 'corn', 'aloe'],
    hp: 1.4, count: 20, budget: [3.1, 2], roster: [['ant', 1], ['beetle', 3], ['grasshopper', 6], ['caterpillar', 9], ['cricket', 13]], boss: [[10, 'rhino', 1], [20, 'rhino', 1]],
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
    dew: 380, pay: [380, 700],
    plants: ['pumpkin', 'rose', 'corn', 'aloe', 'mint'],
    count: 22, budget: [8.7, 4.4], roster: [['ant', 1], ['aphid', 2], ['grasshopper', 3], ['beetle', 4], ['snail', 6], ['caterpillar', 8], ['cricket', 11]], boss: [[11, 'queen', 1], [22, 'queen', 2]],
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
    plants: ['pumpkin', 'rose', 'corn', 'aloe', 'mint', 'pepper'],
    count: 24, budget: [8.3, 3.9], roster: [['ant', 1], ['snail', 2], ['aphid', 3], ['pillbug', 5], ['caterpillar', 7], ['cricket', 9], ['grasshopper', 12], ['beetle', 15]], boss: [[12, 'slugking', 1], [24, 'slugking', 1]],
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
    plants: ['pumpkin', 'rose', 'corn', 'aloe', 'mint', 'pepper', 'dandelion'],
    hp: 1.4, count: 24, budget: [5.6, 2.6], roster: [['ant', 1], ['butterfly', 3], ['beetle', 4], ['caterpillar', 6], ['cricket', 10], ['snail', 13], ['aphid', 16]], boss: [[12, 'hornet', 1], [24, 'hornet', 2]],
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
    plants: ['pumpkin', 'rose', 'corn', 'aloe', 'mint', 'pepper', 'dandelion', 'flytrap'],
    count: 25, budget: [9.6, 4.6], roster: [['ant', 1], ['pillbug', 2], ['firefly', 4], ['grasshopper', 6], ['caterpillar', 8], ['butterfly', 10], ['cricket', 12], ['snail', 15]], boss: [[12, 'spider', 1], [25, 'spider', 2]],
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
    plants: ['pumpkin', 'rose', 'corn', 'aloe', 'mint', 'pepper', 'dandelion', 'flytrap', 'bell'],
    hp: 1.4, count: 26, budget: [9.6, 4.6], roster: [['ant', 1], ['aphid', 2], ['beetle', 3], ['wasp', 5], ['caterpillar', 7], ['firefly', 9], ['cricket', 11], ['pillbug', 14], ['snail', 17]], boss: [[13, 'queen', 1], [26, 'rhino', 2]],
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
    plants: ['pumpkin', 'rose', 'corn', 'aloe', 'mint', 'pepper', 'dandelion', 'flytrap', 'bell'],
    count: 28, budget: [8.3, 3.8], roster: [['ant', 1], ['grasshopper', 2], ['pillbug', 3], ['caterpillar', 5], ['butterfly', 7], ['cricket', 9], ['firefly', 11], ['snail', 13], ['wasp', 16], ['aphid', 19]], boss: [[9, 'rhino', 1], [18, 'slugking', 1], [28, 'spider', 2]],
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
    plants: ['pumpkin', 'rose', 'corn', 'aloe', 'mint', 'pepper', 'dandelion', 'flytrap', 'bell'],
    count: 28, budget: [16.6, 7.2], roster: [['ant', 1], ['snail', 2], ['wasp', 3], ['aphid', 5], ['pillbug', 6], ['caterpillar', 8], ['firefly', 10], ['cricket', 12], ['beetle', 15], ['butterfly', 18]], boss: [[9, 'hornet', 1], [18, 'spider', 1], [28, 'slugking', 2]],
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
    plants: ['pumpkin', 'rose', 'corn', 'aloe', 'mint', 'pepper', 'dandelion', 'flytrap', 'bell'],
    count: 30, budget: [7, 3.6], roster: [['ant', 1], ['beetle', 2], ['butterfly', 3], ['pillbug', 4], ['caterpillar', 6], ['cricket', 8], ['firefly', 10], ['snail', 12], ['wasp', 14], ['grasshopper', 17], ['aphid', 20]], boss: [[10, 'queen', 1], [20, 'hornet', 1], [30, 'rhino', 2]],
  },
];

const OBSTACLE = { R: 'rock', S: 'stump', L: 'log', W: 'water', X: 'weed' }, TILE = { f: 'fertile', m: 'mud', n: 'nettle' };
function readMap(L) {
  L.obstacles = []; L.tiles = []; L.entries = []; L.fruit = null;
  L.map.forEach((row, j) => [...row].forEach((ch, i) => {
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
    let budget = (L.budget[0] + L.budget[1] * (w - 1)) * (w % 5 === 0 ? 1.35 : w % 5 === 1 && w > 1 ? .8 : 1);
    const groups = [], fresh = L.roster.filter(([, from]) => from === w && w > 1).map(([k]) => k);
    const pool = L.roster.filter(([k, from]) => from <= w && !fresh.includes(k)).map(([k]) => k);
    for (const [at, kind, n] of L.boss) if (at === w) { groups.push([kind, n, 8, 0]); budget *= TUNE.bossEscort; }
    // a new bug takes a quarter of the wave, the bugs already known share the rest
    const picks = [], n = w < 3 ? 1 : w < 8 ? 2 : 3;
    while (picks.length < n && pool.length) picks.push(pool.splice(Math.floor(R() * pool.length), 1)[0]);
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
LEVELS.forEach((L, n) => { L.hp ??= 1; readMap(L); L.waves = makeWaves(L, 101 + n); });
