// The campaign: a whole level played from the studio's gardens — the slow, faithful check of what the studio says.
//   node balance/campaign.mjs --level 6 [--secs 120] [--rounds 40] [--batch 12] [--warm] [--set K=V,...] [--jobs N]
//     [--out FILE] [--from balance/.studio/state.json]
// The studio (sim/src/studio.rs) finds the best gardens of every wave alone, each with all the dew of the level so
// far standing in it. A party is more than that: the garden grows wave by wave on the dew there is, eaten plants are
// holes till the wave is over, the fruit's health is spent over the level, frost and rain help. Here:
//   1. the studio searches every wave of the level for --secs seconds (or starts from balance/.studio/ with --warm);
//   2. every one of the best gardens of the last waves and of the hardest ones becomes plans (sim/src/bot.rs, option
//      plan: the plants to put and to grow, cell by cell, in order, a branch named for each): the steps go in the order
//      of the first wave whose best gardens have them — what the studio found worth having at that dew comes when there
//      is that dew — or the walls first; the smart bot plays it (frost, rain, early calls), spending what is left its own way;
//   3. the best plan is changed a step at a time (a step earlier or later, another branch, a plant grown once more or
//      less, another kind on a cell, two cells trading plants) and kept when it lasts against healthier bugs, on the
//      game's own waves and another draw of them, as balance/design.mjs does;
//   4. the margins of the level (balance/margin.mjs: how many times healthier every bug may be before the party is
//      lost) — of the expert (balance/strategy.json), of the smart bot, of the studio's plan and of the plan refined —
//      each the median over the game's own waves and two other draws, the third of which the search never played.
// The expert's margin is what the matrix tunes the levels by; the plan's is what the studio's gardens are worth in a
// party. A plan well above the expert: a stronger way to play the level than the matrix knows (the level is easier
// than tuned for a player who finds it); below: the studio's meta of single waves does not carry over to the party.
import { writeFileSync, readFileSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { LEVELS, PLANTS, makeWaves } from '../public/data.js';
import { exportData } from '../sim/js/export.mjs';
import { play, build } from '../sim/js/play.mjs';
import { resolve, applyOverrides } from './scenario.mjs';
import { margins, show } from './margin.mjs';
import { Engine, sleep } from './studio-engine.mjs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const num = (v) => (v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v);
const set = Object.fromEntries((opt('--set', '') || '').split(',').filter(Boolean).map((kv) => { const [k, v] = kv.split('='); return [k.trim(), num(v.trim())]; }));
const level = Number(opt('--level', 6)) - 1, SECS = Number(opt('--secs', 120)), ROUNDS = Number(opt('--rounds', 40)), BATCH = Number(opt('--batch', 12));
const jobs = opt('--jobs') ? { jobs: Number(opt('--jobs')) } : {}, HI = 4, STEP = 1.05;
// --clean: the party that counts is the perfect one (won, the fruit never bitten), on the game's own waves
const CLEAN = args.includes('--clean'), TARGET = Number(opt('--target', 1 / 0.7)), SEEDS = CLEAN ? [7, 11] : [7];
const out = opt('--out', join(homedir(), 'tmp', 'balance', 'campaigns', `L${level + 1}.json`));
const log = (s) => process.stderr.write(s + '\n');
let rs = 12345; const rnd = () => { rs = (rs + 0x6D2B79F5) >>> 0; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

// ---- 1. the studio ----
// --from FILE: the studio's findings as balance/studio.mjs keeps them (balance/.studio/state.json), its overrides too;
// no search of its own then
let reps, from = opt('--from');
if (from) {
  const st = JSON.parse(readFileSync(from, 'utf8'));
  if (!opt('--set')) Object.assign(set, st.overrides || {});
  reps = Object.values(st.waves || {}).filter((r) => r.level === level && r.top?.length).sort((a, b) => a.wave - b.wave);
  log(`L${level + 1} ${LEVELS[level].name}: the studio's gardens of ${reps.length} waves from ${from}`);
} else {
  const eng = new Engine(jobs.jobs ? { jobs: jobs.jobs } : {});
  await eng.load({ set });
  const CACHE = new URL('./.studio/state.json', import.meta.url);
  if (args.includes('--warm') && existsSync(CACHE)) {
    const st = JSON.parse(readFileSync(CACHE, 'utf8'));
    for (const r of Object.values(st.waves || {})) if (r.level === level) eng.seed(r.level, r.wave, r.top.map((g) => ({ walls: g.walls, cells: g.cells, m: g.m })));
  }
  eng.caps(1e9, 0); eng.focus(level, null);
  log(`L${level + 1} ${LEVELS[level].name}: the studio searches its waves for ${SECS} s`);
  await sleep(SECS * 1000);
  reps = eng.level(level); eng.stop();
  // what the studio found, beside the result: --from it plays the same gardens again (another order, more rounds)
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out.replace(/\.json$/, '') + '.studio.json', JSON.stringify({ overrides: set, waves: Object.fromEntries(reps.map((r) => [`${r.level}:${r.wave}`, r])) }));
}
if (!reps.length) throw new Error('the studio found nothing');

// ---- 2. gardens into plans ----
// the data the parties are played on: the overrides, the game's waves (draw 0) and two other draws
applyOverrides(set);
const DRAWS = [0, 1, 2], datas = DRAWS.map((w) => { if (w) applyOverrides({}, w); return exportData(); });
LEVELS.forEach((L) => { L.waves = makeWaves(L, L.seed); }); applyOverrides(set);
const SMART = { route: 1, place: 'best', upgrades: 'greedy', meta: 'exp2', terrain: true, powers: true, early: true };
const base = resolve({ level, opts: SMART });
const EXPERT = existsSync(new URL('./strategy.json', import.meta.url)) ? JSON.parse(readFileSync(new URL('./strategy.json', import.meta.url), 'utf8')).policy : null;
const BIN = build(); // once: every batch after plays on it
const run = (list) => { const r = Array(list.length);
  for (const w of new Set(list.map((x) => x.w || 0))) { const ks = list.map((x, k) => ((x.w || 0) === w ? k : -1)).filter((k) => k >= 0);
    play(ks.map((k) => ({ level, opts: list[k].opts })), { ...jobs, bin: BIN, data: datas[w] }).forEach((x, i) => { if (x.err) throw new Error(x.err); r[ks[i]] = x.res; }); }
  return r; };

const TIER = [[1, 0], [2, 0], [3, 1], [4, 1], [3, 2], [4, 2]]; // (level, branch) of the studio's tiers
const ij = (k) => [k % 14, Math.floor(k / 14)];
// the steps of a garden: a plant put, then grown to its tier (the branch named on the step to level 3)
function stepsOf(g) {
  const st = [];
  for (const [k, kind, t] of g.cells) {
    const [i, j] = ij(k), [lvl, br] = TIER[t], wall = g.walls.includes(k);
    st.push({ s: [kind, i, j], k, lvl: 1, wall, kind, br });
    for (let l = 2; l <= lvl; l++) st.push({ s: l === 3 ? ['up', i, j, br] : ['up', i, j], k, lvl: l, wall, kind, br });
  }
  return st;
}
// the first wave whose best gardens have the step: that plant on that cell, grown at least so far (on that branch)
function firstWave(step) {
  for (const r of reps) for (const g of r.top.slice(0, 3)) {
    const c = g.cells.find((x) => x[0] === step.k); if (!c || c[1] !== step.kind) continue;
    const [lvl, br] = TIER[c[2]]; if (lvl >= step.lvl && (step.lvl < 3 || br === step.br)) return r.wave;
  }
  return 999;
}
// two orders of the same garden: by the first wave whose best gardens have a step (a wall no early garden has comes
// last then: the maze is built late), and the walls first (the trail at its longest from the start, the plants later)
function plansOf(g) {
  const st = stepsOf(g).map((x) => ({ ...x, at: firstWave(x) }));
  const byWave = [...st].sort((a, b) => a.at - b.at || a.lvl - b.lvl || (b.wall - a.wall));
  const walls = [...st].sort((a, b) => ((b.wall && b.lvl === 1) - (a.wall && a.lvl === 1)) || a.at - b.at || a.lvl - b.lvl);
  return [byWave.map((x) => x.s), walls.map((x) => x.s)];
}
// the targets: the best gardens of the last three waves and of the two hardest (the lowest margin of the best)
const hard = [...reps].sort((a, b) => a.top[0].m - b.top[0].m).slice(0, 2), last = reps.slice(-3);
const targets = []; for (const r of [...last, ...hard]) for (const g of r.top.slice(0, 3)) if (!targets.some((t) => t.g === g)) targets.push({ g, wave: r.wave });
log(`  ${targets.length} gardens of waves ${[...new Set(targets.map((t) => t.wave))].join(', ')} as plans`);

const clean = (r) => r.won && Object.keys(r.bites).length === 0, ok = CLEAN ? clean : (r) => r.won;
const score = (r) => (CLEAN && clean(r) ? 2e5 : r.won ? 1e5 + r.hp : r.time);
// the parties a plan is rated on: the game's waves and another draw of them; for a perfect party, the game's own
// waves on two seeds of the game (where the flyers come from)
const TRIALS = CLEAN ? SEEDS.map((seed) => ({ w: 0, seed })) : [{ w: 0 }, { w: 1 }], NT = TRIALS.length;
const rate = (plans, h, o = base) => { const res = run(plans.flatMap((plan) => TRIALS.map((t) => ({ w: t.w, opts: { ...o, plan, hp: Math.round(h * 1000) / 1000, ...(t.seed ? { seed: t.seed } : {}) } }))));
  return plans.map((_, k) => { const xs = res.slice(k * NT, (k + 1) * NT); return { f: xs.reduce((t, r) => t + score(r), 0), wins: xs.filter(ok).length, res: xs }; }); };
const plans = [], of = []; targets.forEach((t) => plansOf(t.g).forEach((p, v) => { plans.push(p); of.push({ ...t, order: v ? 'walls first' : 'by wave' }); }));
// the parties of the bots themselves, as plans: where a bot does better than any garden of the studio laid out as a
// plan, the search starts from its party
{ const dir = mkdtempSync(join(tmpdir(), 'fruit-campaign-'));
  for (const [name, o] of [['the expert', EXPERT ? { ...base, policy: EXPERT } : null], ['the smart bot', base]]) { if (!o) continue;
    const file = join(dir, 'ops.json'); play([{ level, opts: o, record: file }], { ...jobs, bin: BIN, data: datas[0] });
    plans.push(JSON.parse(readFileSync(file, 'utf8')).filter((x) => x[0] === 'place' || x[0] === 'up').map((x) => (x[0] === 'up' ? (x[3] ? ['up', x[1], x[2], x[3]] : ['up', x[1], x[2]]) : [x[1], x[2], x[3]])));
    of.push({ wave: 0, g: { m: 0 }, order: `the party of ${name}` }); }
  rmSync(dir, { recursive: true }); }
const first = rate(plans, 1);
first.forEach((x, k) => log(`  plan of wave ${of[k].wave} #${of[k].g.m.toFixed(2)} (${of[k].order}): ${x.wins}/${NT} ${CLEAN ? 'clean' : 'won'}, fruit ${x.res.map((r) => r.won ? r.hp : `lost at wave ${r.wave}`).join(' / ')}`));
let bi = first.reduce((b, x, k) => (x.f > first[b].f ? k : b), 0);
const seedPlan = plans[bi];

// ---- 3. refined ----
const cellsOf = (plan) => { const m = new Map(); for (const s of plan) { const key = s[1] + ',' + s[2]; if (s[0] !== 'up') m.set(key, { kind: s[0], i: s[1], j: s[2] }); } return m; };
function mutate(plan) {
  const t = rnd(), cells = [...cellsOf(plan).values()];
  if (t < .3) { // a step earlier or later (never grown before put)
    const p = plan.slice(), n = Math.floor(rnd() * p.length), [st] = p.splice(n, 1), d = Math.round((rnd() - .55) * 40);
    p.splice(Math.max(0, Math.min(p.length, n + d)), 0, st);
    const put = p.findIndex((s) => s[0] !== 'up' && s[1] === st[1] && s[2] === st[2]), ups = p.map((s, q) => (s[0] === 'up' && s[1] === st[1] && s[2] === st[2] ? q : -1)).filter((q) => q >= 0);
    return ups.some((q) => q < put) ? null : p;
  }
  if (t < .45) { // the other branch
    const ups = plan.map((s, q) => (s[0] === 'up' && s.length > 3 ? q : -1)).filter((q) => q >= 0); if (!ups.length) return null;
    const q = pick(ups), p = plan.slice(); p[q] = ['up', p[q][1], p[q][2], 3 - p[q][3]]; return p;
  }
  if (t < .65 && cells.length) { // grown once more, or once less
    const c = pick(cells), ups = plan.map((s, q) => (s[0] === 'up' && s[1] === c.i && s[2] === c.j ? q : -1)).filter((q) => q >= 0);
    if (rnd() < .5 && ups.length < 3) { const after = Math.max(plan.findIndex((s) => s[0] !== 'up' && s[1] === c.i && s[2] === c.j), ...ups) + 1, p = plan.slice();
      p.splice(after + Math.floor(rnd() * (p.length - after + 1)), 0, ups.length === 1 ? ['up', c.i, c.j, 1 + Math.floor(rnd() * 2)] : ['up', c.i, c.j]); return p; }
    return ups.length ? plan.filter((_, q) => q !== ups.at(-1)) : null;
  }
  if (t < .82 && cells.length) { // another kind on a cell (its branch steps go with it)
    const c = pick(cells), k = pick(LEVELS[level].plants.filter((x) => x !== c.kind));
    return plan.map((s) => (s[0] !== 'up' && s[1] === c.i && s[2] === c.j ? [k, s[1], s[2]] : s));
  }
  if (cells.length > 1) { // two cells trade plants (and how far they are grown)
    const a = pick(cells), b = pick(cells); if (a === b) return null;
    return plan.map((s) => (s[1] === a.i && s[2] === a.j ? [s[0], b.i, b.j, ...s.slice(3)] : s[1] === b.i && s[2] === b.j ? [s[0], a.i, a.j, ...s.slice(3)] : s));
  }
  return null;
}
function refine(plan, cur, rounds, o = base, change = mutate) {
  let best = plan, h = 1, kept = 0; const t0 = Date.now();
  for (let round = 1; round <= rounds; round++) {
    while (cur.wins === NT && h < HI) { h *= STEP; cur = rate([best], h, o)[0]; }
    const cands = []; for (let n = 0; cands.length < BATCH && n < BATCH * 6; n++) { let p = change(best); if (p && rnd() < .3) p = change(p) || p; if (p) cands.push(p); }
    const fs = rate(cands, h, o); let top = -1; fs.forEach((x, k) => { if (x.f > (top < 0 ? cur.f : fs[top].f)) top = k; });
    if (top >= 0) { best = cands[top]; cur = fs[top]; kept++; }
    if (round % 10 === 0 || round === rounds) log(`  round ${round}: bugs ×${h.toFixed(2)}, ${kept} changes kept, ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  return best;
}
const best = refine(seedPlan, first[bi], ROUNDS);

// the best garden of one plant alone, as a plan played with that plant only (--clean): what a monoculture is worth
let mono = null;
if (CLEAN) {
  const cands = [];
  for (const r of [...last, ...hard]) for (const [kind, g] of Object.entries(r.mono || {})) plansOf(g).forEach((p) => cands.push({ kind, p, wave: r.wave }));
  if (cands.length) {
    const rated = cands.map((c) => rate([c.p], 1, { ...base, plants: [c.kind] })[0]);
    const k = rated.reduce((b, x, q) => (x.f > rated[b].f ? q : b), 0), c = cands[k];
    log(`  one plant alone: ${c.kind} (the garden of wave ${c.wave}), ${rated[k].wins}/${NT} clean`);
    const same = (plan) => { for (let n = 0; n < 8; n++) { const p = mutate(plan); if (p && p.every((st) => st[0] === 'up' || st[0] === c.kind)) return p; } return null; };
    mono = { kind: c.kind, opts: { ...base, plants: [c.kind] } }; mono.plan = refine(c.p, rated[k], Math.ceil(ROUNDS / 2), mono.opts, same);
  }
}

// ---- 4. the margins ----
const who = [['expert', EXPERT ? { ...base, policy: EXPERT } : null], ['smart bot', base], ['studio plan', { ...base, plan: seedPlan }], ['refined plan', { ...base, plan: best }], ...(mono ? [[`${mono.kind} alone`, { ...mono.opts, plan: mono.plan }]] : [])].filter((x) => x[1]);
const tasks = who.flatMap(([, o]) => DRAWS.map((w) => ({ opts: o, w })));
const at1 = run(tasks);
const ms = await margins(tasks.map((task, k) => ({ task, won: at1[k].won })), async (ts) => run(ts), { hi: HI });
const res = who.map(([name], a) => { const each = ms.slice(a * DRAWS.length, (a + 1) * DRAWS.length), xs = [...each].sort((p, q) => p.at - q.at); return { name, median: xs[1], each: each.map((x) => x.at) }; });
console.log(`L${level + 1} ${LEVELS[level].name}: the margin of the level (median of the game's waves and two other draws; each draw)`);
for (const r of res) console.log(`  ${r.name.padEnd(13)} ${show(r.median).padStart(6)}   [${r.each.map((v) => Math.round(v * 100)).join(' ')}]`);
// the perfect party: how many times healthier the bugs may be and the fruit is still never bitten, on the game's own
// waves, the least over the seeds of the game
let perfect = null, hp = null;
if (CLEAN) {
  const ct = who.flatMap(([, o]) => SEEDS.map((seed) => ({ opts: { ...o, seed }, w: 0 }))), c1 = run(ct);
  const cm = await margins(ct.map((task, k) => ({ task, won: clean(c1[k]) })), async (ts) => run(ts).map((r) => ({ ...r, won: clean(r) })), { lo: .25, hi: HI });
  perfect = who.map(([name], a) => { const each = cm.slice(a * SEEDS.length, (a + 1) * SEEDS.length); return { name, at: Math.min(...each.map((x) => x.at)), each: each.map((x) => x.at) }; });
  const top = Math.max(...perfect.filter((p) => !p.name.endsWith(' alone')).map((p) => p.at)), one = perfect.find((p) => p.name.endsWith(' alone'));
  console.log(`  the perfect party (the fruit never bitten, the game's own waves): bugs how many times healthier`);
  for (const p of perfect) console.log(`  ${p.name.padEnd(13)} ${(Math.round(p.at * 100) + '%').padStart(6)}   [${p.each.map((v) => Math.round(v * 100)).join(' ')}]`);
  // the health of the level's bugs at which a garden of TARGET⁻¹ of the best's strength is the least that does it
  hp = { now: LEVELS[level].hp, best: top, target: TARGET, suggested: Math.round(LEVELS[level].hp * top / TARGET * 100) / 100, mono: one ? one.at / top : null };
  console.log(`  the best holds ×${top.toFixed(2)} clean; for ×${TARGET.toFixed(2)} (a garden of ${Math.round(100 / TARGET)}% of its strength just does it): L${level + 1}.hp ${hp.now} → ${hp.suggested}${one ? `; one plant alone is ${Math.round(hp.mono * 100)}% of the best${hp.mono >= 1 / TARGET ? ' — ENOUGH for a perfect party after that' : ''}` : ''}`);
}
const count = {}; for (const c of cellsOf(best).values()) count[c.kind] = (count[c.kind] || 0) + 1;
console.log(`  the refined plan: ${best.length} steps, ${Object.entries(count).map(([k, n]) => `${k} ${n}`).join(', ')}`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ level: level + 1, set, secs: SECS, rounds: ROUNDS, margins: res, perfect, hp, seedPlan, plan: best, mono: mono && { kind: mono.kind, plan: mono.plan }, target: of[bi] }));
console.log(`  ${out}`);
