// The game data as the native simulation reads it: everything public/data.js holds, as it stands now (after the
// overrides of a scenario), with the waves already put together and the pay of every wave counted. The numbers live
// in data.js only; the native side has the rules alone.
import * as D from '../../public/data.js';
// A plant for the native side: every stat as six numbers, one for each tier a plant can stand at (levels 1 and 2,
// then levels 3 and 4 of branch a, of branch b), 0 where it has no such stat; up: the dew for level 2, for 3 and 4 of
// a, for 3 and 4 of b; from: the first level of the campaign of each branch. (PLANTS goes over as it is too: the JS
// replay of a party reads it.)
const TIERS = [[1, null], [2, null], [3, 'a'], [4, 'a'], [3, 'b'], [4, 'b']], NOT_STATS = new Set(['cost', 'up', 'from', 'shot', 'a', 'b']);
export function tiersOf(P) {
  const names = new Set([P, P.a, P.b].flatMap((T) => Object.keys(T)).filter((k) => !NOT_STATS.has(k))), st = {};
  for (const k of names) st[k] = TIERS.map(([lvl, br]) => { const v = D.statOf(P, k, lvl, br); return typeof v === 'number' ? v : 0; });
  return { cost: P.cost, up: [P.up[0], P.a.up[0], P.a.up[1], P.b.up[0], P.b.up[1]], from: [P.a.from, P.b.from], st };
}
export function exportData() {
  const C = {}; for (const k of ['COLS', 'ROWS', 'FRUIT_HP', 'BREAK', 'EARLY_DEW', 'REFUND', 'CHEW_GROWTH', 'POWER_EVERY', 'POWER_MAX', 'FERTILE', 'FERTILE_ADD', 'MUD', 'NETTLE', 'NETTLE_BOSS', 'WEED_COST', 'BROOD_REWARD', 'FLY_HP', 'MARK_T', 'GUARD_R', 'THORN_BOSS', 'SNIFF', 'FALL_T']) C[k] = D[k];
  C.hpGrowth = D.TUNE.hpGrowth;
  return { C, PLANTS: D.PLANTS, TIERS: Object.fromEntries(Object.entries(D.PLANTS).map(([k, P]) => [k, tiersOf(P)])), BUGS: D.BUGS, PERKS: D.PERKS,
    LEVELS: D.LEVELS.map((L) => ({ dew: L.dew, hp: L.hp, pay: L.pay, count: L.count, plants: L.plants, obstacles: L.obstacles, tiles: L.tiles, entries: L.entries, fruit: L.fruit, waves: L.waves,
      payAt: L.waves.map((_, k) => D.wavePay(L, k + 1)) })) };
}
