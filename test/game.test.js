import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, place, placeProblem, plantOn, plantProblem, trail, trails, startWave, removePlant, upgrade, usePower, earlyBonus, stubAt, refund, pstat, clearWeed, snapshot, restore, bugHp, COLS, ROWS, BREAK } from '../public/game.js';
import { LEVELS, PLANTS, BUGS, PLANT_ORDER, PERKS, PERK_ORDER, WEED_COST, FERTILE, MARK_T, wavePay } from '../public/data.js';
import { expectedMeta, fullMeta } from '../balance/scenario.mjs';
import { play } from '../sim/js/play.mjs';
import { waveLint } from '../balance/lint.mjs';
import { LEAK } from '../balance/rules.mjs';

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
  send(g, 'ant'); g.queue[0].e = 0; const shots = new Set(); let hp = 0; // the ant's health as the level gives it
  for (let t = 0; t < 60 * 20 && (g.queue.length || g.bugs.length); t++) { step(g, 1 / 60); if (g.bugs[0]) hp ||= g.bugs[0].maxHp; for (const s of g.shots) shots.add(s.id); }
  assert.ok(k >= 4, 'roses planted'); assert.equal(g.stats.kills ?? 1, 1);
  assert.equal(shots.size, Math.ceil(hp / PLANTS.rose.dmg[0]), 'no shot wasted on a doomed ant');
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
    if (n === 60 * 12) for (const b of g.bugs) { const i = Math.floor(b.x), j = Math.floor(b.y); if (i < COLS && !g.grid[j][i] && place(g, 'pumpkin', i, j)) for (const q of g.bugs) if (Math.abs(q.x - i - .5) < 1.5 && Math.abs(q.y - j - .5) < 1.5) fresh.set(q.id, n); } // bugs walk in packs: all on the cell, and those already stepping onto it
    for (const b of g.bugs) if (!b.fly && !(n - fresh.get(b.id) < 60 * 3)) { const i = Math.floor(b.x), j = Math.floor(b.y); if (i < COLS) assert.ok(!g.grid[j]?.[i]?.type, `bug in a plant at ${i},${j}`); }
  }
  assert.ok(fresh.size > 0); assert.equal(g.phase, 'build');
});

// Balance. The smart bot (sim/src/bot.rs, on the native copy of the simulation: sim.test.js checks that the two
// copies agree) plays as the level asks: a maze over the whole field led through mud and
// nettles, the best plants where bugs are slowest, upgrades where they pay, frost and
// rain used. It has the perks of a player who took two stars on every earlier level.
// playLevels: [[level, options], ...] played in one go, the bot's reports back in the same order
const playLevels = (list) => play(list.map(([level, opts]) => ({ level, opts }))).map((x) => x.res);
// (played when the first balance test asks: the other tests do not need the native bot, nor cargo)
let smartRuns; const smart = () => (smartRuns ??= playLevels(LEVELS.map((_, n) => [n, { meta: expectedMeta(n) }])));
test('played with thought, every level is won', () => {
  smart().forEach((r, n) => { assert.ok(r.won, `level ${n + 1} lost at wave ${r.wave}`); assert.ok(r.plants >= 40, `level ${n + 1}: ${r.plants} plants`); });
});

// The full picture — many seeds, other draws of the waves, exploits, every skill and perk switched off — is the balance
// matrix (node balance/run.mjs full); these are its hard rules on one seed, quick enough for every run of the tests.
test('a garden beside the untouched trail loses every level, however it is planted, with the most perks there can be by then', () => {
  const soft = [6, 8], PLACES = ['best', 'end', 'start', 'spread']; // «Заросли» and «Закат»: a lazy garden with every perk may still get through
  const usual = playLevels(LEVELS.map((_, n) => [n, { route: 0, meta: expectedMeta(n) }]));
  const hard = LEVELS.map((_, n) => n).filter((n) => !soft.includes(n)), most = playLevels(hard.flatMap((n) => PLACES.map((place) => [n, { route: 0, meta: expectedMeta(n, 3), place }])));
  for (let n = 0; n < LEVELS.length; n++) {
    const r = usual[n];
    assert.equal(r.won, false, `level ${n + 1}`);
    // («Опушка» is the exception: a row of corn with mint holds there until the last waves, and loses in them)
    if (n < 3 && n !== 1) assert.ok(Math.min(...Object.keys(r.bites).map((k) => parseInt(k, 10))) <= LEVELS[n].count * LEAK, `level ${n + 1}: it leaks well before the end`);
  }
  hard.forEach((n, a) => PLACES.forEach((place, b) => assert.equal(most[a * PLACES.length + b].won, false, `level ${n + 1}, three stars a level, planted ${place}`)));
});

test('half a garden or no frost and rain: the levels go worse', () => {
  const score = (list) => list.reduce((s, r) => s + (r.won ? r.hp / r.maxHp : -(1 - (r.wave - 1) / r.waves)), 0), some = [1, 2, 4, 6, 7];
  const base = score(some.map((n) => smart()[n]));
  assert.ok(score(playLevels(some.map((n) => [n, { maxPlants: 30, meta: expectedMeta(n) }]))) < base, 'half a garden');
  assert.ok(score(playLevels(some.map((n) => [n, { powers: false, meta: expectedMeta(n) }]))) < base, 'no powers');
});

test('a hit hurts the same wherever on the trail it lands', () => {
  const g = createGame(0); g.dew = 1000; send(g, 'snail');
  for (let k = 0; k < 60 * 12; k++) step(g, 1 / 60);
  const b = g.bugs[0];
  place(g, 'rose', Math.floor(b.x) - 1, Math.floor(b.y) + 1); const hit = () => { for (let k = 0; k < 600; k++) { step(g, 1 / 60); const e = g.events.find((q) => q.t === 'hit'); g.events.length = 0; if (e) return e; } };
  const e = hit(); assert.equal(e.dmg, PLANTS.rose.dmg[0]);
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

test('a digger eats through the wall in its way; the roots stay a hole till the wave is over, then the plant grows back', () => {
  const g = createGame(0); g.dew = 1000;
  // a wall of frail plants: eating through is clearly quicker than the way round
  for (let j = 0; j < ROWS - 1; j++) { for (const p of g.plants) p.hp = p.maxHp = 20; assert.ok(place(g, 'rose', 7, j), `row ${j}`); }
  for (const p of g.plants) p.hp = p.maxHp = 20; place(g, 'pumpkin', 0, 0); upgrade(g, g.plants[3]);
  const long = trail(g).length; send(g, 'cricket');
  let dead = null;
  for (let n = 0; n < 60 * 120 && !dead; n++) { step(g, 1 / 60); for (const b of g.bugs) b.hp = 1e4; dead = g.events.find((e) => e.t === 'plantDead'); g.events.length = 0; } // the digger is not to be shot here
  assert.ok(dead, 'a plant was eaten');
  const s = stubAt(g, dead.p.i, dead.p.j), lvl = dead.p.lvl;
  assert.ok(s, 'roots are left'); assert.ok(trail(g).length < long, 'the trail got shorter');
  assert.equal(placeProblem(g, s.i, s.j), 'roots'); assert.equal(place(g, 'pumpkin', s.i, s.j), false, 'nothing is planted on roots');
  assert.equal(plantProblem(g, 'pumpkin', s.i, s.j), 'roots');
  // the gap of the wall is the only way once the roots grow back: it cannot be shut meanwhile
  assert.equal(placeProblem(g, 7, ROWS - 1), 'blocks');
  for (let n = 0; n < 60 * 10; n++) { step(g, 1 / 60); for (const b of g.bugs) b.hp = 1e4; }
  assert.ok(stubAt(g, s.i, s.j), 'the roots do not grow back in the wave');
  const bitten = g.plants.find((p) => p.type === 'rose'); bitten.hp = 1;
  const dew = g.dew; g.bugs.length = 0; g.queue.length = 0; step(g, 1 / 60);
  assert.equal(g.phase, 'build'); assert.equal(g.stubs.length, 0);
  const back = g.grid[s.j][s.i]; assert.equal(back?.type, 'rose'); assert.equal(back.lvl, lvl); assert.equal(back.hp, back.maxHp);
  assert.equal(bitten.hp, bitten.maxHp, 'the bitten plants are whole again');
  assert.equal(g.dew, dew + wavePay(g.L, 1), 'for free'); assert.equal(trail(g).length, long);
});

test('a digger walks round when the way round is short', () => {
  const g = createGame(0); g.dew = 1000;
  place(g, 'pumpkin', 7, 3); send(g, 'cricket');
  for (let n = 0; n < 60 * 120 && g.phase === 'wave'; n++) step(g, 1 / 60);
  assert.equal(g.plants.length, 1); assert.equal(g.stubs.length, 0);
});

test('no plant is healed in a wave: the aloe only guards the plants around, rain grows the roots back and heals nothing', () => {
  const g = createGame(0); g.dew = 1000;
  place(g, 'aloe', 7, 4); place(g, 'pumpkin', 7, 5); place(g, 'rose', 7, 3); place(g, 'pumpkin', 12, 7);
  const [aloe, pumpkin, rose, far] = g.plants;
  assert.equal(pumpkin.guard, PLANTS.aloe.guard[0]); assert.equal(far.guard, 0);
  upgrade(g, aloe); assert.equal(pumpkin.guard, PLANTS.aloe.guard[1]);
  pumpkin.hp = 10; far.hp = 10;
  for (let n = 0; n < 60 * 5; n++) step(g, 1 / 60);
  assert.equal(pumpkin.hp, 10); assert.equal(far.hp, 10);
  upgrade(g, rose); removePlant(g, rose, false);
  for (let n = 0; n < 60 * 30; n++) step(g, 1 / 60);
  assert.ok(stubAt(g, 7, 3), 'nothing grows it back by itself'); assert.equal(g.grid[3][7], null);
  pumpkin.web = 5; assert.ok(usePower(g, 'rain'));
  assert.equal(g.grid[3][7]?.type, 'rose'); assert.equal(g.grid[3][7].lvl, 2); assert.equal(g.powers.rain, 0);
  assert.equal(pumpkin.web, 0, 'the web is washed off'); assert.equal(pumpkin.hp, 10, 'a bitten plant is not healed');
});

test('powers come back every tenth wave', () => {
  const g = createGame(0); g.dew = 1000; assert.ok(usePower(g, 'rain'));
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
  g.plants[1].hp = 5; g.wave = 7; g.hp = 13;
  const snap = JSON.parse(JSON.stringify(snapshot(g))), r = restore(snap);
  assert.equal(r.wave, 7); assert.equal(r.hp, 13); assert.equal(r.dew, g.dew); assert.equal(r.phase, 'build'); assert.equal(r.nextIn, null);
  assert.equal(r.grid[4][8].type, 'rose'); assert.equal(r.grid[4][8].lvl, 2); assert.equal(r.grid[4][8].hp, r.grid[4][8].maxHp);
  assert.equal(r.grid[5][8]?.type, 'pumpkin'); assert.equal(r.grid[5][8].hp, r.grid[5][8].maxHp, 'whole again'); assert.equal(r.grid[wj][wi], null);
  assert.equal(r.grid[vj][vi].type, 'corn');
  assert.equal(restore({ ...snap, v: 7 }), null, 'a save of the rules with healing is dropped'); assert.equal(restore({ v: 0 }), null); assert.equal(restore({ v: 1, level: 0, plants: 'x' }), null);
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

// One bug of a kind walking level 9 (every plant is there), with the health asked for.
function lone(kind, hp, plants) {
  const g = createGame(8); g.dew = 1e6; g.hp = g.maxHp = 1e6;
  startWave(g); g.queue = [{ kind, at: 0, e: 0 }];
  for (let n = 0; n < 600 && !g.bugs.length; n++) step(g, 1 / 60);
  const b = g.bugs[0]; b.hp = b.maxHp = hp; g.events.length = 0;
  for (let n = 0; n < 60 * 4; n++) step(g, 1 / 60); // a few cells onto the field
  const i = Math.floor(b.x), j = Math.floor(b.y);
  for (const [type, lvl, di, dj] of plants) { assert.ok(place(g, type, i + di, j + dj), `${type} at ${i + di},${j + dj}`); const p = g.plants[g.plants.length - 1]; for (let l = 1; l < lvl; l++) upgrade(g, p); }
  return { g, b };
}
const hitsOf = (g, secs, src) => { const out = []; for (let n = 0; n < 60 * secs; n++) { step(g, 1 / 60); for (const e of g.events) if (e.t === 'hit' && (!src || e.src === src)) out.push(e); g.events.length = 0; } return out; };

test('a bug pricked by a rose takes more from every plant for a while', () => {
  const { g, b } = lone('snail', 1e5, [['rose', 1, -1, 1]]);
  const first = hitsOf(g, 3, 'rose'); assert.ok(first.length >= 2);
  assert.equal(first[0].dmg, PLANTS.rose.dmg[0]); // the first prick finds it unmarked
  assert.ok(Math.abs(first[1].dmg - PLANTS.rose.dmg[0] * (1 + PLANTS.rose.mark[0])) < 1e-6, `${first[1].dmg}`);
  assert.ok(b.mark > 0 && b.mark <= MARK_T);
});

test('a flytrap swallows a bug the others have worn down, however thick, but never a boss', () => {
  const big = 1e5, { g, b } = lone('snail', big, [['flytrap', 1, -1, 1]]);
  b.hp = big * (PLANTS.flytrap.gulp[0] + .2); hitsOf(g, 1.5); assert.ok(b.hp > 0, 'too healthy to swallow: a bite only');
  b.hp = big * (PLANTS.flytrap.gulp[0] - .05); hitsOf(g, PLANTS.flytrap.eat[0] + 1); assert.ok(b.hp <= 0, 'worn down: swallowed whole');
  const boss = lone('rhino', big, [['flytrap', 1, -1, 1]]); boss.b.hp = big * .1; hitsOf(boss.g, 2); assert.ok(boss.b.hp > 0);
});

test('a cob of corn hits only so many bugs of a pack', () => {
  const g = createGame(0); g.dew = 1e6; g.hp = g.maxHp = 1e6; startWave(g);
  g.queue = Array.from({ length: 12 }, (_, n) => ({ kind: 'ant', at: n * .05, e: 0 }));
  for (let n = 0; n < 60 * 4; n++) step(g, 1 / 60);
  for (const q of g.bugs) q.hp = q.maxHp = 1e5;
  const lead = g.bugs[0]; assert.ok(place(g, 'corn', Math.floor(lead.x) - 1, Math.floor(lead.y) + 1)); g.events.length = 0;
  let most = 0, cur = 0;
  for (let n = 0; n < 60 * 6; n++) { step(g, 1 / 60); cur = g.events.filter((e) => e.t === 'hit' && e.src === 'corn').length; most = Math.max(most, cur); g.events.length = 0; }
  assert.equal(most, PLANTS.corn.hits[0]);
});

// Diggers: the way they eat through the garden is what the player is shown (digTrails); and they come last in a wave,
// so that the holes they make are not a road for the rest of it.
const GARDEN18 = [["pumpkin",1,13,5],["pepper",3,10,1],["pumpkin",1,4,6],["pumpkin",1,10,5],["rose",3,12,2],["corn",3,12,0],["corn",2,13,0],["aloe",3,11,2],["mint",3,9,2],["pepper",3,8,0],["dandelion",3,7,3],["dandelion",3,6,3],["dandelion",1,2,1],["dandelion",1,2,5],["corn",3,8,2],["pepper",3,6,1],["rose",3,7,2],["corn",3,6,2],["corn",3,5,3],["pepper",3,4,4],["corn",2,4,0],["aloe",1,13,6],["aloe",2,0,4],["mint",3,4,1],["corn",2,3,2],["corn",1,2,2],["pepper",1,10,4],["mint",1,9,4],["rose",1,9,5],["flytrap",1,2,4],["flytrap",1,2,3],["aloe",1,5,4],["aloe",1,3,1],["pepper",1,7,4],["flytrap",1,10,6],["flytrap",1,9,6],["flytrap",1,8,6],["flytrap",1,12,3],["flytrap",1,12,4],["corn",1,5,6],["corn",1,6,6],["corn",1,7,6]];
test('diggers: their way eats through the one plant that shuts a short run, and they come last in every wave', async () => {
  const { digTrails } = await import('../public/game.js');
  const g = createGame(4); g.dew = 1e9; const [ei, ej] = g.entries[0];
  place(g, 'pumpkin', ei - 1, ej); // one plant in front of the anthill, the rest of the field open
  const [d] = digTrails(g);
  assert.deepEqual(d.cells[0], [ei, ej]); assert.deepEqual(d.cells.at(-1), g.fruit);
  // a real garden (a party on «Крапивный лог», wave 18, from the analytics): a long maze where one flytrap by the
  // anthill shuts an empty run to the fruit; the crickets ate it every wave and the party was lost to them
  const h = createGame(4); h.dew = 1e9;
  for (const [t, lvl, i, j] of GARDEN18) { if (place(h, t, i, j)) { const p = h.plants.at(-1); while (p.lvl < lvl) upgrade(h, p); } }
  const [dh] = digTrails(h); assert.deepEqual(dh.eats, [[12, 4]]); assert.ok(dh.cells.length < trails(h)[0].length / 2, 'a short way for them');
  for (const L of LEVELS) for (const w of L.waves) { const ks = w.map((x) => x[0]).filter((k) => !BUGS[k].boss), f = ks.findIndex((k) => BUGS[k].dig); if (f >= 0) assert.ok(ks.slice(f).every((k) => BUGS[k].dig), `${L.name}: ${ks}`); }
});
