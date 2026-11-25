// The owner's own gardens from the telemetry, played as plans on the sim: how many times healthier the bugs may be
// and the fruit still never bitten / the level still won.
//   node balance/owner.mjs [FILE.jsonl]   (default: balance/owner/2026-11-25-razvilka-lost.jsonl)
//   SPEND=1 — also the owner's garden with the dew left grown into it by the bot (no new plants)
//   AT1=1 — only at the health of the bugs as it is: the fruit left and the waves that bit it, on each seed
//   GRID=1 — point by point on a grid of health instead of the margin by halving
// The records are those of balance/players.mjs (a copy of every fetch is kept in ~/tmp/telemetry/); the owner's
// parties worth keeping are in balance/owner/ (the device id replaced). A party is replayed as a plan: the owner's
// plants and growing in the owner's order, each step as soon as there is dew for it, the branches the owner took; a
// plant sold later is left out with its growing (a plan cannot sell). Beside it, the kept perfect party of the level.
import { readFileSync } from 'node:fs';
import { LEVELS, PERKS } from '../public/data.js';
import { exportData } from '../sim/js/export.mjs';
import { play, build } from '../sim/js/play.mjs';
import { resolve } from './scenario.mjs';
import { margins } from './margin.mjs';

const file = process.argv[2] || new URL('./owner/2026-11-25-razvilka-lost.jsonl', import.meta.url);
const recs = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const parties = {};
for (const r of recs) { const p = (parties[r.id] ??= { id: r.id, acts: [] }); if (r.type === 'start' && !r.resumed) { p.level = r.level; p.meta = r.meta; } if (r.type === 'wave') { p.last = r; p.acts.push(...r.before, ...r.during); } }
const SEEDS = [7, 11], tasks = [];
for (const p of Object.values(parties)) {
  if (!p.last) continue;
  // the owner's steps in order; a plant sold later is left out with its growing (the plan cannot sell)
  const garden = p.last.garden.plants, steps = [], at = {};
  for (const a of p.acts) { const [op] = a;
    if (op === 'place') { const [, kind, i, j] = a; at[i + ',' + j] = steps.length; steps.push({ cell: i + ',' + j, s: [kind, i, j] }); }
    else if (op === 'up') { const [, kind, lvl, i, j, br] = a; steps.push({ cell: i + ',' + j, s: ['up', i, j, br === 'b' ? 2 : 1] }); }
    else if (op === 'sell') { const [, kind, lvl, i, j] = a; const c = i + ',' + j; for (const x of steps) if (x.cell === c) x.gone = true; } }
  const plan = steps.filter((x) => !x.gone).map((x) => x.s);
  const own = Object.fromEntries(Object.entries(p.meta).filter(([k]) => k in PERKS));
  for (const [who, meta] of [['owner perks', own], ['no perks', 'none'], ['exp3', 'exp3']]) for (const seed of SEEDS) {
    const base = resolve({ level: p.level, opts: { route: 1, place: 'best', upgrades: 'none', terrain: true, powers: false, early: true, meta: typeof meta === 'string' ? meta : 'none', seed } });
    if (typeof meta !== 'string') base.meta = meta;
    tasks.push({ p, who, n: p.level, opts: { ...base, plan, maxPlants: garden.length } });
    if (process.env.SPEND) tasks.push({ p, who: who + ' +dew spent', n: p.level, opts: { ...base, plan, upgrades: 'greedy', maxPlants: garden.length } }); // the owner's garden, the dew left grown into it by the bot (no new plants)
  }
}
const SMART = { route: 1, place: 'best', upgrades: 'greedy', terrain: true, powers: true, early: true };
for (const p of Object.values(parties)) {
  if (!p.last) continue; const k = JSON.parse(readFileSync(new URL(`./perfect/L${p.level + 1}.json`, import.meta.url), 'utf8'));
  const own = Object.fromEntries(Object.entries(p.meta).filter(([x]) => x in PERKS));
  const count = k.plan.filter((x) => x[0] !== 'up').length, q = { id: 'perfect' + p.level, level: p.level };
  for (const [who, meta] of [['owner perks', own], ['no perks', 'none'], ['exp3', 'exp3']]) for (const seed of SEEDS) {
    for (const [tag, o] of [['perfect strict', { route: 1, place: 'best', upgrades: 'none', terrain: true, powers: false, early: true, maxPlants: count }], ['perfect as tuned', SMART]]) {
      const base = resolve({ level: p.level, opts: { ...o, meta: typeof meta === 'string' ? meta : 'none', seed } }); if (typeof meta !== 'string') base.meta = meta;
      tasks.push({ p: { ...q, id: q.id + tag }, who: `${tag} · ${who}`, n: p.level, opts: { ...base, plan: k.plan } }); } } }
const bin = build(), data = exportData();
const clean = (r) => r.won && Object.keys(r.bites).length === 0;
const run = (ts, ok) => play(ts.map((t) => ({ level: t.n, opts: t.opts })), { bin, data }).map((x) => { if (x.err) throw new Error(x.err); return { ...x.res, won: ok(x.res) }; });
if (process.env.AT1) {
  // at the health of the bugs as it is: the fruit left and the waves that bit it, on each seed
  const rs = play(tasks.map((t) => ({ level: t.n, opts: t.opts })), { bin, data }).map((x) => x.res);
  tasks.forEach((t, k) => { if (t.p.id.startsWith('perfect') && !t.who.startsWith('perfect strict')) return; const r = rs[k];
    const waves = [...new Set(Object.keys(r.bites).map((x) => Number(x.split(':')[0])))].sort((a, b) => a - b);
    console.log(`  ${LEVELS[t.n].name.padEnd(9)} ${(t.p.id.startsWith('perfect') ? '' : 'owner · ') + t.who}`.padEnd(46) + ` seed ${t.opts.seed}: ${r.won ? 'won' : 'LOST at wave ' + r.wave}, fruit ${Math.round(r.hp)}/${r.maxHp}, bitten in waves ${waves.join(',') || '-'}`); });
  process.exit(0);
}
if (process.env.GRID) {
  // point by point: the edge jumps about, so a search by halving can land anywhere on it
  const HP = [0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2], all = [];
  tasks.forEach((t, k) => HP.forEach((hp) => all.push({ k, hp, task: { ...t, opts: { ...t.opts, hp } } })));
  const rs = play(all.map((a) => ({ level: a.task.n, opts: a.task.opts })), { bin, data }).map((x) => x.res);
  const cell = (k, hp) => { const rr = all.map((a, i) => [a, rs[i]]).filter(([a]) => a.hp === hp && tasks[a.k].p.id === tasks[k].p.id && tasks[a.k].who === tasks[k].who).map(([, r]) => r);
    return rr.every(clean) ? 'C' : rr.every((r) => r.won) ? 'w' : rr.some((r) => r.won) ? '?' : '-'; };
  console.log('C clean on both seeds, w won on both (bitten), ? won on one, - lost; bugs ×' + HP.join(' '));
  const seen = new Set(); tasks.forEach((t, k) => { const key = t.p.id + t.who; if (seen.has(key)) return; seen.add(key);
    console.log(`  ${LEVELS[t.n].name.padEnd(15)} ${(t.p.id.startsWith('perfect') ? '' : 'owner · ') + t.who}`.padEnd(52) + HP.map((hp) => cell(k, hp).padStart(4)).join('')); });
  process.exit(0);
}
for (const [what, ok] of [['fruit never bitten', clean], ['level won', (r) => r.won]]) {
  const at1 = run(tasks, ok); const ms = await margins(tasks.map((task, k) => ({ task, won: at1[k].won })), (ts) => run(ts, ok), { lo: .25, hi: 6 });
  console.log(`\n${what}: bugs how many times healthier the owner's final garden holds (min over seeds ${SEEDS})`);
  const seen = new Set();
  tasks.forEach((t, k) => { const key = t.p.id + t.who; t.p = tasks.find((u) => u.p.id === t.p.id).p; if (seen.has(key)) return; seen.add(key);
    const at = Math.min(...tasks.map((u, q) => (u.p.id === t.p.id && u.who === t.who ? ms[q].at : Infinity)));
    const r = at1[k]; console.log(`  ${LEVELS[t.n].name.padEnd(15)} ${t.who.padEnd(32)} ${Math.round(at * 100)}%   (at 100%: plants ${r.plants}, grown ${r.grown}, trail ${r.trail}, won ${r.won})`); });
}
