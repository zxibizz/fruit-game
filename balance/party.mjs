// The best perfect party of a level: node balance/party.mjs --level 7 [--secs 300] [--runs 2] [--meta exp3] [--mono]
//   [--keep] [--jobs N] [--out FILE] [--rng N] [--stall 60] [--check] [--no-without] [--ban-secs S] [--ban-stall S] [--without f1,f2] [--from FILE]
// Looks for the party that gets through the level with the fruit never bitten against the healthiest bugs
// (sim/src/perfect.rs: a whole party at a time, a plant on any cell, the maze built and broken a cell at a time; a party
// counts on a rung of health when it is clean on five seeds of the game there and on every rung below, from ×0.75 up). It starts from
// the party kept (balance/perfect/L<n>.json) and from the parties of the smart bot and of the expert, --runs times over
// with another draw of the search each time: runs that end on the same rung say the search found what there is to find,
// runs apart say it did not, and how far. The best of them is then measured as every party is (balance/scan.mjs: a grid
// of health, eight seeds — three of them the search never saw — the margin the last rung before the first failure), with
// the margins of a plain win and of three stars beside it. The search keeps the best party of every make (the families of
// plants a garden ends as), so the same run says the different ways to play the level and what it cannot do without:
// the best party with a branch or a plant absent, against the best of all. --mono: the best party of one plant alone, every plant of the
// level in turn (a fifth of the time each). --keep: it is kept in balance/perfect/ if it holds more than the one there.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { LEVELS, PLANTS } from '../public/data.js';
import { exportData } from '../sim/js/export.mjs';
import { build } from '../sim/js/play.mjs';
import { resolve } from './scenario.mjs';
import { EXPERT } from './plans.mjs';
import { scan, search, searchAsync, pool, PAR, TARGET, SEEDS } from './scan.mjs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const level = Number(opt('--level', 4)) - 1, SECS = Number(opt('--secs', 600)), STALL = Number(opt('--stall', 60)), RUNS = Number(opt('--runs', 1)), META = opt('--meta', 'exp3');
const how = { bin: build(), ...(opt('--jobs') ? { jobs: Number(opt('--jobs')) } : {}) }, data = exportData();
const SMART = { route: 1, place: 'best', upgrades: 'greedy', terrain: true, powers: true, early: true };
const base = resolve({ level, opts: { ...SMART, meta: META } }), bots = [base, ...(EXPERT ? [{ ...base, policy: EXPERT }] : [])];
const FILE = new URL(`./perfect/L${level + 1}.json`, import.meta.url), kept = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : null;
const log = (s) => process.stderr.write(s + '\n'), pc = (x) => `×${x.toFixed(2)}`;
// a party as scan and the tests play it
const party = (plan, kind = null) => ({ level, opts: { ...base, plan, ...(kind ? { plants: [kind] } : {}) } });
const measure = (plan, kind) => { const t = [party(plan, kind)]; return { clean: scan(t, { data, full: true, ...how, quiet: true })[0], stars: scan(t, { data, what: 'stars', ...how, quiet: true })[0], won: scan(t, { data, what: 'won', to: 24, ...how, quiet: true })[0] }; };

log(`L${level + 1} ${LEVELS[level].name}: the best perfect party, ${RUNS} run(s) of ${SECS} s at most (stopping ${STALL} s after the last rise), the perks ${META}`);
const runs = [];
// --from FILE: an earlier report (--out) is a start: the best party of every make it found (not the best alone: after a
// change of the game another make may be the best, and it starts where it was), and for every branch taken out the
// best party found without it. Whether this finds what a search from nothing finds is asked by --cold (none of it).
const FROM = opt('--from') && existsSync(opt('--from')) && !args.includes('--cold') ? JSON.parse(readFileSync(opt('--from'), 'utf8')) : null;
const FROM_PLANS = FROM ? [FROM.plan, ...(FROM.archive || []).slice(0, 40).map((e) => e.plan)] : [];
for (let n = 1; n <= RUNS; n++) { log(` run ${n}`); runs.push(search({ level, opts: base, plans: [...(kept?.plan ? [kept.plan] : []), ...FROM_PLANS], bots, secs: SECS, stall: STALL, rng: n + Number(opt('--rng', 0)), check: args.includes('--check'), data }, how)); }
const best = runs.reduce((a, b) => (b.margin > a.margin ? b : a)), m = measure(best.plan);
let one = null;
if (args.includes('--mono')) {
  for (const kind of LEVELS[level].plants) { log(` ${kind} alone`);
    const r = search({ level, opts: base, plans: kept?.mono?.kind === kind ? [kept.mono.plan] : [], bots, secs: Math.max(20, SECS / 5), stall: STALL / 2, only: kind, rng: 1, data }, how);
    const mm = scan([party(r.plan, kind)], { data, ...how, quiet: true })[0];
    if (!one || mm.margin > one.margin) one = { kind, plan: r.plan, margin: mm.margin, grid: mm.grid }; }
}
const grid = (g) => g.grid.map(([, h, n]) => `${h.toFixed(2)}:${n}`).join(' ');
// The archive: the best party of every make (the families of plants its garden ends as). The different ways to play
// the level: of the makes, the best that are unlike each other (two families of a tenth of the dew and more apart); and
// what the level cannot do without: the best party with a family (a plant) absent, against the best of all.
const RU = { pumpkin: 'Тыква', rose: 'Роза', pepper: 'Чили', mint: 'Мята', flytrap: 'Мухоловка' }, BR = { pumpkin: ['Панцирь', 'Плети'], rose: ['Охотница', 'Дальнобойная'], pepper: ['Жар', 'Прожиг'], mint: ['Холод', 'Сосулька'], flytrap: ['Обжора', 'Ловчая'] };
const famRu = (f) => { const [k, b] = f.split('.'); return b ? BR[k][b === 'a' ? 0 : 1] : RU[k]; };
const arch = [...new Map(runs.flatMap((r) => r.archive || []).sort((a, b) => a.margin - b.margin).map((e) => [Object.keys(e.mix).filter((f) => e.mix[f] >= .03).sort().join('+'), e])).values()].sort((a, b) => b.margin - a.margin);
const big = (e) => new Set(Object.keys(e.mix).filter((f) => e.mix[f] >= .1)), apart = (a, b) => [...a].filter((f) => !b.has(f)).length + [...b].filter((f) => !a.has(f)).length;
const unlike = []; for (const e of arch) { if (unlike.length >= 8 || e.margin < best.margin * .6) break; if (unlike.every((u) => apart(big(u), big(e)) >= 2)) unlike.push(e); }
const mixRu = (e) => Object.entries(e.mix).sort((a, b) => b[1] - a[1]).filter(([, x]) => x >= .04).map(([f, x]) => `${famRu(f)} ${Math.round(x * 100)}%`).join(', ');
const lacks = (e, f) => (f.includes('.') ? (e.mix[f] || 0) : ['', '.a', '.b'].reduce((t, s) => t + (e.mix[f + s] || 0), 0)) < .03;
const ONLY = opt('--without') ? opt('--without').split(',') : null; // --without rose.a,pumpkin: those alone
const open = LEVELS[level].plants.flatMap((k) => [...(LEVELS[level].plants.length > 1 ? [k] : []), ...['a', 'b'].filter((b) => data.PLANTS[k][b].from <= level + 1).map((b) => `${k}.${b}`)]);
// What the level cannot do without: the best party of the game with a branch closed or a plant gone — a search of its
// own on that game (a job each, side by side), from the best party and the best of the archive that have none of it,
// till it is as good as the best of all or stops rising. (The bot plays a step of the plan it cannot take its own way:
// a closed branch becomes the open one; where a whole plant is gone its plants are given as each of the others in turn.)
const NOT = args.includes('--no-without'), BSECS = Number(opt('--ban-secs', Math.max(20, SECS / 4))), BSTALL = Number(opt('--ban-stall', Math.max(8, STALL / 3)));
const gone = (f) => { const [k, b] = f.split('.'), L = LEVELS[level];
  if (b) { const was = PLANTS[k][b].from; PLANTS[k][b].from = 99; const d = exportData(); PLANTS[k][b].from = was; return d; }
  const was = L.plants; L.plants = was.filter((x) => x !== k); const d = exportData(); L.plants = was; return d; };
const as = (plan, k, to) => plan.map((s) => (s[0] === k ? [to, s[1], s[2]] : s));
const jobs = how.jobs || PAR, top = Math.max(0, Math.round(Math.log(Math.max(m.clean.margin, .75)) / Math.log(1.05)) + 2);
const without = NOT ? [] : await pool(open.filter((f) => !ONLY || ONLY.includes(f)), jobs, async (f) => { const d = gone(f), [k, b] = f.split('.');
  const none = (x) => (b ? [f] : [k, k + '.a', k + '.b']).every((g) => !x.mix[g]);
  const starts = [best.plan, ...(FROM?.without?.find((w) => w.f === f)?.plan ? [FROM.without.find((w) => w.f === f).plan] : []), ...[...arch.filter(none).slice(0, 3), ...arch.filter((x) => lacks(x, f) && !none(x)).slice(0, 1)].map((x) => x.plan), ...(b ? [] : LEVELS[level].plants.filter((x) => x !== k).map((x) => as(best.plan, k, x)))];
  const r = await searchAsync({ level, opts: base, plans: starts, bots, secs: BSECS, stall: BSTALL, goal: best.margin, data: d }, { bin: how.bin, jobs: 1 });
  const s = r.plan?.length ? scan([party(r.plan)], { data: d, to: top, bin: how.bin, jobs: 1, quiet: true })[0].margin : 0, margin = Math.min(s, m.clean.margin);
  log(`  without ${f}: ${pc(margin)} (${r.tried} tried)`);
  return { f, margin, cost: 1 - margin / m.clean.margin, tried: r.tried, plan: r.plan }; });
console.log(`L${level + 1} ${LEVELS[level].name} (hp ${LEVELS[level].hp}, the perks ${META})`);
console.log(`  the runs ended on ${runs.map((r) => pc(r.margin)).join(', ')} (${runs.map((r) => r.tried).join(', ')} parties tried)${Math.max(...runs.map((r) => r.margin)) / Math.min(...runs.map((r) => r.margin)) <= 1.06 ? ': they agree' : ': THEY DO NOT AGREE — the search has not settled'}`);
console.log(`  the best, on ${m.clean.seeds} seed(s): the fruit whole against bugs ${pc(m.clean.margin)}; three stars ${pc(m.stars.margin)}; won ${pc(m.won.margin)}${m.won.open ? '+' : ''}`);
console.log(`    health:seeds clean  ${grid(m.clean)}`);
if (kept?.plan) { const k = scan([party(kept.plan)], { data, ...how, quiet: true })[0]; console.log(`  the party kept before: ${pc(k.margin)}`); }
if (arch.length) {
  const ms = scan(unlike.map((e) => party(e.plan)), { data, ...how, quiet: true });
  console.log(`  разные способы пройти (${arch.length} составов в архиве; запас на всех сидах / на сидах поиска):`);
  unlike.forEach((e, q) => { e.scanned = ms[q].margin; }); unlike.sort((a, b) => b.scanned - a.scanned); unlike.length = Math.min(unlike.length, 6);
  unlike.forEach((e, q) => console.log(`    ${q + 1}. ${pc(e.scanned)} / ${pc(e.margin)}  ${mixRu(e)}`));
}
if (without.length) {
  const show = (w) => `${famRu(w.f)} ${w.margin ? `−${Math.round(Math.max(0, w.cost) * 100)}%` : 'чисто не пройти'}`;
  const row = (lo, hi, whole) => without.filter((w) => w.f.includes('.') !== whole && w.cost >= lo && w.cost < hi).sort((a, b) => b.cost - a.cost).map(show).join(', ') || '—';
  console.log(`  без ветки (лучшая партия игры, где ветка закрыта; все сиды) — единственный путь (−30% и больше): ${row(.3, 9, false)}`);
  console.log(`      выбор (−8…−30%): ${row(.08, .3, false)}`);
  console.log(`      не нужна (меньше −8%): ${row(-9, .08, false)}`);
  console.log(`  без растения целиком: ${without.filter((w) => !w.f.includes('.')).sort((a, b) => b.cost - a.cost).map(show).join(', ') || '—'}`);
}
if (one) console.log(`  one plant alone: ${one.kind} ${pc(one.margin)} — ${Math.round(one.margin / m.clean.margin * 100)}% of the best`);
const hp = m.clean.margin > 0 ? Math.round(LEVELS[level].hp * m.clean.margin / TARGET * 100) / 100 : null;
console.log(`  for a garden of ${Math.round(100 / TARGET)}% of its strength to be the least that keeps the fruit whole: L${level + 1}.hp ${LEVELS[level].hp} → ${hp}`);
const res = { level: level + 1, meta: META, secs: SECS, runs: runs.map((r) => ({ margin: r.margin, tried: r.tried, parties: r.parties, wavesSaved: r.waves_saved, history: r.history })), plan: best.plan, clean: m.clean, stars: m.stars.margin, won: m.won.margin, mono: one, unlike: unlike.map((e) => ({ margin: e.margin, scanned: e.scanned ?? null, mix: e.mix })), without, makes: arch.length, archive: arch.slice(0, 60).map((e) => ({ margin: e.margin, mix: e.mix, plan: e.plan })), hp: { now: LEVELS[level].hp, suggested: hp } };
if (opt('--out')) { mkdirSync(dirname(opt('--out')), { recursive: true }); writeFileSync(opt('--out'), JSON.stringify(res)); }
if (args.includes('--keep')) {
  const was = kept?.plan ? scan([party(kept.plan)], { data, ...how, quiet: true })[0].margin : -1, mono = one && (!kept?.mono || one.margin >= scan([party(kept.mono.plan, kept.mono.kind)], { data, ...how, quiet: true })[0].margin) ? { kind: one.kind, plan: one.plan } : kept?.mono ?? null;
  writeFileSync(FILE, JSON.stringify({ level: level + 1, plan: m.clean.margin >= was ? best.plan : kept.plan, mono }) + '\n');
  console.log(`  kept: ${m.clean.margin >= was ? 'the new party' : 'the old one (it holds more)'}`);
}
