// The game data as the native simulation reads it: everything public/data.js holds, as it stands now (after the
// overrides of a scenario), with the waves already put together and the pay of every wave counted. The numbers live
// in data.js only; the native side has the rules alone.
import * as D from '../../public/data.js';
export function exportData() {
  const C = {}; for (const k of ['COLS', 'ROWS', 'FRUIT_HP', 'BREAK', 'EARLY_DEW', 'REFUND', 'CHEW_GROWTH', 'POWER_EVERY', 'POWER_MAX', 'FERTILE', 'FERTILE_ADD', 'MUD', 'NETTLE', 'NETTLE_BOSS', 'WEED_COST', 'BROOD_REWARD', 'FLY_HP', 'MARK_T']) C[k] = D[k];
  C.hpGrowth = D.TUNE.hpGrowth; C.bossBite = D.TUNE.bossBite;
  return { C, PLANTS: D.PLANTS, BUGS: D.BUGS, PERKS: D.PERKS,
    LEVELS: D.LEVELS.map((L) => ({ dew: L.dew, hp: L.hp, pay: L.pay, count: L.count, plants: L.plants, obstacles: L.obstacles, tiles: L.tiles, entries: L.entries, fruit: L.fruit, waves: L.waves,
      payAt: L.waves.map((_, k) => D.wavePay(L, k + 1)) })) };
}
