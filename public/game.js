// Simulation: no DOM, plain data. The view reads the state and the events, and calls the actions below.
import { COLS, ROWS, FRUIT_HP, PLANTS, BUGS, LEVELS, PERKS, BREAK, EARLY_DEW, REPAIR, REGROW, REFUND, CHEW_GROWTH, POWER_EVERY, POWER_MAX, wavePay, FERTILE, FERTILE_ADD, MUD, NETTLE, NETTLE_BOSS, WEED_COST, BROOD_REWARD, FLY_HP, TUNE, MARK_T } from './data.js';

export const VERSION = '0.25.1';
// The version of a saved level: raised when the balance changes so much that a garden grown under the old rules does
// not belong in the new level (2: no fatigue, tight packs, one health rule; 3: the plants given their places and
// every level retuned; 4: the waves retuned for the ordinary player, some levels with fewer and healthier bugs; 5: the
// anthill of «Старый сад» moved to the edge, where an old garden could shut the trail; 6: diggers last in a wave;
// an older save is dropped).
const SAVE_V = 6;
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
    regrow: REGROW * (tier('roots') || 1), refund: tier('refund') || REFUND,
    dist: null, dig: null, stats: { kills: 0, bites: 0, eaten: 0, earned: 0 },
  };
  g.entry = g.entries[0];
  for (const [i, j, type] of L.obstacles) g.grid[j][i] = { obstacle: type, i, j };
  for (const [i, j, type] of L.tiles) g.tiles[j][i] = type;
  refresh(g);
  return g;
}

const key = (i, j) => j * COLS + i;
const inside = (i, j) => i >= 0 && j >= 0 && i < COLS && j < ROWS;

// Distance (in steps) from every free cell to the fruit.
export function computeDist(g, extra = -1) {
  const d = new Array(COLS * ROWS).fill(INF), q = [g.fruit];
  d[key(...g.fruit)] = 0;
  for (let h = 0; h < q.length; h++) {
    const [i, j] = q[h], k = d[key(i, j)];
    for (const [di, dj] of DIRS) {
      const ni = i + di, nj = j + dj, nk = key(ni, nj);
      if (!inside(ni, nj) || d[nk] !== INF || g.grid[nj][ni] || nk === extra) continue;
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
      const c = g.grid[nj][ni]; if (c && !c.type) continue; // rocks, stumps and logs stay in the way
      if (d[u] + enter < d[key(ni, nj)]) d[key(ni, nj)] = d[u] + enter;
    }
  }
  return d;
}
function nextDig(g, i, j, dir) {
  let best = null, bd = INF;
  const tryCell = (di, dj) => {
    const ni = i + di, nj = j + dj; if (!inside(ni, nj)) return;
    const c = g.grid[nj][ni]; if (c && !c.type) return;
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
// What the plants give to the plants around them: a bell makes them shoot more often, a grown aloe guards them.
function auras(g) {
  for (const p of g.plants) { p.buff = 0; p.guard = 0; }
  for (const p of g.plants) {
    if (p.web > 0) continue; // a webbed plant gives nothing
    const buff = pstat(g, p, 'buff'), guard = pstat(g, p, 'guard'); if (!buff && !guard) continue;
    const r = pstat(g, p, 'range');
    for (const q of g.plants) if (q !== p && within(q.i - p.i, q.j - p.j, r)) { q.buff = Math.max(q.buff, buff); q.guard = Math.max(q.guard, guard); }
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

// Why a plant cannot go to (i, j): null when it can. A plant may grow on a cell with bugs on it (a hole in a wall
// is mended while they run through it): they step out of it, so they only need a way on from a cell next to it.
export function placeProblem(g, i, j) {
  if (!inside(i, j)) return 'outside';
  if (g.grid[j][i]) return 'busy';
  if (isEntry(g, i, j) || (i === g.fruit[0] && j === g.fruit[1])) return 'busy';
  if (g.tiles[j][i] === 'nettle') return 'nettle';
  const d = computeDist(g, key(i, j));
  if (g.entries.some((e) => d[key(...e)] >= INF)) return 'blocks';
  const open = (ci, cj) => inside(ci, cj) && d[key(ci, cj)] < INF;
  for (const b of g.bugs) {
    if (b.fly || b.ti == null || BUGS[b.kind].dig || !inside(b.ti, b.tj)) continue;
    if (b.ti === i && b.tj === j ? !DIRS.some(([di, dj]) => open(i + di, j + dj)) : !open(b.ti, b.tj)) return 'blocks';
  }
  return null;
}
export function blockingCells(g) {
  const out = [];
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) if (!g.grid[j][i] && placeProblem(g, i, j) === 'blocks') out.push([i, j]);
  return out;
}
export function previewTrails(g, i, j) { return trails(g, computeDist(g, key(i, j))); }

// A stat of a plant as it stands: its level, the player's perk for this plant and the soil under it.
// p may be a plant or just { type, lvl, i, j } (i < 0: no cell yet).
const BOOSTED = { dmg: 1, burn: 1, heal: 1, chomp: 1, hp: 1 };
export function pstat(g, p, name) {
  let v = PLANTS[p.type][name]; if (v == null) return 0; if (Array.isArray(v)) v = v[p.lvl - 1];
  if (!v || typeof v !== 'number') return v;
  const perk = PERKS[p.type], tier = g.meta[p.type] || 0;
  if (tier && perk.stat === name) v = perk.mul ? v * perk.v[tier - 1] : v + perk.v[tier - 1];
  if (g.tiles[p.j]?.[p.i] === 'fertile') { if (BOOSTED[name]) v *= FERTILE; else if (name === 'slow' || name === 'buff') v += FERTILE_ADD; else if (name === 'eat') v /= FERTILE; }
  if (name === 'slow') v = Math.min(v, .6);
  return name === 'hp' ? Math.round(v) : v;
}

const over = (g) => g.phase === 'won' || g.phase === 'lost';
export const stubAt = (g, i, j) => g.stubs.find((s) => s.i === i && s.j === j) || null;
function grow(g, type, i, j, lvl, spent) {
  const P = PLANTS[type], k = g.stubs.findIndex((s) => s.i === i && s.j === j); if (k >= 0) g.stubs.splice(k, 1);
  const p = { id: g.nextId++, type, i, j, lvl, hp: 1, maxHp: 1, cd: .3, spent, hit: 0, web: 0, buff: 0, guard: 0, busy: 0, born: -1 };
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
// Repairs. The roots of an eaten plant grow back into the same plant of the same level for a part of its price
// (for nothing when an aloe or the rain does it); a bitten plant is healed for the same part of the missing health.
export const regrowCost = (s) => Math.ceil(s.spent * REPAIR);
export function regrow(g, s, free = false) {
  if (!g.stubs.includes(s) || over(g) || (!free && g.dew < regrowCost(s)) || placeProblem(g, s.i, s.j)) return false;
  if (!free) g.dew -= regrowCost(s);
  g.events.push({ t: 'regrow', p: grow(g, s.type, s.i, s.j, s.lvl, s.spent), free });
  return true;
}
export function clearStub(g, s) { const k = g.stubs.indexOf(s); if (k >= 0) g.stubs.splice(k, 1); }
export const healCost = (p) => (p.hp < p.maxHp ? Math.max(1, Math.ceil(p.spent * REPAIR * (1 - p.hp / p.maxHp))) : 0);
export function heal(g, p) {
  const c = healCost(p); if (!c || g.dew < c || over(g) || !g.plants.includes(p)) return false;
  g.dew -= c; p.hp = p.maxHp; g.events.push({ t: 'heal', p });
  return true;
}
export function upgradeCost(p) { return p.lvl < 3 ? PLANTS[p.type].up[p.lvl - 1] : null; }
export function upgrade(g, p) {
  const c = upgradeCost(p); if (c == null || g.dew < c || over(g)) return false;
  g.dew -= c; p.spent += c; p.lvl++; const mh = pstat(g, p, 'hp'); p.hp += mh - p.maxHp; p.maxHp = mh; g.dig = computeDig(g); auras(g);
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
  if (sold) g.dew += refund(g, p); else { g.stats.eaten++; g.stubs.push({ id: g.nextId++, type: p.type, lvl: p.lvl, spent: p.spent, i: p.i, j: p.j, grow: 0 }); }
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
  const b = { id: g.nextId++, kind, hp, maxHp: hp, speed: B.speed, fly: !!B.fly, armor: B.armor || 0, x: COLS + .6, y: en[1] + .5, vx: -1, vy: 0, slow: 1, frozen: 0, burn: 0, burnDps: 0, chew: 0, thaw: 0, chewCd: 2, gnaw: null, gnawT: 0, dir: [-1, 0], ti: en[0], tj: en[1], hit: 0, skill: 0, rush: 0, brood: !!from, e };
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
  if (kind === 'rain') { for (const p of g.plants) { p.hp = p.maxHp; p.web = 0; } auras(g); for (const s of g.stubs.slice()) regrow(g, s, true); g.hp = Math.min(g.maxHp, g.hp + 3); }
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
}
// Health lost for any reason other than a hit (fire, nettles, thorns): no armor, no floor.
// A bug marked by a rose takes more of everything.
const marked = (b) => (b.mark > 0 ? 1 + b.markV : 1);
function lose(g, b, amount, how) { if (b.hp <= 0) return; b.hp -= amount * marked(b); if (b.hp <= 0) kill(g, b, how); }
function damage(g, b, amount, src) {
  if (b.hp <= 0) return;
  const dmg = Math.max(1, amount - b.armor) * marked(b);
  b.hp -= dmg; b.hit = .15;
  g.events.push({ t: 'hit', b, dmg, src });
  if (b.hp <= 0) kill(g, b, src);
}
// A bug bites a plant: a guarded plant takes less, a thorny one bites back. k: the part of a bite or a second.
function hurtPlant(g, p, amount, b, k = 1) {
  p.hp -= amount * (1 - (p.guard || 0)); p.hit = Math.max(p.hit, .12);
  const th = pstat(g, p, 'thorns'); if (th) lose(g, b, b.maxHp * th * k * (BUGS[b.kind].boss ? .3 : 1), 'thorns');
  if (p.hp <= 0) removePlant(g, p, false);
}

// Stops a bug for t seconds. Stops do not chain: when one ends, the bug cannot be stopped again for THAW seconds
// (frost, the player's power, always works).
const THAW = 2.5;
function freeze(b, t, force = false) { if (!force && (b.thaw > 0 || b.frozen > 0)) return; b.frozen = Math.max(b.frozen, t); }
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
  if (b.burn > 0) { b.burn -= dt; lose(g, b, b.burnDps * dt, 'burn'); if (b.hp <= 0) return; } // burn ignores armor and has no 1-damage floor
  const ci = Math.floor(b.x), cj = Math.floor(b.y), tile = b.fly ? null : g.tiles[cj]?.[ci];
  if (tile === 'nettle') { lose(g, b, b.maxHp * (B.boss ? NETTLE_BOSS : NETTLE) * dt, 'nettle'); if (b.hp <= 0) return; b.sting = .25; }
  if (b.sting > 0) b.sting -= dt;
  if (b.thaw > 0) b.thaw -= dt;
  if (b.frozen > 0) { b.frozen -= dt; if (b.frozen <= 0) b.thaw = THAW; return; }
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
  if (b.fly) {
    const tx = g.fruit[0] + .5, ty = g.fruit[1] + .5, dx = tx - b.x, dy = ty - b.y, d = hyp(dx, dy);
    if (d < .45) { bite(g, b); return; }
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
  const P = PLANTS[p.type], px = p.i + .5, py = p.j + .5;
  if (p.hit > 0) p.hit -= dt;
  if (p.busy > 0) p.busy -= dt;
  if (p.web > 0) { p.web -= dt; if (p.web <= 0) auras(g); return; } // caught in a spider's web: does nothing
  if (!P.range || P.buff) return;
  const range = pstat(g, p, 'range');
  if (P.heal) {
    const near = (q) => within(q.i - p.i, q.j - p.j, range), heal = pstat(g, p, 'heal');
    for (const q of g.plants) if (q.hp < q.maxHp && near(q)) q.hp = Math.min(q.maxHp, q.hp + heal * dt);
    for (const s of g.stubs.slice()) {
      if (!near(s)) continue;
      s.grow = Math.min(1, s.grow + dt / pstat(g, p, 'regrow'));
    }
    return;
  }
  const inRange = (b, air = P.air) => b.hp > 0 && (air || !b.fly) && b.x < COLS + .2 && within(b.x - px, b.y - py, (P.groundRange && !b.fly ? Math.min(range, P.groundRange) : range));
  const bugs = near(g, px, py, range).slice(); // the only bugs it can reach
  if (P.slow) {
    const s = 1 - pstat(g, p, 'slow'); let any = false;
    for (const b of bugs) if (inRange(b)) { b.slow = Math.min(b.slow, s); any = true; }
    const chill = pstat(g, p, 'chill'); if (!chill) return;
    p.cd -= dt; if (p.cd > 0 || !any) return;
    p.cd = chill; for (const b of bugs) if (inRange(b)) freeze(b, BUGS[b.kind].boss ? .4 : 1);
    g.events.push({ t: 'chill', p });
    return;
  }
  p.cd -= dt; if (p.cd > 0) return;
  const quick = 1 + (p.buff || 0);
  if (P.eat) { // bites the strongest bug it reaches, through any armor; what is left with no health is swallowed
    const air = !!pstat(g, p, 'eatAir'), chomp = pstat(g, p, 'chomp'), gulp = pstat(g, p, 'gulp'); let best = null, meal = null;
    const fits = (b) => !BUGS[b.kind].boss && (b.hp <= chomp || b.hp <= gulp * b.maxHp);
    for (const b of bugs) if (inRange(b, air)) { if (!best || b.hp > best.hp) best = b; if (fits(b) && (!meal || b.hp > meal.hp)) meal = b; }
    if (!best) return;
    const whole = !!meal; if (whole) best = meal; // the biggest bug it can swallow, else a bite of the strongest
    p.cd = pstat(g, p, 'eat') / quick; p.busy = 1.2;
    g.events.push({ t: 'eat', p, b: best, whole });
    damage(g, best, (whole ? Math.max(chomp, best.hp) : chomp * (BUGS[best.kind].boss ? TUNE.bossBite : 1)) + best.armor, whole ? 'eat' : p.type);
    return;
  }
  if (p.type === 'pepper') {
    const hit = bugs.filter((b) => inRange(b)); if (!hit.length) return;
    p.cd = 1 / (pstat(g, p, 'rate') * quick);
    const dmg = pstat(g, p, 'dmg'), burn = pstat(g, p, 'burn'), burnT = pstat(g, p, 'burnT');
    for (const b of hit) { damage(g, b, dmg, p.type); b.burn = burnT; b.burnDps = burn; }
    g.events.push({ t: 'fire', p });
    return;
  }
  // the bugs nearest to the fruit first; a grown rose shoots at two of them
  const multi = pstat(g, p, 'multi') || 1, seen = [];
  // a plant that is weak against walkers (the dandelion) takes the flyers first
  // …and not at a bug the shots already on their way will finish (all the shooters on one bug was damage thrown away)
  const splash = !!pstat(g, p, 'splash'), mark = pstat(g, p, 'mark');
  for (const b of bugs) if (inRange(b) && (splash || (b.coming || 0) < b.hp)) seen.push([progress(g, b) + (P.ground && !b.fly ? 1e3 : 0) + (mark && b.mark > .5 ? 500 : 0), b]);
  if (!seen.length) return;
  seen.sort((a, b) => a[0] - b[0]);
  p.cd = 1 / (pstat(g, p, 'rate') * quick);
  for (const [, best] of seen.slice(0, multi)) {
    const weak = P.ground && !best.fly, dmg = pstat(g, p, 'dmg') * (weak ? P.ground : 1);
    const est = splash ? 0 : Math.max(1, dmg - best.armor) * marked(best); best.coming = (best.coming || 0) + est; // what it will take
    g.shots.push({ id: g.nextId++, kind: P.shot, from: p.type, x: px, y: py - .25, sx: px, sy: py - .25, target: best, tx: best.x, ty: best.y, speed: P.speed, dmg, est, splash: pstat(g, p, 'splash') || 0, hits: P.hits ? P.hits[p.lvl - 1] : 0, mark, stun: weak ? 0 : pstat(g, p, 'stun') || 0, air: !!P.air });
    g.events.push({ t: 'shoot', p, target: best });
  }
}
function updateShot(g, s, dt) {
  if (s.target && s.target.hp > 0 && !s.target.gone) { s.tx = s.target.x; s.ty = s.target.y; }
  const dx = s.tx - s.x, dy = s.ty - s.y, d = hyp(dx, dy), v = s.speed * dt;
  if (d <= v) {
    s.done = true; if (s.target && s.est) s.target.coming -= s.est;
    if (s.splash) { // the kernels hit the bugs closest to where the cob lands, s.hits of them at most
      const near = g.bugs.filter((b) => !b.fly && b.hp > 0 && within(b.x - s.tx, b.y - s.ty, s.splash)).sort((a, b) => hyp(a.x - s.tx, a.y - s.ty) - hyp(b.x - s.tx, b.y - s.ty));
      for (const b of near.slice(0, s.hits || Infinity)) damage(g, b, s.dmg, s.from); g.events.push({ t: 'splash', x: s.tx, y: s.ty, kind: s.kind, r: s.splash }); }
    else if (s.target && s.target.hp > 0 && !s.target.gone) {
      damage(g, s.target, s.dmg, s.from);
      if (s.mark && s.target.hp > 0) { const t = s.target, old = t.mark > 0 ? t.markV || 0 : 0; t.mark = MARK_T; t.markV = Math.max(s.mark, old); } // a mark run out leaves nothing
      if (s.stun && s.target.hp > 0) freeze(s.target, s.stun * (BUGS[s.target.kind].boss ? .3 : 1));
    }
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
  for (const b of g.bugs) b.slow = 1;
  // roots grow back by themselves (aloes add to it in updatePlant); where that would close the way, they wait
  for (const s of g.stubs.slice()) { s.grow = Math.min(1, s.grow + dt / g.regrow); if (s.grow >= 1) regrow(g, s, true); }
  sortBugs(g); try { for (const p of g.plants.slice()) updatePlant(g, p, dt); } finally { bkOn = false; }
  for (const b of g.bugs.slice()) { if (b.hit > 0) b.hit -= dt; if (b.mark > 0) b.mark -= dt; if (b.hp > 0) updateBug(g, b, dt); }
  for (const s of g.shots) updateShot(g, s, dt);
  g.shots = g.shots.filter((s) => !s.done);
  g.bugs = g.bugs.filter((b) => b.hp > 0);
  if (g.phase === 'lost') return;
  if (g.phase === 'wave' && !g.queue.length && !g.bugs.length) {
    if (g.wave >= g.waves) { g.phase = 'won'; g.events.push({ t: 'won' }); }
    else {
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
    plants: g.plants.map((p) => ({ type: p.type, lvl: p.lvl, i: p.i, j: p.j, hp: p.hp, spent: p.spent })),
    stubs: g.stubs.map((s) => ({ type: s.type, lvl: s.lvl, i: s.i, j: s.j, spent: s.spent, grow: s.grow })),
  };
}
export function restore(snap, meta = {}) {
  if (!snap || snap.v !== SAVE_V || !LEVELS[snap.level] || !Array.isArray(snap.plants)) return null;
  const g = createGame(snap.level, snap.seed, meta);
  if (snap.wave >= g.waves) return null;
  for (const [i, j] of snap.cleared || []) if (g.grid[j]?.[i]?.obstacle === 'weed') g.grid[j][i] = null;
  for (const q of snap.plants) {
    if (!PLANTS[q.type] || ![1, 2, 3].includes(q.lvl) || !Number.isFinite(q.hp) || !inside(q.i, q.j) || g.grid[q.j][q.i]) continue;
    const p = grow(g, q.type, q.i, q.j, q.lvl, q.spent); p.hp = Math.min(p.maxHp, q.hp);
  }
  for (const s of snap.stubs || []) if (PLANTS[s.type] && [1, 2, 3].includes(s.lvl) && inside(s.i, s.j) && !g.grid[s.j][s.i]) g.stubs.push({ id: g.nextId++, ...s });
  Object.assign(g, { wave: snap.wave, dew: snap.dew, hp: Math.min(g.maxHp, snap.hp), time: snap.time || 0 });
  Object.assign(g.powers, snap.powers); Object.assign(g.stats, snap.stats);
  refresh(g);
  return g;
}
