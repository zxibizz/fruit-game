// Simulation: no DOM, plain data. The view reads the state and the events, and calls the actions below.
import { COLS, ROWS, FRUIT_HP, PLANTS, BUGS, LEVELS } from './data.js';

export const VERSION = '0.3.1';
export { COLS, ROWS };

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
    wave: 0, waves: L.waves.length, phase: 'build',
    bugs: [], shots: [], drops: [], plants: [], events: [], queue: [],
    time: 0, waveTime: 0, powers: { frost: 1, rain: 1 }, nextId: 1, rand: mulberry32(seed),
    dist: null, stats: { kills: 0, bites: 0 },
  };
  for (const [i, j, type] of L.obstacles) g.grid[j][i] = { obstacle: type, i, j };
  g.dist = computeDist(g);
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

// Next cell from (i, j) towards the fruit; keeps going straight when that is as short.
export function nextCell(g, i, j, dir, dist = g.dist) {
  const here = dist[key(i, j)];
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

// Why a plant cannot go to (i, j): null when it can.
export function placeProblem(g, i, j) {
  if (!inside(i, j)) return 'outside';
  if (g.grid[j][i]) return 'busy';
  if ((i === g.entry[0] && j === g.entry[1]) || (i === g.fruit[0] && j === g.fruit[1])) return 'busy';
  for (const b of g.bugs) {
    if (b.fly) continue;
    const [bi, bj] = cellOf(b);
    if ((bi === i && bj === j) || (b.ti === i && b.tj === j)) return 'bug';
  }
  const d = computeDist(g, key(i, j));
  if (d[key(...g.entry)] >= INF) return 'blocks';
  for (const b of g.bugs) {
    if (b.fly || b.ti == null) continue;
    if (inside(b.ti, b.tj) && d[key(b.ti, b.tj)] >= INF) return 'blocks';
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

export function place(g, type, i, j) {
  const P = PLANTS[type];
  if (!P || !g.L.plants.includes(type) || g.dew < P.cost || placeProblem(g, i, j) || g.phase === 'won' || g.phase === 'lost') return false;
  const p = { id: g.nextId++, type, i, j, lvl: 1, hp: P.hp[0], maxHp: P.hp[0], cd: .3, timer: P.period ? P.period[0] * .5 : 0, spent: P.cost, hit: 0 };
  g.dew -= P.cost; g.grid[j][i] = p; g.plants.push(p); g.dist = computeDist(g);
  g.events.push({ t: 'place', p });
  return true;
}
export function upgradeCost(p) { return p.lvl < 3 ? PLANTS[p.type].up[p.lvl - 1] : null; }
export function upgrade(g, p) {
  const c = upgradeCost(p); if (c == null || g.dew < c || g.phase === 'won' || g.phase === 'lost') return false;
  g.dew -= c; p.spent += c; p.lvl++; const mh = stat(p, 'hp'); p.hp += mh - p.maxHp; p.maxHp = mh;
  g.events.push({ t: 'upgrade', p });
  return true;
}
export const refund = (p) => Math.floor(p.spent / 2);
export function removePlant(g, p, sold = true) {
  const k = g.plants.indexOf(p); if (k < 0 || (sold && (g.phase === 'won' || g.phase === 'lost'))) return;
  g.plants.splice(k, 1); g.grid[p.j][p.i] = null; g.dist = computeDist(g);
  if (sold) g.dew += refund(p);
  g.events.push({ t: sold ? 'sell' : 'plantDead', p });
}

export function startWave(g) {
  if (g.phase !== 'build' || g.wave >= g.waves) return false;
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

function spawn(g, kind) {
  const B = BUGS[kind], mul = 1 + g.L.hpGrowth * (g.wave - 1), hp = Math.round(B.hp * mul);
  const b = { id: g.nextId++, kind, hp, maxHp: hp, speed: B.speed, fly: !!B.fly, armor: B.armor || 0, x: COLS + .6, y: g.entry[1] + .5, vx: -1, vy: 0, slow: 1, frozen: 0, burn: 0, burnDps: 0, chew: 0, chewCd: 2, dir: [-1, 0], ti: g.entry[0], tj: g.entry[1], hit: 0 };
  if (b.fly) { b.y = .6 + g.rand() * (ROWS - 1.2); b.ti = b.tj = null; }
  g.bugs.push(b);
}

export function usePower(g, kind) {
  if (!g.powers[kind] || g.phase === 'won' || g.phase === 'lost') return false;
  g.powers[kind]--;
  if (kind === 'frost') for (const b of g.bugs) b.frozen = 4;
  if (kind === 'rain') { for (const p of g.plants) p.hp = p.maxHp; g.hp = Math.min(g.maxHp, g.hp + 3); }
  g.events.push({ t: 'power', kind });
  return true;
}
export function collectDrop(g, id) {
  const k = g.drops.findIndex((d) => d.id === id); if (k < 0) return false;
  const d = g.drops[k]; g.drops.splice(k, 1); g.dew += d.value; g.events.push({ t: 'collect', d, tapped: true });
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
  return g.dist[key(b.ti, b.tj)] + Math.hypot(b.x - b.ti - .5, b.y - b.tj - .5);
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
      if (p && g.plants.includes(p)) { p.hp -= B.chew * (1 + g.L.hpGrowth * (g.wave - 1)); p.hit = .2; g.events.push({ t: 'chew', p, b }); if (p.hp <= 0) removePlant(g, p, false); }
    }
    return;
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
    const nx = nextCell(g, b.ti, b.tj, b.dir);
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
  if (P.period) { p.timer -= dt; if (p.timer <= 0) { p.timer = stat(p, 'period'); g.drops.push({ id: g.nextId++, x: px + (g.rand() - .5) * .5, y: py - .3, value: stat(p, 'value'), age: 0 }); g.events.push({ t: 'drop', p }); } return; }
  if (!P.range) return;
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
  if (g.phase === 'won' || g.phase === 'lost') return;
  g.time += dt;
  for (const d of g.drops) d.age += dt;
  for (let k = g.drops.length - 1; k >= 0; k--) if (g.drops[k].age > 5) { const d = g.drops[k]; g.drops.splice(k, 1); g.dew += d.value; g.events.push({ t: 'collect', d, tapped: false }); }
  if (g.phase === 'wave') {
    g.waveTime += dt;
    while (g.queue.length && g.queue[0].at <= g.waveTime) spawn(g, g.queue.shift().kind);
  }
  for (const b of g.bugs) b.slow = 1;
  for (const p of g.plants.slice()) updatePlant(g, p, dt);
  for (const b of g.bugs) { if (b.hit > 0) b.hit -= dt; if (b.hp > 0) updateBug(g, b, dt); }
  for (const s of g.shots) updateShot(g, s, dt);
  g.shots = g.shots.filter((s) => !s.done);
  g.bugs = g.bugs.filter((b) => b.hp > 0);
  if (g.phase === 'lost') return;
  if (g.phase === 'wave' && !g.queue.length && !g.bugs.length) {
    if (g.wave >= g.waves) { g.phase = 'won'; g.events.push({ t: 'won' }); }
    else { g.phase = 'build'; g.dew += g.L.waveBonus; g.events.push({ t: 'waveDone', n: g.wave, bonus: g.L.waveBonus }); }
  }
}

export const stars = (g) => (g.hp >= g.maxHp * .8 ? 3 : g.hp >= g.maxHp * .4 ? 2 : 1);
