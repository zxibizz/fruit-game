import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, place, upgrade, startWave, step } from '../public/game.js';
import { createTelemetry } from '../public/telemetry.js';

// The recorder of public/telemetry.js on a real party of the game: what a player did and what the wave did come out
// as records, they wait in storage until the server takes them, and nothing is lost when it does not.
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

test('a party is recorded wave by wave: the garden, the trail, what was built and what bit the fruit', async () => {
  const sent = []; let up = false;
  const tm = createTelemetry({ storage: memory(), post: async (body) => { if (up) sent.push(...JSON.parse(body)); return up; } });
  const g = createGame(0, 7, {}); tm.start(g);
  g.dew = 1000; for (let j = 0; j < 7; j++) place(g, 'pumpkin', 9, j); place(g, 'rose', 8, 3); place(g, 'pepper', 10, 4); upgrade(g, g.plants.at(-1));
  tm.observe(g); g.events.length = 0;
  startWave(g);
  for (let n = 0; n < 60 * 90 && g.phase === 'wave'; n++) { step(g, 1 / 60); tm.tick(1 / 60, 2, false); tm.observe(g); g.events.length = 0; }
  assert.equal(g.phase, 'build', 'the first wave is over');
  assert.ok(tm.pending >= 2, 'kept while the server is away');
  up = true; await tm.flush();
  assert.equal(tm.pending, 0, 'sent and dropped');
  const [start, wave] = sent;
  assert.equal(start.type, 'start'); assert.equal(start.level, 0); assert.equal(start.seed, 7); assert.ok(start.dev && start.id && start.ver);
  assert.equal(wave.type, 'wave'); assert.equal(wave.n, 1); assert.equal(wave.id, start.id);
  assert.equal(wave.garden.plants.length, 9); assert.ok(wave.garden.trail > 14, 'the pumpkins lengthen the trail');
  assert.deepEqual(wave.before.filter((a) => a[0] === 'place').length, 9); assert.equal(wave.before.filter((a) => a[0] === 'up').length, 1);
  assert.ok(Object.values(wave.kills).reduce((a, b) => a + b, 0) > 0, 'kills counted');
  assert.ok(wave.t > 0 && wave.atSpeed[1] > 0, 'game and real time');
  assert.equal(typeof wave.dewEnd, 'number');
});

test('a party left in the middle is marked; disabled, nothing is kept', () => {
  const tm = createTelemetry({ storage: memory(), post: async () => false });
  const g = createGame(1, 3, {}); tm.start(g); startWave(g); tm.observe(g); g.events.length = 0; tm.quit(g);
  assert.equal(tm.pending, 3); // start, the wave left open, quit
  const off = createTelemetry({ storage: memory(), enabled: false }); off.start(g); off.quit(g); assert.equal(off.pending, 0);
});

test('sending: batches cut by size, a batch the server refuses as junk does not block the rest, records dropped by id', async () => {
  const bodies = []; let answer = 200;
  const tm = createTelemetry({ storage: memory(), post: async (body) => { bodies.push(body); return answer; } });
  const g = createGame(2, 1, {}); tm.start(g); await tm.flush(); bodies.length = 0;
  answer = 503; for (let k = 0; k < 150; k++) { g.wave = 0; startWave(g); tm.observe(g); g.events.length = 0; tm.closeWave(g, 0); g.phase = 'build'; }
  await tm.flush(); assert.ok(tm.pending >= 150, 'kept while the server is down');
  answer = 413; await tm.flush(); const n0 = bodies.length;
  answer = 200; await tm.flush();
  assert.equal(tm.pending, 0, 'all gone: the refused batch dropped, the rest sent');
  for (const b of bodies.slice(n0)) assert.ok(b.length <= 200 * 1024 && JSON.parse(b).length <= 100, 'a request stays under the server limits');
});

test('a saved level taken up again goes on as the same party; a new level is a new one', () => {
  const st = memory(), tm = createTelemetry({ storage: st, post: async () => false });
  const g = createGame(4, 1, {}); tm.start(g); startWave(g); tm.observe(g); g.events.length = 0; tm.quit(g);
  const again = createTelemetry({ storage: st, post: async () => false }); again.start(createGame(4, 1, {}), true);
  const q = JSON.parse(st.getItem('fruit.tq')), ids = new Set(q.map((r) => r.id));
  assert.equal(ids.size, 1, 'one party across the resume'); assert.ok(q.some((r) => r.type === 'wave' && r.cut), 'the cut wave is marked');
  again.start(createGame(2, 1, {})); assert.equal(new Set(JSON.parse(st.getItem('fruit.tq')).map((r) => r.id)).size, 2, 'a fresh level, a fresh party');
});
