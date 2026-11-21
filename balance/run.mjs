// The balance matrix: node balance/run.mjs [quick|full] [--levels 1,5-7] [--set K=V,...] [--grid K=a|b|c;K2=x|y]
//   [--jobs N] [--out DIR] [--no-cache]
// Runs every scenario of the plan for every variant of the data in parallel, caches results by the code and the
// scenario, prints the findings per variant and writes report.html and results.json to --out (default
// ~/tmp/balance/<time>). The parties are played by the native bot on the native simulation (sim/, built here by
// cargo): a batch per variant of the data, on --jobs threads.
//   --set  overrides for every variant: L5.dew=500, TUNE.hpGrowth=1.2, PLANTS.dandelion.ground=.3, FLY_SHARE=.2
//   --grid variants to compare: every combination of the listed values is one variant
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
import { check } from './rules.mjs';
import { waveLint } from './lint.mjs';
import { applyOverrides } from './scenario.mjs';
import { html } from './report.mjs';

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
const JS = ['public/data.js', 'balance/scenario.mjs', 'balance/native.mjs', 'sim/js/export.mjs', 'sim/js/play.mjs'];
const code = createHash('sha1'); for (const f of [...JS, ...RS]) code.update(readFileSync(join(root, f))); const codeHash = code.digest('hex');
// the workers run a snapshot of the code taken now: edits made while the plan runs must not mix into its results
const snap = join(cacheDir, 'code', codeHash), bin = join(snap, 'fruit-sim');
if (!existsSync(bin)) { for (const f of JS) cpSync(join(root, f), join(snap, f)); cpSync(join(root, 'sim', 'target', 'release', 'fruit-sim'), bin); }

const tasks = variants.flatMap((set, vi) => plan(kind, levels).map((sc) => ({ ...sc, set, vi })));
// A result depends on the code of the simulation and the bot, the shared data (plants, bugs, perks, constants, the wave
// builder) and its own level only: tuning one level reruns that level alone.
const logic = createHash('sha1'); for (const f of ['balance/scenario.mjs', ...RS]) logic.update(readFileSync(join(root, f)));
logic.update(JSON.stringify(Object.fromEntries(Object.entries(DATA).filter(([k]) => k !== 'LEVELS'))) + DATA.makeWaves.toString()); const logicHash = logic.digest('hex');
const levelHash = LEVELS.map((L) => createHash('sha1').update(JSON.stringify(L)).digest('hex'));
const setFor = (set, n) => Object.fromEntries(Object.entries(set).filter(([k]) => !/^L\d+\./.test(k) || k.startsWith(`L${n + 1}.`))); // another level's override changes nothing here
const keyOf = (t) => createHash('sha1').update(logicHash + levelHash[t.level] + JSON.stringify({ l: t.level, o: t.opts, w: t.waveSeed ?? null, s: setFor(t.set, t.level) })).digest('hex');
let done = 0, cached = 0; const t0 = Date.now(), results = [];
const tick = () => process.stderr.write(`\r${done}/${tasks.length} (${cached} cached) ${Math.round((Date.now() - t0) / 1000)}s   `);
const fileOf = (t) => join(cacheDir, keyOf(t) + '.json');
const fresh = tasks.filter((t) => { if (!useCache || !existsSync(fileOf(t))) return true; cached++; done++; results.push({ ...t, at: tasks.indexOf(t), res: JSON.parse(readFileSync(fileOf(t), 'utf8')) }); return false; });
const keep = (t, r) => { done++; if (r) { writeFileSync(fileOf(t), JSON.stringify(r)); results.push({ ...t, at: tasks.indexOf(t), res: r }); } tick(); };
const work = (file, workerData) => new Promise((res) => {
  const w = new Worker(join(snap, 'balance', file), { workerData });
  w.once('message', res); w.once('error', (e) => res({ ok: false, err: String(e) }));
});
// one batch per variant of the data and draw of the waves; the binary plays a batch on `jobs` threads
const groups = new Map(); for (const t of fresh) { const k = JSON.stringify([t.set, t.waveSeed ?? null]); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); }
for (const list of groups.values()) {
  const m = await work('native.mjs', { bin, jobs, tasks: list });
  if (!m.ok) console.error(`\n${list.length} scenarios (${JSON.stringify(list[0].set)}, waves ${list[0].waveSeed ?? '-'}): ${m.err}`);
  list.forEach((t, k) => keep(t, m.ok ? m.res[k] : null));
}
tick();
process.stderr.write('\n');

const label = (v) => (Object.keys(v).length ? Object.entries(v).map(([k, x]) => `${k}=${x}`).join(', ') : 'as in data.js');
const report = variants.map((set, vi) => {
  const rs = results.filter((r) => r.vi === vi).sort((a, b) => a.at - b.at); // in the order of the plan
  return { label: label(set), set, results: rs, findings: check(rs) };
});
// the lint of the waves as the first variant has them
applyOverrides(variants[0]);
const lint = waveLint(LEVELS).filter((x) => levels.includes(x.level - 1));
writeFileSync(join(out, 'results.json'), JSON.stringify({ kind, levels, variants: report.map(({ label: l, set, results: r, findings }) => ({ label: l, set, findings, results: r.map(({ level, name, group, opts, waveSeed, res }) => ({ level, name, group, opts, waveSeed, res })) })), lint }, null, 1));
writeFileSync(join(out, 'report.html'), html({ title: `Fruit Defense balance — ${kind}, levels ${levels.map((n) => n + 1).join(',')}`, variants: report, lint }));
for (const v of report) {
  const f = v.findings, c = (s) => f.filter((x) => x.severity === s).length;
  console.log(`\n== ${v.label}: ${c('fail')} fail, ${c('warn')} warn, ${c('info')} info`);
  for (const n of levels) {
    const rs = v.results.filter((r) => r.level === n), sm = rs.filter((r) => r.group === 'smart'), ex = rs.filter((r) => r.group === 'exploit');
    const s = (r) => (r.res.won ? `W${r.res.hp}` : `l${r.res.wave}`);
    console.log(`L${n + 1}  smart ${sm.map(s).join(' ')}  | exploit best ${ex.length ? s(ex.sort((a, b) => b.res.score - a.res.score)[0]) : '-'}  | lazy ${rs.filter((r) => r.group === 'lazy').map(s).join(' ')}`);
  }
  for (const x of f) if (x.severity !== 'info') console.log(`  ${x.severity} L${x.level} ${x.rule}: ${x.text}`);
}
if (lint.length) console.log('\nwave lint:\n' + lint.map((x) => `  ${x.severity} L${x.level} w${x.wave}: ${x.issue}`).join('\n'));
console.log(`\n${out}/report.html`);
