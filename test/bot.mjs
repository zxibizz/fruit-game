// A simple player for balancing: builds traps next to the route (never blocks it), upgrades, fires bonuses.
// Usage: node test/bot.mjs [level numbers...]   — prints one line per level.
// It is weaker than a person who builds mazes, so every level should be won by it with some fruit left.
import { LEVELS, TRAPS, COLS, ROWS, ENEMIES } from '../public/data.js';
import * as G from '../public/game.js';

export function play(L, { onStep } = {}) {
  const g = G.newGame(L);
  const level = LEVELS[L];
  const flyers = level.enemies.some((k) => ENEMIES[k].fly);
  let thinkAt = 0;
  think(g, level, flyers);
  G.start(g);
  let steps = 0;
  const bites = {};
  while (g.state === 'run' && steps < 60 * 60 * 40) {
    G.step(g);
    if (onStep) onStep(g);
    for (const ev of g.events) if (ev.t === 'bite') bites[ev.kind] = (bites[ev.kind] || 0) + ev.n;
    g.events.length = 0;
    steps++;
    if (g.time >= thinkAt) { think(g, level, flyers); thinkAt = g.time + 0.5; }
  }
  const r = G.result(g);
  return { L, state: g.state, hp: g.hp, time: Math.round(g.time), traps: g.traps.length, coins: g.coins, total: r.total, crystals: r.crystals, wave: g.wave + 1, waves: g.waves.length, bites, g };
}

function routeCells(g, level) {
  const cells = new Map();
  for (const dist of level.enemies.includes('blueant') ? [g.dist, g.distStone] : [g.dist]) for (const s of g.spawns) {
    let c = s, guard = 0;
    while (g.tiles[c] !== 'F' && guard++ < 400) {
      cells.set(c, (cells.get(c) || 0) + 1 + 2 / (1 + dist[c] / 4)); // the last stretch before the fruit counts more
      const x = c % COLS, y = (c / COLS) | 0;
      let best = -1, bd = dist[c];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const n = G.cellOf(x + dx, y + dy);
        if (n >= 0 && dist[n] < bd) { bd = dist[n]; best = n; }
      }
      if (best < 0) break;
      c = best;
    }
  }
  return cells;
}

// Route cells in range, each worth less the more traps already reach it (so traps spread along the route).
function coverage(g, c, r, route) {
  const x = (c % COLS) + 0.5, y = ((c / COLS) | 0) + 0.5;
  let n = 0;
  for (const [p, w] of route) {
    const px = (p % COLS) + 0.5, py = ((p / COLS) | 0) + 0.5;
    if ((px - x) ** 2 + (py - y) ** 2 > r * r) continue;
    let have = 0;
    for (const t of g.traps) if ((px - t.x) ** 2 + (py - t.y) ** 2 <= G.trapRange(t) ** 2) have++;
    n += w / (1 + have);
  }
  return n;
}

function airCover(g, c, r) {
  const x = (c % COLS) + 0.5, y = ((c / COLS) | 0) + 0.5;
  let n = 0;
  for (const s of g.spawns) {
    const sx = (s % COLS) + 0.5, sy = ((s / COLS) | 0) + 0.5;
    for (let i = 0; i <= 20; i++) {
      const px = sx + ((g.fruit.x - sx) * i) / 20, py = sy + ((g.fruit.y - sy) * i) / 20;
      if ((px - x) ** 2 + (py - y) ** 2 <= r * r) n += 1 + i / 20;
    }
  }
  return n;
}

function bestCell(g, kind, score) {
  let best = -1, bs = 0;
  for (let c = 0; c < COLS * ROWS; c++) {
    if (g.tiles[c] !== '.' || G.canBuild(g, kind, c)) continue;
    const s = score(c);
    if (s > bs) { bs = s; best = c; }
  }
  return best;
}

function think(g, level, flyers) {
  const route = routeCells(g, level);
  const count = (k) => g.traps.filter((t) => t.kind === k).length;
  // Maze: a trap on the road that sends the insects the long way round is worth more than anything.
  if (g.coins >= TRAPS.spiker.cost[0]) {
    const base = G.routeLength(g);
    let best = -1, gain = 3.5;
    for (const c of route.keys()) {
      if (g.tiles[c] !== '-' && g.tiles[c] !== ',') continue;
      if (G.canBuild(g, 'spiker', c)) continue;
      const d = G.routeLength(g, c) - base;
      if (d > gain && d < Infinity) { gain = d; best = c; }
    }
    if (best >= 0) G.build(g, 'spiker', best);
  }
  for (let guard = 0; guard < 20; guard++) {
    const has = (k) => level.traps.includes(k);
    let kind = 'spiker';
    const n = g.traps.length;
    if (flyers && has('thistle') && count('thistle') < 1 + Math.floor(n / 4)) kind = 'thistle';
    else if (has('slow') && count('slow') < Math.floor(n / 4)) kind = 'slow';
    else if (has('pepper') && count('pepper') < Math.floor(n / 5)) kind = 'pepper';
    else if (has('storm') && n >= 5 && count('storm') < Math.floor(n / 5)) kind = 'storm';
    const up = g.traps.filter((t) => t.lvl < 2).sort((a, b) => G.upgradeCost(a) - G.upgradeCost(b))[0];
    if (n >= 8 && up && g.coins >= G.upgradeCost(up) && g.time > 0 && n % 2 === 0) { G.upgrade(g, up.id); continue; }
    if (kind === 'storm' && g.coins < TRAPS.storm.cost[0] && n % 3) kind = 'spiker'; // save up now and then
    if (g.coins < TRAPS[kind].cost[0]) {
      if (n >= 6 && up && g.coins >= G.upgradeCost(up)) { G.upgrade(g, up.id); continue; }
      break;
    }
    const r = TRAPS[kind].range[0];
    const c = kind === 'thistle' ? bestCell(g, kind, (c) => airCover(g, c, r) + coverage(g, c, r, route) * 0.2)
      : bestCell(g, kind, (c) => coverage(g, c, r, route));
    if (c < 0) break;
    G.build(g, kind, c);
  }
  // Bonuses: fire when several insects are around, at the one closest to the fruit.
  if (g.state === 'run' && g.enemies.length >= 5) {
    const lead = [...g.enemies].sort((a, b) => G.remaining(g, a) - G.remaining(g, b))[0];
    for (const k of Object.keys(g.charge)) if (G.bonusReady(g, k)) G.useBonus(g, k, lead.x, lead.y);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const which = process.argv.slice(2).map(Number);
  const list = which.length ? which.map((n) => n - 1) : LEVELS.map((_, i) => i);
  for (const L of list) {
    const r = play(L);
    console.log(`L${L + 1} ${r.state.padEnd(4)} hp ${String(r.hp).padStart(2)}/20 wave ${r.wave}/${r.waves} ${r.time}s traps ${r.traps} coins ${r.coins} total ${r.total} crystals ${r.crystals} bites ${JSON.stringify(r.bites)}`);
  }
}
