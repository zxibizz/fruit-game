// What the strategy of balance/strategy.json is made of: node balance/explain.mjs [--file F] [--seeds 7,8] [--waves 0,1,2] [--out F] [--brief]
// The weights it puts on what it sees, kind by kind; the maze it builds on every level against the smart bot's; and
// what each thing it sees is worth: the margin (how much healthier the bugs may be before it stops winning, to four
// times) of the whole strategy, of the strategy with one thing it sees taken away (that weight set to nothing for
// every kind), with the smart bot's maze, with the bot's growing, of the smart bot itself and of the designer's
// gardens. The margins are the median over the seeds and the draws of the waves (0: the draw of data.js). Writes it all as JSON to --out (default ~/tmp/balance/strategy/explain.json).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir, setPriority } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEVELS } from '../public/data.js';
import { play } from '../sim/js/play.mjs';
import { resolve, applyOverrides } from './scenario.mjs';
import { exportData } from '../sim/js/export.mjs';
import { margins } from './margin.mjs';
import { FEATURES, MAZE, KINDS, SMART, vectorOf, policyOf } from './strategy.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const file = opt('--file', join(here, 'strategy.json')), seeds = opt('--seeds', '7,8').split(',').map(Number), waves = opt('--waves', '0,1,2').split(',').map(Number);
const datas = {}; for (const w of [...waves].sort((a, b) => a - b)) { if (w) applyOverrides({}, w); datas[w] = exportData(); }
const out = opt('--out', join(homedir(), 'tmp', 'balance', 'strategy', 'explain.json')); mkdirSync(dirname(out), { recursive: true });
try { setPriority(19); } catch { /* as it is */ }
const S = JSON.parse(readFileSync(file, 'utf8')), x = vectorOf(S.policy), NP = KINDS.length * FEATURES.length;
const levels = LEVELS.map((_, n) => n), pct = (v) => (v == null ? '-' : `${Math.round(v * 100)}`);
const med = (a) => { const s = [...a].sort((p, q) => p - q); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

// the weights, kind by kind (exp of a weight is how many times more a step is worth for that much of what it sees)
console.log(`weights of ${file}\n${'kind'.padEnd(10)}${FEATURES.map((f) => f.slice(0, 9).padStart(10)).join('')}${'grow'.padStart(8)}`);
for (const k of KINDS) console.log(`${k.padEnd(10)}${S.policy.place[k].map((w) => w.toFixed(2).padStart(10)).join('')}${S.policy.up[k].toFixed(2).padStart(8)}`);
console.log(`maze: ${MAZE.map((m, i) => `${m} ${S.policy.maze[i].toFixed(2)}`).join(', ')}`);

// the variants: the strategy, each thing it sees taken away, the bot's maze, the bot's growing, the bot
const variant = (name, y) => ({ name, policy: policyOf(y) });
const off = (cols) => x.map((w, i) => (i < NP && cols.includes(i % FEATURES.length) ? 0 : w));
const brief = args.includes('--brief'); // the strategy, the smart bot and the designer only
const vs = [variant('the strategy', x),
  ...(brief ? [] : FEATURES).map((f, c) => variant(`without "${f}"`, off([c]))),
  ...(brief ? [] : [variant('with the smart bot\'s maze', x.map((w, i) => (i >= x.length - MAZE.length ? (i === x.length - 1 ? 1 : 0) : w))),
  variant('with the smart bot\'s growing', x.map((w, i) => (i >= NP && i < NP + KINDS.length ? 0 : w)))]),
  { name: 'the smart bot', policy: null }];
// and the gardens of the designer (balance/design.mjs), where there are any: a plan laid out for one map
const designs = Object.fromEntries(levels.map((n) => [n, join(homedir(), 'tmp', 'balance', 'designs', `L${n + 1}.json`)]).filter(([, f]) => existsSync(f)).map(([n, f]) => [n, JSON.parse(readFileSync(f, 'utf8'))]));
if (Object.keys(designs).length) vs.push({ name: 'the designer\'s garden', design: true });
const draws = waves.flatMap((w) => seeds.map((seed) => ({ w, seed })));
const items = vs.flatMap((v, a) => levels.filter((n) => !v.design || designs[n]).flatMap((n) => draws.map(({ w, seed }) => ({ v: a, level: n, task: { level: n, w, opts: { ...resolve({ level: n, opts: SMART }), seed, ...(v.policy ? { policy: v.policy } : {}), ...(v.design ? { plan: designs[n].plan, ...(designs[n].start === 'expert' ? { policy: S.policy } : {}) } : {}) } } }))));
const run = (ts) => { const r = Array(ts.length).fill(null);
  for (const w of new Set(ts.map((t) => t.w || 0))) { const ks = ts.map((t, k) => ((t.w || 0) === w ? k : -1)).filter((k) => k >= 0);
    play(ks.map((k) => ({ level: ts[k].level, opts: ts[k].opts })), { jobs: 2, data: datas[w] ?? datas[0] }).forEach((x, i) => { r[ks[i]] = x.err ? null : x.res; }); }
  return r; };
const at1 = run(items.map((i) => i.task));
const ms = await margins(items.map((i, k) => ({ task: i.task, won: at1[k]?.won })), async (ts) => run(ts), { hi: 4 });
const all = (a, n) => items.map((it, k) => [it, ms[k]]).filter(([it]) => it.v === a && it.level === n).map(([, m]) => m?.at ?? 0);
const table = vs.map((v, a) => ({ name: v.name, levels: levels.map((n) => { const xs = all(a, n); return xs.length ? med(xs) : null; }), each: levels.map((n) => all(a, n)),
  trail: levels.map((n) => at1[items.findIndex((it) => it.v === a && it.level === n)]?.trail) }));
console.log(`\nmargin, % of the bugs' health (the median over seeds ${seeds.join(', ')} and draws of the waves ${waves.join(', ')}; the spread is in the JSON)\n${''.padEnd(30)}${levels.map((n) => `L${n + 1}`.padStart(6)).join('')}${'mean'.padStart(7)}`);
const mean = (a) => a.reduce((t, v) => t + v, 0) / a.length;
for (const t of table) console.log(`${t.name.padEnd(30)}${t.levels.map((v) => pct(v).padStart(6)).join('')}${pct(t.levels.every((v) => v != null) ? mean(t.levels) : null).padStart(7)}`);
console.log(`\nthe trail (cells): strategy ${table[0].trail.join(' ')} | smart bot ${table.find((t) => t.name === 'the smart bot').trail.join(' ')}`);
writeFileSync(out, JSON.stringify({ file, seeds, weights: S.policy, table }, null, 1));
console.log(out);
