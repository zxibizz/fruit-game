// Tall against wide (docs/rebalance-tall.md, criteria 1 and 2): for every level the best party the search finds of
// every kind of garden, side by side.
//   node balance/tallwide.mjs [--levels 1,4,8] [--gardens free,tallD,wide25] [--set K=V,...] [--secs 120] [--stall 45] [--runs 2]
//     [--meta exp3] [--from DIR] [--out DIR] [--jobs N]
// Gardens: free — no bounds (what balance/party.mjs looks for); tallK — K shooters at most (every plant but the
// pumpkins: a maze of pumpkins is free), grown as far as wanted; flatL — as many plants as wanted, no shooter grown
// past level L; wideN — N shooters at least, grown as far as wanted (the many plants of a wide garden, with what growing
// pays on top: the best free parties of 0.31 are such). The search (sim/src/perfect.rs) and the bot spending the dew left keep to the bounds (wideN: the search only). Every search
// starts from the kept perfect party of the level (balance/perfect/L<n>.json, cut to the bounds), the smart bot and the
// expert playing within them, and with --from DIR the best plans of an earlier run (DIR/L<n>.<garden>.json, written
// with --out DIR): after a change of the numbers the last best of each garden is the best start there is. Every garden
// gets the same time and as many runs (other draws of the search): the search is noisy (docs/balance-issues.md, 7),
// and a tall garden against a flat one is only told apart with the same effort on both.
// Each cell: the margin with the fruit never bitten (clean) and of a plain win (won), as balance/scan.mjs measures them
// (a grid of health, eight seeds); then, of the best party played once at the health as it is (seed 7): shooters,
// pumpkins, how many grown / at the top, the dew it got and the dew left at the end, and the share of the dew spent
// on plants at levels 3-4 (the families on a branch, from the search). The ratios printed under every level are those
// of criterion 1, for the gardens that were searched: tallD / wide25 and tall12 / wide25 (the owner's band ×1.10–1.15),
// and tall12 / flat2.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { LEVELS } from '../public/data.js';
import { exportData } from '../sim/js/export.mjs';
import { play, build } from '../sim/js/play.mjs';
import { resolve, applyOverrides, levelDew } from './scenario.mjs';
import { EXPERT } from './plans.mjs';
import { kept } from './perfect.mjs';
import { scan, searchAsync, pool, PAR } from './scan.mjs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ranges = (s) => s.split(',').flatMap((p) => { const [a, b] = p.split('-').map(Number); return Array.from({ length: (b || a) - a + 1 }, (_, k) => a + k - 1); });
const levels = ranges(opt('--levels', '1,4,8')), GARDENS = opt('--gardens', 'free,tallD,wide25').split(',').filter((g) => g && g !== 'none');
const SECS = Number(opt('--secs', 120)), STALL = Number(opt('--stall', 45)), RUNS = Number(opt('--runs', 2)), META = opt('--meta', 'exp3');
const FROM = opt('--from'), OUT = opt('--out'), JOBS = Number(opt('--jobs', PAR));
const SMART = { route: 1, place: 'best', upgrades: 'greedy', terrain: true, powers: true, early: true };
const num = (v) => (Number.isNaN(Number(v)) ? v : Number(v));
// --set K=V,...: other numbers (as balance/run.mjs --set takes them: PLANTS.pepper.b.from=2, L1.budget=6/3.2)
applyOverrides(Object.fromEntries((opt('--set', '') || '').split(',').filter(Boolean).map((kv) => { const [k, v] = kv.split('='); return [k.trim(), num(v.trim())]; })));
// tallD: the owner's tall garden (2026-11-25) — a cap that grows with the dew of the level, at most 28: 12 shooters
// on «Развилка», 18 on «Поляна», 21 on «Большая поляна», 28 from «Лужайка» on
export const tallCap = (n) => Math.min(28, Math.round(levelDew(n, {}) / 450));
const bounds = (g, n) => { if (g === 'tallD') return { maxShooters: tallCap(n) }; const m = /^(free|tall|flat|wide)(\d*)$/.exec(g); if (!m) throw new Error(`a garden is free, tallK, flatL or wideN, not ${g}`);
  return m[1] === 'tall' ? { maxShooters: Number(m[2]) } : m[1] === 'flat' ? { flat: Number(m[2]) } : m[1] === 'wide' ? { minShooters: Number(m[2]) } : {}; };
const bin = build(), data = exportData(), log = (s) => process.stderr.write(s + '\n'), T0 = Date.now();
const file = (dir, n, g) => `${dir}/L${n + 1}.${g}.json`;

// every search: a level, a garden, a run
const jobs = [];
for (const n of levels) for (const g of GARDENS) {
  const opts = resolve({ level: n, opts: { ...SMART, meta: META, ...bounds(g, n) } });
  // (a tallD of an earlier run, or the tallK of the same cap)
  const from = FROM ? [g, ...(g === 'tallD' ? [`tall${tallCap(n)}`] : [])].map((x) => file(FROM, n, x)).find((f) => existsSync(f)) : null;
  const plans = [kept(n)?.plan, from ? JSON.parse(readFileSync(from, 'utf8')).plan : null].filter(Boolean);
  const bots = [opts, ...(EXPERT ? [{ ...opts, policy: EXPERT }] : [])];
  for (let r = 1; r <= RUNS; r++) jobs.push({ n, g, r, opts, plans, bots });
}
log(`${jobs.length} searches of ${SECS} s at most (stopping ${STALL} s after the last rise), ${JOBS} at a time: about ${Math.ceil(jobs.length / JOBS) * SECS / 60} min at most`);
const found = await pool(jobs, JOBS, async (j) => {
  const res = await searchAsync({ level: j.n, opts: j.opts, plans: j.plans, bots: j.bots, secs: SECS, stall: STALL, rng: j.r, data }, { bin, jobs: 1 });
  log(`  [${Math.round((Date.now() - T0) / 1000)} s] L${j.n + 1} ${j.g} run ${j.r}: ×${res.margin.toFixed(2)} (${res.tried} tried)`); return res;
});
// the best run of every level and garden
const best = new Map();
jobs.forEach((j, q) => { const key = j.n + ':' + j.g, r = found[q], b = best.get(key); if (!b || r.margin > b.res.margin) best.set(key, { ...j, res: r, runs: [] }); });
jobs.forEach((j, q) => best.get(j.n + ':' + j.g).runs.push(found[q].margin));
const cells = [...best.values()], tasks = cells.map((c) => ({ level: c.n, opts: { ...c.opts, plan: c.res.plan } }));
const clean = scan(tasks, { data, bin, to: 24, quiet: true }), won = scan(tasks, { data, bin, what: 'won', to: 24, quiet: true }); // (to 24: ×3.2 — the default ×1.98 cut the best parties short once the numbers moved past the hp of 0.31)
const one = play(tasks.map((t) => ({ level: t.level, opts: { ...t.opts, seed: 7 } })), { bin, data });
if (OUT) mkdirSync(OUT, { recursive: true });
const rows = cells.map((c, q) => {
  const r = one[q].res, mix = c.res.archive?.[0]?.mix || {}, tall = Object.entries(mix).filter(([f]) => f.includes('.')).reduce((t, [, x]) => t + x, 0);
  const pumpkins = r?.kinds?.pumpkin || 0, shooters = r ? Object.entries(r.kinds).filter(([k]) => k !== 'pumpkin').reduce((t, [, x]) => t + x, 0) : NaN;
  const row = { level: c.n + 1, garden: c.g, clean: clean[q].margin, cleanOpen: clean[q].open, won: won[q].margin, wonOpen: won[q].open, runs: c.runs,
    shooters, pumpkins, grown: r?.grown, top: r?.maxed, dewIn: r ? Math.round(LEVELS[c.n].dew + r.income) : null, dewLeft: r ? Math.round(r.dew) : null, tallShare: tall, mix, plan: c.res.plan };
  if (OUT) writeFileSync(file(OUT, c.n, c.g), JSON.stringify(row) + '\n');
  return row;
});
// criterion 4: the lazy gardens of the test «a garden beside the untouched trail loses every level» (the smart bot with no
// maze, planted best / at the end / at the start / spread) must not win once hp sets the best free party at ×1.43: their
// margin of a plain win under 0.7 of the best clean party
const LAZY = ['best', 'end', 'start', 'spread'], lazy = levels.flatMap((n) => LAZY.map((place) => ({ level: n, opts: resolve({ level: n, opts: { ...SMART, route: 0, meta: META, place } }) })));
const lazyWon = scan(lazy, { data, bin, what: 'won', from: -14, to: 24, quiet: true });
const x = (m, open) => `×${m.toFixed(2)}${open ? '+' : ''}`;
for (const n of levels) {
  console.log(`L${n + 1} ${LEVELS[n].name}`);
  const mine = rows.filter((r) => r.level === n + 1), get = (g) => mine.find((r) => r.garden === g);
  for (const r of mine) console.log(`  ${(r.garden === 'tallD' ? `tall${tallCap(n)}` : r.garden).padEnd(7)} clean ${x(r.clean, r.cleanOpen).padEnd(7)} won ${x(r.won, r.wonOpen).padEnd(7)} (runs ${r.runs.map((m) => m.toFixed(2)).join(' ')})   shooters ${r.shooters}, pumpkins ${r.pumpkins}, grown ${r.grown}, top ${r.top}, dew ${r.dewIn} left ${r.dewLeft}, at levels 3-4 ${Math.round(r.tallShare * 100)}%`);
  const lz = levels.indexOf(n), lw = LAZY.map((_, q) => lazyWon[lz * LAZY.length + q].margin), worst = Math.max(...lw);
  // (over the best party of any garden: each is a party of the free game too, and a short search of the free game may
  // find less than one of a bounded garden does)
  const top = Math.max(0, ...mine.map((r) => r.clean));
  console.log(`  lazy (no maze) won ${lw.map((m) => m.toFixed(2)).join(' / ')} (${LAZY.join(' / ')})${mine.length ? `: the best of them over the best clean party ${top > 0 ? `×${(worst / top).toFixed(2)}` : '-'} (wanted < 0.70)` : ''}`);
  for (const [a, b, want] of [['tallD', 'wide25', '1.10–1.15'], ['tall12', 'wide25', '1.10–1.15'], ['tall12', 'flat2', '']]) if (get(a) && get(b)) {
    const q = (k) => (get(b)[k] > 0 ? (get(a)[k] / get(b)[k]).toFixed(2) : '-');
    console.log(`  ${a} / ${b}: clean ×${q('clean')}, won ×${q('won')}${want ? ` (wanted ${want})` : ''}`);
  }
}
