// A bot that plays the level the way it is meant to be played: a serpentine maze over the whole field, shooters in
// its walls, holes closed at once. Used by the tests as a balance check: it must win every level, and must lose
// when its garden stops at half of the field or when it plants along the straight trail without a maze
// (maze: false). Run directly to see how it did: node test/bot.mjs [level ...] [max=N]
import { createGame, computeDist, step, place, upgrade, upgradeCost, startWave, placeProblem, trails, regrow, regrowCost, heal, healCost, removePlant, refund, stubAt, COLS, ROWS } from '../public/game.js';
import { LEVELS, BUGS, PLANTS } from '../public/data.js';
const inside = (i, j) => i >= 0 && j >= 0 && i < COLS && j < ROWS;
// every cell some trail runs over (a level may have two anthills), each once
const trail = (g, dist) => { const seen = new Set(), out = []; for (const tr of trails(g, dist)) for (const c of tr) { const k = c[0] + ',' + c[1]; if (!seen.has(k)) { seen.add(k); out.push(c); } } return out; };
const show = process.env.MAP ? (await import(process.env.MAP)).show : null;

// The maze: full-height walls of plants two columns apart, each with one gap, the gaps at opposite ends in turn.
// Rocks differ from level to level, so the wall columns and the gap rows are searched for the longest trail.
function layout(level) {
  const length = (walls) => {
    const g = createGame(level);
    for (const [col, gap] of walls) for (let j = 0; j < ROWS; j++) if (j !== gap && !g.grid[j][col] && g.tiles[j][col] !== 'nettle' && !(col === g.fruit[0] && j === g.fruit[1])) g.grid[j][col] = { type: 'pumpkin' };
    const all = trails(g, computeDist(g));
    return all.every((tr) => { const last = tr[tr.length - 1]; return last[0] === g.fruit[0] && last[1] === g.fruit[1]; }) ? Math.min(...all.map((tr) => tr.length)) : -1;
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

// Free cells off the trail and close enough to it for a shooter.
function spare(g) {
  const tr = trail(g), on = new Set(tr.map(([i, j]) => i + ',' + j)), out = [];
  for (let i = 0; i < COLS; i++) for (let j = 0; j < ROWS; j++) {
    if (g.grid[j][i] || on.has(i + ',' + j) || g.entries.some((e) => e[0] === i && e[1] === j)) continue;
    if (tr.some(([a, b]) => Math.hypot(a - i, b - j) <= 2.3)) out.push([i, j]);
  }
  return out;
}

// What a garden is worth: for every shooter, its damage per second times the trail cells it reaches.
const power = (type, lvl) => {
  const P = PLANTS[type], v = (a) => a[lvl - 1];
  if (P.slow) return 14 * v(P.slow);
  if (!P.dmg) return 0;
  return v(P.dmg) * v(P.rate) * (P.splash ? 1.6 : 1) * (P.multi ? v(P.multi) : 1) + (P.burn ? v(P.burn) * 2 + v(P.dmg) * v(P.rate) : 0);
};
function worth(g, tr, flyers) {
  let sum = 0;
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    const p = g.grid[j][i]; if (!p || !p.type) continue;
    const pw = power(p.type, p.lvl); if (!pw) continue;
    const r = PLANTS[p.type].range[p.lvl - 1]; let n = 0;
    for (const [a, b] of tr) if (Math.hypot(a - i, b - j) <= r) n++;
    if (flyers && PLANTS[p.type].air && Math.hypot(g.fruit[0] - i, g.fruit[1] - j) <= r) n += 3;
    sum += pw * n;
  }
  return sum;
}

// The bot plants where the search above put the walls, then everywhere else by the trail. Each time it takes the
// step that adds the most worth per dew: a shooter, a pumpkin that closes a wall and makes the trail longer, an
// upgrade, a shooter in place of a pumpkin. It waits for the dew when the best step is not affordable yet.
export function playLevel(level, { seed = 7, verbose = false, maxPlants = Infinity, onEvents = null, maze = true } = {}) {
  const g = createGame(level, seed), L = LEVELS[level], walls = maze ? layout(level) : [];
  const flyers = L.waves.some((w) => w.some(([kind]) => BUGS[kind].fly));
  const kinds = L.plants.filter((k) => !['aloe', 'flytrap', 'bell'].includes(k)), shooters = kinds.filter((k) => k !== 'pumpkin');
  const planned = []; for (const [col, gap] of walls) for (let j = 0; j < ROWS; j++) if (j !== gap) planned.push([col, j]);
  const room = () => g.plants.length + g.stubs.length < maxPlants;
  const firstDigger = L.waves.findIndex((w) => w.some(([kind]) => BUGS[kind].dig)) + 1;
  // where the trail will run when the walls stand: nothing but the walls is planted on it
  const keep = new Set();
  if (walls.length) { const f = createGame(level); for (const [i, j] of planned) if (!f.grid[j][i] && f.tiles[j][i] !== 'nettle') f.grid[j][i] = { type: 'pumpkin' }; for (const [i, j] of trail(f, computeDist(f))) keep.add(i + ',' + j); }
  const best = () => {
    const tr = trail(g), now = worth(g, tr, flyers), on = new Set(tr.map(([i, j]) => i + ',' + j));
    let top = null;
    const offer = (gain, cost, run) => { if (gain > 1e-6 && (!top || gain / cost > top.gain / top.cost)) top = { gain, cost, run }; };
    const tryCell = (i, j, types) => {
      if (g.grid[j][i] || stubAt(g, i, j) || placeProblem(g, i, j)) return;
      for (const type of types) {
        if (g.wave < 5 && PLANTS[type].cost > 60) continue; // a young garden needs many cheap shooters, not a few dear ones
        g.grid[j][i] = { type, lvl: 1, i, j };
        const tr2 = on.has(i + ',' + j) ? trail(g, computeDist(g)) : tr, gain = worth(g, tr2, flyers) - now + (tr2.length - tr.length) * .5;
        g.grid[j][i] = null;
        offer(gain, PLANTS[type].cost, () => place(g, type, i, j));
      }
    };
    if (room()) {
      for (const [i, j] of planned) tryCell(i, j, kinds);
      for (const [i, j] of spare(g)) if (!keep.has(i + ',' + j)) tryCell(i, j, shooters);
    }
    for (const p of g.plants) {
      const c = upgradeCost(p);
      if (c != null) { p.lvl++; const gain = worth(g, tr, flyers) - now; p.lvl--; offer(gain || (p.type === 'pumpkin' ? .2 : 0), c, () => upgrade(g, p)); }
      if (p.type === 'pumpkin' && g.phase === 'build') for (const type of shooters) {
        p.type = type; const gain = worth(g, tr, flyers) - now; p.type = 'pumpkin';
        offer(gain, PLANTS[type].cost - refund(g, p), () => { removePlant(g, p); place(g, type, p.i, p.j); });
      }
    }
    return top;
  };
  let seen = '', need = 0;
  const tryBuild = () => {
    // repairs first: a hole the bugs run through is closed at once for dew; other roots grow back by themselves
    const tr = new Set(trail(g).map(([i, j]) => i + ',' + j)), on = (s) => tr.has(s.i + ',' + s.j);
    for (const s of g.stubs.slice()) if (g.phase === 'wave' && on(s) && g.dew >= regrowCost(s)) regrow(g, s);
    // the maze grows with the level: a new wall is closed every third wave, with pumpkins where nothing stands yet
    const due = Math.min(walls.length, Math.floor(g.wave / 3));
    for (const [col, gap] of walls.slice(0, due)) for (let j = 0; j < ROWS; j++) {
      if (j === gap || g.grid[j][col] || stubAt(g, col, j) || !room() || placeProblem(g, col, j)) continue;
      if (!place(g, 'pumpkin', col, j)) return;
    }
    // from the first diggers on, some dew is always kept to close a hole at once
    const keepDew = walls.length && g.wave >= firstDigger - 1 ? 60 : 0;
    // the best step is looked for again only when the field changed or the dew for the last one found is there
    for (let n = 0; n < 40; n++) {
      const sig = `${g.wave},${g.phase},${g.stubs.length},${g.plants.reduce((t, p) => t + p.id * 7 + p.lvl, 0)}`;
      if (sig === seen && g.dew < need) return;
      const a = best(); seen = sig; need = a ? a.cost + keepDew : Infinity;
      if (!a || g.dew < need) return;
      a.run();
    }
  };
  let t = 0, income = 0, eaten = 0; const log = [];
  while (g.phase !== 'won' && g.phase !== 'lost' && t < 3600) {
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
