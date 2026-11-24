// The best parties kept: node balance/keep.mjs DIR [--levels 1-12]
// Takes the results of balance/campaign.mjs --clean in DIR (c<n>.json) and keeps, for every level, the party that holds
// the healthiest bugs with the fruit whole — of the one kept already (balance/perfect/L<n>.json) and the campaign's
// (its start and what it made of it) — and the same for the party of one plant alone. Measured as the levels are
// tuned: the game's own waves, both seeds, the perks of three stars a level.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { LEVELS } from '../public/data.js';
import { exportData } from '../sim/js/export.mjs';
import { play, build } from '../sim/js/play.mjs';
import { margins } from './margin.mjs';
import { kept, partyOf, clean, SEEDS } from './perfect.mjs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const dir = args[0], DIR = new URL('./perfect/', import.meta.url);
const ranges = (s) => s.split(',').flatMap((p) => { const [a, b] = p.split('-').map(Number); return Array.from({ length: (b || a) - a + 1 }, (_, k) => a + k - 1); });
const bin = build(), data = exportData(), tasks = [], cands = [];
for (const n of ranges(opt('--levels', `1-${LEVELS.length}`))) {
  const k = kept(n), f = `${dir}/c${n + 1}.json`, c = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
  const plans = [k?.plan, c?.plan, c?.seedPlan].filter(Boolean), monos = [k?.mono, c?.mono].filter(Boolean);
  plans.forEach((plan, q) => cands.push({ n, one: false, plan, from: k?.plan && q === 0 ? 'kept' : 'new' }));
  monos.forEach((mono, q) => cands.push({ n, one: true, mono, from: k?.mono && q === 0 ? 'kept' : 'new' }));
}
for (const [q, c] of cands.entries()) for (const seed of SEEDS) tasks.push({ q, n: c.n, opts: { ...partyOf(c.n, c.one ? { mono: c.mono } : { plan: c.plan }, opt('--for', 'exp3'), c.one), seed } });
const run = (ts) => play(ts.map((t) => ({ level: t.n, opts: t.opts })), { bin, data }).map((x) => { if (x.err) throw new Error(x.err); return { ...x.res, won: clean(x.res) }; });
const at1 = run(tasks), ms = await margins(tasks.map((task, k) => ({ task, won: at1[k].won })), async (ts) => run(ts), { lo: .25, hi: 4 });
cands.forEach((c, q) => { c.at = Math.min(...tasks.map((t, k) => (t.q === q ? ms[k].at : Infinity))); });
mkdirSync(DIR, { recursive: true });
for (const n of new Set(cands.map((c) => c.n))) {
  const top = (one) => cands.filter((c) => c.n === n && c.one === one).sort((a, b) => b.at - a.at)[0], p = top(false), m = top(true);
  if (!p) continue;
  writeFileSync(new URL(`L${n + 1}.json`, DIR), JSON.stringify({ level: n + 1, plan: p.plan, mono: m?.mono ?? null }) + '\n');
  console.log(`L${n + 1} ${LEVELS[n].name}: the party kept holds ×${p.at.toFixed(2)} (${p.from})${m ? `, ${m.mono.kind} alone ×${m.at.toFixed(2)} (${m.from})` : ''}`);
}
