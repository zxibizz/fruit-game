// Simulation: no DOM, plain data. The view reads the state and the events, and calls the actions below.
import { COLS, ROWS, FRUIT_HP, PLANTS, BUGS, LEVELS, PERKS, BREAK, EARLY_DEW, REFUND, CHEW_GROWTH, POWER_EVERY, POWER_MAX, wavePay, FERTILE, FERTILE_ADD, MUD, NETTLE, NETTLE_BOSS, WEED_COST, BROOD_REWARD, FLY_HP, TUNE, MARK_T, BRANCHES, GUARD_R, THORN_BOSS, PRICK_CAP, SNIFF, FALL_T, statOf, upCost } from './data.js';

export const VERSION = '0.31.0';
// The version of a saved level: raised when the balance changes so much that a garden grown under the old rules does
// not belong in the new level (2: no fatigue, tight packs, one health rule; 3: the plants given their places and
// every level retuned; 4: the waves retuned for the ordinary player, some levels with fewer and healthier bugs; 5: the
// anthill of «Старый сад» moved to the edge, where an old garden could shut the trail; 6: diggers last in a wave;
// 7: the anthills and the fruit of «Закат» moved; 8: no healing, the roots grow back after the wave (an old garden
// with its roots grown back could shut the trail); 9: five plants with branches; 10: five levels before «Лужайка», every
// level after them moved on by five; 11: the first two of those five taken out, every level moved back by two; 12: the
// first two levels laid out again as lawns with boxes; an older save is dropped).
const SAVE_V = 12;
export { COLS, ROWS, BREAK };

const DIRS = [[-1, 0], [0, -1], [0, 1], [1, 0]]; // tie order: towards the fruit side first
const INF = 1e9;

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// meta: the tiers of the permanent perks the player has bought, { perk: tier }.
export function createGame(levelIndex, seed = 1, meta = {}) {
  const L = LEVELS[levelIndex], tier = (k) => (meta[k] ? PERKS[k].v[meta[k] - 1] : 0);
  const hp = FRUIT_HP + tier('heart'), clouds = tier('clouds');
  const g = {
    level: levelIndex, L, cols: COLS, rows: ROWS, seed, meta,
    grid: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
    tiles: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
    entries: L.entries.map((j) => [COLS - 1, j]), fruit: L.fruit.slice(),
    dew: L.dew + tier('dew'), hp, maxHp: hp,
    wave: 0, waves: L.waves.length, phase: 'build', nextIn: null, // nextIn: seconds until the next wave starts by itself
    bugs: [], shots: [], plants: [], stubs: [], events: [], queue: [], // stubs: roots of the eaten plants
    time: 0, waveTime: 0, powers: { frost: 1 + clouds, rain: 1 + clouds }, powerMax: POWER_MAX + clouds, nextId: 1, rand: mulberry32(seed),
    refund: tier('refund') || REFUND,
    dist: null, dig: null, stats: { kills: 0, bites: 0, eaten: 0, earned: 0 },
    thorn: new Float64Array(COLS * ROWS), thornAir: new Float64Array(COLS * ROWS), // the thorns of the pumpkins on every cell
  };
  g.entry = g.entries[0];
  for (const [i, j, type] of L.obstacles) g.grid[j][i] = { obstacle: type, i, j };
  for (const [i, j, type] of L.tiles) g.tiles[j][i] = type;
  refresh(g);
  return g;
}

const key = (i, j) => j * COLS + i;
const inside = (i, j) => i >= 0 && j >= 0 && i < COLS && j < ROWS;

// Distance (in steps) from every free cell to the fruit. extra: a cell taken as busy; roots: the roots of the eaten
// plants too (they grow back after the wave).
export function computeDist(g, extra = -1, roots = false) {
  const d = new Array(COLS * ROWS).fill(INF), q = [g.fruit];
  d[key(...g.fruit)] = 0;
  for (let h = 0; h < q.length; h++) {
    const [i, j] = q[h], k = d[key(i, j)];
    for (const [di, dj] of DIRS) {
      const ni = i + di, nj = j + dj, nk = key(ni, nj);
      if (!inside(ni, nj) || d[nk] !== INF || g.grid[nj][ni] || g.tiles[nj][ni] === 'bed' || nk === extra || (roots && stubAt(g, ni, nj))) continue;
      d[nk] = k + 1; q.push([ni, nj]);
    }
  }
  return d;
}

// Diggers eat through plants: for them a plant is a cell that takes longer, as many steps as they would walk in the
// time they need to eat it. So they break a wall where the way round is longer than the meal, and pick the weak plants.
const digSteps = (cell) => (cell && cell.type ? cell.maxHp / BUGS.cricket.dig * BUGS.cricket.speed : 0);
export function computeDig(g) {
  const d = new Array(COLS * ROWS).fill(INF), done = new Array(COLS * ROWS).fill(false);
  d[key(...g.fruit)] = 0;
  for (;;) {
    let u = -1; for (let k = 0; k < d.length; k++) if (!done[k] && d[k] < INF && (u < 0 || d[k] < d[u])) u = k;
    if (u < 0) break;
    done[u] = true; const i = u % COLS, j = (u - i) / COLS, enter = 1 + digSteps(g.grid[j][i]);
    for (const [di, dj] of DIRS) {
      const ni = i + di, nj = j + dj; if (!inside(ni, nj)) continue;
      const c = g.grid[nj][ni]; if ((c && !c.type) || g.tiles[nj][ni] === 'bed') continue; // rocks, stumps, logs and beds stay in the way
      if (d[u] + enter < d[key(ni, nj)]) d[key(ni, nj)] = d[u] + enter;
    }
  }
  return d;
}
function nextDig(g, i, j, dir) {
  let best = null, bd = INF;
  const tryCell = (di, dj) => {
    const ni = i + di, nj = j + dj; if (!inside(ni, nj)) return;
    const c = g.grid[nj][ni]; if ((c && !c.type) || g.tiles[nj][ni] === 'bed') return;
    const v = g.dig[key(ni, nj)] + 1 + digSteps(c); if (v < bd - 1e-6) { bd = v; best = [ni, nj]; }
  };
  if (dir) tryCell(dir[0], dir[1]);
  for (const [di, dj] of DIRS) tryCell(di, dj);
  return best;
}
// Call after any change of the plants on the field.
// a point (dx, dy) away is within r: the same as hyp(dx, dy) <= r, several times cheaper (plants check every bug
// every step)
const within = (dx, dy, r) => dx * dx + dy * dy <= r * r;
// The length of (dx, dy). Not Math.hypot: that one is rounded differently from engine to engine, while a square root
// is the same everywhere, and the native copy of this simulation (sim/) has to walk the same way to the last bit.
const hyp = (dx, dy) => Math.sqrt(dx * dx + dy * dy);
function refresh(g) { g.dist = computeDist(g); g.dig = computeDig(g); auras(g); }
// What the pumpkins give: a guard (and the spikes of a shell, and its ward) to the plants around them, thorns to the
// free cells around them. Neither adds up: the strongest counts. A webbed pumpkin gives nothing.
function auras(g) {
  for (const p of g.plants) { p.guard = 0; p.spikes = 0; p.ward = null; }
  g.thorn.fill(0); g.thornAir.fill(0);
  for (const p of g.plants) {
    if (p.web > 0) continue;
    const guard = pstat(g, p, 'guard'); if (!guard) continue;
    const spikes = pstat(g, p, 'spikes'), ward = pstat(g, p, 'ward') && !p.warded;
    for (const q of g.plants) {
      if (!within(q.i - p.i, q.j - p.j, GUARD_R)) continue;
      q.spikes = Math.max(q.spikes, spikes); if (q === p) continue;
      q.guard = Math.max(q.guard, guard); if (ward && !q.ward) q.ward = p;
    }
    const th = pstat(g, p, 'thorns'), air = pstat(g, p, 'thornAir'), r = pstat(g, p, 'range'), n = Math.ceil(r);
    for (let j = p.j - n; j <= p.j + n; j++) for (let i = p.i - n; i <= p.i + n; i++) {
      if (!inside(i, j) || g.grid[j][i] || !within(i - p.i, j - p.j, r)) continue;
      const k = key(i, j); g.thorn[k] = Math.max(g.thorn[k], th); if (air) g.thornAir[k] = Math.max(g.thornAir[k], th);
    }
  }
}

// Next cell from (i, j) towards the fruit; keeps going straight when that is as short.
export function nextCell(g, i, j, dir, dist = g.dist) {
  const here = dist[key(i, j)];
  if (here >= INF) { // a plant grew on this cell under the bug: it steps out to the neighbour nearest to the fruit
    let best = null, bd = INF;
    for (const [di, dj] of DIRS) { const ni = i + di, nj = j + dj; if (inside(ni, nj) && dist[key(ni, nj)] < bd) { bd = dist[key(ni, nj)]; best = [ni, nj]; } }
    return best;
  }
  if (dir) { const ni = i + dir[0], nj = j + dir[1]; if (inside(ni, nj) && dist[key(ni, nj)] === here - 1) return [ni, nj]; }
  for (const [di, dj] of DIRS) { const ni = i + di, nj = j + dj; if (inside(ni, nj) && dist[key(ni, nj)] === here - 1) return [ni, nj]; }
  return null;
}

// The trail bugs take from the entrance (list of cells, entrance first).
export function trail(g, dist = g.dist, e = 0) {
  const out = [g.entries[e].slice()]; let dir = [-1, 0], [i, j] = g.entries[e];
  if (dist[key(i, j)] >= INF) return out;
  for (let n = 0; n < COLS * ROWS; n++) {
    if (i === g.fruit[0] && j === g.fruit[1]) break;
    const nx = nextCell(g, i, j, dir, dist); if (!nx) break;
    dir = [nx[0] - i, nx[1] - j]; [i, j] = nx; out.push(nx);
  }
  return out;
}
// The anthills diggers come out of: in the build phase those the diggers of the coming wave will use (as startWave
// gives the groups out), in a wave those of the diggers on the field.
export function digHills(g) {
  const hills = new Set();
  if (g.phase === 'build') { const spec = g.L.waves[g.wave] || []; spec.forEach(([kind], k) => { if (BUGS[kind].dig && !BUGS[kind].boss) hills.add((g.wave + 2 + k) % g.entries.length); }); }
  for (const b of g.bugs) if (BUGS[b.kind].dig) hills.add(b.e % g.entries.length);
  return hills;
}
// The way diggers (crickets) take from every anthill: every cell, and the plants they eat through on it. Shown to the
// player when diggers are coming: a long maze with one plant between the anthill and an empty run to the fruit is
// a short way for them, and nothing else on the screen tells.
export function digTrails(g) {
  return g.entries.map((en) => {
    const cells = [en.slice()], eats = []; let [i, j] = en, dir = [-1, 0];
    for (let n = 0; n < COLS * ROWS && !(i === g.fruit[0] && j === g.fruit[1]); n++) {
      const nx = nextDig(g, i, j, dir); if (!nx) break;
      dir = [nx[0] - i, nx[1] - j]; [i, j] = nx; cells.push(nx); if (g.grid[j][i]?.type) eats.push(nx);
    }
    return { cells, eats };
  });
}
// one trail per anthill
export const trails = (g, dist = g.dist) => g.entries.map((_, e) => trail(g, dist, e));
const isEntry = (g, i, j) => g.entries.some((e) => e[0] === i && e[1] === j);

// Why a plant cannot go to (i, j): null when it can. Not on roots: the eaten plant grows back there after the wave.
export function placeProblem(g, i, j) {
  if (!inside(i, j)) return 'outside';
  if (g.grid[j][i]) return 'busy';
  if (isEntry(g, i, j) || (i === g.fruit[0] && j === g.fruit[1])) return 'busy';
  if (g.tiles[j][i] === 'nettle') return 'nettle';
  if (g.tiles[j][i] === 'stone') return 'stone';
  if (stubAt(g, i, j)) return 'roots';
  return blocks(g, i, j) ? 'blocks' : null;
}
// Whether a plant on (i, j) would shut the bugs in. The way from every anthill has to stay open with all the roots
// grown back too, as they will be after the wave. A plant may grow on a cell with bugs on it: they step out of it, so
// they only need a way on from a cell next to it (with the roots as they are now: open).
function blocks(g, i, j) {
  const d = computeDist(g, key(i, j)), all = g.stubs.length ? computeDist(g, key(i, j), true) : d;
  if (g.entries.some((e) => all[key(...e)] >= INF)) return true;
  const open = (ci, cj) => inside(ci, cj) && d[key(ci, cj)] < INF;
  for (const b of g.bugs) {
    if (b.fly || b.ti == null || BUGS[b.kind].dig || !inside(b.ti, b.tj)) continue;
    if (b.ti === i && b.tj === j ? !DIRS.some(([di, dj]) => open(i + di, j + dj)) : !open(b.ti, b.tj)) return true;
  }
  return false;
}
export function blockingCells(g) {
  const out = [];
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) if (!g.grid[j][i] && placeProblem(g, i, j) === 'blocks') out.push([i, j]);
  return out;
}
export function previewTrails(g, i, j) { return trails(g, computeDist(g, key(i, j))); }

// A stat of a plant as it stands: its level and branch, the player's perk for this plant and the soil under it.
// p may be a plant or just { type, lvl, br, i, j } (i < 0: no cell yet). 0 when it has no such stat.
const BOOSTED = { dmg: 1, burn: 1, hp: 1, thorns: 1 }, ADDED = { slow: 1, frost: 1, guard: 1 };
export function pstat(g, p, name) {
  let v = statOf(PLANTS[p.type], name, p.lvl, p.br); if (v == null) return 0;
  if (!v || typeof v !== 'number') return v;
  const perk = PERKS[p.type], tier = g.meta[p.type] || 0;
  if (tier && perk.stat.includes(name)) v = perk.mul ? v * perk.v[tier - 1] : v + perk.v[tier - 1];
  if (g.tiles[p.j]?.[p.i] === 'fertile') { if (BOOSTED[name]) v *= FERTILE; else if (ADDED[name]) v += FERTILE_ADD; else if (name === 'eat') v /= FERTILE; }
  if (name === 'slow' || name === 'frost') v = Math.min(v, .6);
  return name === 'hp' ? Math.round(v) : v;
}

const over = (g) => g.phase === 'won' || g.phase === 'lost';
export const stubAt = (g, i, j) => g.stubs.find((s) => s.i === i && s.j === j) || null;
function grow(g, type, i, j, lvl, spent, br = null) {
  const P = PLANTS[type], k = g.stubs.findIndex((s) => s.i === i && s.j === j); if (k >= 0) g.stubs.splice(k, 1);
  const p = { id: g.nextId++, type, i, j, lvl, br, hp: 1, maxHp: 1, cd: .3, spent, hit: 0, web: 0, guard: 0, spikes: 0, ward: null, warded: false, busy: 0, born: -1, tgt: 0, stk: 0 };
  p.hp = p.maxHp = pstat(g, p, 'hp');
  g.grid[j][i] = p; g.plants.push(p); refresh(g);
  return p;
}
export function place(g, type, i, j) {
  const P = PLANTS[type];
  if (!P || !g.L.plants.includes(type) || g.dew < P.cost || placeProblem(g, i, j) || over(g)) return false;
  g.dew -= P.cost;
  const p = grow(g, type, i, j, 1, P.cost); if (g.phase === 'build') p.born = g.wave; // sold before the wave starts, it gives all its dew back
  g.events.push({ t: 'place', p });
  return true;
}
// A new plant may go over an old one of another kind: the old one is sold first (as by the sell button) and its dew
// counts towards the new one. Why it cannot: null when it can.
export function plantProblem(g, type, i, j) {
  const old = g.grid[j]?.[i], P = PLANTS[type];
  if (!old?.type) return placeProblem(g, i, j) || (g.dew < P.cost ? 'poor' : null);
  if (old.type === type) return 'same';
  return over(g) ? 'busy' : g.dew + refund(g, old) < P.cost ? 'poor' : null;
}
export function plantOn(g, type, i, j) {
  const old = g.grid[j]?.[i];
  if (!old?.type) return place(g, type, i, j);
  if (plantProblem(g, type, i, j) || !g.L.plants.includes(type)) return false;
  const dew = g.dew, n = g.events.length; removePlant(g, old);
  if (place(g, type, i, j)) return true;
  // could not grow there after all: put the old plant back as it was
  g.events.length = n; g.dew = dew; g.grid[j][i] = old; g.plants.push(old); refresh(g);
  return false;
}
// The roots of an eaten plant grow back into the same plant of the same level, for nothing: after the wave, or at
// once by the rain. In a wave they wait while a bug would be shut in by them.
function regrow(g, s, by) {
  if (!g.stubs.includes(s) || g.grid[s.j][s.i] || blocks(g, s.i, s.j)) return false;
  const p = grow(g, s.type, s.i, s.j, s.lvl, s.spent, s.br); if (s.warded) { p.warded = true; auras(g); } // a ward used stays used for the wave
  g.events.push({ t: 'regrow', p, by });
  return true;
}
// Growing a plant: to level 3 it takes branch br (one open on this level), after that it keeps its own.
export const branchOpen = (g, type, br) => !!PLANTS[type][br] && g.level + 1 >= PLANTS[type][br].from;
export function upgradeCost(p, br = p.br) { return upCost(PLANTS[p.type], p.lvl, br); }
export function upgrade(g, p, br = p.br) {
  if (p.lvl !== 2) br = p.br; else if (!branchOpen(g, p.type, br)) return false;
  const c = upgradeCost(p, br); if (c == null || g.dew < c || over(g)) return false;
  g.dew -= c; p.spent += c; p.lvl++; p.br = br; p.cd = Math.max(p.cd, .3);
  const mh = pstat(g, p, 'hp'); p.hp = Math.max(1, p.hp + mh - p.maxHp); p.maxHp = mh; g.dig = computeDig(g); auras(g);
  g.events.push({ t: 'upgrade', p });
  return true;
}
export const isFresh = (g, p) => g.phase === 'build' && p.born === g.wave;
export const refund = (g, p) => (isFresh(g, p) ? p.spent : Math.floor(p.spent * g.refund));
// Weeds are cleared for dew; the cell is free after that.
export function clearWeed(g, i, j) {
  const o = g.grid[j]?.[i]; if (!o || o.obstacle !== 'weed' || g.dew < WEED_COST || over(g)) return false;
  g.dew -= WEED_COST; g.grid[j][i] = null; refresh(g); g.events.push({ t: 'weed', i, j });
  return true;
}
export function removePlant(g, p, sold = true) {
  const k = g.plants.indexOf(p); if (k < 0 || (sold && over(g))) return;
  g.plants.splice(k, 1); g.grid[p.j][p.i] = null; refresh(g);
  if (sold) g.dew += refund(g, p); else { g.stats.eaten++; g.stubs.push({ id: g.nextId++, type: p.type, lvl: p.lvl, br: p.br, spent: p.spent, i: p.i, j: p.j, warded: p.warded }); }
  g.events.push({ t: sold ? 'sell' : 'plantDead', p });
}

// Dew for calling the next wave now instead of waiting for it.
export const earlyBonus = (g) => (g.phase === 'build' && g.nextIn > 0 ? Math.round(g.nextIn * EARLY_DEW) : 0);
export function startWave(g) {
  if (g.phase !== 'build' || g.wave >= g.waves) return false;
  const bonus = earlyBonus(g); g.nextIn = null;
  if (bonus) { gain(g, bonus); g.events.push({ t: 'early', bonus }); }
  const spec = g.L.waves[g.wave]; g.wave++; g.phase = 'wave'; g.waveTime = 0; g.queue = [];
  // with two anthills the groups of a wave come out of them in turn; a group starts when half the one before is out,
  // but diggers only once all the others are (a hole they eat must not be a road for the rest of the wave)
  let t0 = 0, e = g.wave, last = 0;
  for (const [kind, count, gap, delay] of spec) { t0 += delay; e++; if (BUGS[kind].dig) t0 = Math.max(t0, last + delay); for (let n = 0; n < count; n++) g.queue.push({ kind, at: t0 + n * gap, e: (BUGS[kind].boss ? e + n : e) % g.entries.length }); last = Math.max(last, t0 + (count - 1) * gap); t0 += count * gap * .5; }
  g.queue.sort((a, b) => a.at - b.at);
  g.events.push({ t: 'wave', n: g.wave, boss: spec.find(([k]) => BUGS[k].boss)?.[0] || null });
  return true;
}
export function wavePreview(g, n = g.wave) {
  const spec = g.L.waves[n]; if (!spec) return [];
  const m = new Map(); for (const [k, c] of spec) m.set(k, (m.get(k) || 0) + c);
  return [...m];
}
function gain(g, n) { g.dew += n; g.stats.earned += n; }

// How much stronger the bugs of a wave are than in the first one, and how much harder they bite the plants.
export const hpMul = (g, wave = g.wave) => 1 + TUNE.hpGrowth * (wave - 1);
// (L.hp: how healthy the bugs of this level are, against their own health; 1 on most levels)
export const bugHp = (g, kind, wave = g.wave) => Math.round(BUGS[kind].hp * g.L.hp * (BUGS[kind].fly ? 1 + (hpMul(g, wave) - 1) * FLY_HP : hpMul(g, wave)));
const chewMul = (g) => 1 + CHEW_GROWTH * (g.wave - 1);
// A bug comes out of anthill e, or (from: a boss) appears where its boss is.
// The bugs by the cell they are in, rebuilt every step before the plants look round: a plant checks only the cells
// within its reach, not every bug on the field. near() gives them in the order of g.bugs, as a plain loop would.
const BW = COLS + 4, bucketOf = (b) => Math.max(0, Math.min(BW - 1, Math.floor(b.x) + 1)) + Math.max(0, Math.min(ROWS + 1, Math.floor(b.y) + 1)) * BW;
const BK = Array.from({ length: BW * (ROWS + 2) }, () => []); let bkOn = false; // filled only while the plants look round
function sortBugs(g) {
  for (const l of BK) l.length = 0;
  g.bugs.forEach((b, k) => { b.k = k; BK[bucketOf(b)].push(b); }); bkOn = true;
}
const nearOut = [];
function near(g, px, py, r) {
  nearOut.length = 0; const bk = BK;
  // one cell more on the low side: a bug a hair below the edge of the reach (y = 0.9999999999999999 with the edge at
  // 1) is in another cell, yet its distance rounds to the reach itself and a plain loop takes it
  const x0 = Math.max(0, Math.floor(px - r)), x1 = Math.min(BW - 1, Math.floor(px + r) + 1), y0 = Math.max(0, Math.floor(py - r)), y1 = Math.min(ROWS + 1, Math.floor(py + r) + 1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) for (const b of bk[x + y * BW]) nearOut.push(b);
  if (nearOut.length > 1) nearOut.sort((a, b) => a.k - b.k);
  return nearOut;
}
function spawn(g, kind, e = 0, from = null) {
  const B = BUGS[kind], hp = Math.round(bugHp(g, kind) * (from ? .4 : 1)), en = g.entries[e] || g.entries[0];
  const b = { id: g.nextId++, kind, hp, maxHp: hp, speed: B.speed, fly: !!B.fly, armor: B.armor || 0, x: COLS + .6, y: en[1] + .5, vx: -1, vy: 0, slow: 1, slowT: 0, slowV: 1, frozen: 0, burn: 0, burnDps: 0, melt: 0, spread: false, chew: 0, thaw: 0, chewCd: 2, gnaw: null, gnawT: 0, dir: [-1, 0], ti: en[0], tj: en[1], hit: 0, skill: 0, rush: 0, brood: !!from, e,
    mark: 0, markV: 0, chain: 0, coming: 0, lured: false, lure: null, sniff: 0, fall: 0, pricked: 0 };
  if (B.charge) b.skill = B.charge[0] * .6; if (B.brood) b.skill = B.brood[2]; if (B.web) b.skill = B.web[0] * .6;
  if (b.fly) { b.y = from ? from.y : .6 + g.rand() * (ROWS - 1.2); b.ti = b.tj = null; }
  if (from) {
    b.x = from.x + (g.rand() - .5) * .5; b.y = from.y + (g.rand() - .5) * .5;
    if (!b.fly) { b.x = Math.min(COLS - .05, Math.max(.05, b.x)); b.y = Math.min(ROWS - .05, Math.max(.05, b.y)); b.ti = from.ti; b.tj = from.tj; b.dir = from.dir.slice(); if (b.ti == null) { b.ti = Math.floor(b.x); b.tj = Math.floor(b.y); } }
  }
  g.bugs.push(b); if (bkOn) { b.k = g.bugs.length - 1; BK[bucketOf(b)].push(b); } // born while the plants look round
  if (B.boss) g.events.push({ t: 'boss', b });
  return b;
}

export function usePower(g, kind) {
  if (!g.powers[kind] || over(g) || (kind === 'frost' && g.phase !== 'wave')) return false; // frost on an empty field is lost
  g.powers[kind]--;
  if (kind === 'frost') for (const b of g.bugs) freeze(b, BUGS[b.kind].boss ? 2 : 4, true);
  // rain: the roots grow back at once and the webs are washed off; it heals no bitten plant
  if (kind === 'rain') { for (const p of g.plants) p.web = 0; auras(g); for (const s of g.stubs.slice()) regrow(g, s, 'rain'); g.hp = Math.min(g.maxHp, g.hp + 3); }
  g.events.push({ t: 'power', kind });
  return true;
}
export const rewardOf = (b) => Math.max(1, Math.round(BUGS[b.kind].reward * (b.brood ? BROOD_REWARD : 1)));
function kill(g, b, how) {
  const B = BUGS[b.kind], reward = rewardOf(b);
  b.hp = 0; gain(g, reward); g.stats.kills++;
  g.events.push({ t: 'kill', b, reward, how });
  if (B.boss) g.events.push({ t: 'bossDead', b });
  if (B.split && !b.fly) for (let n = 0; n < B.split[1]; n++) spawn(g, B.split[0], b.e, b);
  // a mark of a grown hunter rose goes on to the nearest bugs not marked yet
  if (b.mark > 0 && b.chain) {
    const next = g.bugs.filter((o) => o !== b && o.hp > 0 && !(o.mark > 0) && within(o.x - b.x, o.y - b.y, 1.5)).sort((p, q) => hyp(p.x - b.x, p.y - b.y) - hyp(q.x - b.x, q.y - b.y)).slice(0, b.chain);
    for (const o of next) { o.mark = MARK_T; o.markV = b.markV; o.chain = b.chain; }
    if (next.length) g.events.push({ t: 'chain', b, to: next });
  }
}
// Health lost for any reason other than a hit (fire, nettles, thorns): no armor, no floor.
// A bug marked by a rose takes more of everything.
const marked = (b) => (b.mark > 0 ? 1 + b.markV : 1);
function lose(g, b, amount, how) { if (b.hp <= 0) return; b.hp -= amount * marked(b); if (b.hp <= 0) kill(g, b, how); }
// Thorns and nettles take a share of a bug's health, whatever its health: the two together take no more
// than PRICK_CAP of it off one bug (b.pricked: the share taken so far), or a long thorny trail alone would kill any
// bug of any wave. True when it took something.
function prick(g, b, share, how) { const s = Math.min(share, PRICK_CAP - b.pricked); if (!(s > 0) || b.hp <= 0) return false; b.pricked += s; lose(g, b, b.maxHp * s, how); return true; }
// A bug burning by a burn-through chili has no armor.
const armorOf = (b) => (b.melt > 0 ? 0 : b.armor);
function damage(g, b, amount, src) {
  if (b.hp <= 0) return;
  const dmg = Math.max(1, amount - armorOf(b)) * marked(b);
  b.hp -= dmg; b.hit = .15;
  g.events.push({ t: 'hit', b, dmg, src });
  if (b.hp <= 0) kill(g, b, src);
}
// A bug bites a plant: a guarded plant takes less, one by a shell pumpkin bites back, and a shell with a ward saves
// one plant a wave from being eaten. k: the part of a bite or a second.
function hurtPlant(g, p, amount, b, k = 1) {
  p.hp -= amount * (1 - p.guard); p.hit = Math.max(p.hit, .12);
  if (p.spikes) lose(g, b, b.maxHp * (p.spikes * k * (BUGS[b.kind].boss ? THORN_BOSS : 1)), 'spikes'); // (not under PRICK_CAP: only a bug that bites is pricked, and a shell is the answer to those)
  if (p.hp > 0) return;
  const w = p.ward;
  if (w && !w.warded && g.plants.includes(w)) { p.hp = 1; w.warded = true; auras(g); g.events.push({ t: 'ward', p, by: w }); return; }
  removePlant(g, p, false);
}

// Stops a bug for t seconds. Stops do not chain: when one ends, the bug cannot be stopped again for THAW seconds
// (frost, the player's power, always works).
const THAW = 3;
function freeze(b, t, force = false) { if (!force && (b.thaw > 0 || b.frozen > 0)) return; b.frozen = Math.max(b.frozen, t); }
// Slows a bug to v of its speed for t seconds; slows do not add up: a weaker one does nothing while a stronger is on.
function chill(b, v, t) { if (b.slowT <= 0 || v <= b.slowV) { b.slowV = v; b.slowT = t; } }
// Sets a bug burning; burns do not add up: a weaker one does nothing while a stronger is on.
function ignite(b, dps, t) { if (b.burn <= 0 || dps >= b.burnDps) { b.burn = t; b.burnDps = dps; b.spread = false; return true; } return false; }
// A flyer shot down falls onto the cell of the trail nearest to it (not the fruit's) and walks on.
function fall(g, b) {
  const on = new Array(COLS * ROWS).fill(false);
  for (const tr of trails(g)) for (const [i, j] of tr) if (inside(i, j)) on[key(i, j)] = true;
  let best = -1, bd = INF;
  for (let k = 0; k < on.length; k++) {
    if (!on[k]) continue; const i = k % COLS, j = (k - i) / COLS;
    if (g.grid[j][i] || (i === g.fruit[0] && j === g.fruit[1])) continue;
    const d = hyp(i + .5 - b.x, j + .5 - b.y); if (d < bd) { bd = d; best = k; }
  }
  if (best < 0) return;
  const i = best % COLS, j = (best - i) / COLS;
  b.fly = false; b.fx = b.x; b.fy = b.y; b.x = i + .5; b.y = j + .5; b.ti = i; b.tj = j; b.dir = [-1, 0]; b.fall = FALL_T; b.lure = null; b.sniff = 0;
  g.events.push({ t: 'fall', b });
}
function progress(g, b) {
  if (b.fly) return hyp(b.x - g.fruit[0] - .5, b.y - g.fruit[1] - .5);
  if (b.ti == null || !inside(b.ti, b.tj)) return 100;
  return (BUGS[b.kind].dig ? g.dig : g.dist)[key(b.ti, b.tj)] + hyp(b.x - b.ti - .5, b.y - b.tj - .5);
}

// What a boss does on its way.
function bossSkill(g, b, B, dt) {
  if (b.rush > 0) b.rush -= dt;
  b.skill -= dt; if (b.skill > 0) return;
  if (B.charge) { b.skill = B.charge[0]; b.rush = B.charge[1]; g.events.push({ t: 'charge', b }); }
  else if (B.brood) {
    b.skill = B.brood[2];
    if (b.x < COLS - .5) { for (let n = 0; n < B.brood[1]; n++) spawn(g, B.brood[0], b.e, b); g.events.push({ t: 'brood', b }); }
  }
  else if (B.web) {
    const [every, r, n, life] = B.web; b.skill = every;
    const near = g.plants.filter((p) => !p.web && PLANTS[p.type].range && within(p.i + .5 - b.x, p.j + .5 - b.y, r))
      .sort((p, q) => hyp(p.i + .5 - b.x, p.j + .5 - b.y) - hyp(q.i + .5 - b.x, q.j + .5 - b.y)).slice(0, n);
    if (!near.length) { b.skill = 1; return; }
    for (const p of near) p.web = life;
    auras(g);
    g.events.push({ t: 'web', b, plants: near });
  }
}

function updateBug(g, b, dt) {
  const B = BUGS[b.kind];
  // fire is weak against armor: it comes off the burn every second; there is no 1-damage floor
  if (b.burn > 0) {
    b.burn -= dt; lose(g, b, Math.max(0, b.burnDps - armorOf(b)) * dt, 'burn'); if (b.hp <= 0) return;
    if (b.burn <= 0) b.spread = false; // a fire out passes nothing on
    if (b.spread) for (const o of g.bugs) if (o !== b && !o.fly && o.hp > 0 && !(o.burn > 0) && within(o.x - b.x, o.y - b.y, .6)) { o.burn = b.burn; o.burnDps = b.burnDps; b.spread = false; g.events.push({ t: 'spread', b, o }); break; }
  }
  if (b.melt > 0) b.melt -= dt;
  const ci = Math.floor(b.x), cj = Math.floor(b.y), tile = b.fly ? null : g.tiles[cj]?.[ci];
  if (tile === 'nettle') { const stung = prick(g, b, (B.boss ? NETTLE_BOSS : NETTLE) * dt, 'nettle'); if (b.hp <= 0) return; if (stung) b.sting = .25; }
  if (inside(ci, cj)) {
    const th = (b.fly ? g.thornAir : g.thorn)[key(ci, cj)];
    if (th) { const stung = prick(g, b, th * (B.boss ? THORN_BOSS : 1) * dt, 'thorns'); if (b.hp <= 0) return; if (stung) b.sting = .25; }
  }
  if (b.sting > 0) b.sting -= dt;
  if (b.thaw > 0) b.thaw -= dt;
  if (b.frozen > 0) { b.frozen -= dt; if (b.frozen <= 0) b.thaw = THAW; return; }
  if (b.fall > 0) { b.fall -= dt; return; } // a flyer shot down, on its way to the ground
  if (B.mend) for (const o of g.bugs) if (o !== b && o.hp > 0 && o.hp < o.maxHp && !BUGS[o.kind].boss && !BUGS[o.kind].mend && within(o.x - b.x, o.y - b.y, 1.6)) { o.hp = Math.min(o.maxHp, o.hp + o.maxHp * B.mend * dt); o.mended = .3; }
  if (b.mended > 0) b.mended -= dt;
  if (B.boss) bossSkill(g, b, B, dt);
  if (b.chew > 0) {
    b.chew -= dt;
    if (b.chew <= 0) {
      const p = b.chewTarget; b.chewCd = 5;
      if (p && g.plants.includes(p)) { g.events.push({ t: 'chew', p, b }); hurtPlant(g, p, B.chew * chewMul(g), b); }
    }
    return;
  }
  if (b.gnaw) { // a digger eating the plant in its way
    const p = b.gnaw;
    if (!g.plants.includes(p)) b.gnaw = null;
    else {
      b.gnawT -= dt;
      if (b.gnawT <= 0) { b.gnawT = .45; g.events.push({ t: 'chew', p, b }); }
      hurtPlant(g, p, B.dig * chewMul(g) * dt, b, dt);
      if (!g.plants.includes(p)) b.gnaw = null;
      return;
    }
  }
  b.chewCd -= dt;
  const rush = b.rush > 0 ? B.charge[2] : 1;
  const v = b.speed * (B.noSlow || rush > 1 ? 1 : b.slow) * (tile === 'mud' ? MUD : 1) * rush * dt;
  if (b.fly) { // straight to the fruit, or first to the nectar of a lure flytrap, where it hangs a moment
    if (b.sniff > 0) { b.sniff -= dt; if (b.sniff <= 0) b.lure = null; return; }
    if (b.lure && (!g.plants.includes(b.lure) || b.lure.web > 0)) b.lure = null;
    const L = b.lure, tx = L ? L.i + .5 : g.fruit[0] + .5, ty = L ? L.j + .5 : g.fruit[1] + .5, dx = tx - b.x, dy = ty - b.y, d = hyp(dx, dy);
    if (L) { if (d < .4) { b.sniff = SNIFF; return; } } else if (d < .45) { bite(g, b); return; }
    b.vx = dx / d; b.vy = dy / d; b.x += b.vx * v; b.y += b.vy * v; return;
  }
  const tx = b.ti + .5, ty = b.tj + .5, dx = tx - b.x, dy = ty - b.y, d = hyp(dx, dy);
  if (d <= Math.max(v, .1)) {
    if (b.ti === g.fruit[0] && b.tj === g.fruit[1]) { bite(g, b); return; }
    if (B.chew && b.chewCd <= 0) {
      for (const [di, dj] of DIRS) { const c = (g.grid[b.tj + dj] || [])[b.ti + di]; if (c && c.type) { b.chew = 1.6; b.chewTarget = c; b.vx = di; b.vy = dj; return; } }
    }
    const nx = B.dig ? nextDig(g, b.ti, b.tj, b.dir) : nextCell(g, b.ti, b.tj, b.dir);
    if (nx && B.dig && g.grid[nx[1]][nx[0]]) { b.gnaw = g.grid[nx[1]][nx[0]]; b.gnawT = 0; b.x = tx; b.y = ty; b.vx = nx[0] - b.ti; b.vy = nx[1] - b.tj; return; }
    if (!nx) { b.x += dx * .5; b.y += dy * .5; return; }
    b.dir = [nx[0] - b.ti, nx[1] - b.tj]; b.ti = nx[0]; b.tj = nx[1];
    const rest = v - d; b.x = tx; b.y = ty;
    if (rest > 0) { b.x += b.dir[0] * rest; b.y += b.dir[1] * rest; }
    return;
  }
  b.vx = dx / d; b.vy = dy / d; b.x += b.vx * v; b.y += b.vy * v;
}
function bite(g, b) {
  g.hp -= BUGS[b.kind].bite; g.stats.bites++; b.hp = 0; b.gone = true;
  g.events.push({ t: 'bite', b });
  if (g.hp <= 0) { g.hp = 0; g.phase = 'lost'; g.events.push({ t: 'lost' }); }
}

function updatePlant(g, p, dt) {
  const px = p.i + .5, py = p.j + .5;
  if (p.hit > 0) p.hit -= dt;
  if (p.busy > 0) p.busy -= dt;
  if (p.web > 0) { p.web -= dt; if (p.web <= 0) auras(g); return; } // caught in a spider's web: does nothing
  const range = pstat(g, p, 'range'); if (!range || pstat(g, p, 'guard')) return; // a pumpkin works through auras
  const air = !!pstat(g, p, 'air'), gr = pstat(g, p, 'groundRange');
  const inRange = (b, a = air) => b.hp > 0 && (a || !b.fly) && b.x < COLS + .2 && within(b.x - px, b.y - py, gr && !b.fly ? Math.min(range, gr) : range);
  const slow = pstat(g, p, 'slow');
  if (slow) { // the cold mint: every bug around slower, and with rime frozen now and then
    let any = false;
    for (const b of near(g, px, py, range)) if (inRange(b)) { b.slow = Math.min(b.slow, 1 - slow); any = true; }
    const rime = pstat(g, p, 'rime'); if (!rime) return;
    p.cd -= dt; if (p.cd > 0 || !any) return;
    p.cd = rime; for (const b of near(g, px, py, range).slice()) if (inRange(b)) freeze(b, BUGS[b.kind].boss ? .5 : 1);
    g.events.push({ t: 'chill', p });
    return;
  }
  const lure = pstat(g, p, 'lure');
  if (lure) { // the nectar of a lure flytrap: a flyer near turns to it, once
    const boss = !!pstat(g, p, 'lureBoss');
    for (const b of near(g, px, py, lure)) if (b.fly && b.hp > 0 && !b.lured && b.x < COLS + .2 && (boss || !BUGS[b.kind].boss) && within(b.x - px, b.y - py, lure)) { b.lured = true; b.lure = p; g.events.push({ t: 'lure', p, b }); }
  }
  const bugs = near(g, px, py, range).slice(); // the only bugs it can reach
  p.cd -= dt; if (p.cd > 0) return;
  const eat = pstat(g, p, 'eat');
  if (eat) { // swallows the worn bugs whole, the biggest it can first; a healthier bug it leaves alone
    const eatAir = !!pstat(g, p, 'eatAir'), gulp = pstat(g, p, 'gulp'), heads = pstat(g, p, 'heads') || 1;
    const meals = bugs.filter((b) => inRange(b, eatAir) && !BUGS[b.kind].boss && b.hp <= gulp * b.maxHp).sort((a, b) => b.hp - a.hp).slice(0, heads);
    if (!meals.length) return;
    p.cd = eat; p.busy = 1.2;
    for (const b of meals) { g.events.push({ t: 'eat', p, b, whole: true }); if (b.hp > 0) kill(g, b, 'eat'); } // whole: no sum of health and armor to round
    return;
  }
  if (pstat(g, p, 'blaze')) { // the heat chili: every walker around, a little each
    const hit = bugs.filter((b) => inRange(b)); if (!hit.length) return;
    p.cd = 1 / pstat(g, p, 'rate');
    const dmg = pstat(g, p, 'dmg'), burn = pstat(g, p, 'burn'), burnT = pstat(g, p, 'burnT'), spread = !!pstat(g, p, 'spread');
    for (const b of hit) { damage(g, b, dmg, p.type); if (b.hp > 0 && ignite(b, burn, burnT) && spread) b.spread = true; }
    g.events.push({ t: 'fire', p });
    return;
  }
  // a shooter: the bugs nearest to the fruit first, and not a bug the shots already on their way will finish (all the
  // shooters on one bug was damage thrown away). A hunter rose pricks the bugs not marked yet first, a far shot takes
  // the flyers first, an icicle mint the thickest walker, a burn-through chili the armored and the thick.
  const multi = pstat(g, p, 'multi') || 1, splash = pstat(g, p, 'splash'), mark = pstat(g, p, 'mark'), ground = pstat(g, p, 'ground');
  const heavy = !!pstat(g, p, 'heavy'), melt = !!pstat(g, p, 'melt'), seen = [];
  for (const b of bugs) if (inRange(b) && (splash || b.coming < b.hp)) {
    seen.push([heavy ? -b.hp : melt ? -(b.armor * 1e6 + b.hp) : progress(g, b) + (ground && !b.fly ? 1e3 : 0) + (mark && b.mark > .5 ? 500 : 0), b]);
  }
  if (!seen.length) return;
  seen.sort((a, b) => a[0] - b[0]);
  p.cd = 1 / pstat(g, p, 'rate');
  const P = PLANTS[p.type], stack = pstat(g, p, 'stack');
  for (const [, best] of seen.slice(0, multi)) {
    const weak = ground && !best.fly; let dmg = pstat(g, p, 'dmg') * (weak ? ground : 1);
    if (stack) { if (p.tgt === best.id) p.stk = Math.min(p.stk + 1, Math.round(1 / stack)); else { p.tgt = best.id; p.stk = 0; } dmg *= 1 + stack * p.stk; }
    const est = splash ? 0 : Math.max(1, dmg - armorOf(best)) * marked(best); best.coming += est; // what it will take
    g.shots.push({ id: g.nextId++, kind: statOf(P, 'shot', p.lvl, p.br), from: p.type, x: px, y: py - .25, sx: px, sy: py - .25, target: best, tx: best.x, ty: best.y, speed: pstat(g, p, 'speed'), dmg, est,
      splash, hits: pstat(g, p, 'hits'), mark, chain: pstat(g, p, 'chain'), frost: pstat(g, p, 'frost'), frostT: pstat(g, p, 'frostT'), burn: pstat(g, p, 'burn'), burnT: pstat(g, p, 'burnT'), melt,
      crack: !!pstat(g, p, 'crack'), down: weak ? 0 : pstat(g, p, 'down'), air });
    g.events.push({ t: 'shoot', p, target: best });
  }
}
// What a shot does to a bug it hits.
function strike(g, s, b) {
  damage(g, b, s.dmg, s.from);
  if (s.crack && b.armor > 0) { b.armor--; b.cracks = (b.cracks || 0) + 1; } // the burn-through top: armor off for good
  if (b.hp <= 0) return;
  if (s.burn) { ignite(b, s.burn, s.burnT); if (s.melt) b.melt = Math.max(b.melt, s.burnT); }
  if (s.mark) { const on = b.mark > 0; b.markV = Math.max(s.mark, on ? b.markV : 0); b.chain = on ? Math.max(b.chain, s.chain) : s.chain; b.mark = MARK_T; } // a mark run out leaves nothing
  if (s.frost) chill(b, 1 - s.frost, s.frostT);
  if (s.down && b.fly) { if (BUGS[b.kind].boss) freeze(b, .5); else if (b.hp <= s.down * b.maxHp) fall(g, b); }
}
function updateShot(g, s, dt) {
  if (s.target && s.target.hp > 0 && !s.target.gone) { s.tx = s.target.x; s.ty = s.target.y; }
  const dx = s.tx - s.x, dy = s.ty - s.y, d = hyp(dx, dy), v = s.speed * dt;
  if (d <= v) {
    s.done = true; if (s.target && s.est) s.target.coming -= s.est;
    if (s.splash) { // a pepper bursts: the walkers closest to where it lands, s.hits of them at most
      const near = g.bugs.filter((b) => !b.fly && b.hp > 0 && within(b.x - s.tx, b.y - s.ty, s.splash)).sort((a, b) => hyp(a.x - s.tx, a.y - s.ty) - hyp(b.x - s.tx, b.y - s.ty));
      for (const b of near.slice(0, s.hits || Infinity)) strike(g, s, b);
      g.events.push({ t: 'splash', x: s.tx, y: s.ty, kind: s.kind, r: s.splash });
    } else if (s.target && s.target.hp > 0 && !s.target.gone) strike(g, s, s.target);
    return;
  }
  s.x += dx / d * v; s.y += dy / d * v;
}

export function step(g, dt) {
  if (over(g)) return;
  g.time += dt;
  if (g.phase === 'build' && g.nextIn != null) { g.nextIn -= dt; if (g.nextIn <= 0) { g.nextIn = 0; startWave(g); } }
  if (g.phase === 'wave') {
    g.waveTime += dt;
    while (g.queue.length && g.queue[0].at <= g.waveTime) { const q = g.queue.shift(); spawn(g, q.kind, q.e); }
  }
  for (const b of g.bugs) { b.slow = 1; if (b.slowT > 0) { b.slow = b.slowV; b.slowT -= dt; } }
  sortBugs(g); try { for (const p of g.plants.slice()) updatePlant(g, p, dt); } finally { bkOn = false; }
  for (const b of g.bugs.slice()) { if (b.hit > 0) b.hit -= dt; if (b.mark > 0) b.mark -= dt; if (b.hp > 0) updateBug(g, b, dt); }
  for (const s of g.shots) updateShot(g, s, dt);
  g.shots = g.shots.filter((s) => !s.done);
  g.bugs = g.bugs.filter((b) => b.hp > 0);
  if (g.phase === 'lost') return;
  if (g.phase === 'wave' && !g.queue.length && !g.bugs.length) {
    if (g.wave >= g.waves) { g.phase = 'won'; g.events.push({ t: 'won' }); }
    else {
      // the garden grows back: the eaten plants out of their roots, the bitten ones to full health
      for (const s of g.stubs.slice()) regrow(g, s, 'wave');
      for (const p of g.plants) { p.hp = p.maxHp; p.warded = false; }
      auras(g);
      const bonus = wavePay(g.L, g.wave); g.phase = 'build'; g.nextIn = BREAK; gain(g, bonus);
      const powers = g.wave % POWER_EVERY === 0;
      if (powers) for (const k in g.powers) g.powers[k] = Math.min(g.powerMax, g.powers[k] + 1);
      g.events.push({ t: 'waveDone', n: g.wave, bonus, powers });
    }
  }
}

export const stars = (g) => (g.hp >= g.maxHp * .8 ? 3 : g.hp >= g.maxHp * .4 ? 2 : 1);

// A level in progress is kept between waves: what stands on the field and what the player has. It comes back in the
// build phase, and the next wave waits for the player.
export function snapshot(g) {
  const cleared = g.L.obstacles.filter(([i, j, t]) => t === 'weed' && g.grid[j][i]?.obstacle !== 'weed').map(([i, j]) => [i, j]);
  return {
    v: SAVE_V, level: g.level, seed: g.seed, wave: g.wave, dew: g.dew, hp: g.hp, powers: { ...g.powers }, stats: { ...g.stats }, time: g.time, cleared,
    // between waves the whole garden stands in full health (no roots: they grew back when the wave was over)
    plants: g.plants.map((p) => ({ type: p.type, lvl: p.lvl, br: p.br, i: p.i, j: p.j, spent: p.spent })),
  };
}
export function restore(snap, meta = {}) {
  if (!snap || snap.v !== SAVE_V || !LEVELS[snap.level] || !Array.isArray(snap.plants)) return null;
  const g = createGame(snap.level, snap.seed, meta);
  if (snap.wave >= g.waves) return null;
  for (const [i, j] of snap.cleared || []) if (g.grid[j]?.[i]?.obstacle === 'weed') g.grid[j][i] = null;
  for (const q of snap.plants) {
    const P = PLANTS[q.type], br = q.lvl > 2 ? q.br : null;
    if (!P || ![1, 2, 3, 4].includes(q.lvl) || (q.lvl > 2 && !(BRANCHES.includes(br) && branchOpen(g, q.type, br))) || !Number.isFinite(q.spent) || !inside(q.i, q.j) || g.grid[q.j][q.i]) continue;
    grow(g, q.type, q.i, q.j, q.lvl, q.spent, br);
  }
  Object.assign(g, { wave: snap.wave, dew: snap.dew, hp: Math.min(g.maxHp, snap.hp), time: snap.time || 0 });
  Object.assign(g.powers, snap.powers); Object.assign(g.stats, snap.stats);
  refresh(g);
  return g;
}
