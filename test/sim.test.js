import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// The balance is measured on the native copy of the simulation (sim/src/game.rs), so it has to be the game itself:
// the native bot plays parts of several levels and players with no plan play every level, and public/game.js
// replays every party to the same state after every step. A rule changed in one copy only fails here.
// (sim/js/verify.mjs full: every scenario of the balance matrix; the Parity workflow runs it once a night.)
test('the native simulation and public/game.js walk the same way, step for step', () => {
  let out; try { out = execFileSync(process.execPath, [fileURLToPath(new URL('../sim/js/verify.mjs', import.meta.url)), 'fast'], { stdio: ['ignore', 'pipe', 'inherit'] }).toString(); } catch (e) { assert.fail(`\n${e.stdout}`); }
  assert.match(out, /all the same in both/);
});
