// The worth of a party, read off a grid (sim/src/perfect.rs, `fruit-sim scan` and `fruit-sim perfect`).
// Whether the fruit is bitten does not turn on one health of the bugs — a party may be clean against bugs 10% healthier,
// bitten against 20% and clean again against 40% — so a margin is not found by halving. Every party is played on every
// rung of a grid (the bugs 1.05^k times healthier, k from..to) on every seed asked (where the flyers come from is drawn
// by the game: eight seeds, three of them never seen by the search); its margin is the last rung before the first it fails
// on, on any seed.
//   scan(tasks, { what, full }) → [{ margin, open (never failed up to the top rung), seeds (how many were played: one
//     where nothing in the level is drawn by the seed), grid: [[k, health, seeds held]] }]; the rungs above the first
//     failure are not played unless `full`
//   what: 'clean' (won, the fruit never bitten), 'stars' (won with three stars: 80% of the fruit left), 'won'
//   search(request) → { plan, margin, history, tried, parties }: the best perfect party found (perfect.rs has how); it
//     runs `secs` at most and stops once its champion has not risen for `stall` seconds
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportData } from '../sim/js/export.mjs';
import { build, trustOf } from '../sim/js/play.mjs';

// The seeds of the game a party is measured on, and the ones it is searched on (the other three: seeds the search never
// saw). On three seeds the search fitted its parties to them where there are flyers: «Большая поляна» ×1.80 on its
// three and ×1.55 on five.
export const SEEDS = [7, 11, 13, 17, 19, 23, 29, 31];
export const SEARCH_SEEDS = [7, 11, 13, 17, 19];
export const TARGET = 1 / 0.7;
const JOBS = Math.max(1, availableParallelism() - 1);
// the bot's trust in its own count (balance/trust.json), as sim/js/play.mjs hands it over
export const withTrust = (opts, data) => { const t = trustOf(data); return t && opts.trust == null ? { ...opts, trust: t } : opts; };
function call(cmd, body, { bin = null, jobs = JOBS, quiet = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'fruit-scan-')), file = join(dir, 'req.json');
  try { writeFileSync(file, JSON.stringify(body));
    const r = spawnSync(bin || build(), [cmd, file, '--jobs', String(jobs)], { maxBuffer: 2 ** 30, stdio: ['ignore', 'pipe', quiet ? 'ignore' : 'inherit'] });
    if (r.status !== 0) throw new Error(`fruit-sim ${cmd} failed`);
    return JSON.parse(r.stdout.toString()); } finally { rmSync(dir, { recursive: true }); }
}
export function scan(tasks, { seeds = SEEDS, from = -6, to = 14, what = 'clean', full = false, data = exportData(), ...how } = {}) {
  return call('scan', { data, tasks: tasks.map((t) => ({ level: t.level, opts: withTrust(t.opts, data) })), seeds, from, to, what, full }, how);
}
export function search({ level, opts, plans = [], bots = [], seeds = SEARCH_SEEDS, secs = 120, stall = 45, only = null, rng = 1, check = false, data = exportData() }, how = {}) {
  return call('perfect', { data, level, opts: withTrust(opts, data), plans, bots: bots.map((o) => withTrust(o, data)), seeds, secs, stall, only, rng, check }, how);
}
