// The plant lab's garden and pack (balance/lab.mjs, balance/tiers.mjs --sim): a fixed maze of pumpkins (the walls only:
// no guard, no thorns), beside its trail a garden of plants bought for `dew` (on the free cells beside the trail from
// the fruit end), and one pack of one kind of bug with the health of wave `wave` and the weight `weight` (as in the wave
// budgets). A kind is a plant grown to level 2 ('rose'), a plant and its branch grown to level 4 ('rose.a') or to 3
// ('rose.a3'), or a plant left at level 1 ('rose:1'). walls: the garden may stand on the cells of the maze too, a plant
// put in a pumpkin's place (every plant is a wall: a wide garden of cheap plants is its own maze), the nearest the
// trail first; without it, only on the free cells beside the trail (balance/lab.mjs). best: the cells that see the most
// of the trail get the plants first (a few strong plants go where they reach most), else the cells along the trail.
import { LEVELS, BUGS, PLANTS, TUNE, upCost } from '../public/data.js';
import { createGame, step, place, plantOn, upgrade, upgradeCost, startWave, placeProblem, bugHp, trails, COLS, ROWS } from '../public/game.js';
import { layout } from '../sim/js/play.mjs';

export const typeOf = (k) => k.split(/[.:]/)[0];
export const brOf = (k) => (k.includes('.') ? k.split('.')[1][0] : null);
export const top = (k) => (k.endsWith(':1') ? 1 : Number(k.split('.')[1]?.[1]) || (brOf(k) ? 4 : 2)); // 'rose.a3': grown to 3
// all the dew for one plant of a kind
export const full = (k) => { const P = PLANTS[typeOf(k)]; let c = P.cost; for (let l = 1; l < top(k); l++) c += upCost(P, l, brOf(k)); return c; };
const within = (dx, dy, r) => dx * dx + dy * dy <= r * r + 1e-9;
// every cell some trail runs over, each once
const trailOf = (g) => { const seen = new Set(), out = []; for (const tr of trails(g)) for (const c of tr) { const k = c[0] + ',' + c[1]; if (!seen.has(k)) { seen.add(k); out.push(c); } } return out; };

export function makeLab({ level = 7, wave = 14, dew = 4000, weight = 100, walls: onWalls = false, best = false } = {}) {
  const walls = layout(level, true);
  // a garden: [[kind, share of the dew]], each kind planted in turn along the trail from the fruit end, then grown;
  // as many plants of a kind as its dew grows to the full (one at least), the kinds standing mixed along the trail
  function garden(mix) {
    const g = createGame(level, 7, {}); g.dew = 1e9;
    for (const [col, gap] of walls) for (let j = 0; j < ROWS; j++) if (j !== gap && !g.grid[j][col] && !placeProblem(g, col, j)) place(g, 'pumpkin', col, j);
    for (const p of g.plants) p.web = 1e9; // the walls are walls only: no guard, no thorns (pumpkins are measured as plants of the garden)
    g.thorn.fill(0); g.thornAir.fill(0); // (what they gave so far; the plants put later count without them)
    const tr = trailOf(g), on = new Set(tr.map(([i, j]) => i + ',' + j)), cells = [];
    for (let i = 0; i < COLS; i++) for (let j = 0; j < ROWS; j++) {
      const wall = onWalls && g.grid[j][i]?.type === 'pumpkin';
      if (on.has(i + ',' + j) || (!wall && placeProblem(g, i, j))) continue; // the free cells (and with walls, the maze's): the rest stay pumpkins
      let near = -1, sees = 0; tr.forEach(([a, b], k) => { if (within(a - i, b - j, 1.5)) { near = k; sees++; } }); if (near >= 0) cells.push([i, j, near, sees]);
    }
    // best: the cells that see the most of the trail first (where a player puts a few strong plants), else along the trail
    cells.sort((a, b) => (best ? b[3] - a[3] : 0) || b[2] - a[2]);
    const left = Object.fromEntries(mix.map(([k, s]) => [k, dew * s])), mine = Object.fromEntries(mix.map(([k]) => [k, []]));
    const want = mix.map(([k, s]) => [k, Math.max(1, Math.round(dew * s / full(k)))]);
    const total = want.reduce((t, [, n]) => t + n, 0), deal = [];
    for (const [k, n] of want) for (let q = 0; q < n; q++) deal.push([(q + .5) / n, k]);
    deal.sort((a, b) => a[0] - b[0]);
    cells.slice(0, total).forEach(([i, j], q) => {
      const k = deal[q][1], P = PLANTS[typeOf(k)]; if (left[k] < P.cost) return;
      if (plantOn(g, typeOf(k), i, j)) { left[k] -= P.cost; mine[k].push(g.plants[g.plants.length - 1]); }
    });
    g.level = LEVELS.length - 1; // every branch open
    for (const [k] of mix) for (let lvl = 1; lvl < top(k); lvl++) for (const p of mine[k]) { const c = upgradeCost(p, brOf(k)); if (p.lvl === lvl && c != null && left[k] >= c) { upgrade(g, p, brOf(k)); left[k] -= c; } }
    g.labSpent = mix.reduce((t, [k, s]) => t + dew * s - left[k], 0); g.labPlants = Object.values(mine).reduce((t, m) => t + m.length, 0);
    return g;
  }
  // the health a garden takes off a pack too big for it (weight, as in the wave budgets), in thousands, and its share
  function dealt(mix, kind, w = weight) {
    const g = garden(mix), B = BUGS[kind], count = Math.max(1, Math.round(w / B.w));
    g.wave = wave - 1; if (!startWave(g)) throw new Error(`level ${level + 1} has no wave ${wave}`);
    const gap = Math.max(.05, Math.round(Math.min(2.6, Math.max(.4, 14 / count)) * TUNE.gap * 20) / 20);
    g.queue = Array.from({ length: count }, (_, n) => ({ kind, at: n * gap, e: 0 })); g.hp = g.maxHp = 1e9;
    let left = 0; const all = count * bugHp(g, kind, wave);
    const seen = new Map(); // a bug that bites is gone with no health: what it had a step before is what got through
    for (let n = 0; n < 30 * 600 && (g.queue.length || g.bugs.length); n++) {
      for (const q of g.bugs) seen.set(q.id, q.hp);
      step(g, 1 / 30); for (const e of g.events) if (e.t === 'bite' && !e.b.brood) left += Math.max(0, seen.get(e.b.id) ?? bugHp(g, kind, wave)); g.events.length = 0;
    }
    for (const q of g.bugs) if (!q.brood) left += Math.max(0, q.hp);
    return { dealt: (all - left) / 1000, share: 1 - left / all, spent: g.labSpent, plants: g.labPlants };
  }
  return { garden, dealt, trailOf };
}
