// The perfect party of every level: how far the kept parties hold with the fruit never bitten.
//   node balance/perfect.mjs [--levels 1-12] [--metas none,exp2,exp3,full] [--for exp3] [--hp FILE] [--quick]
// The levels are tuned so that the best party known holds bugs 1/0.7 = 1.43 times healthier with the fruit whole: a
// garden of 70% of its strength is the least that gets a level through clean, and a garden of one plant alone must not
// do it. The best party of every level and its best party of one plant are kept as plans in balance/perfect/L<n>.json
// (balance/party.mjs --keep finds and keeps them). This plays them on the game as it is now and prints their margins
// as balance/scan.mjs measures them (a grid of health in steps of 5%, five seeds of the game, the last rung before the
// first failure): with the perks of a player who took no stars, two a level before this one, three (what the levels
// are tuned for, --for: a player of perfect parties has three) and every perk; the margins of three stars and of a
// plain win of the same party; the two bots; the one plant against the best; and the health of the level's bugs (hp) at
// which the best of the party and the bots holds the target (--hp FILE: written there, level → hp). --quick: the
// perks of --for only.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { LEVELS } from '../public/data.js';
import { exportData } from '../sim/js/export.mjs';
import { build } from '../sim/js/play.mjs';
import { resolve } from './scenario.mjs';
import { EXPERT } from './plans.mjs';
import { scan, SEEDS, TARGET, targetOf } from './scan.mjs';

export { SEEDS, TARGET };
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const DIR = new URL('./perfect/', import.meta.url);
const ranges = (s) => s.split(',').flatMap((p) => { const [a, b] = p.split('-').map(Number); return Array.from({ length: (b || a) - a + 1 }, (_, k) => a + k - 1); });
const SMART = { route: 1, place: 'best', upgrades: 'greedy', terrain: true, powers: true, early: true };
export const clean = (r) => r.won && Object.keys(r.bites).length === 0;
export const kept = (n) => (existsSync(new URL(`L${n + 1}.json`, DIR)) ? JSON.parse(readFileSync(new URL(`L${n + 1}.json`, DIR), 'utf8')) : null);
// the options of a kept plan's party with the perks `meta`
export const partyOf = (n, k, meta, one = false) => ({ ...resolve({ level: n, opts: { ...SMART, meta } }), plan: one ? k.mono.plan : k.plan, ...(one ? { plants: [k.mono.kind] } : {}) });

if (import.meta.url === `file://${process.argv[1]}`) {
  const FOR = opt('--for', 'exp3'), METAS = args.includes('--quick') ? [FOR] : opt('--metas', 'none,exp2,exp3,full').split(','), levels = ranges(opt('--levels', `1-${LEVELS.length}`));
  const how = { bin: build(), data: exportData() }, clean5 = [], other = [];
  for (const n of levels) { const k = kept(n); if (!k) continue;
    for (const m of new Set([...METAS, FOR])) clean5.push({ n, who: m, level: n, opts: partyOf(n, k, m) });
    if (k.mono) clean5.push({ n, who: 'one', level: n, opts: partyOf(n, k, FOR, true) });
    const bot = resolve({ level: n, opts: { ...SMART, meta: FOR } }); clean5.push({ n, who: 'smart', level: n, opts: bot }); if (EXPERT) clean5.push({ n, who: 'expert', level: n, opts: { ...bot, policy: EXPERT } });
    other.push({ n, level: n, opts: partyOf(n, k, FOR) }); }
  const cs = scan(clean5, how), stars = scan(other, { ...how, what: 'stars' }), won = scan(other, { ...how, what: 'won', to: 24 });
  const pc = (x) => (x == null ? '-' : Math.round(x * 100) + '%').padStart(7), hps = {};
  console.log(`the perfect party (the fruit never bitten): bugs how many times healthier the kept party holds, on ${SEEDS.length} seeds; target ${Math.round(TARGET * 100)}% with the perks ${FOR} (three stars, a win, the bots and the one plant: with them too)`);
  console.log('level'.padEnd(22) + 'hp'.padStart(5) + METAS.map((m) => m.padStart(7)).join('') + '  stars    won expert  smart  hp for the target   one plant (of the best)');
  for (const n of levels) { const of = (who) => { const q = clean5.findIndex((t) => t.n === n && t.who === who); return q < 0 ? null : cs[q].margin; }; if (of(FOR) == null) continue;
    const k = kept(n), one = of('one'), ref = Math.max(of(FOR), of('expert') ?? 0, of('smart') ?? 0), hp = Math.round(LEVELS[n].hp * ref / targetOf(n) * 100) / 100, q = other.findIndex((t) => t.n === n); hps[n + 1] = hp;
    console.log(`${String(n + 1).padStart(2)} ${LEVELS[n].name.padEnd(19)}${String(LEVELS[n].hp).padStart(5)}${METAS.map((m) => pc(of(m))).join('')}${pc(stars[q].margin)}${pc(won[q].margin)}${pc(of('expert'))}${pc(of('smart'))}${String(hp).padStart(10)}          ${one == null ? '-' : `${k.mono.kind} ${pc(one).trim()} (${Math.round(one / ref * 100)}%)${one / ref >= 1 / targetOf(n) ? '  ONE PLANT IS ENOUGH' : ''}`}`); }
  if (opt('--hp')) writeFileSync(opt('--hp'), JSON.stringify(hps));
}
