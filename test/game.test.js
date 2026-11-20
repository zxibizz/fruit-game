import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, place, placeProblem, trail, startWave, removePlant, upgrade, usePower, COLS, ROWS } from '../public/game.js';
import { LEVELS, PLANTS } from '../public/data.js';
import { playLevel } from './bot.mjs';

test('every level has a way from the entrance to the fruit', () => {
  LEVELS.forEach((L, n) => {
    const g = createGame(n), tr = trail(g), last = tr[tr.length - 1];
    assert.deepEqual(last, g.fruit, `level ${n + 1}`);
    assert.ok(L.plants.every((p) => PLANTS[p]), `level ${n + 1} plants`);
  });
});

test('a plant cannot close the way completely', () => {
  const g = createGame(0); g.dew = 10000;
  // wall off column 12 except one cell, then the last cell is refused
  for (let j = 0; j < ROWS - 1; j++) assert.ok(place(g, 'pumpkin', 12, j), `row ${j}`);
  assert.equal(placeProblem(g, 12, ROWS - 1), 'blocks');
  assert.equal(place(g, 'pumpkin', 12, ROWS - 1), false);
  assert.equal(trail(g).some(([i, j]) => i === 12 && j === ROWS - 1), true);
});

test('planting makes the trail longer, removing gives half the dew back', () => {
  const g = createGame(0); g.dew = 1000;
  const before = trail(g).length;
  for (let j = 0; j < ROWS - 1; j++) place(g, 'pumpkin', 12, j);
  assert.ok(trail(g).length > before);
  const p = g.plants[0], dew = g.dew; removePlant(g, p);
  assert.equal(g.dew, dew + Math.floor(PLANTS.pumpkin.cost / 2));
});

test('bugs that reach the fruit bite it and the level can be lost', () => {
  const g = createGame(0); startWave(g);
  for (let n = 0; n < 60 * 120 && g.phase === 'wave'; n++) step(g, 1 / 60);
  assert.ok(g.hp < g.maxHp);
  for (let w = 1; w < g.waves && g.phase !== 'lost'; w++) { startWave(g); for (let n = 0; n < 60 * 120 && g.phase === 'wave'; n++) step(g, 1 / 60); }
  assert.equal(g.phase, 'lost');
});

test('upgrades raise the level up to 3, powers are limited', () => {
  const g = createGame(0); g.dew = 1000; place(g, 'rose', 10, 0);
  const p = g.plants[0];
  assert.ok(upgrade(g, p)); assert.ok(upgrade(g, p)); assert.equal(upgrade(g, p), false); assert.equal(p.lvl, 3);
  assert.ok(usePower(g, 'rain')); assert.equal(usePower(g, 'rain'), false);
});

test('bugs never walk through plants', () => {
  const g = createGame(1); g.dew = 2000;
  for (let j = 1; j < ROWS; j++) place(g, 'pumpkin', 10, j);
  startWave(g);
  for (let n = 0; n < 60 * 60 && g.phase === 'wave'; n++) {
    step(g, 1 / 60);
    for (const b of g.bugs) if (!b.fly) { const i = Math.floor(b.x), j = Math.floor(b.y); if (i < COLS) assert.ok(!g.grid[j]?.[i]?.type, `bug in a plant at ${i},${j}`); }
  }
});

test('the bot wins every level (balance check)', () => {
  for (let n = 0; n < LEVELS.length; n++) {
    const r = playLevel(n);
    assert.ok(r.won, `level ${n + 1} lost at wave ${r.wave}`);
  }
});
