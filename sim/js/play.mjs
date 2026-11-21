// The door to the native bot (sim/src, built by cargo): the data as public/data.js has it now goes to fruit-sim with
// a list of scenarios, and what the bot made of each comes back.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
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
// upgrades, early, repair, maxPlants, steps. Gives [{ res, ms }] in the same order, { err } for a party that broke;
// res is the bot's own report (won, hp, maxHp, wave, waves, plants, grown, maxed, dew, eaten, income, kinds, bites,
// powersUsed, trail, worth, time). record: a file the party is written to (every action and the hash of the state
// after every step); random: a player with no plan plays instead of the bot (for the parity check).
export function play(scenarios, { jobs = Math.max(1, Math.floor(availableParallelism() / 2)), bin = null, data = exportData() } = {}) {
  if (!bin) build(); // a given binary (a snapshot run.mjs took) is used as it is
  return call(bin || BIN, 'run', { data, scenarios }, jobs);
}
// the maze the bot builds on a level: [[column, row of the gap], ...]
export function layout(level, terrain = true) { build(); return call(BIN, 'layout', { data: exportData(), level, terrain }, 1); }
