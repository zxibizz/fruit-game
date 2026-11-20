import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, place, placeProblem, trail, startWave, removePlant, upgrade, usePower, earlyBonus, regrow, regrowCost, stubAt, heal, healCost, COLS, ROWS, BREAK } from '../public/game.js';
import { LEVELS, PLANTS, BUGS, PLANT_ORDER } from '../public/data.js';
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
  for (let j = 1; j < ROWS; j++) assert.ok(place(g, 'pumpkin', 7, j), `row ${j}`);
  startWave(g);
  for (let n = 0; n < 60 * 60 && g.phase === 'wave'; n++) {
    step(g, 1 / 60);
    for (const b of g.bugs) if (!b.fly) { const i = Math.floor(b.x), j = Math.floor(b.y); if (i < COLS) assert.ok(!g.grid[j]?.[i]?.type, `bug in a plant at ${i},${j}`); }
  }
});

test('the bot wins every level with the whole field planted (balance check)', () => {
  for (let n = 0; n < LEVELS.length; n++) {
    const r = playLevel(n);
    assert.ok(r.won, `level ${n + 1} lost at wave ${r.wave}`);
    assert.ok(r.plants >= 44, `level ${n + 1}: the dew of the level should fill the field, got ${r.plants} plants`);
  }
});

test('a garden on half of the field loses every level, however well it is upgraded', () => {
  for (let n = 0; n < LEVELS.length; n++) assert.equal(playLevel(n, { maxPlants: 28 }).won, false, `level ${n + 1}`);
});

test('levels are long and their waves grow', () => {
  LEVELS.forEach((L, n) => {
    assert.ok(L.waves.length >= 20, `level ${n + 1}`);
    const weight = (w) => w.reduce((s, [k, c]) => s + c * BUGS[k].w, 0);
    assert.ok(weight(L.waves[L.waves.length - 1]) > 5 * weight(L.waves[0]), `level ${n + 1}`);
    assert.ok(L.waves.some((w) => w.some(([k]) => BUGS[k].dig)), `level ${n + 1} has diggers`);
  });
});

test('dew comes only from bugs and waves: no plant makes it', () => {
  const g = createGame(2); g.dew = 5000;
  PLANT_ORDER.forEach((type, k) => assert.ok(place(g, type, 8, k), type));
  const dew = g.dew;
  for (let n = 0; n < 60 * 90; n++) step(g, 1 / 60);
  assert.equal(g.dew, dew);
});

// one bug of the kind walks in; the field is left as it is
function send(g, kind) { startWave(g); g.queue = [{ kind, at: 0 }]; }

test('a digger eats through the wall in its way; the roots grow back for a part of the price', () => {
  const g = createGame(0); g.dew = 1000;
  for (let j = 1; j < ROWS; j++) assert.ok(place(g, 'pumpkin', 7, j), `row ${j}`);
  const long = trail(g).length; send(g, 'cricket');
  let dead = null;
  for (let n = 0; n < 60 * 120 && !dead; n++) { step(g, 1 / 60); dead = g.events.find((e) => e.t === 'plantDead'); g.events.length = 0; }
  assert.ok(dead, 'a plant was eaten');
  const s = stubAt(g, dead.p.i, dead.p.j);
  assert.ok(s, 'roots are left'); assert.ok(trail(g).length < long, 'the trail got shorter');
  for (let n = 0; n < 60 * 3; n++) step(g, 1 / 60); // the digger walks on
  const dew = g.dew; assert.ok(regrow(g, s)); assert.equal(g.dew, dew - regrowCost(s));
  assert.equal(regrowCost(s), Math.ceil(PLANTS.pumpkin.cost / 3));
  assert.equal(g.grid[s.j][s.i].type, 'pumpkin'); assert.equal(trail(g).length, long); assert.equal(g.stubs.length, 0);
});

test('a digger walks round when the way round is short', () => {
  const g = createGame(0); g.dew = 1000;
  place(g, 'pumpkin', 7, 3); send(g, 'cricket');
  for (let n = 0; n < 60 * 120 && g.phase === 'wave'; n++) step(g, 1 / 60);
  assert.equal(g.plants.length, 1); assert.equal(g.stubs.length, 0);
});

test('aloe heals the plants around and grows the eaten ones back for free; a bitten plant can be healed for dew', () => {
  const g = createGame(0); g.dew = 1000;
  place(g, 'aloe', 7, 4); place(g, 'pumpkin', 7, 5); place(g, 'rose', 7, 3); place(g, 'pumpkin', 12, 7);
  const [, pumpkin, rose, far] = g.plants;
  pumpkin.hp = 10; far.hp = 10;
  for (let n = 0; n < 60 * 5; n++) step(g, 1 / 60);
  assert.ok(pumpkin.hp > 20); assert.equal(far.hp, 10);
  const cost = healCost(far), dew0 = g.dew; assert.ok(cost > 0 && cost <= Math.ceil(PLANTS.pumpkin.cost / 3));
  assert.ok(heal(g, far)); assert.equal(far.hp, far.maxHp); assert.equal(g.dew, dew0 - cost); assert.equal(heal(g, far), false);
  upgrade(g, rose); removePlant(g, rose, false);
  assert.ok(stubAt(g, 7, 3)); const dew = g.dew;
  for (let n = 0; n < 60 * (PLANTS.aloe.regrow[0] + 1); n++) step(g, 1 / 60);
  assert.equal(g.grid[3][7]?.type, 'rose'); assert.equal(g.grid[3][7].lvl, 2); assert.equal(g.dew, dew);
});

test('rain grows the eaten plants back, and powers come back every tenth wave', () => {
  const g = createGame(0); g.dew = 1000; place(g, 'rose', 7, 3);
  removePlant(g, g.plants[0], false); assert.equal(g.plants.length, 0);
  assert.ok(usePower(g, 'rain')); assert.equal(g.grid[3][7]?.type, 'rose'); assert.equal(g.powers.rain, 0);
  g.wave = 9; send(g, 'ant'); g.bugs.length = 0; g.queue.length = 0; step(g, 1 / 60);
  assert.equal(g.wave, 10); assert.equal(g.phase, 'build'); assert.equal(g.powers.rain, 1); assert.equal(g.powers.frost, 2);
});

test('after the first wave the next one starts by itself; calling it early pays dew', () => {
  const g = createGame(0); g.dew = 1000;
  for (let j = 0; j < ROWS; j++) if (j !== 3) place(g, 'rose', 11, j);
  startWave(g);
  for (let n = 0; n < 60 * 120 && g.phase === 'wave'; n++) step(g, 1 / 60);
  assert.equal(g.phase, 'build'); assert.equal(g.nextIn, BREAK);
  for (let n = 0; n < 60 * 5; n++) step(g, 1 / 60);
  const bonus = earlyBonus(g), dew = g.dew; assert.equal(bonus, BREAK - 5);
  assert.ok(startWave(g)); assert.equal(g.dew, dew + bonus); assert.equal(g.wave, 2);
  for (let n = 0; n < 60 * 120 && g.phase === 'wave'; n++) step(g, 1 / 60);
  for (let n = 0; n < 60 * (BREAK + 1) && g.phase === 'build'; n++) step(g, 1 / 60);
  assert.equal(g.wave, 3); assert.equal(g.phase, 'wave');
});
