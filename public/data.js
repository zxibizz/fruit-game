// Game data: plants (towers), bugs (enemies) and levels. Distances are in grid cells, times in seconds.

export const COLS = 14;
export const ROWS = 8;
export const FRUIT_HP = 20;
// After the first wave the next one comes by itself after BREAK seconds; calling it early pays EARLY_DEW per second left.
export const BREAK = 20, EARLY_DEW = 1;

// Stats with three values are per plant level 1..3.
// There is no plant that makes dew: dew comes only from beaten bugs, finished waves and waves called early.
export const PLANTS = {
  pumpkin: { cost: 15, up: [20, 30], hp: [80, 140, 220] },
  rose: { cost: 40, up: [45, 70], hp: [30, 40, 50], range: [2.5, 2.7, 2.9], rate: [1.25, 1.45, 1.65], dmg: [7, 10, 14], air: true, shot: 'thorn', speed: 9 },
  corn: { cost: 60, up: [55, 80], hp: [30, 40, 50], range: [3, 3.2, 3.4], rate: [.6, .65, .7], dmg: [12, 18, 26], splash: .8, shot: 'kernel', speed: 5 },
  // heals the plants around and grows the eaten ones back (regrow: seconds for one)
  aloe: { cost: 45, up: [40, 60], hp: [40, 50, 60], range: [2.2, 2.6, 3], heal: [3, 5, 8], regrow: [10, 7, 4] },
  mint: { cost: 50, up: [40, 60], hp: [30, 40, 50], range: [1.7, 1.9, 2.1], slow: [.4, .5, .6], air: true },
  pepper: { cost: 85, up: [70, 100], hp: [30, 40, 50], range: [1.5, 1.6, 1.7], rate: [.4, .45, .5], dmg: [16, 24, 34], burn: [4, 6, 9] },
  dandelion: { cost: 90, up: [70, 100], hp: [25, 30, 35], range: [4.5, 5, 5.5], rate: [.45, .5, .55], dmg: [22, 32, 46], airMul: 2, air: true, shot: 'fluff', speed: 11 },
};
export const PLANT_ORDER = ['pumpkin', 'rose', 'corn', 'aloe', 'mint', 'pepper', 'dandelion'];
// An eaten plant leaves its roots: growing it back costs this share of the dew spent on it, healing costs the
// same share of the missing health.
export const REPAIR = 1 / 3;
// Plants get no stronger from wave to wave, so the bite of the plant eaters grows much slower than the bugs' health.
export const CHEW_GROWTH = .04;
// Frost and rain come back (up to POWER_MAX of each) after every POWER_EVERY-th wave.
export const POWER_EVERY = 10, POWER_MAX = 2;

// w: the weight of a bug when a wave is put together. chew: bites the plants next to the trail in passing.
// dig: goes straight for the fruit and eats through the plants in its way (damage per second).
export const BUGS = {
  ant: { hp: 12, speed: 1.0, bite: 1, reward: 3, w: 1 },
  beetle: { hp: 44, armor: 2, speed: .7, bite: 2, reward: 8, w: 5 },
  caterpillar: { hp: 34, speed: .65, bite: 2, reward: 7, chew: 12, w: 4 },
  grasshopper: { hp: 18, speed: 1.7, bite: 1, reward: 4, w: 1.6 },
  snail: { hp: 80, speed: .42, bite: 3, reward: 12, noSlow: true, w: 8 },
  butterfly: { hp: 14, speed: 1.05, bite: 1, reward: 5, fly: true, w: 2 },
  cricket: { hp: 55, armor: 1, speed: .6, bite: 3, reward: 12, dig: 14, w: 8 },
  rhino: { hp: 400, armor: 3, speed: .4, bite: 5, reward: 60, boss: true, w: 60 },
};

// Levels are long: the dew of one wave buys a few plants, so the garden fills the field over the whole level and the
// last waves need it full. The waves are put together by makeWaves from a short recipe:
// count, budget [first wave, added per wave] in bug weights, roster [bug, first wave it comes in], boss waves.
export const LEVELS = [
  {
    name: 'Лужайка',
    entry: 3, fruit: [1, 4], dew: 150, hpGrowth: .2, waveBonus: 20,
    plants: ['pumpkin', 'rose', 'corn', 'aloe'],
    obstacles: [[5, 0, 'rock'], [2, 1, 'rock'], [8, 2, 'rock'], [4, 6, 'rock'], [10, 5, 'rock'], [11, 1, 'stump'], [2, 7, 'log'], [3, 7, 'log']],
    count: 20, budget: [8, 5.2], roster: [['ant', 1], ['beetle', 3], ['grasshopper', 6], ['caterpillar', 9], ['cricket', 13]], boss: [],
  },
  {
    name: 'Опушка',
    entry: 2, fruit: [1, 5], dew: 160, hpGrowth: .15, waveBonus: 25,
    plants: ['pumpkin', 'rose', 'corn', 'aloe', 'mint'],
    obstacles: [[6, 1, 'rock'], [6, 2, 'rock'], [9, 5, 'rock'], [9, 6, 'rock'], [3, 3, 'rock'], [11, 6, 'rock'], [4, 0, 'stump'], [8, 7, 'stump'], [10, 3, 'log'], [11, 3, 'log']],
    count: 25, budget: [10, 5], roster: [['ant', 1], ['grasshopper', 2], ['caterpillar', 4], ['beetle', 6], ['cricket', 9], ['snail', 13]], boss: [25],
  },
  {
    name: 'Старый сад',
    entry: 5, fruit: [1, 2], dew: 200, hpGrowth: .13, waveBonus: 30,
    plants: ['pumpkin', 'rose', 'corn', 'aloe', 'mint', 'pepper', 'dandelion'],
    obstacles: [[6, 0, 'rock'], [6, 2, 'rock'], [6, 3, 'rock'], [10, 6, 'stump'], [3, 6, 'stump'], [4, 1, 'log'], [5, 1, 'log'], [11, 3, 'log'], [12, 3, 'log'], [9, 0, 'rock']],
    count: 30, budget: [12, 6], roster: [['ant', 1], ['snail', 2], ['butterfly', 3], ['beetle', 5], ['caterpillar', 6], ['cricket', 8], ['grasshopper', 11]], boss: [10, 20, 30],
  },
];

function rng(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// A wave is a list of groups: [bug, count, seconds between bugs, delay before the group].
// Every fifth wave is a big one and the wave after it is a breather; a bug new to the level first comes as a small group.
export function makeWaves(L, seed) {
  const R = rng(seed), out = [];
  for (let w = 1; w <= L.count; w++) {
    let budget = (L.budget[0] + L.budget[1] * (w - 1)) * (w % 5 === 0 ? 1.35 : w % 5 === 1 && w > 1 ? .8 : 1);
    const groups = [], fresh = L.roster.filter(([, from]) => from === w && w > 1).map(([k]) => k);
    const pool = L.roster.filter(([k, from]) => from <= w && !fresh.includes(k)).map(([k]) => k);
    if (L.boss.includes(w)) { groups.push(['rhino', w === L.count && L.boss.length > 1 ? 2 : 1, 8, 0]); budget *= .6; }
    // a new bug takes a quarter of the wave, the bugs already known share the rest
    const picks = [], n = w < 3 ? 1 : w < 8 ? 2 : 3;
    while (picks.length < n && pool.length) picks.push(pool.splice(Math.floor(R() * pool.length), 1)[0]);
    const rest = 1 - .25 * fresh.length, shares = [[1], [.6, .4], [.45, .33, .22]][picks.length - 1].map((v) => v * rest);
    picks.unshift(...fresh); shares.unshift(...fresh.map(() => .25));
    picks.forEach((k, idx) => {
      let count = Math.max(fresh.includes(k) ? 2 : 1, Math.round(budget * shares[idx] / BUGS[k].w));
      if (BUGS[k].dig) count = Math.min(count, 1 + Math.floor(w / 5));
      const gap = Math.round(Math.min(2.6, Math.max(.4, 14 / count)) * 20) / 20;
      groups.push([k, count, gap, groups.length ? 3 : 0]);
    });
    out.push(groups);
  }
  return out;
}
LEVELS.forEach((L, n) => { L.waves = makeWaves(L, 101 + n); });
