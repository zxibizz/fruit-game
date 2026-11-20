// Game data: plants (towers), bugs (enemies) and levels. Distances are in grid cells, times in seconds.

export const COLS = 14;
export const ROWS = 8;
export const FRUIT_HP = 20;

// Stats with three values are per plant level 1..3.
export const PLANTS = {
  pumpkin: { cost: 15, up: [20, 30], hp: [70, 120, 180] },
  rose: { cost: 40, up: [45, 70], hp: [30, 40, 50], range: [2.5, 2.7, 2.9], rate: [1.25, 1.45, 1.65], dmg: [7, 10, 14], air: true, shot: 'thorn', speed: 9 },
  clover: { cost: 30, up: [35, 50], hp: [25, 30, 35], period: [9, 8, 7], value: [10, 14, 18] },
  corn: { cost: 60, up: [55, 80], hp: [30, 40, 50], range: [3, 3.2, 3.4], rate: [.6, .65, .7], dmg: [12, 18, 26], splash: .8, shot: 'kernel', speed: 5 },
  mint: { cost: 50, up: [40, 60], hp: [30, 40, 50], range: [1.7, 1.9, 2.1], slow: [.4, .5, .6], air: true },
  pepper: { cost: 85, up: [70, 100], hp: [30, 40, 50], range: [1.5, 1.6, 1.7], rate: [.4, .45, .5], dmg: [16, 24, 34], burn: [4, 6, 9] },
  dandelion: { cost: 90, up: [70, 100], hp: [25, 30, 35], range: [4.5, 5, 5.5], rate: [.45, .5, .55], dmg: [22, 32, 46], airMul: 2, air: true, shot: 'fluff', speed: 11 },
};
export const PLANT_ORDER = ['pumpkin', 'rose', 'clover', 'corn', 'mint', 'pepper', 'dandelion'];

export const BUGS = {
  ant: { hp: 12, speed: 1.0, bite: 1, reward: 3 },
  beetle: { hp: 44, armor: 2, speed: .7, bite: 2, reward: 8 },
  caterpillar: { hp: 34, speed: .65, bite: 2, reward: 7, chew: 14 },
  grasshopper: { hp: 18, speed: 1.7, bite: 1, reward: 4 },
  snail: { hp: 80, speed: .42, bite: 3, reward: 12, noSlow: true },
  butterfly: { hp: 14, speed: 1.05, bite: 1, reward: 5, fly: true },
  rhino: { hp: 480, armor: 3, speed: .4, bite: 6, reward: 60, boss: true },
};

// A wave is a list of groups: [bug, count, seconds between bugs, delay before the group].
export const LEVELS = [
  {
    name: 'Лужайка',
    entry: 3, fruit: [1, 4], dew: 150, hpGrowth: .12, waveBonus: 20,
    plants: ['pumpkin', 'rose', 'clover', 'corn'],
    obstacles: [[5, 0, 'rock'], [2, 1, 'rock'], [8, 2, 'rock'], [4, 6, 'rock'], [10, 5, 'rock'], [11, 1, 'stump'], [2, 7, 'log'], [3, 7, 'log']],
    waves: [
      [['ant', 6, 1.4, 0]],
      [['ant', 10, 1.1, 0]],
      [['ant', 10, .9, 0], ['beetle', 2, 2.5, 3]],
      [['ant', 12, .8, 0], ['beetle', 4, 2, 4]],
      [['beetle', 4, 1.8, 0], ['ant', 16, .7, 2]],
      [['ant', 20, .6, 0], ['beetle', 7, 1.6, 3]],
    ],
  },
  {
    name: 'Опушка',
    entry: 2, fruit: [1, 5], dew: 160, hpGrowth: .11, waveBonus: 25,
    plants: ['pumpkin', 'rose', 'clover', 'corn', 'mint'],
    obstacles: [[6, 1, 'rock'], [6, 2, 'rock'], [9, 5, 'rock'], [9, 6, 'rock'], [3, 3, 'rock'], [11, 6, 'rock'], [4, 0, 'stump'], [8, 7, 'stump'], [10, 3, 'log'], [11, 3, 'log']],
    waves: [
      [['ant', 10, 1, 0]],
      [['ant', 8, .9, 0], ['grasshopper', 4, 1.2, 4]],
      [['caterpillar', 3, 2.2, 0], ['ant', 10, .8, 3]],
      [['beetle', 4, 2, 0], ['grasshopper', 6, 1, 3]],
      [['ant', 14, .7, 0], ['caterpillar', 4, 2, 4]],
      [['grasshopper', 10, .8, 0], ['beetle', 5, 1.8, 2]],
      [['caterpillar', 6, 1.6, 0], ['ant', 16, .6, 2]],
      [['beetle', 8, 1.4, 0], ['grasshopper', 10, .7, 2], ['caterpillar', 4, 1.8, 6]],
    ],
  },
  {
    name: 'Старый сад',
    entry: 5, fruit: [1, 2], dew: 200, hpGrowth: .1, waveBonus: 35,
    plants: ['pumpkin', 'rose', 'clover', 'corn', 'mint', 'pepper', 'dandelion'],
    obstacles: [[6, 0, 'rock'], [6, 2, 'rock'], [6, 3, 'rock'], [10, 6, 'stump'], [3, 6, 'stump'], [4, 1, 'log'], [5, 1, 'log'], [11, 3, 'log'], [12, 3, 'log'], [9, 0, 'rock']],
    waves: [
      [['ant', 12, .9, 0]],
      [['snail', 2, 3, 0], ['ant', 10, .8, 2]],
      [['butterfly', 6, 1.2, 0], ['ant', 10, .8, 2]],
      [['beetle', 5, 1.8, 0], ['caterpillar', 4, 2, 3]],
      [['grasshopper', 12, .7, 0], ['butterfly', 6, 1, 4]],
      [['snail', 3, 2.8, 0], ['beetle', 5, 1.8, 4]],
      [['ant', 20, .5, 0], ['caterpillar', 6, 1.6, 3]],
      [['butterfly', 10, .8, 0], ['grasshopper', 10, .7, 3]],
      [['beetle', 8, 1.3, 0], ['snail', 5, 2, 3], ['ant', 16, .5, 5]],
      [['rhino', 1, 1, 0], ['ant', 14, .7, 4], ['butterfly', 6, 1.1, 8]],
    ],
  },
];
