// Game content: traps, insects, super-bonuses, the crystal shop and the levels.
// Maps are COLS x ROWS character grids:
//   .  firm ground — traps can stand here, insects cannot walk here
//   -  dug trench   — insects walk here; a trap may stand here as long as some route to the fruit stays open
//   ,  loose sand   — same as a trench, only looks like open ground (maze levels)
//   #  stones       — nobody walks or builds here, except big blue ants, which walk over stones
//   S  burrow       — insects come out here (always on the border)
//   F  the fruit    — a 2x2 block; walking insects that reach it take a bite
export const COLS = 18;
export const ROWS = 11;

// Every number a trap needs, per upgrade level (index 0..2). cost[0] builds it, cost[1..2] upgrade it.
// range is in cells, rate is actions per second.
export const TRAPS = {
  spiker: { cost: [15, 18, 32], range: [1.65, 1.85, 2.05], rate: [1.1, 1.25, 1.45], dmg: [4, 7, 12], hits: 'both', key: 'spiker' },
  slow: { cost: [10, 14, 26], range: [1.45, 1.65, 1.9], rate: [1, 1, 1], slow: [0.38, 0.48, 0.58], dmg: [0, 1, 2], hits: 'ground', key: 'slow' },
  storm: { cost: [50, 45, 75], range: [2.2, 2.5, 2.8], rate: [0.45, 0.5, 0.56], dmg: [13, 21, 33], chain: [3, 4, 5], hits: 'both', key: 'storm' },
  thistle: { cost: [15, 16, 30], range: [2.4, 2.7, 3.0], rate: [1.2, 1.35, 1.5], dmg: [8, 13, 21], hits: 'air', key: 'thistle' },
  pepper: { cost: [10, 14, 26], range: [1.15, 1.25, 1.38], rate: [1.25, 1.25, 1.25], dmg: [2, 4, 6], burn: [2, 3, 5], hits: 'ground', key: 'pepper' },
};
// The order of the buttons, as in the shop window of the trap panel.
export const TRAP_ORDER = ['slow', 'spiker', 'storm', 'thistle', 'pepper'];
export const SELL_BACK = 0.7;

// speed in cells per second, bite = fruit damage, reward = coins, score = points.
export const ENEMIES = {
  ant: { hp: 10, speed: 1.35, bite: 1, reward: 1, score: 10, size: 0.36 },
  redant: { hp: 7, speed: 2.15, bite: 1, reward: 1, score: 10, size: 0.32 },
  beetle: { hp: 28, speed: 0.85, bite: 2, reward: 3, score: 30, armor: 1, size: 0.5 },
  blueant: { hp: 22, speed: 0.95, bite: 2, reward: 3, score: 30, stones: true, size: 0.5 },
  caterpillar: { hp: 40, speed: 0.7, bite: 2, reward: 4, score: 40, regen: 1.5, size: 0.6 },
  centipede: { hp: 90, speed: 0.7, bite: 3, reward: 12, score: 150, size: 0.95, boss: true },
  mosquito: { hp: 8, speed: 1.9, bite: 1, reward: 1, score: 15, fly: true, size: 0.4 },
  wasp: { hp: 16, speed: 1.55, bite: 2, reward: 2, score: 25, fly: true, size: 0.48 },
  goldbug: { hp: 32, speed: 0.95, bite: 2, reward: 4, score: 50, fly: true, armor: 1, size: 0.55 },
};

// Super-bonuses: charge for `charge` seconds of battle, then fire once. `aim` ones need a spot on the field.
export const BONUSES = {
  spray: { charge: 38, aim: true, r: 1.6, dps: 11, t: 4 },
  cracker: { charge: 46, aim: true, r: 1.35, dmg: 85 },
  honey: { charge: 40, aim: true, r: 1.75, slow: 0.72, t: 8 },
  horn: { charge: 60, aim: false, t: 3.5 },
  bolt: { charge: 70, aim: false, n: 6, dmg: 130 },
};
export const BONUS_ORDER = ['spray', 'cracker', 'honey', 'horn', 'bolt'];

// Crystal shop (crystals are earned by finishing levels).
export const SHOP = {
  freeze: { price: 500, t: 30 },
  shield: { price: 150, t: 30 },
  armageddon: { price: 100 },
  exchange: { price: 50, coins: 30 },
};
export const SHOP_ORDER = ['freeze', 'shield', 'armageddon', 'exchange'];

export const FRUIT_HP = 20;
export const WAVE_GAP = 9; // seconds between the last spawn of a wave and the next wave

// ---- Locations and levels ----
export const LOCATIONS = [
  { key: 'garden', fruits: ['strawberry', 'pear', 'apple', 'orange'] },
  { key: 'orchard', fruits: ['plum', 'peach', 'lemon', 'cherry'] },
  { key: 'dunes', fruits: ['watermelon', 'apple', 'pear', 'strawberry'] },
];

const L1 = [
  { // 1 — one long trench
    map: [
      '..................',
      '..................',
      '...------.........',
      '...-....-.........',
      '...-....-..-----..',
      'S---....-..-...-..',
      '........-..-...-FF',
      '........-..-....FF',
      '........----......',
      '..................',
      '..................',
    ],
    waves: 5, coins: 60, traps: ['spiker'], enemies: ['ant'],
  },
  { // 2 — the snake
    map: [
      '..................',
      '.----...----......',
      '.-..-...-..-......',
      '.-..-...-..-......',
      'S-..-...-..-....FF',
      '....-...-..-....FF',
      '....-...-..-....-.',
      '....-...-..-....-.',
      '....-----..------.',
      '..................',
      '..................',
    ],
    waves: 7, coins: 60, newTrap: 'slow', newEnemy: 'redant',
  },
  { // 3 — a straight road with two detours; block the road and the ants take the long way
    map: [
      '..................',
      '....--------......',
      '....-......-......',
      '....-......-......',
      '....-......-......',
      'S---------------FF',
      '....-......-....FF',
      '....-......-......',
      '....--------......',
      '..................',
      '..................',
    ],
    waves: 8, coins: 70, newBonus: 'spray', newEnemy: 'beetle',
  },
  { // 4 — the spiral
    map: [
      '..................',
      '.---------------..',
      '.-.............-..',
      '.-.-----------.-..',
      '.-.-.........-.-..',
      'S-.-.---FF...-.-..',
      '...-.-..FF...-.-..',
      '...-.---------.-..',
      '...-...........-..',
      '...-------------..',
      '..................',
    ],
    waves: 9, coins: 80, newTrap: 'thistle', newEnemy: 'mosquito',
  },
  { // 5 — a stone wall: ordinary ants go round, big blue ones walk straight over it
    map: [
      '..................',
      '......------......',
      '......-....-......',
      '......-....-......',
      '......-....-...##.',
      'S------####-----FF',
      '......-....-....FF',
      '......-....-...##.',
      '......-....-......',
      '......------......',
      '..................',
    ],
    waves: 10, coins: 100, newBonus: 'cracker', newEnemy: 'blueant',
  },
  { // 6 — two burrows, one road
    map: [
      'S-----............',
      '.....-............',
      '.....-............',
      '.....-...------...',
      '.....-...-....-...',
      '.....-----####--FF',
      '.....-..........FF',
      '.....-............',
      '.....-............',
      '.....-............',
      'S-----............',
    ],
    waves: 11, coins: 100, newTrap: 'pepper', newEnemy: 'wasp',
  },
  { // 7 — a fork before the fruit
    map: [
      '..................',
      '.--------.........',
      '.-......-.........',
      '.-......-..------.',
      '.-......-..-....-.',
      'S-......----....-.',
      '........-.......-.',
      '........-......FF.',
      '........-......FF.',
      '........--------..',
      '..................',
    ],
    waves: 12, coins: 110, newBonus: 'horn', newEnemy: 'caterpillar',
  },
  { // 8 — the fruit inside two rings
    map: [
      '..................',
      '.----------------.',
      '.-..............-.',
      '.-..----------..-.',
      '.-..-........-..-.',
      'S-..-...FF...-..-.',
      '....-...FF...-..-.',
      '....-...--...-..-.',
      '....----------..-.',
      '.............----.',
      '..................',
    ],
    waves: 13, coins: 130, newTrap: 'storm',
  },
  { // 9 — two burrows, a double lane
    map: [
      'S------.....#####.',
      '......-...........',
      '......-----.......',
      '..........-.......',
      '..........-.......',
      '..........-----FF.',
      '..........-----FF.',
      '..........-.......',
      '......-----.......',
      '......-...........',
      'S------.....#####.',
    ],
    waves: 14, coins: 140, newBonus: 'honey', newEnemy: 'centipede',
  },
  { // 10 — three burrows around a stone field
    map: [
      '.........S........',
      '.........-........',
      '.........-........',
      '...------------...',
      '...-..........-...',
      'S---##########-FF.',
      '...-..........-FF.',
      '...-..........-...',
      '...------------...',
      '.........-........',
      '.........S........',
    ],
    waves: 15, coins: 170, newBonus: 'bolt', newEnemy: 'goldbug',
  },
  { // 11 — two burrows on top, a stone gate
    map: [
      '..S.........S.....',
      '..-.........-.....',
      '..-...-------.....',
      '..-...-...........',
      '..-...-...........',
      '..-----###-----FF.',
      '......-...-....FF.',
      '......-...-.......',
      '......-----.......',
      '..................',
      '..................',
    ],
    waves: 16, coins: 160,
  },
  { // 12 — the ladder: many roads, three burrows
    map: [
      '........S.........',
      '.---------------..',
      '.-......-......-..',
      '.-......-......-..',
      '.-......-......-..',
      'S---------------FF',
      '.-......-......-FF',
      '.-......-......-..',
      '.-......-......-..',
      '.---------------..',
      '........S.........',
    ],
    waves: 18, coins: 170,
  },
];

// Unlock order inside location 1; locations 2 and 3 start with everything.
function buildLevels() {
  const out = [];
  const traps = [];
  const enemies = [];
  const bonuses = [];
  L1.forEach((l, i) => {
    for (const t of l.traps || []) traps.push(t);
    for (const e of l.enemies || []) enemies.push(e);
    if (l.newTrap) traps.push(l.newTrap);
    if (l.newEnemy) enemies.push(l.newEnemy);
    if (l.newBonus) bonuses.push(l.newBonus);
    out.push({ ...l, loc: 0, n: i, fruit: LOCATIONS[0].fruits[i % 4], traps: [...traps], enemies: [...enemies], bonuses: [...bonuses] });
  });
  return out;
}
export const LEVELS = buildLevels();

// ---- Waves ----
// A wave is a list of groups { kind, count, every (seconds between insects), at (seconds after the wave starts), spawn }.
// Waves are generated from the level number so that every level gets harder in the same, tested way (test/bot.mjs).
const COST = { ant: 1, redant: 1, beetle: 3.6, blueant: 3, caterpillar: 4.2, centipede: 14, mosquito: 0.9, wasp: 2, goldbug: 4.6 };
const EVERY = { ant: 0.7, redant: 0.5, beetle: 1.5, blueant: 1.3, caterpillar: 1.8, centipede: 4, mosquito: 0.6, wasp: 1.0, goldbug: 1.8 };

export function levelStrength(L) { return 1 + 0.025 * L; }

export function makeWaves(level, L) {
  const n = level.waves;
  const pool = level.enemies;
  const spawns = level.map.reduce((a, row) => a + [...row].filter((ch) => ch === 'S').length, 0);
  const waves = [];
  let seed = 1000 + L * 77;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const fresh = level.newEnemy;
  for (let w = 0; w < n; w++) {
    const budget = (5 + w * 0.9 + L * 0.2) * (1 + 0.025 * w);
    const last = w === n - 1;
    const groups = [];
    let kinds;
    if (fresh && w === 1) kinds = [fresh];
    else if (last && pool.includes('centipede')) kinds = ['centipede', pick(pool.filter((k) => k !== 'centipede'))];
    else if (w === 0) kinds = [pool[0]];
    else kinds = [pick(pool), pick(pool)];
    if (fresh && w > 1 && rnd() < 0.5) kinds.push(fresh);
    kinds = [...new Set(kinds)];
    let at = 0;
    kinds.forEach((kind, gi) => {
      const share = budget / kinds.length;
      const count = Math.max(1, Math.round(share / COST[kind]));
      const spawn = Math.floor(rnd() * spawns);
      groups.push({ kind, count, every: EVERY[kind], at, spawn });
      at += kinds.length > 1 && gi === 0 ? Math.min(4, count * EVERY[kind] * 0.5) : 0;
    });
    waves.push(groups);
  }
  return waves;
  function pick(arr) { return arr[Math.floor(rnd() * arr.length)]; }
}
