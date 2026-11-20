// A simple bot that builds a serpentine maze and upgrades its shooters. Used by the tests as a balance check:
// every level must be winnable. Run directly to see how it did: node test/bot.mjs [level ...]
import { createGame, step, place, upgrade, upgradeCost, startWave, placeProblem, COLS, ROWS } from '../public/game.js';
import { LEVELS } from '../public/data.js';

function plan(level) {
  const L = LEVELS[level], has = (p) => L.plants.includes(p), items = [];
  const walls = [14, 11, 8, 5];
  // first a shooter by the entrance and the dew plants
  items.push(['rose', 15, L.entry === 0 ? 1 : L.entry - 1], ['rose', 15, L.entry === ROWS - 1 ? ROWS - 2 : L.entry + 1]);
  for (const [i, j] of [[0, 0], [0, ROWS - 1], [1, 0]]) items.push(['clover', i, j]);
  walls.forEach((col, k) => {
    const gap = k % 2 ? 0 : ROWS - 1, cells = [];
    for (let j = 0; j < ROWS; j++) if (j !== gap) cells.push(j);
    const near = cells.slice().sort((a, b) => Math.abs(a - gap) - Math.abs(b - gap));
    const shooters = new Set([near[0], near[2], near[4]]);
    let s = 0;
    for (const j of near) {
      if (!shooters.has(j)) continue;
      const kind = has('mint') && s === 0 && k > 0 ? 'mint' : has('pepper') && s === 2 ? 'pepper' : s % 2 ? 'corn' : 'rose';
      items.push([kind, col, j]); s++;
    }
    for (const j of cells) if (!shooters.has(j)) items.push(['pumpkin', col, j]);
  });
  if (has('dandelion')) for (const [i, j] of [[3, 0], [3, ROWS - 1], [2, 3]]) items.push(['dandelion', i, j]);
  return items;
}

export function playLevel(level, { seed = 7, verbose = false } = {}) {
  const g = createGame(level, seed), items = plan(level), dead = new Set();
  const tryBuild = () => {
    for (const [type, i, j] of items) {
      const k = `${i},${j}`; if (dead.has(k)) continue;
      const cell = g.grid[j][i];
      if (cell) { if (!cell.type) dead.add(k); continue; }
      const pr = placeProblem(g, i, j);
      if (pr === 'blocks' || pr === 'busy') { if (g.phase === 'build') dead.add(k); continue; }
      if (pr) continue;
      if (!place(g, type, i, j)) return; // not enough dew: keep the order
    }
    const shooters = g.plants.filter((p) => p.type !== 'pumpkin' && p.type !== 'clover').sort((a, b) => a.lvl - b.lvl);
    for (const p of shooters) { const c = upgradeCost(p); if (c != null && g.dew >= c + 20) upgrade(g, p); }
  };
  let t = 0;
  while (g.phase !== 'won' && g.phase !== 'lost' && t < 3600) {
    if (g.phase === 'build') { if (verbose && g.wave) console.log(`  after wave ${g.wave}: hp ${g.hp} dew ${g.dew} plants ${g.plants.length}`); tryBuild(); startWave(g); }
    for (let n = 0; n < 15; n++) step(g, 1 / 30);
    t += .5; tryBuild();
    g.events.length = 0;
  }
  const res = { level, won: g.phase === 'won', hp: g.hp, wave: g.wave, plants: g.plants.length, time: Math.round(t) };
  if (verbose) console.log(`level ${level + 1} ${LEVELS[level].name}: ${res.won ? 'won' : 'LOST'} hp ${res.hp}/${g.maxHp} wave ${res.wave}/${g.waves} plants ${res.plants} time ${res.time}s`);
  return res;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const levels = process.argv.slice(2).map((n) => Number(n) - 1);
  for (const n of levels.length ? levels : LEVELS.map((_, k) => k)) playLevel(n, { verbose: true });
}
