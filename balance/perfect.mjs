// The perfect party of every level: how far the kept plans hold with the fruit never bitten.
//   node balance/perfect.mjs [--levels 1-14] [--metas none,exp2,exp3,full] [--for exp3] [--keep DIR] [--hp FILE]
// The levels are tuned (balance/campaign.mjs --clean) so that the best party known holds bugs 1/0.7 = 1.43 times
// healthier clean: a garden of 70% of its strength is the least that gets a level through with the fruit whole, and a
// garden of one plant alone must not do it. The best party of every level and its best party of one plant are kept as
// plans in balance/perfect/L<n>.json (--keep DIR: take them from the campaigns' results there, c<n>.json). This plays
// them on the game as it is now, on the game's own waves, with the perks of a player who took no stars, two a level
// before this one, three (what the levels are tuned for, --for: a player of perfect parties has three), and every perk: the margin of each (bugs how many times
// healthier and still no bite), of the two bots, and of the one plant against the best of them; and the health of the
// level's bugs (hp) at which the best of them holds the target exactly (--hp FILE: written there, level → hp).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { LEVELS } from '../public/data.js';
import { exportData } from '../sim/js/export.mjs';
import { play, build } from '../sim/js/play.mjs';
import { resolve } from './scenario.mjs';
import { margins } from './margin.mjs';
import { EXPERT } from './plans.mjs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const DIR = new URL('./perfect/', import.meta.url), keep = opt('--keep');
const ranges = (s) => s.split(',').flatMap((p) => { const [a, b] = p.split('-').map(Number); return Array.from({ length: (b || a) - a + 1 }, (_, k) => a + k - 1); });
const levels = ranges(opt('--levels', `1-${LEVELS.length}`)), METAS = opt('--metas', 'none,exp2,exp3,full').split(','), FOR = opt('--for', 'exp3');
export const TARGET = 1 / 0.7, SEEDS = [7, 11]; // the seeds of the game a party has to be perfect on (where the flyers come from)
const SMART = { route: 1, place: 'best', upgrades: 'greedy', terrain: true, powers: true, early: true };
export const clean = (r) => r.won && Object.keys(r.bites).length === 0;
export const kept = (n) => (existsSync(new URL(`L${n + 1}.json`, DIR)) ? JSON.parse(readFileSync(new URL(`L${n + 1}.json`, DIR), 'utf8')) : null);
// the options of a kept plan's party with the perks `meta`
export const partyOf = (n, k, meta, one = false) => ({ ...resolve({ level: n, opts: { ...SMART, meta } }), plan: one ? k.mono.plan : k.plan, ...(one ? { plants: [k.mono.kind] } : {}) });

if (import.meta.url === `file://${process.argv[1]}`) {
  if (keep) { mkdirSync(DIR, { recursive: true });
    for (const n of levels) { const f = `${keep}/c${n + 1}.json`; if (!existsSync(f)) continue; const c = JSON.parse(readFileSync(f, 'utf8'));
      writeFileSync(new URL(`L${n + 1}.json`, DIR), JSON.stringify({ level: n + 1, plan: c.plan, mono: c.mono }) + '\n'); } }
  const bin = build(), data = exportData(), tasks = [];
  const tasks1 = tasks; { const tasks = { push: (t) => SEEDS.forEach((seed) => tasks1.push({ ...t, seed, opts: { ...t.opts, seed } })) };
  for (const n of levels) { const k = kept(n); if (!k) continue; for (const m of METAS) tasks.push({ n, who: m, opts: partyOf(n, k, m) }); if (k.mono) tasks.push({ n, who: 'one', opts: partyOf(n, k, FOR, true) }); if (!METAS.includes(FOR)) tasks.push({ n, who: FOR, opts: partyOf(n, k, FOR) });
    // the bots themselves, with the same perks: where one of them does better than the kept plan, it is the best party known
    const bot = resolve({ level: n, opts: { ...SMART, meta: FOR } }); tasks.push({ n, who: 'smart', opts: bot }); if (EXPERT) tasks.push({ n, who: 'expert', opts: { ...bot, policy: EXPERT } }); } }
  const run = (ts) => play(ts.map((t) => ({ level: t.n, opts: t.opts })), { bin, data }).map((x) => { if (x.err) throw new Error(x.err); return { ...x.res, won: clean(x.res) }; });
  const at1 = run(tasks), ms = await margins(tasks.map((task, k) => ({ task, won: at1[k].won })), async (ts) => run(ts), { lo: .25, hi: 4 });
  const pc = (x) => (x == null ? '-' : Math.round(x * 100) + '%').padStart(7);
  console.log(`the perfect party (the fruit never bitten): bugs how many times healthier the kept plan holds; target ${Math.round(TARGET * 100)}% with the perks ${FOR} (the bots and the one plant play with them)`);
  console.log('level'.padEnd(22) + 'hp'.padStart(5) + METAS.map((m) => m.padStart(7)).join('') + ' expert  smart  hp for the target   one plant (of the best)');
  const hps = {};
  for (const n of levels) { const of = (who) => { const ks = tasks.map((t, k) => (t.n === n && t.who === who ? k : -1)).filter((k) => k >= 0); return ks.length ? Math.min(...ks.map((k) => ms[k].at)) : null; }; if (of(METAS[0]) == null) continue;
    const k = kept(n), one = of('one'), ref = Math.max(of(FOR), of('expert') ?? 0, of('smart') ?? 0), hp = Math.round(LEVELS[n].hp * ref / TARGET * 100) / 100; hps[n + 1] = hp;
    console.log(`${String(n + 1).padStart(2)} ${LEVELS[n].name.padEnd(19)}${String(LEVELS[n].hp).padStart(5)}${METAS.map((m) => pc(of(m))).join('')}${pc(of('expert'))}${pc(of('smart'))}${String(hp).padStart(10)}          ${one == null ? '-' : `${k.mono.kind} ${pc(one).trim()} (${Math.round(one / ref * 100)}%)${one / ref >= 1 / TARGET ? '  ONE PLANT IS ENOUGH' : ''}`}`); }
  if (opt('--hp')) writeFileSync(opt('--hp'), JSON.stringify(hps));
}
