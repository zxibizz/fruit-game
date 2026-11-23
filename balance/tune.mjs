// The tuner of the waves: node balance/tune.mjs [--levels 1-9] [--dry] [--target 1.1] [--iter 5] [--hp 1,1.4,2] [--jobs 2]
// For every level it measures, on the waves of the game (the draw of data.js) and three other draws of them (the
// seed of the game changes nothing for the bot, but the draw does: a tenth of a bug more in the budget, and so a bug
// more or less in some group, swung a margin by a third on one draw), the margins (each the median over the draws) — how much
// healthier the bugs may be before a player stops winning — of the players the levels are for (plans.mjs):
// the novice and the ordinary player on every maze of their length, the smart bot, the expert (balance/strategy.json)
// and the lazy gardens beside the untouched trail. Then (without --dry) it scales the level's budget — how many bugs
// every wave holds, the first wave and the growth together — until the ordinary player's margin (the median over its
// mazes) is the target, 1.1 by default: it wins with some fruit to spare, against bugs a tenth healthier it is on the
// edge. More bugs also bring more dew, so a step is checked by playing it, and the next step is taken from the two
// measured last (the secant). What the other players do at that budget is checked against what the levels are for:
// the novice loses, but in the last third of the waves; the expert takes three stars; every lazy garden loses.
// When the novice is out before the last third, the budget is tilted (a fifth less for the first wave, the growth
// such that the level holds as many bugs as before) and scaled to the target again; the tilt is kept when the
// novice lasts longer.
// Two knobs: the budget (how many bugs) and the level's hp (how healthy they are). For every hp of --hp the budget
// is scaled to the target (starting from as much health over the level as before: twice as healthy, half as many),
// and of all that is measured the one taken is where the maze pays most — the ordinary player furthest above the best
// lazy garden — among those that keep the hard rules on the game's own waves (the smart bot and the expert win, no
// lazy garden wins, the ordinary player wins on half its mazes or more) with the ordinary player at the target.
// Prints the budget and hp found for every level and what is off; the numbers go to data.js by hand.
// --at 2=9.4/4.7,2=9.2/4.6 measures those budgets as well (with --dry: only those), to look between steps.
import { setPriority } from 'node:os';
import { LEVELS, makeWaves } from '../public/data.js';
import { play, routes as mazesOf } from '../sim/js/play.mjs';
import { exportData } from '../sim/js/export.mjs';
import { applyOverrides, resolve } from './scenario.mjs';
import { margins, show } from './margin.mjs';
import { PLAYERS, EXPERT } from './plans.mjs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const range = (s) => s.split(',').flatMap((p) => { const [a, b] = p.split('-').map(Number); return b ? Array.from({ length: b - a + 1 }, (_, k) => a + k) : [a]; });
const levels = range(opt('--levels', `1-${LEVELS.length}`)).map((n) => n - 1), TARGET = Number(opt('--target', 1.1)), ITER = Number(opt('--iter', 5)), jobs = Number(opt('--jobs', 2));
const dry = args.includes('--dry'), TOL = .03; // the ordinary player's margin within 3% of the target is good enough: the noise of a level is more
try { setPriority(19); } catch { /* as it is */ }
const SMART = { route: 1, place: 'best', upgrades: 'greedy', meta: 'exp2', terrain: true, powers: true, early: true };
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
const r1 = (v) => Math.round(v * 10) / 10, pct = (v) => `${Math.round(v * 100)}%`;
// the draws of the waves a level is measured on, and data.js as it was (all the levels, the draw of data.js)
const DRAWS = [0, 1, 2, 3];
const reset = () => LEVELS.forEach((L, n) => { L.waves = makeWaves(L, 101 + n); });
const mazes = Object.fromEntries(mazesOf(levels).map((L) => [L.level, L]));

// the scenarios of a level: who, and the options the bot takes
function scenarios(n) {
  const out = [], add = (who, name, opts) => out.push({ who, name, opts: resolve({ level: n, opts }) });
  for (const [who, p] of Object.entries(PLAYERS)) for (const r of mazes[n].routes.filter((x) => x.class === p.cls && x.shape !== 'best')) add(who, r.name, { ...p.opts, maze: r.name });
  add('smart', 'smart', SMART);
  if (EXPERT) add('expert', 'expert', { ...SMART, policy: EXPERT });
  for (const place of ['best', 'end', 'start', 'spread']) add('lazy', `lazy ${place}`, { route: 0, meta: 'exp3', place });
  add('lazy2', 'lazy with the usual perks', { route: 0, meta: 'exp2' }); // the perks of the ordinary player: for comparison only
  return out;
}
// one level at one budget: what every scenario makes of the waves as they are, and its margin
async function measure(n, budget, hp = LEVELS[n].hp) {
  // the data of every draw at this budget (0: the draw of data.js)
  const datas = DRAWS.map((w) => { applyOverrides({ [`L${n + 1}.budget`]: `${budget[0]}/${budget[1]}`, [`L${n + 1}.hp`]: hp }, w || null); return exportData(); });
  reset();
  const scs = scenarios(n);
  const run = (ts) => { const r = Array(ts.length).fill(null);
    DRAWS.forEach((_, d) => { const ks = ts.map((t, k) => (t.d === d ? k : -1)).filter((k) => k >= 0); if (!ks.length) return;
      play(ks.map((k) => ({ level: n, opts: ts[k].opts })), { jobs, data: datas[d] }).forEach((x, i) => { r[ks[i]] = x.err ? null : x.res; }); });
    return r; };
  // every scenario on every draw; its margin the median over the draws, its party the one of the game's own draw
  const SEEDS = DRAWS, all = scs.flatMap((s) => DRAWS.map((_, d) => ({ ...s, d })));
  const at1 = run(all), ms = await margins(all.map((s, k) => ({ task: s, won: at1[k]?.won })), async (ts) => run(ts), { hi: 4 });
  const of = (who) => scs.map((s, k) => { const xs = SEEDS.map((_, q) => ms[k * SEEDS.length + q]).sort((a, b) => (a?.at ?? 0) - (b?.at ?? 0));
    const rs = SEEDS.map((_, q) => at1[k * SEEDS.length + q]);
    return { ...s, res: rs[0], all: rs, m: { ...xs[Math.floor(xs.length / 2)], at: med(xs.map((x) => x?.at ?? 0)) } }; }).filter((s) => s.who === who);
  const L = LEVELS[n], stars = (r) => (!r?.won ? 0 : r.hp >= r.maxHp * .8 ? 3 : r.hp >= r.maxHp * .4 ? 2 : 1);
  const o = of('ordinary'), nv = of('novice'), lz = of('lazy'), sm = of('smart')[0], xp = of('expert')[0];
  const real = (list) => list.map((s) => s.all[0]);
  return { budget, hp, realSmart: !!sm.all[0]?.won, realExpert: !xp || !!xp.all[0]?.won, realLazy: real([...lz, ...of('lazy2')]).some((r) => r?.won), realOrd: real(o).filter((r) => r?.won).length / Math.max(1, o.length), ordinary: med(o.map((s) => s.m?.at ?? 0)), ordinaryStars: med(o.flatMap((s) => s.all.map(stars))), each: o.map((s) => `${s.name.split('/')[1]} ${show(s.m)}`),
    novice: med(nv.map((s) => s.m?.at ?? 0)), noviceWave: med(nv.flatMap((s) => s.all.map((r) => (r?.won ? L.count + 1 : r?.wave ?? 0)))), smart: sm.m?.at, expert: xp?.m?.at, expertStars: med((xp?.all || []).map(stars)),
    lazy: Math.max(...lz.map((s) => s.m?.at ?? 0)), lazyWon: lz.filter((s) => s.all.filter((r) => r?.won).length * 2 > s.all.length).map((s) => s.name), lazy2: of('lazy2')[0]?.m?.at, waves: L.count };
}
const line = (n, x) => `L${n + 1} hp ${x.hp} budget ${x.budget[0]}/${x.budget[1]}: real waves ${x.realSmart ? '' : 'SMART LOSES '}${x.realExpert ? '' : 'EXPERT LOSES '}${x.realLazy ? 'A LAZY GARDEN WINS ' : ''}ordinary wins ${Math.round(x.realOrd * 100)}%; ordinary ${pct(x.ordinary)} (${x.each.join(', ')}; ${x.ordinaryStars}★ at 100%), novice ${pct(x.novice)} out at wave ${x.noviceWave > x.waves ? 'never' : `${x.noviceWave}/${x.waves}`}, smart ${pct(x.smart)}, expert ${x.expert ? `${pct(x.expert)} ${x.expertStars}★` : '-'}, best lazy ${pct(x.lazy)}, lazy with the usual perks ${pct(x.lazy2)}`;
// what is off at a budget, against what the levels are for
const off = (x) => [
  Math.abs(x.ordinary - TARGET) > TOL * TARGET && `the ordinary player holds ${pct(x.ordinary)}, not ${pct(TARGET)}`,
  x.noviceWave > x.waves && 'the novice wins', x.noviceWave <= x.waves && x.noviceWave < x.waves * 2 / 3 && `the novice is out at wave ${x.noviceWave} of ${x.waves}, before the last third`,
  x.expert != null && x.expertStars < 3 && `the expert takes ${x.expertStars}★`,
  (x.lazyWon.length || x.lazy >= 1) && `a lazy garden holds ${pct(x.lazy)}${x.lazyWon.length ? ` and wins (${x.lazyWon.join(', ')})` : ''}`,
  x.lazy >= x.ordinary && 'a lazy garden does as well as the ordinary player: no budget makes the maze pay here (the map, not the waves)'].filter(Boolean);

// scales a budget until the ordinary player is at the target (the secant over the last two measured); gives every
// budget measured on the way
async function scale(n, start, first, hp) {
  let x = first || await measure(n, start, hp); console.log('  ' + line(n, x));
  const tried = [x];
  for (let k = 0; k < ITER && Math.abs(x.ordinary - TARGET) > TOL * TARGET; k++) {
    let s; const [a, b] = tried.slice(-2);
    if (!b || a.ordinary === b.ordinary) s = x.ordinary / TARGET; // the margin taken as the share of the bugs to keep
    else { const sa = a.budget[0], sb = b.budget[0], sNew = sb + (TARGET - b.ordinary) * (sb - sa) / (b.ordinary - a.ordinary); s = sNew / sb; }
    s = Math.min(1.6, Math.max(.6, s));
    const nb = [r1(x.budget[0] * s), r1(x.budget[1] * s)];
    if (nb[0] === x.budget[0] && nb[1] === x.budget[1]) break;
    x = await measure(n, nb, x.hp); tried.push(x); console.log('  ' + line(n, x));
  }
  return tried;
}
// the budget to take of those measured: a lazy garden that wins is worst of all (the rule of the game: no lazy way
// through), then the ordinary player away from the target (beyond the tolerance), then the novice out too soon
const cost = (x) => (x.lazy >= 1 || x.lazyWon.length ? 100 + x.lazy : 0) + Math.max(0, Math.abs(x.ordinary - TARGET) - TOL * TARGET) * 10
  + (x.noviceWave <= x.waves && x.noviceWave < x.waves * 2 / 3 ? (x.waves * 2 / 3 - x.noviceWave) / x.waves : 0) + Math.abs(x.ordinary - TARGET) * .01;
const near = (list) => list.reduce((p, q) => (cost(q) < cost(p) ? q : p));
const at = (opt('--at', '') || '').split(',').filter(Boolean).map((x) => { const [n, b] = x.split('='); return [Number(n) - 1, b.split('/').map(Number)]; });
const HPS = opt('--hp', '1,1.4,2').split(',').map(Number);
// the hard rules on the game's own waves, and the ordinary player at the target
const keeps = (x) => x.realSmart && x.realExpert && !x.realLazy && x.realOrd >= .5 && Math.abs(x.ordinary - TARGET) <= TOL * TARGET && !x.lazyWon.length && x.lazy < 1;
const pick = (list) => { const ok = list.filter(keeps); return ok.length ? ok.reduce((p, q) => (q.ordinary - q.lazy > p.ordinary - p.lazy ? q : p)) : near(list); };
const found = [];
for (const n of levels) {
  const L = LEVELS[n], was = [...L.budget], wasHp = L.hp, extra = at.filter(([m]) => m === n).map(([, b]) => b);
  console.log(`L${n + 1} ${L.name}`);
  let tried = [];
  if (dry) { const x = await measure(n, was); console.log('  ' + line(n, x)); tried.push(x); }
  else for (const hp of HPS) { const k = wasHp / hp; tried = tried.concat(await scale(n, [r1(was[0] * k), r1(was[1] * k)], null, hp)); }
  for (const b of extra) { const x = await measure(n, b, wasHp); console.log('  ' + line(n, x)); tried.push(x); }
  const best = pick(tried);
  LEVELS[n].budget = was; LEVELS[n].hp = wasHp; reset(); // data.js as it was: every level is tuned on its own
  found.push({ n, was, wasHp, best, keeps: keeps(best), off: off(best) });
}
console.log(`\n${dry ? 'as it is' : `the budgets for the ordinary player at ${pct(TARGET)}`}:`);
for (const f of found) console.log(`  L${f.n + 1} ${LEVELS[f.n].name}: hp ${f.wasHp}, budget ${f.was.join('/')}${dry ? '' : ` → hp ${f.best.hp}, budget ${f.best.budget.join('/')}`}; ordinary ${pct(f.best.ordinary)}, best lazy ${pct(f.best.lazy)} (the maze pays ${Math.round((f.best.ordinary - f.best.lazy) * 100)} points); ${f.keeps ? 'the hard rules hold on the game\'s waves' : 'THE HARD RULES DO NOT ALL HOLD'}${f.off.length ? '; ' + f.off.join('; ') : ''}`);
