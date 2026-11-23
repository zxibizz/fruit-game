// The balance matrix: node balance/run.mjs [quick|full|routes] [--levels 1,5-7] [--set K=V,...] [--grid K=a|b|c;K2=x|y]
//   [--jobs N] [--out DIR] [--no-cache] [--margin]
// Runs every scenario of the plan for every variant of the data in parallel, caches results by the code and the
// scenario, prints the findings per variant and writes report.html and results.json to --out (default
// ~/tmp/balance/<time>). The parties are played by the native bot on the native simulation (sim/, built here by
// cargo): a batch per variant of the data, on --jobs threads.
//   --set  overrides for every variant: L5.dew=500, TUNE.hpGrowth=1.2, PLANTS.rose.b.ground=.3, FLY_SHARE=.2
//   --grid variants to compare: every combination of the listed values is one variant
//   --margin for the smart bot, the lazy gardens and the routes, how much healthier the bugs may be before each stops
//          winning (margin.mjs; seven more parties for each; always on in the routes plan; some three minutes for
//          all the levels from scratch, the levels not touched since come from the cache)
import { Worker } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { availableParallelism, homedir, setPriority } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as DATA from '../public/data.js';
const { LEVELS } = DATA;
import { plan } from './plans.mjs';
import { check, ROUTE, marginTable } from './rules.mjs';
import { waveLint } from './lint.mjs';
import { applyOverrides } from './scenario.mjs';
import { html } from './report.mjs';
import { routes as mazesOf } from '../sim/js/play.mjs';
import { strip } from './routes.mjs';
import { margins, show } from './margin.mjs';
const MARGIN = ['smart', 'expert', 'lazy', 'route', 'player']; // the groups whose margin is looked for

const here = dirname(fileURLToPath(import.meta.url)), root = join(here, '..');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const VALUED = new Set(['--levels', '--set', '--grid', '--jobs', '--out']); // flags that take a value
const kind = args.find((a, k) => !a.startsWith('--') && !VALUED.has(args[k - 1])) || 'quick';
const range = (s) => s.split(',').flatMap((p) => { const [a, b] = p.split('-').map(Number); return b ? Array.from({ length: b - a + 1 }, (_, k) => a + k) : [a]; });
const levels = (opt('--levels') ? range(opt('--levels')) : LEVELS.map((_, n) => n + 1)).map((n) => n - 1);
const num = (v) => (v === 'true' ? true : v === 'false' ? false : Number.isNaN(Number(v)) ? v : Number(v));
const parseSet = (s) => Object.fromEntries((s || '').split(',').filter(Boolean).map((kv) => { const [k, v] = kv.split('='); return [k.trim(), num(v.trim())]; }));
const base = parseSet(opt('--set'));
let variants = [{}];
for (const axis of (opt('--grid') || '').split(';').filter(Boolean)) { const [k, vs] = axis.split('='); variants = variants.flatMap((v) => vs.split('|').map((x) => ({ ...v, [k.trim()]: num(x.trim()) }))); }
variants = variants.map((v) => ({ ...base, ...v }));
// Half the cores by default and at the lowest priority: claude-vm shares one power-capped host (pve3) whose fan
// roars when all its threads run flat out for long (2026-11-21); --jobs N for more when that does not matter.
const jobs = Number(opt('--jobs', Math.max(1, Math.floor(availableParallelism() / 2)))), useCache = !args.includes('--no-cache');
try { setPriority(19); } catch { /* not allowed: run as is */ } // workers started after this inherit it
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-'), out = opt('--out', join(homedir(), 'tmp', 'balance', stamp));
const cacheDir = join(homedir(), 'tmp', 'balance-cache'); mkdirSync(cacheDir, { recursive: true }); mkdirSync(out, { recursive: true });
const RS = readdirSync(join(root, 'sim', 'src')).sort().map((f) => `sim/src/${f}`);
execFileSync('cargo', ['build', '--release', '--quiet'], { cwd: join(root, 'sim'), stdio: 'inherit' });
const JS = ['public/data.js', 'balance/scenario.mjs', 'balance/native.mjs', 'sim/js/export.mjs', 'sim/js/play.mjs', ...(existsSync(join(root, 'balance', 'trust.json')) ? ['balance/trust.json'] : [])];
const code = createHash('sha1'); for (const f of [...JS, ...RS]) code.update(readFileSync(join(root, f))); const codeHash = code.digest('hex');
// the workers run a snapshot of the code taken now: edits made while the plan runs must not mix into its results
const snap = join(cacheDir, 'code', codeHash), bin = join(snap, 'fruit-sim');
if (!existsSync(bin)) { for (const f of JS) cpSync(join(root, f), join(snap, f)); cpSync(join(root, 'sim', 'target', 'release', 'fruit-sim'), bin); }

// the mazes of the route group (the trail by its length and its shape): the same for every variant of the data
const mazes = kind === 'quick' ? [] : mazesOf(levels, { bin });
const tasks = variants.flatMap((set, vi) => plan(kind, levels, mazes).map((sc) => ({ ...sc, set, vi })));
// A result depends on the code of the simulation and the bot, the shared data (plants, bugs, perks, constants, the wave
// builder) and its own level only: tuning one level reruns that level alone.
const logic = createHash('sha1'); for (const f of [...JS.filter((x) => x !== 'public/data.js'), ...RS]) logic.update(readFileSync(join(root, f)));
logic.update(JSON.stringify(Object.fromEntries(Object.entries(DATA).filter(([k]) => k !== 'LEVELS'))) + DATA.makeWaves.toString()); const logicHash = logic.digest('hex');
const levelHash = LEVELS.map((L) => createHash('sha1').update(JSON.stringify(L)).digest('hex'));
const setFor = (set, n) => Object.fromEntries(Object.entries(set).filter(([k]) => !/^L\d+\./.test(k) || k.startsWith(`L${n + 1}.`))); // another level's override changes nothing here
const keyOf = (t) => createHash('sha1').update(logicHash + levelHash[t.level] + JSON.stringify({ l: t.level, o: t.opts, w: t.waveSeed ?? null, s: setFor(t.set, t.level) })).digest('hex');
let done = 0, cached = 0, total = tasks.length, lost = 0; const t0 = Date.now();
const tick = () => process.stderr.write(`\r${done}/${total} (${cached} cached) ${Math.round((Date.now() - t0) / 1000)}s   `);
const fileOf = (t) => join(cacheDir, keyOf(t) + '.json');
const work = (file, workerData) => new Promise((res) => {
  const w = new Worker(join(snap, 'balance', file), { workerData });
  w.once('message', res); w.once('error', (e) => res({ ok: false, err: String(e) }));
});
// plays the tasks that are not in the cache: one batch per variant of the data and draw of the waves, the binary
// plays a batch on `jobs` threads. Gives what came of each, in their order (null: no result).
async function playAll(ts) {
  const res = ts.map(() => null), groups = new Map();
  ts.forEach((t, k) => {
    if (useCache && existsSync(fileOf(t))) { res[k] = JSON.parse(readFileSync(fileOf(t), 'utf8')); cached++; done++; return; }
    const g = JSON.stringify([t.set, t.waveSeed ?? null]); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(k);
  });
  for (const ks of groups.values()) {
    const list = ks.map((k) => ts[k]), m = await work('native.mjs', { bin, jobs, tasks: list });
    if (!m.ok) console.error(`\n${list.length} scenarios lost (${JSON.stringify(list[0].set)}, waves ${list[0].waveSeed ?? '-'}): ${m.err}`);
    list.forEach((t, i) => { const x = m.ok ? m.out[i] : null; if (x?.err) console.error(`\n${t.name} L${t.level + 1}: ${x.err}`);
      done++; if (x?.res) { writeFileSync(fileOf(t), JSON.stringify(x.res)); res[ks[i]] = x.res; } else lost++; });
    tick();
  }
  tick(); return res;
}
const played = await playAll(tasks);
const results = tasks.map((t, k) => played[k] && { ...t, at: k, res: played[k] }).filter(Boolean);
process.stderr.write('\n');
// the margins (margin.mjs): how much healthier the bugs may be before a scenario stops winning — for the groups the
// balance is read from. Some seven more parties for each, so only in the routes plan or when asked (--margin).
if (kind === 'routes' || args.includes('--margin')) {
  const items = results.filter((r) => MARGIN.includes(r.group));
  done = 0; cached = 0; total = 0; const ms = await margins(items.map((r) => ({ task: tasks[r.at], won: r.res.won })), (ts) => { total += ts.length; return playAll(ts); });
  items.forEach((r, k) => { r.margin = ms[k]; });
  process.stderr.write('\n');
}

const label = (v) => (Object.keys(v).length ? Object.entries(v).map(([k, x]) => `${k}=${x}`).join(', ') : 'as in data.js');
const report = variants.map((set, vi) => {
  const rs = results.filter((r) => r.vi === vi).sort((a, b) => a.at - b.at); // in the order of the plan
  return { label: label(set), set, results: rs, findings: check(rs), margins: marginTable(rs) };
});
// the lint of the waves as the first variant has them
applyOverrides(variants[0]);
const lint = waveLint(LEVELS).filter((x) => levels.includes(x.level - 1));
// the mazes drawn, each under its name, its length and what came of it (in the first variant)
const routes = mazes.map((L) => ({ level: L.level, base: L.base, max: L.max, text: ROUTE.slice(1).map((c) => L.routes.filter((r) => r.class === c)).filter((list) => list.length)
  .map((list) => strip(L.level, list, (r) => { const x = report[0].results.find((q) => q.level === L.level && q.name === `route ${r.name}`); return `${r.name} ${r.len}${x ? (x.margin ? ` ${show(x.margin)}` : x.res.won ? ` W${x.res.hp}` : ` l${x.res.wave}`) : ''}`; })).join('\n\n') }));
writeFileSync(join(out, 'results.json'), JSON.stringify({ kind, levels, variants: report.map(({ label: l, set, results: r, findings, margins }) => ({ label: l, set, findings, margins, results: r.map(({ level, name, group, opts, waveSeed, cls, who, shape, len, margin, res }) => ({ level, name, group, opts, waveSeed, cls, who, shape, len, margin, res })) })), mazes, lint }, null, 1));
writeFileSync(join(out, 'report.html'), html({ title: `Fruit Defense balance — ${kind}, levels ${levels.map((n) => n + 1).join(',')}`, variants: report, lint, routes }));
for (const v of report) {
  const f = v.findings, c = (s) => f.filter((x) => x.severity === s).length;
  console.log(`\n== ${v.label}: ${c('fail')} fail, ${c('warn')} warn, ${c('info')} info`);
  for (const n of levels) {
    const rs = v.results.filter((r) => r.level === n), sm = rs.filter((r) => r.group === 'smart'), ex = rs.filter((r) => r.group === 'exploit');
    const s = (r) => (r.margin ? show(r.margin) : r.res.won ? `W${r.res.hp}` : `l${r.res.wave}`);
    const xp = rs.filter((r) => r.group === 'expert');
    console.log(`L${n + 1}  smart ${sm.map(s).join(' ')}${xp.length ? `  | expert ${xp.map(s).join(' ')}` : ''}${ex.length ? `  | exploit best ${s(ex.sort((a, b) => b.res.score - a.res.score)[0])}  | lazy ${rs.filter((r) => r.group === 'lazy').map(s).join(' ')}` : ''}`);
    const pl = rs.filter((r) => r.group === 'player'); if (pl.length) console.log(`    players  ${[...new Set(pl.map((r) => r.who))].map((w) => `${w}: ${pl.filter((r) => r.who === w).map((r) => `${r.res.won ? `W${r.res.hp}` : `l${r.res.wave}`}${r.margin ? ` ${show(r.margin)}` : ''}`).join(', ')}`).join('  | ')}`);
    // the trail by its length (cells), every shape of it
    const rt = rs.filter((r) => r.group === 'route'); if (rt.length) console.log(`    route  ${ROUTE.filter((c) => rt.some((r) => r.cls === c)).map((c) => { const xs = rt.filter((r) => r.cls === c), ls = xs.map((r) => r.len); return `${c} ${Math.min(...ls)}${Math.max(...ls) > Math.min(...ls) ? `–${Math.max(...ls)}` : ''}: ${xs.map(s).join(' ')}`; }).join('  | ')}`);
  }
  for (const x of f) if (x.severity !== 'info') console.log(`  ${x.severity} L${x.level} ${x.rule}: ${x.text}`);
  // the margins: the health of the bugs each holds, in percent of what it is now
  if (v.margins.length) { const pc = (x) => (x == null ? '-' : `${Math.round(x * 100)}`), cell = (x) => (x ? `${pc(x.m)}${x.n > 1 ? ` (${pc(x.lo)}–${pc(x.hi)})` : ''}` : '-').padEnd(14);
    console.log(`\n  margin, % of the bugs' health   lazy   novice ordin. smart  expert ${ROUTE.map((c) => c.padEnd(14)).join('')}   (lazy: the best lazy garden with the perks of its time; novice, ordinary: the players of plans.mjs, the median over their mazes; smart: the smart bot; expert: the strategy of balance/strategy.json; both the median over seeds and draws of the waves; the trail by its length: the median over its shapes, the least–the most)`);
    for (const m of v.margins) console.log(`  L${m.level}`.padEnd(32) + `${pc(m.lazy).padEnd(7)}${pc(m.novice).padEnd(7)}${pc(m.ordinary).padEnd(7)}${pc(m.smart).padEnd(7)}${pc(m.expert).padEnd(7)}${ROUTE.map((c) => cell(m.route[c])).join('')}`); }
}
if (lint.length) console.log('\nwave lint:\n' + lint.map((x) => `  ${x.severity} L${x.level} w${x.wave}: ${x.issue}`).join('\n'));
console.log(`\n${out}/report.html`);
// scenarios with no result are not in the findings above: a matrix with holes in it is not a clean one
if (lost) { console.error(`\n${lost} of ${tasks.length} scenarios gave no result: the findings above are not the whole picture`); process.exitCode = 1; }
