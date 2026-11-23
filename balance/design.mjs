// The designer: looks for the strongest garden a level allows — the trail and the plants around it together — by
// trying changes on a garden laid out beforehand and keeping what the simulation says is better.
//   node balance/design.mjs --level 3 [--rounds 40] [--batch 12] [--seed 1] [--from max/alt] [--start bot|expert]
//     [--hi 8] [--out FILE] [--jobs N]
// A design is a plan (sim/src/bot.rs, option plan): the plants to put and to grow, cell by cell, in order. It starts
// from the smart bot's own party (on its own maze, or on the maze --from of sim/src/routes.rs), or with --start expert
// from the party of the expert (the strategy of balance/strategy.json) and is changed a step
// at a time: two plants trade cells (a pepper goes where the trail winds round it, a mint where the most plants
// reach), a plant becomes another kind, a plant off the trail moves, steps come earlier or later, a plant is grown
// or not, a pumpkin is put on the trail or taken out of a wall. Every change is played against bugs a little
// healthier than the design holds now, on the game's own waves and one other draw of them (the seed of the game
// changes nothing for the bot; a garden fitted to one draw's luck is no garden);
// it is kept when the garden lasts longer. When the design wins both, the bugs get healthier. In the end the margin (margin.mjs) of the design and of the bot it
// started from are found: the difference is what the layout is worth.
import { writeFileSync, readFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir, homedir, setPriority } from 'node:os';
import { join, dirname } from 'node:path';
import { LEVELS, PLANTS, makeWaves } from '../public/data.js';
import { exportData } from '../sim/js/export.mjs';
import { createGame, place, placeProblem, trails, COLS, ROWS } from '../public/game.js';
import { play } from '../sim/js/play.mjs';
import { resolve, applyOverrides } from './scenario.mjs';
import { margins, show } from './margin.mjs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const START = opt('--start', 'bot'), HI = Number(opt('--hi', 8)), level = Number(opt('--level', 1)) - 1, ROUNDS = Number(opt('--rounds', 40)), BATCH = Number(opt('--batch', 12)), from = opt('--from'), jobs = opt('--jobs') ? { jobs: Number(opt('--jobs')) } : {};
const out = opt('--out', join(homedir(), 'tmp', 'balance', 'designs', `L${level + 1}.json`)), STEP = 1.05;
try { setPriority(19); } catch { /* as it is */ }
let rs = Number(opt('--seed', 1)) * 2654435761 >>> 0;
const rnd = () => { rs = (rs + 0x6D2B79F5) >>> 0; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)], K = (i, j) => i + ',' + j;
const SMART = { place: 'best', upgrades: 'greedy', meta: 'exp2', terrain: true, powers: true, early: true, ...(from ? { maze: from } : { route: 1 }) };
const policy = START === 'expert' ? JSON.parse(readFileSync(new URL('./strategy.json', import.meta.url), 'utf8')).policy : null;
const base = { ...resolve({ level, opts: SMART }), ...(policy ? { policy } : {}) }, kinds = LEVELS[level].plants;
mkdirSync(dirname(out), { recursive: true }); // before the search: its result must have somewhere to go
// the waves of the game (draw 0) and two other draws of them; data.js as it was after
const DRAWS = [0, 1, 2], datas = DRAWS.map((w) => { if (w) applyOverrides({}, w); return exportData(); });
LEVELS.forEach((L, n) => { L.waves = makeWaves(L, 101 + n); });
// plays [{ opts, w }] (w: the draw, 0 when not said), a batch per draw, in the order given
const run = (list) => { const r = Array(list.length);
  for (const w of new Set(list.map((x) => x.w || 0))) { const ks = list.map((x, k) => ((x.w || 0) === w ? k : -1)).filter((k) => k >= 0);
    play(ks.map((k) => ({ level, opts: list[k].opts })), { ...jobs, data: datas[w] }).forEach((x, i) => { if (x.err) throw new Error(x.err); r[ks[i]] = x.res; }); }
  return r; };

// the bot's own party, as a plan
const dir = mkdtempSync(join(tmpdir(), 'fruit-design-')), file = join(dir, 'ops.json');
play([{ level, opts: base, record: file }], jobs);
const seedPlan = JSON.parse(readFileSync(file, 'utf8')).filter((o) => o[0] === 'place' || o[0] === 'up').map((o) => (o[0] === 'up' ? ['up', o[1], o[2]] : [o[1], o[2], o[3]]));
rmSync(dir, { recursive: true });

// the garden a plan ends in: cell → { kind, lvl }, and the trail through it as the game lays it
function study(plan) {
  const cells = new Map();
  for (const [k, i, j] of plan) { if (k === 'up') { const c = cells.get(K(i, j)); if (c && c.lvl < 3) c.lvl++; } else cells.set(K(i, j), { kind: k, lvl: 1, i, j }); }
  const g = createGame(level, 1, {}); g.dew = 1e9;
  for (const c of cells.values()) if (!placeProblem(g, c.i, c.j)) place(g, c.kind, c.i, c.j);
  const trail = []; const seen = new Set(); for (const tr of trails(g)) for (const [i, j] of tr) if (!seen.has(K(i, j))) { seen.add(K(i, j)); trail.push([i, j]); }
  return { cells, g, trail, on: seen };
}
const reach = (kind, lvl = 3) => { const p = PLANTS[kind]; return p.range ? Math.min(p.range[lvl - 1], p.groundRange ?? 9) : 0; };
const within = (a, b, i, j, r) => (a - i) ** 2 + (b - j) ** 2 <= r * r + 1e-9;
const hurts = (kind) => { const p = PLANTS[kind]; return !!(p.dmg || p.chomp); };
// what a kind is worth on a cell, roughly: the cells of the trail it reaches; for a mint, the plants reaching the
// cells it slows; for a bell, the plants around it
function worth(s, kind, i, j) {
  const r = reach(kind); if (!r) return 0;
  if (PLANTS[kind].buff) return [...s.cells.values()].filter((c) => hurts(c.kind) && (c.i !== i || c.j !== j) && within(c.i, c.j, i, j, r)).length;
  const near = s.trail.filter(([a, b]) => within(a, b, i, j, r));
  if (PLANTS[kind].slow) return near.reduce((t, [a, b]) => t + [...s.cells.values()].filter((c) => hurts(c.kind) && within(a, b, c.i, c.j, reach(c.kind))).length, 0);
  return near.length;
}
const swapCells = (plan, a, b) => plan.map(([k, i, j]) => (i === a.i && j === a.j ? [k, b.i, b.j] : i === b.i && j === b.j ? [k, a.i, a.j] : [k, i, j]));
const moveCell = (plan, a, i2, j2) => plan.map(([k, i, j]) => (i === a.i && j === a.j ? [k, i2, j2] : [k, i, j]));
const lastPlace = (plan, c) => plan.findLastIndex(([k, i, j]) => k !== 'up' && i === c.i && j === c.j);

// one change of a plan (null: this one found nothing to do)
function mutate(plan) {
  const s = study(plan), all = [...s.cells.values()], t = rnd();
  const others = all.filter((c) => c.kind !== 'pumpkin');
  if (t < .3 && others.length) { // two plants trade cells: to where the first is worth more, or anywhere
    const a = pick(others), w = worth(s, a.kind, a.i, a.j);
    let to = all.filter((c) => c.kind !== a.kind);
    if (rnd() < .7) { const better = to.map((c) => [worth(s, a.kind, c.i, c.j), c]).filter(([v]) => v > w).sort((x, y) => y[0] - x[0]).slice(0, 5).map(([, c]) => c); if (better.length) to = better; }
    return to.length ? swapCells(plan, a, pick(to)) : null;
  }
  if (t < .45 && all.length) { // a plant becomes another kind
    const a = pick(all), k = pick(kinds.filter((x) => x !== a.kind && x !== 'aloe')), at = lastPlace(plan, a);
    return plan.map((st, n) => (n === at ? [k, a.i, a.j] : st));
  }
  if (t < .6 && others.length) { // a plant off the trail moves to a free cell by the trail
    const a = pick(others), free = [];
    for (let i = 0; i < COLS; i++) for (let j = 0; j < ROWS; j++) if (!s.cells.has(K(i, j)) && !s.on.has(K(i, j)) && !s.g.grid[j][i] && !placeProblem(s.g, i, j)) { const v = worth(s, a.kind, i, j); if (v > 0) free.push([v, i, j]); }
    if (!free.length) return null;
    free.sort((x, y) => y[0] - x[0]); const [, i2, j2] = pick(free.slice(0, rnd() < .7 ? 4 : free.length));
    return moveCell(plan, a, i2, j2);
  }
  if (t < .75) { // a step, or all the steps of a plant, earlier or later
    const p = plan.slice(), n = Math.floor(rnd() * p.length), [st] = p.splice(n, 1), d = Math.round((rnd() - .6) * 60);
    p.splice(Math.max(0, Math.min(p.length, n + d)), 0, st);
    // a plant is never grown before it is put
    const put = p.findIndex(([k, i, j]) => k !== 'up' && i === st[1] && j === st[2]), up = p.findIndex(([k, i, j]) => k === 'up' && i === st[1] && j === st[2]);
    return up >= 0 && up < put ? null : p;
  }
  if (t < .88 && all.length) { // a plant is grown once more, or once less
    const a = pick(all), ups = plan.map((st, n) => (st[0] === 'up' && st[1] === a.i && st[2] === a.j ? n : -1)).filter((n) => n >= 0);
    if (rnd() < .6 && a.lvl < 3) { const p = plan.slice(), after = Math.max(lastPlace(plan, a), ...ups) + 1; p.splice(after + Math.floor(rnd() * (p.length - after + 1)), 0, ['up', a.i, a.j]); return p; }
    return ups.length ? plan.filter((_, n) => n !== ups.at(-1)) : null;
  }
  if (rnd() < .5) { // a pumpkin on the trail: the trail goes round it
    const [i, j] = pick(s.trail); if (placeProblem(s.g, i, j)) return null;
    const p = plan.slice(); p.splice(Math.floor(rnd() * Math.min(p.length, 40)), 0, ['pumpkin', i, j]); return p;
  }
  const walls = all.filter((c) => c.kind === 'pumpkin'); if (!walls.length) return null; // a pumpkin out of a wall: the trail may go through
  const a = pick(walls); return plan.filter(([, i, j]) => i !== a.i || j !== a.j);
}

// how long a plan lasts against bugs h and a step more times healthier: a win counts for more than any loss, then the fruit left; a loss by the time it took
const score = (r) => (r.won ? 1e5 + r.hp : r.time);
function rate(plans, h) { const res = run(plans.flatMap((plan) => [0, 1].map((w) => ({ w, opts: { ...base, plan, hp: Math.round(h * 1000) / 1000 } })))); return plans.map((_, k) => ({ f: score(res[2 * k]) + score(res[2 * k + 1]), wins: res[2 * k].won + res[2 * k + 1].won })); }

let best = seedPlan, h = 1, cur = rate([best], h)[0], kept = 0; const t0 = Date.now();
const log = (s) => process.stderr.write(s + '\n');
log(`L${level + 1} ${LEVELS[level].name}: the ${START}'s garden${from ? ` on ${from}` : ''}, ${seedPlan.length} steps`);
for (let round = 1; round <= ROUNDS; round++) {
  while (cur.wins === 2 && h < HI) { h *= STEP; cur = rate([best], h)[0]; }
  const cands = []; for (let n = 0; cands.length < BATCH && n < BATCH * 6; n++) { let p = mutate(best); if (p && rnd() < .3) p = mutate(p) || p; if (p) cands.push(p); }
  const fs = rate(cands, h); let top = -1; fs.forEach((x, k) => { if (x.f > (top < 0 ? cur.f : fs[top].f)) top = k; });
  if (top >= 0) { best = cands[top]; cur = fs[top]; kept++; }
  if (round % 10 === 0 || round === ROUNDS) log(`  round ${round}: bugs ×${h.toFixed(2)}, ${kept} changes kept, ${Math.round((Date.now() - t0) / 1000)}s`);
}
// the margins: the bot as it plays, its own garden as a plan, and the design
// (each the median over the game's own waves and two other draws, the third of which the search never played;
// each: draw by draw, the game's own first)
const tasks = [{ opts: base }, { opts: { ...base, plan: seedPlan } }, { opts: { ...base, plan: best } }].flatMap((t) => DRAWS.map((w) => ({ opts: t.opts, w })));
const at1 = run(tasks);
const ms = await margins(tasks.map((task, k) => ({ task, won: at1[k].won })), async (ts) => run(ts), { hi: HI });
const medOf = (a) => { const each = ms.slice(a * DRAWS.length, (a + 1) * DRAWS.length), xs = [...each].sort((p, q) => p.at - q.at); return { ...xs[1], each: each.map((x) => x.at) }; };
const [bot, seed, design] = [0, 1, 2].map(medOf);
const s = study(best), count = {}; for (const c of s.cells.values()) count[c.kind] = (count[c.kind] || 0) + 1;
const peppers = [...s.cells.values()].filter((c) => c.kind === 'pepper'), wrap = peppers.length ? peppers.reduce((t, c) => t + worth(s, 'pepper', c.i, c.j), 0) / peppers.length : null;
const map = LEVELS[level].map.map((line, j) => [...line].map((ch, i) => { const c = s.cells.get(K(i, j)); return c ? (c.kind === 'pumpkin' ? '#' : c.kind[0].toUpperCase()) : s.on.has(K(i, j)) && ch === '.' ? 'o' : ch === '.' ? ' ' : ch.toLowerCase(); }).join(''));
writeFileSync(out, JSON.stringify({ level: level + 1, from: from || 'best', start: START, rounds: ROUNDS, h, margin: { bot, seed, design }, trail: s.trail.length, plants: count, plan: best }));
console.log(`L${level + 1} (from the ${START}): the ${START} holds bugs of ${show(bot)}, its garden as a plan ${show(seed)}, the design ${show(design)} [${design.each.map((v) => Math.round(v * 100)).join(' ')}]  (trail ${s.trail.length} cells; ${Object.entries(count).map(([k, n]) => `${k} ${n}`).join(', ')}${wrap != null ? `; a pepper burns ${wrap.toFixed(1)} cells of the trail` : ''})`);
console.log(map.join('\n'));
console.log(`(# pumpkin, capitals — plants by their first letter, o — the trail)  ${out}`);
