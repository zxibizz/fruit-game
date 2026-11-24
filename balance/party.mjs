// The best perfect party of a level: node balance/party.mjs --level 7 [--secs 300] [--runs 2] [--meta exp3] [--mono]
//   [--keep] [--jobs N] [--out FILE] [--rng N]
// Looks for the party that gets through the level with the fruit never bitten against the healthiest bugs
// (sim/src/perfect.rs: a whole party at a time, a plant on any cell, the maze built and broken a cell at a time; a party
// counts on a rung of health when it is clean on five seeds of the game there and on every rung below, from ×0.75 up). It starts from
// the party kept (balance/perfect/L<n>.json) and from the parties of the smart bot and of the expert, --runs times over
// with another draw of the search each time: runs that end on the same rung say the search found what there is to find,
// runs apart say it did not, and how far. The best of them is then measured as every party is (balance/scan.mjs: a grid
// of health, eight seeds — three of them the search never saw — the margin the last rung before the first failure), with
// the margins of a plain win and of three stars beside it. --mono: the best party of one plant alone, every plant of the
// level in turn (a fifth of the time each). --keep: it is kept in balance/perfect/ if it holds more than the one there.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { LEVELS } from '../public/data.js';
import { exportData } from '../sim/js/export.mjs';
import { build } from '../sim/js/play.mjs';
import { resolve } from './scenario.mjs';
import { EXPERT } from './plans.mjs';
import { scan, search, TARGET, SEEDS } from './scan.mjs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const level = Number(opt('--level', 4)) - 1, SECS = Number(opt('--secs', 300)), RUNS = Number(opt('--runs', 2)), META = opt('--meta', 'exp3');
const how = { bin: build(), ...(opt('--jobs') ? { jobs: Number(opt('--jobs')) } : {}) }, data = exportData();
const SMART = { route: 1, place: 'best', upgrades: 'greedy', terrain: true, powers: true, early: true };
const base = resolve({ level, opts: { ...SMART, meta: META } }), bots = [base, ...(EXPERT ? [{ ...base, policy: EXPERT }] : [])];
const FILE = new URL(`./perfect/L${level + 1}.json`, import.meta.url), kept = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : null;
const log = (s) => process.stderr.write(s + '\n'), pc = (x) => `×${x.toFixed(2)}`;
// a party as scan and the tests play it
const party = (plan, kind = null) => ({ level, opts: { ...base, plan, ...(kind ? { plants: [kind] } : {}) } });
const measure = (plan, kind) => { const t = [party(plan, kind)]; return { clean: scan(t, { data, ...how, quiet: true })[0], stars: scan(t, { data, what: 'stars', ...how, quiet: true })[0], won: scan(t, { data, what: 'won', to: 24, ...how, quiet: true })[0] }; };

log(`L${level + 1} ${LEVELS[level].name}: the best perfect party, ${RUNS} runs of ${SECS} s, the perks ${META}`);
const runs = [];
for (let n = 1; n <= RUNS; n++) { log(` run ${n}`); runs.push(search({ level, opts: base, plans: kept?.plan ? [kept.plan] : [], bots, secs: SECS, rng: n + Number(opt('--rng', 0)), data }, how)); }
const best = runs.reduce((a, b) => (b.margin > a.margin ? b : a)), m = measure(best.plan);
let one = null;
if (args.includes('--mono')) {
  for (const kind of LEVELS[level].plants) { log(` ${kind} alone`);
    const r = search({ level, opts: base, plans: kept?.mono?.kind === kind ? [kept.mono.plan] : [], bots, secs: Math.max(20, SECS / 5), only: kind, rng: 1, data }, how);
    const mm = scan([party(r.plan, kind)], { data, ...how, quiet: true })[0];
    if (!one || mm.margin > one.margin) one = { kind, plan: r.plan, margin: mm.margin, grid: mm.grid }; }
}
const grid = (g) => g.grid.map(([, h, n]) => `${h.toFixed(2)}:${n}`).join(' ');
console.log(`L${level + 1} ${LEVELS[level].name} (hp ${LEVELS[level].hp}, the perks ${META})`);
console.log(`  the runs ended on ${runs.map((r) => pc(r.margin)).join(', ')} (${runs.map((r) => r.tried).join(', ')} parties tried)${Math.max(...runs.map((r) => r.margin)) / Math.min(...runs.map((r) => r.margin)) <= 1.06 ? ': they agree' : ': THEY DO NOT AGREE — the search has not settled'}`);
console.log(`  the best, on ${SEEDS.length} seeds: the fruit whole against bugs ${pc(m.clean.margin)}; three stars ${pc(m.stars.margin)}; won ${pc(m.won.margin)}${m.won.open ? '+' : ''}`);
console.log(`    health:seeds clean  ${grid(m.clean)}`);
if (kept?.plan) { const k = scan([party(kept.plan)], { data, ...how, quiet: true })[0]; console.log(`  the party kept before: ${pc(k.margin)}`); }
if (one) console.log(`  one plant alone: ${one.kind} ${pc(one.margin)} — ${Math.round(one.margin / m.clean.margin * 100)}% of the best`);
const hp = m.clean.margin > 0 ? Math.round(LEVELS[level].hp * m.clean.margin / TARGET * 100) / 100 : null;
console.log(`  for a garden of ${Math.round(100 / TARGET)}% of its strength to be the least that keeps the fruit whole: L${level + 1}.hp ${LEVELS[level].hp} → ${hp}`);
const res = { level: level + 1, meta: META, secs: SECS, runs: runs.map((r) => ({ margin: r.margin, tried: r.tried, parties: r.parties, history: r.history })), plan: best.plan, clean: m.clean, stars: m.stars.margin, won: m.won.margin, mono: one, hp: { now: LEVELS[level].hp, suggested: hp } };
if (opt('--out')) { mkdirSync(dirname(opt('--out')), { recursive: true }); writeFileSync(opt('--out'), JSON.stringify(res)); }
if (args.includes('--keep')) {
  const was = kept?.plan ? scan([party(kept.plan)], { data, ...how, quiet: true })[0].margin : -1, mono = one && (!kept?.mono || one.margin >= scan([party(kept.mono.plan, kept.mono.kind)], { data, ...how, quiet: true })[0].margin) ? { kind: one.kind, plan: one.plan } : kept?.mono ?? null;
  writeFileSync(FILE, JSON.stringify({ level: level + 1, plan: m.clean.margin >= was ? best.plan : kept.plan, mono }) + '\n');
  console.log(`  kept: ${m.clean.margin >= was ? 'the new party' : 'the old one (it holds more)'}`);
}
