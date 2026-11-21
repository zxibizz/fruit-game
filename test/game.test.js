import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, place, placeProblem, plantOn, plantProblem, trail, trails, startWave, removePlant, upgrade, usePower, earlyBonus, regrow, regrowCost, stubAt, heal, healCost, refund, pstat, clearWeed, snapshot, restore, bugHp, COLS, ROWS, BREAK } from '../public/game.js';
import { LEVELS, PLANTS, BUGS, PLANT_ORDER, PERKS, PERK_ORDER, REGROW, WEED_COST, FERTILE, FATIGUE, wavePay } from '../public/data.js';
import { playLevel, expectedMeta, fullMeta } from './bot.mjs';
import { waveLint } from '../balance/lint.mjs';

test('every level has a way from the entrance to the fruit', () => {
  LEVELS.forEach((L, n) => {
    const g = createGame(n);
    assert.ok(g.entries.length >= 1 && L.fruit, `level ${n + 1} has anthills and a fruit`);
    for (const tr of trails(g)) assert.deepEqual(tr[tr.length - 1], g.fruit, `level ${n + 1}`);
    assert.ok(L.map.length === ROWS && L.map.every((r) => r.length === COLS), `level ${n + 1} map size`);
    assert.ok(L.boss.length >= 2 && L.boss.every(([at, kind]) => at <= L.count && BUGS[kind].boss), `level ${n + 1} bosses`);
    assert.ok(!L.waves.flat().some(([k]) => BUGS[k].fly) || L.plants.includes('dandelion') || !L.boss.some(([, k]) => BUGS[k].fly), `level ${n + 1}: a flying boss needs dandelions`);
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

test('planting makes the trail longer; a plant sells for all its dew before the wave and for half after', () => {
  const g = createGame(0); g.dew = 1000;
  const before = trail(g).length;
  for (let j = 0; j < ROWS - 1; j++) place(g, 'pumpkin', 12, j);
  assert.ok(trail(g).length > before);
  const p = g.plants[0], dew = g.dew; assert.equal(refund(g, p), PLANTS.pumpkin.cost); removePlant(g, p);
  assert.equal(g.dew, dew + PLANTS.pumpkin.cost);
  startWave(g); const q = g.plants[0], dew2 = g.dew; removePlant(g, q);
  assert.equal(g.dew, dew2 + Math.floor(PLANTS.pumpkin.cost / 2));
});

test('a new plant over an old one of another kind sells the old one first', () => {
  const g = createGame(2); g.dew = 100;
  place(g, 'rose', 12, 6); const trail0 = trail(g).length;
  assert.equal(plantProblem(g, 'rose', 12, 6), 'same');
  g.dew = PLANTS.corn.cost - PLANTS.rose.cost - 1; assert.equal(plantProblem(g, 'corn', 12, 6), 'poor');
  g.dew = PLANTS.corn.cost - PLANTS.rose.cost; assert.ok(plantOn(g, 'corn', 12, 6)); // fresh: the rose gives all its dew back
  assert.equal(g.dew, 0); assert.equal(g.grid[6][12].type, 'corn'); assert.equal(g.plants.length, 1); assert.equal(trail(g).length, trail0);
  startWave(g); g.dew = 0; const spent = g.grid[6][12].spent; // later only half comes back
  assert.equal(plantProblem(g, 'pumpkin', 12, 6), null); assert.ok(plantOn(g, 'pumpkin', 12, 6));
  assert.equal(g.dew, Math.floor(spent / 2) - PLANTS.pumpkin.cost); assert.equal(g.grid[6][12].type, 'pumpkin');
});

test('a dandelion hits walkers too, weaker, and takes the flyers first', () => {
  const n = LEVELS.findIndex((L) => L.plants.includes('dandelion'));
  const shoot = (kinds) => {
    const g = createGame(n); g.dew = 1000; const [ei, ej] = g.entries[0];
    for (const [di, dj] of [[-1, 1], [-1, -1], [-2, 1], [-2, -1], [-1, 2], [-1, -2]]) if (place(g, 'dandelion', ei + di, ej + dj)) break;
    assert.equal(g.plants.length, 1); startWave(g); g.queue = kinds.map((kind) => ({ kind, at: 0, e: 0 }));
    for (let k = 0; k < 60 * 20; k++) { step(g, 1 / 60); const s = g.shots.find((q) => q.from === 'dandelion'); if (s) return [g, s]; }
    return [g, null];
  };
  const [, s1] = shoot(['ant', 'butterfly']); assert.ok(s1 && s1.target.fly, 'the flyer first');
  const [g2, s2] = shoot(['ant']); assert.ok(s2 && !s2.target.fly, 'walkers too');
  assert.equal(s2.dmg, pstat(g2, g2.plants[0], 'dmg') * PLANTS.dandelion.ground); assert.equal(s2.stun, 0);
});

test('no wave is a sudden wall of bugs the player cannot see coming', () => {
  assert.deepEqual(waveLint(LEVELS).filter((x) => x.severity === 'fail').map((x) => `L${x.level} w${x.wave}: ${x.issue}`), []);
});

test('flyers stay a side threat: never most of a wave, and shooters do not waste shots on a doomed bug', () => {
  LEVELS.forEach((L, n) => { const g = createGame(n); L.waves.forEach((spec, w) => {
    let fly = 0, all = 0; for (const [k, c] of spec) { const hp = c * bugHp(g, k, w + 1); all += hp; if (BUGS[k].fly && !BUGS[k].boss) fly += hp; }
    assert.ok(fly <= all * .45, `level ${n + 1} wave ${w + 1}: flyers ${Math.round(fly / all * 100)}% of the wave`);
  }); });
  const g = createGame(0); g.dew = 5000; const [ei, ej] = g.entries[0];
  let k = 0; for (const [di, dj] of [[-1, 1], [-1, -1], [-2, 1], [-2, -1], [-1, 2], [-1, -2]]) if (place(g, 'rose', ei + di, ej + dj)) k++;
  send(g, 'ant'); g.queue[0].e = 0; const shots = new Set();
  for (let t = 0; t < 60 * 20 && (g.queue.length || g.bugs.length); t++) { step(g, 1 / 60); for (const s of g.shots) shots.add(s.id); }
  assert.ok(k >= 4, 'roses planted'); assert.equal(g.stats.kills ?? 1, 1);
  assert.equal(shots.size, Math.ceil(BUGS.ant.hp / PLANTS.rose.dmg[0]), 'no shot wasted on a doomed ant');
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

test('bugs never walk into plants; a plant put on a cell with bugs lets them out', () => {
  const g = createGame(1); g.dew = 2000;
  for (let j = 1; j < ROWS; j++) assert.ok(place(g, 'pumpkin', 7, j), `row ${j}`);
  startWave(g);
  const fresh = new Map(); // bugs that stood on a cell when a plant grew there may still be walking out of it
  for (let n = 0; n < 60 * 60 && g.phase === 'wave'; n++) {
    step(g, 1 / 60);
    if (n === 60 * 12) for (const b of g.bugs) { const i = Math.floor(b.x), j = Math.floor(b.y); if (i < COLS && !g.grid[j][i] && place(g, 'pumpkin', i, j)) fresh.set(b.id, n); }
    for (const b of g.bugs) if (!b.fly && !(n - fresh.get(b.id) < 60 * 3)) { const i = Math.floor(b.x), j = Math.floor(b.y); if (i < COLS) assert.ok(!g.grid[j]?.[i]?.type, `bug in a plant at ${i},${j}`); }
  }
  assert.ok(fresh.size > 0); assert.equal(g.phase, 'build');
});

// Balance. The smart bot (test/bot.mjs) plays as the level asks: a maze over the whole field led through mud and
// nettles, the best plants where bugs are slowest and most tired, upgrades where they pay, holes mended, frost and
// rain used. It has the perks of a player who took two stars on every earlier level.
const smart = LEVELS.map((_, n) => playLevel(n, { meta: expectedMeta(n) }));
test('played with thought, every level is won', () => {
  smart.forEach((r, n) => { assert.ok(r.won, `level ${n + 1} lost at wave ${r.wave}`); assert.ok(r.plants >= 40, `level ${n + 1}: ${r.plants} plants`); });
});

// The full picture — many seeds, other draws of the waves, exploits, every skill and perk switched off — is the balance
// matrix (node balance/run.mjs full); these are its hard rules on one seed, quick enough for every run of the tests.
test('a garden beside the untouched trail loses every level, however it is planted, with the most perks there can be by then', () => {
  const soft = [6, 8]; // «Заросли» and «Закат»: a lazy garden with every perk may still get through
  for (let n = 0; n < LEVELS.length; n++) {
    const r = playLevel(n, { route: 0, meta: expectedMeta(n) });
    assert.equal(r.won, false, `level ${n + 1}`);
    if (n < 3) assert.ok(Math.min(...Object.keys(r.bites).map((k) => parseInt(k, 10))) <= LEVELS[n].count * .55, `level ${n + 1}: it leaks by the middle`);
    if (!soft.includes(n)) for (const place of ['best', 'end', 'start', 'spread']) assert.equal(playLevel(n, { route: 0, meta: expectedMeta(n, 3), place }).won, false, `level ${n + 1}, three stars a level, planted ${place}`);
  }
});

test('half a garden or no frost and rain: the levels go worse', () => {
  const score = (list) => list.reduce((s, r) => s + (r.won ? r.hp / r.maxHp : -(1 - (r.wave - 1) / r.waves)), 0), some = [1, 2, 4, 6, 7];
  const base = score(some.map((n) => smart[n]));
  assert.ok(score(some.map((n) => playLevel(n, { maxPlants: 30, meta: expectedMeta(n) }))) < base, 'half a garden');
  assert.ok(score(some.map((n) => playLevel(n, { powers: false, meta: expectedMeta(n) }))) < base, 'no powers');
});

test('bugs tire on the way: the same hit hurts more after a long walk, and flyers do not tire', () => {
  const g = createGame(0); g.dew = 1000; send(g, 'snail');
  for (let k = 0; k < 60 * 12; k++) step(g, 1 / 60);
  const b = g.bugs[0]; assert.ok(b.walk > 3);
  place(g, 'rose', Math.floor(b.x) - 1, Math.floor(b.y) + 1); const hit = () => { for (let k = 0; k < 600; k++) { step(g, 1 / 60); const e = g.events.find((q) => q.t === 'hit'); g.events.length = 0; if (e) return e; } };
  const e = hit(); assert.ok(Math.abs(e.dmg - PLANTS.rose.dmg[0] * (1 + FATIGUE * e.b.walk)) < .5, `${e.dmg}`);
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
  const g = createGame(8); g.dew = 5000;
  PLANT_ORDER.forEach((type, k) => assert.ok(place(g, type, k + 3, 4), type));
  const dew = g.dew;
  for (let n = 0; n < 60 * 90; n++) step(g, 1 / 60);
  assert.equal(g.dew, dew);
});

// one bug of the kind walks in; the field is left as it is
function send(g, kind) { startWave(g); g.queue = [{ kind, at: 0 }]; }

test('a digger eats through the wall in its way; the roots grow back for dew at once or by themselves in time', () => {
  const g = createGame(0); g.dew = 1000;
  // a wall of frail plants: eating through is clearly quicker than the way round
  for (let j = 0; j < ROWS - 1; j++) { for (const p of g.plants) p.hp = p.maxHp = 20; assert.ok(place(g, 'rose', 7, j), `row ${j}`); }
  for (const p of g.plants) p.hp = p.maxHp = 20; place(g, 'pumpkin', 0, 0);
  const long = trail(g).length; send(g, 'cricket');
  let dead = null;
  for (let n = 0; n < 60 * 120 && !dead; n++) { step(g, 1 / 60); for (const b of g.bugs) b.hp = 1e4; dead = g.events.find((e) => e.t === 'plantDead'); g.events.length = 0; } // the digger is not to be shot here
  assert.ok(dead, 'a plant was eaten');
  const s = stubAt(g, dead.p.i, dead.p.j);
  assert.ok(s, 'roots are left'); assert.ok(trail(g).length < long, 'the trail got shorter');
  const dew = g.dew; assert.ok(regrow(g, s), 'even with the digger still on the cell'); assert.equal(g.dew, dew - regrowCost(s));
  assert.equal(regrowCost(s), Math.ceil(PLANTS.rose.cost / 3));
  assert.equal(g.grid[s.j][s.i].type, 'rose'); assert.equal(trail(g).length, long); assert.equal(g.stubs.length, 0);
  // left alone, the roots grow back by themselves
  const p = g.plants.find((q) => q.i === 3 && q.type) || (place(g, 'pumpkin', 3, 3), g.plants[g.plants.length - 1]);
  removePlant(g, p, false); const dew2 = g.dew;
  for (let n = 0; n < 60 * (REGROW + 1); n++) step(g, 1 / 60);
  assert.equal(g.grid[p.j][p.i]?.type, p.type); assert.ok(g.dew >= dew2, 'for free');
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
  for (let n = 0; n < 60 * (PLANTS.aloe.regrow[0] * .8); n++) step(g, 1 / 60); // sooner than the roots alone would
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

test('a plant sees its level, the soil under it and the perk bought for it', () => {
  const g = createGame(1, 1, { rose: 2 }); g.dew = 1000;
  const [fi, fj] = LEVELS[1].tiles.find(([, , t]) => t === 'fertile');
  assert.ok(place(g, 'rose', fi, fj)); assert.ok(place(g, 'rose', 12, 7));
  const [rich, plain] = g.plants;
  assert.equal(pstat(g, plain, 'dmg'), PLANTS.rose.dmg[0] * PERKS.rose.v[1]);
  assert.ok(Math.abs(pstat(g, rich, 'dmg') - PLANTS.rose.dmg[0] * PERKS.rose.v[1] * FERTILE) < 1e-9);
  assert.equal(rich.maxHp, Math.round(PLANTS.rose.hp[0] * FERTILE));
  const h = createGame(0, 1, { dew: 3, heart: 1, clouds: 2 });
  assert.equal(h.dew, LEVELS[0].dew + PERKS.dew.v[2]); assert.equal(h.maxHp, 20 + PERKS.heart.v[0]); assert.equal(h.powers.frost, 3);
  for (const k of PERK_ORDER) assert.ok(PERKS[k].cost.length === PERKS[k].v.length, k);
});

test('ground: nothing grows on nettles and they sting, mud slows, weeds are cleared for dew', () => {
  const n = LEVELS.findIndex((L) => L.feature === 'nettle'), g = createGame(n); g.dew = 1000;
  const [ni, nj] = LEVELS[n].tiles.find(([, , t]) => t === 'nettle');
  assert.equal(placeProblem(g, ni, nj), 'nettle'); assert.equal(place(g, 'pumpkin', ni, nj), false);
  send(g, 'snail'); step(g, 1 / 60); const b = g.bugs[0]; b.x = ni + .5; b.y = nj + .5; b.ti = ni; b.tj = nj; const hp = b.hp;
  step(g, 1 / 60); assert.ok(b.hp < hp, 'stung');
  const m = LEVELS.findIndex((L) => L.feature === 'mud'), gm = createGame(m);
  const [mi, mj] = LEVELS[m].tiles.find(([, , t]) => t === 'mud');
  send(gm, 'ant'); step(gm, 1 / 60); const a = gm.bugs[0]; a.x = mi + .5; a.y = mj + .5; a.ti = mi - 1; a.tj = mj;
  const x0 = a.x; step(gm, .1); const slow = x0 - a.x; a.x = mi + 1.5; a.ti = mi; gm.tiles[mj][mi + 1] = null; const x1 = a.x; step(gm, .1);
  assert.ok(slow > 0 && slow < (x1 - a.x) * .7, 'slower in the mud');
  const w = LEVELS.findIndex((L) => L.feature === 'weed'), gw = createGame(w), [wi, wj] = LEVELS[w].obstacles.find(([, , t]) => t === 'weed');
  assert.equal(placeProblem(gw, wi, wj), 'busy'); const dew = gw.dew;
  assert.ok(clearWeed(gw, wi, wj)); assert.equal(gw.dew, dew - WEED_COST); assert.equal(placeProblem(gw, wi, wj), null);
});

test('two anthills: bugs come from both, and neither way can be closed', () => {
  const n = LEVELS.findIndex((L) => L.entries.length === 2), g = createGame(n); g.dew = 5000;
  assert.equal(trails(g).length, 2);
  for (let j = 0; j < ROWS; j++) place(g, 'pumpkin', 12, j);
  assert.ok(trails(g).every((tr) => tr[tr.length - 1][0] === g.fruit[0]), 'both still reach the fruit');
  startWave(g); const rows = new Set();
  for (let k = 0; k < 60 * 40; k++) { step(g, 1 / 60); for (const b of g.bugs) if (b.x > COLS) rows.add(Math.floor(b.y)); if (g.wave < 3 && g.phase === 'build') startWave(g); }
  assert.equal(rows.size, 2);
});

test('bosses: the queen lets ants out, the slug king splits, the spider webs plants, the rhino runs', () => {
  const run = (kind, lvl = 0) => { const g = createGame(lvl); g.dew = 5000; g.wave = 4; send(g, kind); return g; };
  let g = run('queen'); for (let k = 0; k < 60 * 12; k++) step(g, 1 / 60);
  assert.ok(g.bugs.some((b) => b.kind === 'ant' && b.brood), 'ants');
  g = run('slugking'); for (let k = 0; k < 60 * 5; k++) step(g, 1 / 60);
  const king = g.bugs[0]; king.hp = 1; place(g, 'rose', Math.floor(king.x), Math.floor(king.y) + 1 < ROWS ? Math.floor(king.y) + 1 : Math.floor(king.y) - 1);
  for (let k = 0; k < 60 * 5 && g.bugs.includes(king); k++) step(g, 1 / 60);
  assert.equal(g.bugs.filter((b) => b.kind === 'snail').length, BUGS.slugking.split[1]);
  assert.ok(g.events.some((e) => e.t === 'bossDead'));
  g = run('spider'); place(g, 'rose', 11, 2); place(g, 'rose', 11, 4);
  for (let k = 0; k < 60 * 14; k++) { step(g, 1 / 60); for (const b of g.bugs) b.hp = b.maxHp; }
  assert.ok(g.events.some((e) => e.t === 'web'), 'web');
  g = run('rhino'); let fast = false;
  for (let k = 0; k < 60 * 12; k++) { step(g, 1 / 60); if (g.bugs[0]?.rush > 0) fast = true; }
  assert.ok(fast, 'charge');
  { // a mid-level boss is a part of its wave, not the whole of it
    const L = LEVELS[0], [at, kind, cnt] = L.boss[0], g0 = createGame(0);
    const rest = L.waves[at - 1].filter(([k]) => !BUGS[k].boss).reduce((t, [k, c]) => t + c * bugHp(g0, k, at), 0);
    assert.ok(cnt * bugHp(g0, kind, at) < rest, 'a mid-level boss is weaker than its wave');
  }
});

test('new plants: a flytrap bites hard and swallows small bugs, a bell makes its neighbours shoot more often, level 3 tricks', () => {
  const g = createGame(8); g.dew = 5000; place(g, 'flytrap', 12, 2); place(g, 'bell', 12, 3); place(g, 'rose', 11, 3); place(g, 'rose', 5, 7);
  assert.ok(g.plants[2].buff > 0); assert.equal(g.plants[3].buff, 0);
  send(g, 'ant'); let eaten = null;
  for (let k = 0; k < 60 * 20 && !eaten; k++) { step(g, 1 / 60); eaten = g.events.find((e) => e.t === 'eat'); }
  assert.ok(eaten && eaten.whole && eaten.b.hp <= 0, 'a small bug is swallowed whole');
  const rose = g.plants[2]; upgrade(g, rose); upgrade(g, rose); assert.equal(pstat(g, rose, 'multi'), 2);
  for (const k of PLANT_ORDER) assert.ok(LEVELS.some((L) => L.plants.includes(k)), `${k} is used`);
});

test('a level in progress is saved between waves and comes back as it was', () => {
  const g = createGame(6, 5); g.dew = 900; place(g, 'rose', 8, 4); place(g, 'pumpkin', 8, 5); upgrade(g, g.plants[0]);
  const [wi, wj] = LEVELS[6].obstacles.find(([, , t]) => t === 'weed'); clearWeed(g, wi, wj);
  const [vi, vj] = LEVELS[6].obstacles.filter(([, , t]) => t === 'weed')[1]; clearWeed(g, vi, vj); place(g, 'corn', vi, vj); // a plant where a weed was
  removePlant(g, g.plants[1], false); g.wave = 7; g.hp = 13;
  const r = restore(JSON.parse(JSON.stringify(snapshot(g))));
  assert.equal(r.wave, 7); assert.equal(r.hp, 13); assert.equal(r.dew, g.dew); assert.equal(r.phase, 'build'); assert.equal(r.nextIn, null);
  assert.equal(r.grid[4][8].type, 'rose'); assert.equal(r.grid[4][8].lvl, 2); assert.ok(stubAt(r, 8, 5)); assert.equal(r.grid[wj][wi], null);
  assert.equal(r.grid[vj][vi].type, 'corn');
  assert.equal(restore({ v: 0 }), null); assert.equal(restore({ v: 1, level: 0, plants: 'x' }), null);
});

test('a wave got through pays by the level, a bug gives its own reward whatever the level and the wave', () => {
  for (const L of LEVELS) {
    assert.equal(wavePay(L, 1), L.pay[0]); assert.equal(wavePay(L, L.count - 1), L.pay[1]);
    for (let w = 2; w < L.count; w++) assert.ok(wavePay(L, w) >= wavePay(L, w - 1));
  }
  for (const level of [0, 4]) {
    const g = createGame(level); g.dew = 5000;
    for (let j = 0; j < ROWS; j++) for (const i of [9, 11]) place(g, 'corn', i, j);
    for (const p of g.plants.slice()) { upgrade(g, p); upgrade(g, p); }
    startWave(g); let kills = 0, paid = null;
    for (let n = 0; n < 60 * 200 && paid == null; n++) {
      step(g, 1 / 60);
      for (const e of g.events) { if (e.t === 'kill') { assert.equal(e.reward, BUGS[e.b.kind].reward); kills++; } if (e.t === 'waveDone') paid = e.bonus; }
      g.events.length = 0;
    }
    assert.ok(kills > 0); assert.equal(paid, LEVELS[level].pay[0]);
  }
});
