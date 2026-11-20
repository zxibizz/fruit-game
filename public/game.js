// Simulation: no DOM, plain data. The view reads the state and the events, and calls the actions below.
import { COLS, ROWS, FRUIT_HP, PLANTS, BUGS, LEVELS, BREAK, EARLY_DEW, REPAIR, REGROW, CHEW_GROWTH, POWER_EVERY, POWER_MAX } from './data.js';

export const VERSION = '0.12.0';
export { COLS, ROWS, BREAK };

const DIRS = [[-1, 0], [0, -1], [0, 1], [1, 0]]; // tie order: towards the fruit side first
const INF = 1e9;

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function createGame(levelIndex, seed = 1) {
  const L = LEVELS[levelIndex];
  const g = {
    level: levelIndex, L, cols: COLS, rows: ROWS,
    grid: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
    entry: [COLS - 1, L.entry], fruit: L.fruit.slice(),
    dew: L.dew, hp: FRUIT_HP, maxHp: FRUIT_HP,
    wave: 0, waves: L.waves.length, phase: 'build', nextIn: null, // nextIn: seconds until the next wave starts by itself
    bugs: [], shots: [], plants: [], stubs: [], events: [], queue: [], // stubs: roots of the eaten plants
    time: 0, waveTime: 0, powers: { frost: 1, rain: 1 }, nextId: 1, rand: mulberry32(seed),
    dist: null, dig: null, stats: { kills: 0, bites: 0 },
  };
  for (const [i, j, type] of L.obstacles) g.grid[j][i] = { obstacle: type, i, j };
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
function refresh(g) { g.dist = computeDist(g); g.dig = computeDig(g); }

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
export function trail(g, dist = g.dist) {
  const out = [g.entry.slice()]; let dir = [-1, 0], [i, j] = g.entry;
  if (dist[key(i, j)] >= INF) return out;
  for (let n = 0; n < COLS * ROWS; n++) {
    if (i === g.fruit[0] && j === g.fruit[1]) break;
    const nx = nextCell(g, i, j, dir, dist); if (!nx) break;
    dir = [nx[0] - i, nx[1] - j]; [i, j] = nx; out.push(nx);
  }
  return out;
}

const cellOf = (b) => [Math.floor(b.x), Math.floor(b.y)];

// Why a plant cannot go to (i, j): null when it can. A plant may grow on a cell with bugs on it (a hole in a wall
// is mended while they run through it): they step out of it, so they only need a way on from a cell next to it.
export function placeProblem(g, i, j) {
  if (!inside(i, j)) return 'outside';
  if (g.grid[j][i]) return 'busy';
  if ((i === g.entry[0] && j === g.entry[1]) || (i === g.fruit[0] && j === g.fruit[1])) return 'busy';
  const d = computeDist(g, key(i, j));
  if (d[key(...g.entry)] >= INF) return 'blocks';
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
export function previewTrail(g, i, j) { return trail(g, computeDist(g, key(i, j))); }

const stat = (p, name) => { const v = PLANTS[p.type][name]; return Array.isArray(v) ? v[p.lvl - 1] : v; };

const over = (g) => g.phase === 'won' || g.phase === 'lost';
export const stubAt = (g, i, j) => g.stubs.find((s) => s.i === i && s.j === j) || null;
function grow(g, type, i, j, lvl, spent) {
  const P = PLANTS[type], k = g.stubs.findIndex((s) => s.i === i && s.j === j); if (k >= 0) g.stubs.splice(k, 1);
  const p = { id: g.nextId++, type, i, j, lvl, hp: P.hp[lvl - 1], maxHp: P.hp[lvl - 1], cd: .3, spent, hit: 0 };
  g.grid[j][i] = p; g.plants.push(p); refresh(g);
  return p;
}
export function place(g, type, i, j) {
  const P = PLANTS[type];
  if (!P || !g.L.plants.includes(type) || g.dew < P.cost || placeProblem(g, i, j) || over(g)) return false;
  g.dew -= P.cost;
  g.events.push({ t: 'place', p: grow(g, type, i, j, 1, P.cost) });
  return true;
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
  g.dew -= c; p.spent += c; p.lvl++; const mh = stat(p, 'hp'); p.hp += mh - p.maxHp; p.maxHp = mh; g.dig = computeDig(g);
  g.events.push({ t: 'upgrade', p });
  return true;
}
export const refund = (p) => Math.floor(p.spent / 2);
export function removePlant(g, p, sold = true) {
  const k = g.plants.indexOf(p); if (k < 0 || (sold && over(g))) return;
  g.plants.splice(k, 1); g.grid[p.j][p.i] = null; refresh(g);
  if (sold) g.dew += refund(p); else g.stubs.push({ id: g.nextId++, type: p.type, lvl: p.lvl, spent: p.spent, i: p.i, j: p.j, grow: 0 });
  g.events.push({ t: sold ? 'sell' : 'plantDead', p });
}

// Dew for calling the next wave now instead of waiting for it.
export const earlyBonus = (g) => (g.phase === 'build' && g.nextIn > 0 ? Math.round(g.nextIn * EARLY_DEW) : 0);
export function startWave(g) {
  if (g.phase !== 'build' || g.wave >= g.waves) return false;
  const bonus = earlyBonus(g); g.nextIn = null;
  if (bonus) { g.dew += bonus; g.events.push({ t: 'early', bonus }); }
  const spec = g.L.waves[g.wave]; g.wave++; g.phase = 'wave'; g.waveTime = 0; g.queue = [];
  let t0 = 0;
  for (const [kind, count, gap, delay] of spec) { t0 += delay; for (let n = 0; n < count; n++) g.queue.push({ kind, at: t0 + n * gap }); t0 += count * gap * .5; }
  g.queue.sort((a, b) => a.at - b.at);
  g.events.push({ t: 'wave', n: g.wave });
  return true;
}
export function wavePreview(g, n = g.wave) {
  const spec = g.L.waves[n]; if (!spec) return [];
  const m = new Map(); for (const [k, c] of spec) m.set(k, (m.get(k) || 0) + c);
  return [...m];
}

// How much stronger the bugs of a wave are than in the first one, and how much harder they bite the plants.
export const hpMul = (g, wave = g.wave) => 1 + g.L.hpGrowth * (wave - 1) + (g.L.hpLate || 0) * (wave - 1) ** 2;
const chewMul = (g) => 1 + CHEW_GROWTH * (g.wave - 1);
function spawn(g, kind) {
  const B = BUGS[kind], hp = Math.round(B.hp * hpMul(g));
  const b = { id: g.nextId++, kind, hp, maxHp: hp, speed: B.speed, fly: !!B.fly, armor: B.armor || 0, x: COLS + .6, y: g.entry[1] + .5, vx: -1, vy: 0, slow: 1, frozen: 0, burn: 0, burnDps: 0, chew: 0, chewCd: 2, gnaw: null, gnawT: 0, dir: [-1, 0], ti: g.entry[0], tj: g.entry[1], hit: 0 };
  if (b.fly) { b.y = .6 + g.rand() * (ROWS - 1.2); b.ti = b.tj = null; }
  g.bugs.push(b);
}

export function usePower(g, kind) {
  if (!g.powers[kind] || over(g)) return false;
  g.powers[kind]--;
  if (kind === 'frost') for (const b of g.bugs) b.frozen = 4;
  if (kind === 'rain') { for (const p of g.plants) p.hp = p.maxHp; for (const s of g.stubs.slice()) regrow(g, s, true); g.hp = Math.min(g.maxHp, g.hp + 3); }
  g.events.push({ t: 'power', kind });
  return true;
}
function damage(g, b, amount, src) {
  if (b.hp <= 0) return;
  const dmg = Math.max(1, amount - b.armor);
  b.hp -= dmg; b.hit = .15;
  g.events.push({ t: 'hit', b, dmg, src });
  if (b.hp <= 0) {
    g.dew += BUGS[b.kind].reward; g.stats.kills++;
    g.events.push({ t: 'kill', b, reward: BUGS[b.kind].reward });
  }
}

function progress(g, b) {
  if (b.fly) return Math.hypot(b.x - g.fruit[0] - .5, b.y - g.fruit[1] - .5);
  if (b.ti == null || !inside(b.ti, b.tj)) return 100;
  return (BUGS[b.kind].dig ? g.dig : g.dist)[key(b.ti, b.tj)] + Math.hypot(b.x - b.ti - .5, b.y - b.tj - .5);
}

function updateBug(g, b, dt) {
  if (b.frozen > 0) { b.frozen -= dt; return; }
  if (b.burn > 0) {
    b.burn -= dt; b.hp -= b.burnDps * dt; // burn ignores armor and has no 1-damage floor
    if (b.hp <= 0) { g.dew += BUGS[b.kind].reward; g.stats.kills++; g.events.push({ t: 'kill', b, reward: BUGS[b.kind].reward }); return; }
  }
  const B = BUGS[b.kind];
  if (b.chew > 0) {
    b.chew -= dt;
    if (b.chew <= 0) {
      const p = b.chewTarget; b.chewCd = 5;
      if (p && g.plants.includes(p)) { p.hp -= B.chew * chewMul(g); p.hit = .2; g.events.push({ t: 'chew', p, b }); if (p.hp <= 0) removePlant(g, p, false); }
    }
    return;
  }
  if (b.gnaw) { // a digger eating the plant in its way
    const p = b.gnaw;
    if (!g.plants.includes(p)) b.gnaw = null;
    else {
      p.hp -= B.dig * chewMul(g) * dt; p.hit = .1; b.gnawT -= dt;
      if (b.gnawT <= 0) { b.gnawT = .45; g.events.push({ t: 'chew', p, b }); }
      if (p.hp <= 0) { removePlant(g, p, false); b.gnaw = null; }
      return;
    }
  }
  b.chewCd -= dt;
  const v = b.speed * (B.noSlow ? 1 : b.slow) * dt;
  if (b.fly) {
    const tx = g.fruit[0] + .5, ty = g.fruit[1] + .5, dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy);
    if (d < .45) { bite(g, b); return; }
    b.vx = dx / d; b.vy = dy / d; b.x += b.vx * v; b.y += b.vy * v; return;
  }
  const tx = b.ti + .5, ty = b.tj + .5, dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy);
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
  if (!P.range) return;
  if (P.heal) {
    const range = stat(p, 'range'), near = (q) => Math.hypot(q.i - p.i, q.j - p.j) <= range;
    for (const q of g.plants) if (q.hp < q.maxHp && near(q)) q.hp = Math.min(q.maxHp, q.hp + stat(p, 'heal') * dt);
    for (const s of g.stubs.slice()) {
      if (!near(s)) continue;
      s.grow = Math.min(1, s.grow + dt / stat(p, 'regrow'));
    }
    return;
  }
  const range = stat(p, 'range'), inRange = (b) => b.hp > 0 && (P.air || !b.fly) && Math.hypot(b.x - px, b.y - py) <= range;
  if (P.slow) { const s = 1 - stat(p, 'slow'); for (const b of g.bugs) if (inRange(b)) b.slow = Math.min(b.slow, s); return; }
  p.cd -= dt; if (p.cd > 0) return;
  if (p.type === 'pepper') {
    const hit = g.bugs.filter(inRange); if (!hit.length) return;
    p.cd = 1 / stat(p, 'rate');
    for (const b of hit) { damage(g, b, stat(p, 'dmg'), p.type); b.burn = 2; b.burnDps = stat(p, 'burn'); }
    g.events.push({ t: 'fire', p });
    return;
  }
  let best = null, bp = INF; for (const b of g.bugs) if (inRange(b)) { const pr = progress(g, b); if (pr < bp) { bp = pr; best = b; } }
  if (!best) return;
  p.cd = 1 / stat(p, 'rate');
  const dmg = stat(p, 'dmg') * (best.fly && P.airMul ? P.airMul : 1);
  g.shots.push({ id: g.nextId++, kind: P.shot, from: p.type, x: px, y: py - .25, sx: px, sy: py - .25, target: best, tx: best.x, ty: best.y, speed: P.speed, dmg, splash: P.splash || 0, air: !!P.air });
  g.events.push({ t: 'shoot', p, target: best });
}
function updateShot(g, s, dt) {
  if (s.target && s.target.hp > 0 && !s.target.gone) { s.tx = s.target.x; s.ty = s.target.y; }
  const dx = s.tx - s.x, dy = s.ty - s.y, d = Math.hypot(dx, dy), v = s.speed * dt;
  if (d <= v) {
    s.done = true;
    if (s.splash) { for (const b of g.bugs) if (!b.fly && b.hp > 0 && Math.hypot(b.x - s.tx, b.y - s.ty) <= s.splash) damage(g, b, s.dmg, s.from); g.events.push({ t: 'splash', x: s.tx, y: s.ty, kind: s.kind }); }
    else if (s.target && s.target.hp > 0 && !s.target.gone) damage(g, s.target, s.dmg, s.from);
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
    while (g.queue.length && g.queue[0].at <= g.waveTime) spawn(g, g.queue.shift().kind);
  }
  for (const b of g.bugs) b.slow = 1;
  // roots grow back by themselves (aloes add to it in updatePlant); where that would close the way, they wait
  for (const s of g.stubs.slice()) { s.grow = Math.min(1, s.grow + dt / REGROW); if (s.grow >= 1) regrow(g, s, true); }
  for (const p of g.plants.slice()) updatePlant(g, p, dt);
  for (const b of g.bugs) { if (b.hit > 0) b.hit -= dt; if (b.hp > 0) updateBug(g, b, dt); }
  for (const s of g.shots) updateShot(g, s, dt);
  g.shots = g.shots.filter((s) => !s.done);
  g.bugs = g.bugs.filter((b) => b.hp > 0);
  if (g.phase === 'lost') return;
  if (g.phase === 'wave' && !g.queue.length && !g.bugs.length) {
    if (g.wave >= g.waves) { g.phase = 'won'; g.events.push({ t: 'won' }); }
    else {
      g.phase = 'build'; g.nextIn = BREAK; g.dew += g.L.waveBonus;
      const powers = g.wave % POWER_EVERY === 0;
      if (powers) for (const k in g.powers) g.powers[k] = Math.min(POWER_MAX, g.powers[k] + 1);
      g.events.push({ t: 'waveDone', n: g.wave, bonus: g.L.waveBonus, powers });
    }
  }
}

export const stars = (g) => (g.hp >= g.maxHp * .8 ? 3 : g.hp >= g.maxHp * .4 ? 2 : 1);
