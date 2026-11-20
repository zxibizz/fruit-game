// A bot that plays a level the way it is meant to be played, and worse on purpose. The tests use it as the balance
// check. The smart bot builds a serpentine maze over the whole field, leads the trail through mud and nettles, puts
// its best plants on fertile beds and where they see the most of the trail, mixes in mint and bells, upgrades what
// pays most, mends holes, calls the waves early and uses frost and rain. Options switch its skills off:
//   maze: false — plants only beside the trail as it is; terrain: false — blind to the ground; powers: false — no
//   frost and rain; bank: true — all the dew of the level in hand from the start (an upper bound for a lazy garden);
//   meta — the perks bought; maxPlants — a cap on the garden.
// Run directly to see how it did: node test/bot.mjs [level ...]
import { createGame, computeDist, step, place, upgrade, upgradeCost, startWave, placeProblem, trails, regrow, regrowCost, removePlant, refund, stubAt, usePower, pstat, COLS, ROWS } from '../public/game.js';
import { LEVELS, BUGS, PLANTS, PERKS, PERK_ORDER, MUD, EARLY_DEW, BREAK, FATIGUE } from '../public/data.js';
const show = process.env.MAP ? (await import(process.env.MAP)).show : null;
const kOf = (i, j) => i + ',' + j;
// every cell some trail runs over (a level may have two anthills), each once
// (the third number: how many cells a bug has walked when it gets there)
const trailOf = (g, dist) => { const seen = new Set(), out = []; for (const tr of trails(g, dist)) tr.forEach((c, n) => { const k = kOf(c[0], c[1]); if (!seen.has(k)) { seen.add(k); out.push([c[0], c[1], n + 1]); } }); return out; };

// The perks a player has by level n who took two stars on every level before it, and all of them.
const BUY = ['dew', 'rose', 'heart', 'corn', 'pumpkin', 'mint', 'dew', 'roots', 'pepper', 'rose', 'clouds', 'corn', 'dandelion', 'heart', 'aloe', 'flytrap', 'bell', 'mint', 'pepper', 'dew'];
export function expectedMeta(level, perLevel = 2) {
  let stars = level * perLevel; const meta = {};
  for (const k of BUY) { const cost = PERKS[k].cost[meta[k] || 0]; if (cost == null || cost > stars) continue; stars -= cost; meta[k] = (meta[k] || 0) + 1; }
  return meta;
}
export const fullMeta = () => Object.fromEntries(PERK_ORDER.map((k) => [k, PERKS[k].cost.length]));
// All the dew a level gives: at the start, for every bug, for every wave, and for calling every wave at once.
export function levelDew(level, meta = {}) {
  const L = LEVELS[level]; let sum = L.dew + (meta.dew ? PERKS.dew.v[meta.dew - 1] : 0) + (L.count - 1) * (L.waveBonus + BREAK * EARLY_DEW);
  for (const w of L.waves) for (const [kind, n] of w) sum += n * Math.round(BUGS[kind].reward * (L.rich || 1));
  return sum;
}

// The maze: full-height walls of plants two columns apart, each with one gap, the gaps at opposite ends in turn.
// The wall columns and the gap rows are searched for the best trail: the longest, and (seeing the ground) with mud
// and nettles on it.
function layout(level, terrain) {
  const value = (walls) => {
    const g = createGame(level);
    for (const [col, gap] of walls) for (let j = 0; j < ROWS; j++) if (j !== gap && !g.grid[j][col] && g.tiles[j][col] !== 'nettle' && !(col === g.fruit[0] && j === g.fruit[1])) g.grid[j][col] = { type: 'pumpkin' };
    const all = trails(g, computeDist(g));
    if (!all.every((tr) => { const last = tr[tr.length - 1]; return last[0] === g.fruit[0] && last[1] === g.fruit[1]; })) return -1;
    return Math.min(...all.map((tr) => tr.reduce((s, [i, j]) => s + 1 + (terrain ? (g.tiles[j][i] === 'mud' ? .8 : g.tiles[j][i] === 'nettle' ? 1.5 : 0) : 0), 0)));
  };
  let best = null, bestV = -1;
  for (const cols of [[11, 9, 7, 5, 3], [10, 8, 6, 4, 2], [11, 9, 7, 5, 2], [12, 10, 8, 6, 4, 2], [11, 8, 6, 4, 2], [12, 10, 8, 6, 4]]) {
    const walls = [], tune = (w) => {
      let at = w[1], top = -1;
      for (let j = 0; j < ROWS; j++) { w[1] = j; const v = value(walls); if (v > top) { top = v; at = j; } }
      w[1] = at;
    };
    for (const col of cols) { const w = [col, 0]; walls.push(w); tune(w); } // wall by wall, then two more rounds
    for (let pass = 0; pass < 2; pass++) walls.forEach(tune);
    const v = value(walls); if (v > bestV) { bestV = v; best = walls.map((w) => w.slice()); }
  }
  return best;
}

// What a garden is worth: the damage a bug takes on its way. For every cell of the trail, the damage per second of
// the plants that reach it, times the time a bug spends there (longer by a mint, longer in mud).
function worth(g, tr, o) {
  const at = (p) => (o.terrain ? p : { type: p.type, lvl: p.lvl, i: -1, j: -1 }), st = (p, name) => pstat(g, at(p), name);
  const plants = []; for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) { const p = g.grid[j][i]; if (p && p.type) plants.push(p); }
  const time = tr.map(([a, b], k) => {
    let slow = 0; for (const p of plants) if (PLANTS[p.type].slow && Math.hypot(a - p.i, b - p.j) <= st(p, 'range')) slow = Math.max(slow, st(p, 'slow') + (st(p, 'chill') ? .06 : 0));
    return (1 + FATIGUE * tr[k][2]) / ((1 - slow) * (o.terrain && g.tiles[b][a] === 'mud' && !g.grid[b][a] ? MUD : 1));
  });
  let sum = 0;
  for (const p of plants) {
    const P = PLANTS[p.type]; let dps = 0;
    if (P.eat) dps = st(p, 'chomp') / st(p, 'eat');
    else if (p.type === 'pepper') dps = 2 * st(p, 'dmg') * st(p, 'rate') + 2 * st(p, 'burn') * Math.min(1.5, st(p, 'burnT') / 2);
    else if (P.dmg) dps = st(p, 'dmg') * st(p, 'rate') * (st(p, 'multi') || 1) * (P.splash ? 1 + st(p, 'splash') * .75 : 1) * (st(p, 'stun') ? 1.1 : 1);
    if (!dps) continue;
    let buff = 0; for (const q of plants) if (PLANTS[q.type].buff && q !== p && Math.hypot(q.i - p.i, q.j - p.j) <= st(q, 'range')) buff = Math.max(buff, st(q, 'buff'));
    const r = st(p, 'range'); let n = 0;
    if (!P.airOnly) for (let k = 0; k < tr.length; k++) if (Math.hypot(tr[k][0] - p.i, tr[k][1] - p.j) <= r) n += time[k];
    // flyers come over the field straight to the fruit: what reaches the fruit sees them all
    if (o.flyers && P.air) n += Math.hypot(g.fruit[0] - p.i, g.fruit[1] - p.j) <= r ? (P.airOnly ? 5 : 3) : P.airOnly && p.i > g.fruit[0] ? 1 : 0;
    sum += dps * (1 + buff) * n;
  }
  return sum;
}

export function playLevel(level, { seed = 7, verbose = false, maxPlants = Infinity, maze = true, terrain = true, powers = true, bank = false, meta = {} } = {}) {
  const g = createGame(level, seed, meta), L = LEVELS[level], walls = maze ? layout(level, terrain) : [];
  const o = { terrain, flyers: L.waves.some((w) => w.some(([kind]) => BUGS[kind].fly)) };
  if (bank) g.dew = bank === true ? levelDew(level, meta) : bank;
  const kinds = L.plants.filter((k) => k !== 'aloe'), others = kinds.filter((k) => k !== 'pumpkin');
  const reach = Math.max(...others.map((k) => PLANTS[k].range[2])) + .6;
  const planned = []; for (const [col, gap] of walls) for (let j = 0; j < ROWS; j++) if (j !== gap) planned.push([col, j]);
  const room = () => g.plants.length + g.stubs.length < maxPlants;
  const firstDigger = L.waves.findIndex((w) => w.some(([kind]) => BUGS[kind].dig)) + 1;
  // where the trail will run when the walls stand: nothing but the walls is planted on it; without a maze, the trail as it is
  const keep = new Set();
  { const f = createGame(level); for (const [i, j] of planned) if (!f.grid[j][i] && f.tiles[j][i] !== 'nettle') f.grid[j][i] = { type: 'pumpkin' }; for (const [i, j] of trailOf(f, computeDist(f))) keep.add(kOf(i, j)); }
  const best = () => {
    const tr = trailOf(g), now = worth(g, tr, o), on = new Set(tr.map(([i, j]) => kOf(i, j)));
    let top = null;
    const offer = (gain, cost, run) => { if (gain > 1e-6 && (!top || gain / cost > top.gain / top.cost)) top = { gain, cost, run }; };
    const tryCell = (i, j, types) => {
      if (g.grid[j][i] || stubAt(g, i, j) || placeProblem(g, i, j)) return;
      for (const type of types) {
        g.grid[j][i] = { type, lvl: 1, i, j };
        const tr2 = on.has(kOf(i, j)) ? trailOf(g, computeDist(g)) : tr, gain = worth(g, tr2, o) - now + (tr2.length - tr.length) * .5;
        g.grid[j][i] = null;
        offer(gain, PLANTS[type].cost, () => place(g, type, i, j));
      }
    };
    if (room()) {
      for (const [i, j] of planned) tryCell(i, j, kinds);
      for (let i = 0; i < COLS; i++) for (let j = 0; j < ROWS; j++) if (!keep.has(kOf(i, j)) && !on.has(kOf(i, j)) && tr.some(([a, b]) => Math.hypot(a - i, b - j) <= reach)) tryCell(i, j, others);
    }
    for (const p of g.plants) {
      const c = upgradeCost(p);
      if (c != null) { p.lvl++; const gain = worth(g, tr, o) - now; p.lvl--; offer(gain || (p.type === 'pumpkin' && g.wave >= firstDigger - 2 ? .5 : 0), c, () => upgrade(g, p)); }
      if (p.type === 'pumpkin' && p.lvl === 1 && g.phase === 'build') for (const type of others) {
        p.type = type; const gain = worth(g, tr, o) - now; p.type = 'pumpkin';
        offer(gain, PLANTS[type].cost - refund(g, p) + .01, () => { removePlant(g, p); place(g, type, p.i, p.j); });
      }
    }
    return top;
  };
  let seen = '', need = 0;
  const tryBuild = () => {
    // repairs first: a hole the bugs run through is closed at once for dew; other roots grow back by themselves
    const tr = new Set(trailOf(g).map(([i, j]) => kOf(i, j))), on = (s) => tr.has(kOf(s.i, s.j));
    for (const s of g.stubs.slice()) if (g.phase === 'wave' && on(s) && g.dew >= regrowCost(s)) regrow(g, s);
    // the maze grows with the level: a new wall is closed every second wave, with pumpkins where nothing stands yet
    const due = Math.min(walls.length, 1 + Math.floor(g.wave / 2));
    for (const [col, gap] of walls.slice(0, due)) for (let j = 0; j < ROWS; j++) {
      if (j === gap || g.grid[j][col] || stubAt(g, col, j) || !room() || placeProblem(g, col, j)) continue;
      if (!place(g, 'pumpkin', col, j)) return;
    }
    // from the first diggers on, some dew is always kept to close a hole at once
    const keepDew = walls.length && g.wave >= firstDigger - 1 ? 50 : 0;
    // the best step is looked for again only when the field changed or the dew for the last one found is there
    for (let n = 0; n < 60; n++) {
      const sig = `${g.wave},${g.phase},${g.stubs.length},${g.plants.reduce((t, p) => t + p.id * 7 + p.lvl, 0)}`;
      if (sig === seen && g.dew < need) return;
      const a = best(); seen = sig; need = a ? a.cost + keepDew : Infinity;
      if (!a || g.dew < need) return;
      a.run();
    }
  };
  // frost when bugs are about to bite, rain when the fruit or the garden is hurt
  const usePowers = () => {
    if (!powers) return;
    const near = g.bugs.filter((b) => Math.hypot(b.x - g.fruit[0] - .5, b.y - g.fruit[1] - .5) < 2.5);
    if (g.powers.frost && (near.length >= 3 || near.some((b) => BUGS[b.kind].boss))) usePower(g, 'frost');
    if (g.powers.rain && (g.hp <= g.maxHp - 3 || g.stubs.length >= 3 || g.plants.filter((p) => p.web > 0).length >= 2)) usePower(g, 'rain');
  };
  let t = 0, income = 0, eaten = 0; const log = [], bites = {};
  while (g.phase !== 'won' && g.phase !== 'lost' && t < 3600) {
    // it builds, then calls the wave at once (for the dew of an early start)
    if (g.phase === 'build') { tryBuild(); const dew = g.dew; startWave(g); if (bank) g.dew = dew; }
    for (let n = 0; n < 15; n++) step(g, 1 / 30);
    t += .5; usePowers();
    for (const e of g.events) { if (e.t === 'kill') { income += e.reward; if (bank) g.dew -= e.reward; } if (e.t === 'waveDone') { income += e.bonus; if (bank) g.dew -= e.bonus; } if (e.t === 'plantDead') eaten++; if (e.t === 'bite') bites[`${g.wave}:${e.b.kind}${e.b.brood ? '*' : ''}`] = (bites[`${g.wave}:${e.b.kind}${e.b.brood ? '*' : ''}`] || 0) + 1; }
    if (g.events.some((e) => e.t === 'waveDone') && g.wave % 5 === 0) log.push(`${g.wave}:${g.hp}hp/${g.plants.length}p`);
    if (verbose && g.events.some((e) => e.t === 'waveDone')) console.log(`  after wave ${g.wave}: hp ${g.hp} dew ${g.dew} plants ${g.plants.length} (${g.plants.filter((p) => p.lvl > 1).length} grown) eaten ${eaten} t ${Math.round(t)}s`);
    g.events.length = 0; tryBuild();
  }
  const res = { worth: Math.round(worth(g, trailOf(g), o)), trail: trailOf(g).length, level, won: g.phase === 'won', hp: g.hp, maxHp: g.maxHp, wave: g.wave, plants: g.plants.length, grown: g.plants.filter((p) => p.lvl > 1).length, dew: g.dew, eaten, income, log, bites, time: Math.round(t) };
  if (show) show(g);
  if (verbose) console.log(`level ${level + 1} ${L.name}: ${res.won ? 'won' : 'LOST'} hp ${res.hp}/${g.maxHp} wave ${res.wave}/${g.waves} plants ${res.plants} (${res.grown} grown) dew left ${g.dew} eaten ${eaten} income ${income} time ${res.time}s bites ${JSON.stringify(bites)}`);
  return res;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const levels = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map((n) => Number(n) - 1);
  for (const n of levels.length ? levels : LEVELS.map((_, k) => k)) playLevel(n, { verbose: true, meta: expectedMeta(n) });
}
