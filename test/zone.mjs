// A garden without a maze, for the balance tests: shooters packed along the straight trail from the anthill on, each upgraded to the
// top before the next is planted (or, with wide, all planted first). It must lose: node test/zone.mjs [maxPlants] [wide]
import { createGame, step, place, upgrade, upgradeCost, startWave, placeProblem, trail, regrow, regrowCost, COLS, ROWS } from '../public/game.js';
import { LEVELS } from '../public/data.js';
const cap = Number(process.argv[2] || 99), wide = process.argv[3] === 'wide';
export function run(level, cap, wide) {
  const g = createGame(level, 7), L = LEVELS[level];
  const tr = trail(g), on = new Set(tr.map(([i, j]) => i + ',' + j)), cells = [];
  for (let i = 0; i < COLS; i++) for (let j = 0; j < ROWS; j++) if (!g.grid[j][i] && !on.has(i + ',' + j)) {
    const d = Math.min(...tr.map(([a, b]) => Math.hypot(a - i, b - j))); if (d > 2.1) continue;
    cells.push([i, j, d, COLS - i]);
  }
  cells.sort((a, b) => (a[3] - b[3]) || (a[2] - b[2])); // from the anthill on, nearest to the trail first
  const build = () => {
    for (const s of g.stubs.slice()) if (g.dew >= regrowCost(s)) regrow(g, s);
    for (;;) {
      const p = g.plants.find((q) => upgradeCost(q) != null);
      if (p && !wide) { if (g.dew >= upgradeCost(p)) { upgrade(g, p); continue; } return; }
      if (g.plants.length + g.stubs.length < cap) {
        const c = cells.find(([i, j]) => !g.grid[j][i] && !g.stubs.some((s) => s.i === i && s.j === j) && !placeProblem(g, i, j));
        if (c) { const kind = c[2] < 1.5 ? 'rose' : 'corn'; if (place(g, kind, c[0], c[1])) continue; return; }
      }
      if (p) { if (g.dew >= upgradeCost(p)) { upgrade(g, p); continue; } }
      return;
    }
  };
  let t = 0; build(); startWave(g);
  while (g.phase !== 'won' && g.phase !== 'lost' && t < 3600) { for (let n = 0; n < 15; n++) step(g, 1 / 30); t += .5; g.events.length = 0; build(); }
  return { won: g.phase === 'won', hp: g.hp, wave: g.wave, plants: g.plants.length, text: `L${level + 1}: ${g.phase} hp ${g.hp} wave ${g.wave}/${g.waves} plants ${g.plants.length} (${g.plants.filter((p) => p.lvl === 3).length} at lvl 3) dew ${g.dew}` };
}
if (import.meta.url === `file://${process.argv[1]}`) for (let n = 0; n < LEVELS.length; n++) console.log(run(n, cap, wide).text);
