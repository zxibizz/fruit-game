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

// The route group of the balance matrix: mazes of every length of the trail, each in several shapes (sim/src/routes.rs).
// What is said of a maze there must be what the game makes of it, and the lengths must be what their names say.
test('the mazes of the balance matrix: the game walks them as long as they are said to be, every length in more than one shape', async () => {
  const { LEVELS } = await import('../public/data.js'), { createGame, place, placeProblem, trails } = await import('../public/game.js'), { routes } = await import('../sim/js/play.mjs');
  const ORDER = ['min', 'mid', 'above', 'max'];
  for (const L of routes(LEVELS.map((_, n) => n).filter((n) => !LEVELS[n].map.some((r) => r.includes('_'))))) { // (a stone path has no mazes)
    const at = `level ${L.level + 1}`, walk = (walls) => { const g = createGame(L.level, 1); g.dew = 1e9;
      for (const w of walls) for (const [i, j] of w) if (!placeProblem(g, i, j)) place(g, 'pumpkin', i, j);
      return Math.min(...trails(g).map((t) => t.length)); };
    assert.equal(walk([]), L.base, `${at}: the trail as it is`);
    for (const r of L.routes) assert.equal(walk(r.walls), r.len, `${at} ${r.name}`);
    assert.ok(L.routes.some((r) => r.shape === 'best'), `${at}: the bot's own maze is among them`);
    let last = L.base;
    for (const c of ORDER) {
      const list = L.routes.filter((r) => r.class === c && r.shape !== 'best'), own = L.routes.filter((r) => r.class === c).length; // the bot's maze sits where its length puts it
      assert.ok(own > 0, `${at}: no maze of the length ${c}`);
      if (c === 'min' || c === 'mid') assert.ok(own >= 3, `${at} ${c}: ${own} shape(s)`);
      if (!list.length) continue;
      const lo = Math.min(...list.map((r) => r.len)); assert.ok(lo > last, `${at}: ${c} (${lo}) is no longer than the length before it (${last})`); last = Math.max(...list.map((r) => r.len));
    }
    assert.equal(Math.max(...L.routes.map((r) => r.len)), L.max, `${at}: the longest`);
  }
});

// A strategy (sim/src/bot.rs, Policy; balance/strategy.mjs finds its weights) leans on the bot's own weighing of its
// steps: with every weight at nothing it is the smart bot, step for step, and a wrong number of weights is an error.
test('a strategy of zeros plays as the smart bot; weights of the wrong size are refused', async () => {
  const { LEVELS } = await import('../public/data.js'), { play } = await import('../sim/js/play.mjs'), { resolve } = await import('../balance/scenario.mjs');
  const { KINDS, FEATURES, MAZE, SMART, policyOf } = await import('../balance/strategy.mjs');
  const zero = policyOf(Array(KINDS.length * FEATURES.length + KINDS.length + MAZE.length).fill(0)); zero.maze = null;
  const ls = [0, 3, 6].filter((n) => n < LEVELS.length), opts = (n, o = {}) => ({ level: n, opts: { ...resolve({ level: n, opts: SMART }), steps: 9000, ...o } });
  const a = play(ls.map((n) => opts(n))), b = play(ls.map((n) => opts(n, { policy: zero })));
  ls.forEach((n, k) => assert.deepEqual(b[k].res, a[k].res, `level ${n + 1}`));
  assert.throws(() => play([opts(0, { policy: { ...zero, place: { ...zero.place, rose: [1, 2] } } })]), /weights/);
});
