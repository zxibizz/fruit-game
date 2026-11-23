// The door to the native bot (sim/src, built by cargo): the data as public/data.js has it now goes to fruit-sim with
// a list of scenarios, and what the bot made of each comes back.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportData } from './export.mjs';

const sim = join(dirname(fileURLToPath(import.meta.url)), '..');
export const BIN = join(sim, 'target', 'release', 'fruit-sim');
// builds the binary if the sources changed (a fraction of a second when they did not)
export function build() { execFileSync('cargo', ['build', '--release', '--quiet'], { cwd: sim, stdio: 'inherit' }); return BIN; }
function call(bin, cmd, body, jobs) {
  const dir = mkdtempSync(join(tmpdir(), 'fruit-sim-')), file = join(dir, 'batch.json');
  try { writeFileSync(file, JSON.stringify(body)); return JSON.parse(execFileSync(bin, [cmd, file, '--jobs', String(jobs)], { maxBuffer: 2 ** 31 - 1 }).toString()); } finally { rmSync(dir, { recursive: true }); }
}
// scenarios: [{ level, opts, record?, random? }], opts as the bot takes them (balance/scenario.mjs resolve): seed,
// route, terrain, powers (true, false, 'eager'), bank (dew), meta ({ perk: tier }), place, plants ([kinds] or null),
// upgrades, early, maxPlants, steps, maze (a maze of routes() by name, instead of route). Gives [{ res, ms }] in the same order, { err } for a party that broke;
// res is the bot's own report (won, hp, maxHp, wave, waves, plants, grown, maxed, dew, eaten, income, kinds, bites,
// powersUsed, trail, worth, time). record: a file the party is written to (every action and the hash of the state
// after every step); random: a player with no plan plays instead of the bot (for the parity check).
export function play(scenarios, { jobs = Math.max(1, Math.floor(availableParallelism() / 2)), bin = null, data = exportData() } = {}) {
  if (!bin) build(); // a given binary (a snapshot run.mjs took) is used as it is
  const t = trustOf(data); if (t) scenarios = scenarios.map((s) => (s.random || s.opts?.trust != null ? s : { ...s, opts: { ...s.opts, trust: t } }));
  return call(bin || BIN, 'run', { data, scenarios }, jobs);
}
// The bot's trust in its own count of what a plant does (balance/calibrate.mjs fits it): { plant: [itself, branch a,
// branch b] } in balance/trust.json, handed over in the order of the plants of the data; none: the count as it is.
const TRUST = new URL('../../balance/trust.json', import.meta.url);
export const trustOf = (data, t = existsSync(TRUST) ? JSON.parse(readFileSync(TRUST, 'utf8')) : null) => (t ? Object.keys(data.TIERS).flatMap((k) => t[k] || [1, 1, 1]) : null);
// the maze the bot builds on a level: [[column, row of the gap], ...]
export function layout(level, terrain = true) { build(); return call(BIN, 'layout', { data: exportData(), level, terrain }, 1); }
// the mazes of the balance matrix on those levels (sim/src/routes.rs): [{ level, base, max, routes: [{ name, class,
// shape, len, walls, trail }] }] — base: the trail as it is, max: the longest found, in cells
export function routes(levels, { bin = null, data = exportData() } = {}) { if (!bin) build(); return call(bin || BIN, 'routes', { data, levels }, 1); }
