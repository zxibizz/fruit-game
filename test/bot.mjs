// A simple bot that fills the field with a serpentine maze, upgrades it and repairs what the bugs eat. Used by the
// tests as a balance check: every level must be winnable with the whole field planted, and must be lost with a
// garden that stops growing halfway. Run directly to see how it did: node test/bot.mjs [level ...]
import { createGame, computeDist, step, place, upgrade, upgradeCost, startWave, placeProblem, trail, regrow, regrowCost, heal, healCost, COLS, ROWS } from '../public/game.js';
import { LEVELS, BUGS } from '../public/data.js';
const inside = (i, j) => i >= 0 && j >= 0 && i < COLS && j < ROWS;
const show = process.env.MAP ? (await import(process.env.MAP)).show : null;

// The maze: full-height walls of plants two columns apart, each with one gap, the gaps at opposite ends in turn.
// Rocks differ from level to level, so the wall columns and the gap rows are searched for the longest trail.
function layout(level) {
  const length = (walls) => {
    const g = createGame(level);
    for (const [col, gap] of walls) for (let j = 0; j < ROWS; j++) if (j !== gap && !g.grid[j][col] && !(col === g.fruit[0] && j === g.fruit[1])) g.grid[j][col] = { type: 'pumpkin' };
    const tr = trail(g, computeDist(g)), last = tr[tr.length - 1];
    return last[0] === g.fruit[0] && last[1] === g.fruit[1] ? tr.length : -1;
  };
  let best = null, bestLen = -1;
  for (const cols of [[11, 9, 7, 5, 3], [10, 8, 6, 4, 2], [11, 9, 7, 5, 2], [12, 10, 8, 6, 4, 2], [11, 8, 6, 4, 2]]) {
    const walls = [], tune = (w) => {
      let at = w[1], len = -1;
      for (let j = 0; j < ROWS; j++) { w[1] = j; const l = length(walls); if (l > len) { len = l; at = j; } }
      w[1] = at;
    };
    for (const col of cols) { const w = [col, 0]; walls.push(w); tune(w); } // wall by wall, then two more rounds
    for (let pass = 0; pass < 2; pass++) walls.forEach(tune);
    const len = length(walls); if (len > bestLen) { bestLen = len; best = walls.map((w) => w.slice()); }
  }
  return best;
}

function plan(level) {
  const L = LEVELS[level], has = (p) => L.plants.includes(p), items = [], walls = layout(level);
  // first two shooters by the entrance
  items.push(['rose', walls[0][0], L.entry === 0 ? 1 : L.entry - 1], ['rose', walls[0][0], L.entry === ROWS - 1 ? ROWS - 2 : L.entry + 1]);
  // butterflies fly straight to the fruit: shooters that reach them stand around it
  const guard = () => { for (const [di, dj] of [[1, -1], [1, 1], [-1, 0], [2, 0]]) if (inside(L.fruit[0] + di, L.fruit[1] + dj)) items.push(['rose', L.fruit[0] + di, L.fruit[1] + dj]); };
  walls.forEach(([col, gap], k) => {
    if (k === 1 && L.waves.some((w) => w.some(([kind]) => BUGS[kind].fly))) guard();
    const cells = [];
    for (let j = 0; j < ROWS; j++) if (j !== gap) cells.push(j);
    const near = cells.slice().sort((a, b) => Math.abs(a - gap) - Math.abs(b - gap));
    const shooters = new Set([near[0], near[2], near[4]]);
    let s = 0;
    for (const j of near) {
      if (!shooters.has(j)) continue;
      const kind = has('mint') && s === 0 && k > 0 ? 'mint' : has('pepper') && s === 2 ? 'pepper' : s % 2 ? 'corn' : 'rose';
      items.push([kind, col, j]); s++;
    }
    for (const j of cells) if (!shooters.has(j)) items.push([j === near[3] ? 'aloe' : 'pumpkin', col, j]);
  });
  return items;
}

// Free cells off the trail and close enough to it for a shooter.
function spare(g) {
  const tr = trail(g), on = new Set(tr.map(([i, j]) => i + ',' + j)), out = [];
  for (let i = 0; i < COLS; i++) for (let j = 0; j < ROWS; j++) {
    if (g.grid[j][i] || on.has(i + ',' + j) || (i === g.entry[0] && j === g.entry[1])) continue;
    if (tr.some(([a, b]) => Math.hypot(a - i, b - j) <= 2.3)) out.push([i, j]);
  }
  return out;
}

export function playLevel(level, { seed = 7, verbose = false, maxPlants = Infinity, onEvents = null } = {}) {
  const g = createGame(level, seed), L = LEVELS[level], items = plan(level), dead = new Set();
  const room = () => g.plants.length + g.stubs.length < maxPlants;
  const tryBuild = () => {
    // repairs first: grow the eaten plants back, heal the badly bitten ones
    for (const s of g.stubs.slice()) if (g.dew >= regrowCost(s)) regrow(g, s);
    for (const p of g.plants) if (p.hp < p.maxHp * .5 && g.dew >= healCost(p)) heal(g, p);
    for (const [type, i, j] of items) {
      const k = `${i},${j}`; if (dead.has(k)) continue;
      const cell = g.grid[j][i];
      if (cell) { if (!cell.type) dead.add(k); continue; }
      if (g.stubs.some((s) => s.i === i && s.j === j)) continue;
      const pr = placeProblem(g, i, j);
      if (pr === 'blocks' || pr === 'busy') { if (g.phase === 'build') dead.add(k); continue; }
      if (pr) continue;
      if (!room() || !place(g, type, i, j)) return; // not enough dew: keep the order
    }
    // the maze stands: plant every free cell from which a shooter reaches the trail
    for (const [i, j] of spare(g)) {
      if (!room()) break;
      if (placeProblem(g, i, j) === 'blocks') continue;
      const kind = L.plants.includes('dandelion') && (i + j) % 3 === 0 ? 'dandelion' : (i + j) % 2 ? 'corn' : 'rose';
      if (!place(g, kind, i, j)) return; // no dew yet (or a bug on the cell): upgrades wait until the field is full
    }
    // the field is full: upgrades, the cheapest first
    const ups = g.plants.filter((p) => upgradeCost(p) != null).sort((a, b) => upgradeCost(a) - upgradeCost(b));
    for (const p of ups) if (g.dew >= upgradeCost(p) + 30) upgrade(g, p);
  };
  let t = 0, income = 0, eaten = 0; const log = [];
  while (g.phase !== 'won' && g.phase !== 'lost' && t < 4 * 3600) {
    // the bot only calls the first wave; the others come by themselves (no early-start dew)
    if (g.phase === 'build' && g.wave === 0) { tryBuild(); startWave(g); }
    for (let n = 0; n < 15; n++) step(g, 1 / 30);
    t += .5;
    if (onEvents) onEvents(g, g.events);
    for (const e of g.events) { if (e.t === 'kill') income += e.reward; if (e.t === 'waveDone') income += e.bonus; if (e.t === 'plantDead') eaten++; }
    if (g.events.some((e) => e.t === 'waveDone') && g.wave % 5 === 0) log.push(`${g.wave}:${g.hp}hp/${g.plants.length}p`);
    if (verbose && g.events.some((e) => e.t === 'waveDone')) console.log(`  after wave ${g.wave}: hp ${g.hp} dew ${g.dew} plants ${g.plants.length} eaten ${eaten} t ${Math.round(t)}s`);
    g.events.length = 0; tryBuild();
  }
  const free = spare(g).length;
  const res = { level, won: g.phase === 'won', hp: g.hp, wave: g.wave, plants: g.plants.length, free, eaten, income, log, time: Math.round(t) };
  if (show) show(g);
  if (verbose) console.log(`level ${level + 1} ${L.name}: ${res.won ? 'won' : 'LOST'} hp ${res.hp}/${g.maxHp} wave ${res.wave}/${g.waves} plants ${res.plants} free cells by the trail ${free} eaten ${eaten} income ${income} time ${res.time}s`);
  return res;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), cap = args.find((a) => a.startsWith('max='));
  const levels = args.filter((a) => /^\d+$/.test(a)).map((n) => Number(n) - 1);
  for (const n of levels.length ? levels : LEVELS.map((_, k) => k)) playLevel(n, { verbose: true, maxPlants: cap ? Number(cap.slice(4)) : Infinity });
}
