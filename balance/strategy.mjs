// The strategist: finds the weights of a strategy (sim/src/bot.rs, Policy) — what the bot should make of what it sees
// in a cell and in a maze — by playing whole levels on the native simulation.
//   node balance/strategy.mjs [--gens 60] [--pop 24] [--levels 1-9] [--seeds 7,8] [--waves 0,1,2] [--out FILE] [--from FILE]
//     [--free-maze] [--jobs 2]
// The weights are looked for on all the levels at once: a strategy is good when it plays every level well, not when
// it fits one map. The search is the cross-entropy method: every generation draws --pop weight sets around the mean,
// plays each on every level, seed and draw of the waves (--waves: 0 is the draw of data.js, n the draw n of
// makeWaves) against bugs a little healthier than the mean holds there (h, one per level:
// starts at the smart bot's margin and grows by a step when the mean wins a level with two stars or more), and moves
// the mean to the best quarter. A party counts 1 + the share of the fruit left when won, the share of the waves got
// through when lost. All zeros is the smart bot as it plays; the mean starts there.
// Writes the weights to --out (default balance/strategy.json) with what the search went through; --from goes on
// from such a file (the health of the bugs is looked for again when the file has none); --free-maze then starts the
// maze weights afresh, the bot's own maze weighing nothing, and widens the search round the rest. claude-vm shares a power-capped host: two threads at the lowest priority, and a pause every
// ten minutes of work.
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { setPriority, homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEVELS } from '../public/data.js';
import { play } from '../sim/js/play.mjs';
import { resolve, applyOverrides } from './scenario.mjs';
import { exportData } from '../sim/js/export.mjs';
import { margins } from './margin.mjs';

const here = dirname(fileURLToPath(import.meta.url));
// what a cell and a maze show, in the order of feat() and routes::pool (the names are for the report only)
export const FEATURES = ['kind', 'reach', 'passes', 'heat', 'slowed', 'shooters near', 'along', 'fertile', 'wall'];
export const MAZE = ['length', 'wall cells', 'best pepper cell', 'eight best cells', 'turns', 'the bot\'s own'];
export const KINDS = ['pumpkin', 'rose', 'mint', 'pepper', 'flytrap'];
export const SMART = { route: 1, place: 'best', upgrades: 'greedy', meta: 'exp2', terrain: true, powers: true, early: true };
// a flat vector of weights ↔ the policy the bot takes
const NP = KINDS.length * FEATURES.length, NU = KINDS.length, DIM = NP + NU + MAZE.length;
export function policyOf(x) {
  return { place: Object.fromEntries(KINDS.map((k, a) => [k, x.slice(a * FEATURES.length, (a + 1) * FEATURES.length)])),
    up: Object.fromEntries(KINDS.map((k, a) => [k, x[NP + a]])), maze: x.slice(NP + NU) };
}
export function vectorOf(p) { return [...KINDS.flatMap((k) => p.place[k]), ...KINDS.map((k) => p.up[k]), ...p.maze]; }
const ZERO = () => { const x = Array(DIM).fill(0); x[DIM - 1] = 1; return x; }; // the bot's own maze

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const range = (s) => s.split(',').flatMap((p) => { const [a, b] = p.split('-').map(Number); return b ? Array.from({ length: b - a + 1 }, (_, k) => a + k) : [a]; });
  const GENS = Number(opt('--gens', 60)), POP = Number(opt('--pop', 24)), ELITE = Math.max(2, Math.round(POP / 4)), jobs = Number(opt('--jobs', 2));
  const levels = range(opt('--levels', `1-${LEVELS.length}`)).map((n) => n - 1), seeds = opt('--seeds', '7,8').split(',').map(Number), waves = opt('--waves', '0').split(',').map(Number);
  // the data of every draw of the waves (the draw of data.js first: the others change the levels for good)
  const datas = {}; for (const w of [...waves].sort((a, b) => a - b)) { if (w) applyOverrides({}, w); datas[w] = exportData(); }
  const out = opt('--out', join(here, 'strategy.json')), log = join(homedir(), 'tmp', 'balance', 'strategy'); mkdirSync(log, { recursive: true });
  try { setPriority(19); } catch { /* as it is */ }
  let rs = 12345; const rnd = () => { rs = (rs + 0x6D2B79F5) >>> 0; let t = rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());
  const base = Object.fromEntries(levels.map((n) => [n, resolve({ level: n, opts: SMART })]));
  let worked = 0, since = Date.now();
  // plays the list, a batch per draw of the waves (w: 0 when not said), in the order given
  const run = (list) => { const t = Date.now(), r = Array(list.length).fill(null);
    for (const w of new Set(list.map((x) => x.w || 0))) { const ks = list.map((x, k) => ((x.w || 0) === w ? k : -1)).filter((k) => k >= 0);
      play(ks.map((k) => ({ level: list[k].level, opts: list[k].opts })), { jobs, data: datas[w] ?? datas[0] }).forEach((x, i) => { r[ks[i]] = x.err ? null : x.res; }); }
    worked += Date.now() - t; return r; };
  const rest = async () => { if (worked > 600e3) { await new Promise((r) => setTimeout(r, 120e3)); worked = 0; } }; // the host cools down
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const value = (r) => (!r ? 0 : r.won ? 1 + r.hp / r.maxHp : (r.wave - 1) / r.waves);

  // where the search starts: the mean, the spread, and the health of the bugs per level
  const prev = opt('--from') && existsSync(opt('--from')) ? JSON.parse(readFileSync(opt('--from'), 'utf8')) : null;
  let mean = prev ? vectorOf(prev.policy) : ZERO(), sd = prev?.sd || [...Array(NP).fill(.6), ...Array(NU).fill(.6), ...Array(MAZE.length).fill(.8)];
  if (args.includes('--free-maze')) { sd = sd.map((v) => Math.max(v, .25)); for (let i = NP + NU; i < DIM; i++) { mean[i] = 0; sd[i] = 1; } mean[NP + NU] = .5; } // a little for length, nothing for the bot's own
  let h = prev?.h ? Object.fromEntries(levels.map((n) => [n, prev.h[n] ?? 1])) : null;
  if (!h) { // the smart bot's margin on every level (to four times the health of the bugs)
    process.stderr.write('the smart bot\'s margins… ');
    const items = levels.map((n) => ({ task: { level: n, opts: base[n] } })), at1 = run(items.map((x) => x.task)); // (on the draw of data.js)
    const ms = await margins(items.map((x, k) => ({ ...x, won: !!at1[k]?.won })), async (ts) => run(ts), { hi: 4 });
    h = Object.fromEntries(levels.map((n, k) => [n, r3((ms[k]?.at ?? 1) * 1.05)])); // a broken party: as if the bot held the bugs as they are
    process.stderr.write(levels.map((n) => `L${n + 1} ${ms[k(n)] ? `${Math.round(ms[k(n)].at * 100)}%` : '?'}`).join(' ') + '\n');
    function k(n) { return levels.indexOf(n); }
  }
  const history = prev?.history || [];
  const t0 = Date.now();
  for (let gen = 1; gen <= GENS; gen++) {
    // the mean itself and POP draws around it, every one on every level and seed
    const xs = [mean, ...Array.from({ length: POP }, () => mean.map((m, i) => m + sd[i] * gauss()))];
    const draws = waves.flatMap((w) => seeds.map((seed) => ({ w, seed })));
    const tasks = xs.flatMap((x) => { const policy = policyOf(x); return levels.flatMap((n) => draws.map(({ w, seed }) => ({ level: n, w, opts: { ...base[n], seed, policy, hp: h[n] } }))); });
    const res = run(tasks), per = levels.length * draws.length;
    const fit = xs.map((_, a) => res.slice(a * per, (a + 1) * per).reduce((t, r) => t + value(r), 0) / per);
    const order = xs.map((_, a) => a).sort((a, b) => fit[b] - fit[a]), elite = order.slice(0, ELITE).map((a) => xs[a]);
    // the levels the mean now wins with two stars on every seed: the bugs there get healthier
    const meanRes = res.slice(0, per);
    // (most of the draws: with several draws of the waves one bad one is the noise of the level, not the strategy)
    for (const n of levels) { const rs2 = meanRes.filter((_, i) => levels[Math.floor(i / draws.length)] === n); if (rs2.filter((r) => r && r.won && r.hp >= r.maxHp * .4).length >= Math.ceil(rs2.length * .75)) h[n] = r3(h[n] * 1.05); }
    const newMean = mean.map((_, i) => elite.reduce((t, x) => t + x[i], 0) / ELITE);
    sd = sd.map((s, i) => Math.max(.05, .3 * s + .7 * Math.sqrt(elite.reduce((t, x) => t + (x[i] - newMean[i]) ** 2, 0) / ELITE)));
    mean = newMean;
    history.push({ gen: history.length + 1, mean: r3(fit[0]), best: r3(fit[order[0]]), h: { ...h }, s: Math.round((Date.now() - t0) / 1000) });
    process.stderr.write(`gen ${history.length}: the mean ${fit[0].toFixed(3)}, the best ${fit[order[0]].toFixed(3)}, bugs ${levels.map((n) => `L${n + 1}×${h[n].toFixed(2)}`).join(' ')}, ${Math.round((Date.now() - t0) / 1000)}s\n`);
    writeFileSync(out, JSON.stringify({ policy: policyOf(mean.map(r3)), sd: sd.map(r3), h, levels: levels.map((n) => n + 1), seeds, waves, history }, null, 1));
    await rest();
  }
  console.log(out);
}
