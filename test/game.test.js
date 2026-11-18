import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, COLS, ROWS, TRAPS, makeWaves } from '../public/data.js';
import * as G from '../public/game.js';
import { play } from './bot.mjs';

const at = (x, y) => G.cellOf(x + 0.5, y + 0.5);

test('every map is COLS x ROWS with a 2x2 fruit and burrows on the border that reach it', () => {
  LEVELS.forEach((l, i) => {
    assert.equal(l.map.length, ROWS, `level ${i + 1}`);
    for (const row of l.map) assert.equal(row.length, COLS, `level ${i + 1}: ${row}`);
    const g = G.newGame(i);
    const fruit = [...g.tiles].map((c, k) => (c === 'F' ? k : -1)).filter((k) => k >= 0);
    assert.equal(fruit.length, 4, `level ${i + 1}`);
    const xs = fruit.map((k) => k % COLS), ys = fruit.map((k) => (k / COLS) | 0);
    assert.equal(Math.max(...xs) - Math.min(...xs), 1);
    assert.equal(Math.max(...ys) - Math.min(...ys), 1);
    assert.ok(g.spawns.length > 0);
    for (const s of g.spawns) {
      const x = s % COLS, y = (s / COLS) | 0;
      assert.ok(x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1, `level ${i + 1}: burrow ${x},${y} not on the border`);
      assert.ok(g.dist[s] < Infinity, `level ${i + 1}: burrow ${x},${y} cannot reach the fruit`);
      assert.ok(g.distStone[s] <= g.dist[s]);
    }
  });
});

test('every level has waves of known insects', () => {
  LEVELS.forEach((l, i) => {
    const w = makeWaves(l, i);
    assert.equal(w.length, l.waves);
    for (const groups of w) for (const gr of groups) assert.ok(l.enemies.includes(gr.kind), `${gr.kind} in level ${i + 1}`);
  });
});

test('a trap may not cut the only road, but may close one of two', () => {
  const g = G.newGame(0); // one long trench
  assert.equal(G.canBuild(g, 'spiker', at(1, 5)), 'blocks');
  assert.equal(G.canBuild(g, 'spiker', at(0, 0)), '');
  const h = G.newGame(2); // straight road with two detours
  const before = G.routeLength(h);
  assert.equal(G.canBuild(h, 'spiker', at(8, 5)), '');
  G.build(h, 'spiker', at(8, 5));
  assert.ok(G.routeLength(h) > before + 4, 'the ants now take the long way');
  assert.equal(G.canBuild(h, 'spiker', at(8, 1)), '');
  G.build(h, 'spiker', at(8, 1));
  assert.equal(G.canBuild(h, 'spiker', at(8, 8)), 'blocks', 'the last detour stays open');
});

test('stones, coins, upgrades and selling', () => {
  const g = G.newGame(0);
  assert.equal(G.canBuild(g, 'slow', at(0, 0)), 'locked');
  const coins = g.coins;
  const t = G.build(g, 'spiker', at(4, 4));
  assert.equal(g.coins, coins - TRAPS.spiker.cost[0]);
  assert.equal(G.canBuild(g, 'spiker', at(4, 4)), 'busy');
  assert.ok(G.upgrade(g, t.id));
  assert.equal(t.lvl, 1);
  const back = G.sellValue(t);
  assert.ok(G.sell(g, t.id));
  assert.equal(g.coins, coins - TRAPS.spiker.cost[0] - TRAPS.spiker.cost[1] + back);
  const s = G.newGame(4); // level 5 has a stone wall
  const stone = [...s.tiles].indexOf('#');
  assert.equal(G.canBuild(s, 'spiker', stone), 'tile');
});

test('a saved level continues exactly like the original', () => {
  const a = G.newGame(5);
  G.build(a, 'spiker', at(4, 4));
  G.build(a, 'pepper', at(6, 4));
  G.start(a);
  for (let i = 0; i < 60 * 30; i++) G.step(a);
  const b = G.restore(JSON.parse(G.serialize(a)));
  for (let i = 0; i < 60 * 30; i++) { G.step(a); G.step(b); }
  a.events.length = 0; b.events.length = 0;
  assert.equal(G.serialize(a), G.serialize(b));
});

test('the test bot wins every level (the levels are passable without perfect play)', () => {
  for (let L = 0; L < LEVELS.length; L++) {
    const r = play(L);
    assert.equal(r.state, 'won', `level ${L + 1}: ${JSON.stringify({ hp: r.hp, wave: r.wave })}`);
  }
});
