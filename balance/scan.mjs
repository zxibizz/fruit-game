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
//     runs `secs` at most and stops once its champion has not risen for `stall` seconds, or holds bugs `goal` times healthier
import { execFileSync, spawnSync, spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportData } from '../sim/js/export.mjs';
import { build, trustOf } from '../sim/js/play.mjs';

// The seeds of the game a party is measured on, and searched on. The search had five of them once (three seeds it never
// saw to tell its fit): it fitted its parties to the five wherever flyers are drawn — «Большая поляна» ×1.55 on the five
// and ×1.05 on all eight, and that champion pushed the party of its make that held ×1.41 on eight out of the archive.
export const SEEDS = [7, 11, 13, 17, 19, 23, 29, 31];
export const SEARCH_SEEDS = SEEDS;
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
// the same without waiting: several of them side by side, a job each
function callAsync(cmd, body, { bin = null, jobs = 1 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'fruit-scan-')), file = join(dir, 'req.json'); writeFileSync(file, JSON.stringify(body));
  return new Promise((ok, no) => { const c = spawn(bin || build(), [cmd, file, '--jobs', String(jobs)], { stdio: ['ignore', 'pipe', 'ignore'] }); let out = '';
    c.stdout.on('data', (d) => { out += d; }); c.on('close', (code) => { rmSync(dir, { recursive: true }); if (code !== 0) no(new Error(`fruit-sim ${cmd} failed`)); else ok(JSON.parse(out)); }); });
}
// every one of `list` through `fn`, `n` at a time
export async function pool(list, n, fn) { const out = new Array(list.length); let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, n) }, async () => { while (next < list.length) { const q = next++; out[q] = await fn(list[q], q); } })); return out; }
export const PAR = JOBS;
export function scan(tasks, { seeds = SEEDS, from = -6, to = 14, what = 'clean', full = false, data = exportData(), ...how } = {}) {
  return call('scan', { data, tasks: tasks.map((t) => ({ level: t.level, opts: withTrust(t.opts, data) })), seeds, from, to, what, full }, how);
}
export function search({ level, opts, plans = [], bots = [], seeds = SEARCH_SEEDS, secs = 120, stall = 45, goal = null, only = null, rng = 1, check = false, data = exportData() }, how = {}) {
  return call('perfect', { data, level, opts: withTrust(opts, data), plans, bots: bots.map((o) => withTrust(o, data)), seeds, secs, stall, goal, only, rng, check }, how);
}
export function searchAsync({ level, opts, plans = [], bots = [], seeds = SEARCH_SEEDS, secs = 120, stall = 45, goal = null, only = null, rng = 1, data = exportData() }, how = {}) {
  return callAsync('perfect', { data, level, opts: withTrust(opts, data), plans, bots: bots.map((o) => withTrust(o, data)), seeds, secs, stall, goal, only, rng }, how);
}
