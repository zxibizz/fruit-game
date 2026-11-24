// The game data for the balance studio (balance/studio.mjs), counted in a process of its own so that every set of
// overrides starts from public/data.js as it is on disk: stdin { set: { key: value }, meta: 'exp3' }, stdout
// { data (for fruit-sim, sim/js/export.mjs), meta (the perks of every level, [[perk, tier]]), ui (what the page shows
// and edits) }. The keys of `set` are those of balance/run.mjs --set (balance/scenario.mjs applyOverrides), and
// L<n>.map: the field of a level as its 8 rows of 14 characters (public/data.js has the legend).
import { readFileSync } from 'node:fs';
import { LEVELS, PLANTS, BUGS, TUNE, PLANT_ORDER, FRUIT_HP, BREAK, EARLY_DEW, FLY_HP, CHEW_GROWTH, MARK_T, GUARD_R, THORN_BOSS, FERTILE, MUD, NETTLE } from '../public/data.js';
import { applyOverrides, metaOf } from './scenario.mjs';
import { exportData } from '../sim/js/export.mjs';

const { set = {}, meta = 'exp3' } = JSON.parse(readFileSync(0, 'utf8') || '{}');
const errors = [];
// one key at a time, so that a bad one is said and the others still count
for (const [k, v] of Object.entries(set)) {
  try {
    const m = k.match(/^L(\d+)\.map$/);
    if (m) {
      const L = LEVELS[Number(m[1]) - 1];
      if (!L || !Array.isArray(v) || v.length !== 8 || v.some((r) => typeof r !== 'string' || r.length !== 14)) throw new Error(`${k}: 8 rows of 14 characters`);
      if (!v.some((r) => r.includes('A')) || !v.some((r) => r[13] === 'E')) throw new Error(`${k}: a fruit (A) and an anthill (E, last column) are needed`);
      L.map = v; readMap(L); continue;
    }
    applyOverrides({ [k]: v });
  } catch (e) { errors.push(String(e.message || e)); }
}
// public/data.js readMap: the field as lists of obstacles, ground, anthills and the fruit
function readMap(L) {
  const OBSTACLE = { R: 'rock', S: 'stump', L: 'log', W: 'water', X: 'weed', B: 'bush' }, TILE = { f: 'fertile', m: 'mud', n: 'nettle', _: 'stone', '+': 'bed' };
  L.obstacles = []; L.tiles = []; L.entries = []; L.fruit = null;
  L.map.forEach((row, j) => [...row].forEach((ch, i) => {
    if (OBSTACLE[ch]) L.obstacles.push([i, j, OBSTACLE[ch]]);
    else if (TILE[ch]) L.tiles.push([i, j, TILE[ch]]);
    else if (ch === 'A') L.fruit = [i, j];
    else if (ch === 'E') L.entries.push(j);
  }));
}
let data;
try { data = exportData(); } catch (e) { errors.push(String(e.message || e)); }
const ui = {
  levels: LEVELS.map((L, n) => ({ n, name: L.name, map: L.map, plants: L.plants, count: L.count, dew: L.dew, pay: L.pay, hp: L.hp, budget: L.budget, roster: L.roster, boss: L.boss, swell: L.swell ?? null, waves: L.waves, feature: L.feature ?? null })),
  PLANTS, BUGS, TUNE, PLANT_ORDER, C: { FRUIT_HP, BREAK, EARLY_DEW, FLY_HP, CHEW_GROWTH, MARK_T, GUARD_R, THORN_BOSS, FERTILE, MUD, NETTLE },
};
process.stdout.write(JSON.stringify({ data, meta: LEVELS.map((_, n) => Object.entries(metaOf(meta, n))), ui, errors }));
