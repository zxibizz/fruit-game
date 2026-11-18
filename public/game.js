// The simulation: no DOM, no drawing, plain JSON state (so a level in progress can be saved and restored).
// view.js draws the state and turns taps into calls of build/upgrade/sell/useBonus/buy; it also reads
// game.events (kills, shots, zaps, bites...) every frame for effects and sounds, and clears the list.
// When any file in public/ changes, bump VERSION here and in sw.js.
export const VERSION = '0.1.0';

import {
  COLS, ROWS, TRAPS, ENEMIES, BONUSES, SHOP, LEVELS, FRUIT_HP, WAVE_GAP, SELL_BACK, makeWaves, levelStrength,
} from './data.js';

const WALK = new Set(['-', ',', 'S', 'F']);
const BUILD = new Set(['.', '-', ',']);
const DT = 1 / 60;
const SQ2 = Math.SQRT2;

export function newGame(L) {
  const level = LEVELS[L];
  const tiles = level.map.join('');
  const fruit = { x: 0, y: 0 };
  const spawns = [];
  for (let i = 0; i < tiles.length; i++) {
    const x = i % COLS, y = (i / COLS) | 0;
    if (tiles[i] === 'F') { fruit.x += (x + 0.5) / 4; fruit.y += (y + 0.5) / 4; }
    if (tiles[i] === 'S') spawns.push(i);
  }
  const g = {
    v: VERSION, L, tiles, fruit, spawns,
    state: 'build', // build -> run -> won | lost
    time: 0, // seconds of battle (only runs in 'run')
    coins: level.coins,
    hp: FRUIT_HP, maxHp: FRUIT_HP,
    waves: makeWaves(level, L),
    wave: -1, // index of the last started wave
    queue: [], // [{t, kind, spawn, wave}] insects still to come out
    nextWaveAt: 0,
    waveLeft: [], // insects of each wave still alive or to come
    waveBitten: [],
    safeWaves: 0,
    killScore: 0,
    kills: 0,
    traps: [], enemies: [], shots: [], zones: [],
    charge: Object.fromEntries(level.bonuses.map((b) => [b, 0.35])),
    shieldT: 0, freezeT: 0,
    ids: 1,
    seed: 12345 + L,
  };
  g.events = [];
  rebuild(g);
  return g;
}

// After JSON.parse of a saved game: restore the derived fields.
export function restore(saved) {
  const g = saved;
  g.events = [];
  rebuild(g);
  return g;
}

export function serialize(g) {
  const { events, dist, distStone, trapGrid, ...rest } = g;
  return JSON.stringify(rest);
}

// ---------- grid helpers ----------
export const cellOf = (x, y) => (x < 0 || y < 0 || x >= COLS || y >= ROWS ? -1 : (y | 0) * COLS + (x | 0));
const cx = (c) => (c % COLS) + 0.5;
const cy = (c) => ((c / COLS) | 0) + 0.5;
const rnd = (g) => ((g.seed = (g.seed * 16807) % 2147483647) / 2147483647);

function rebuild(g) {
  g.trapGrid = new Int32Array(COLS * ROWS);
  for (const t of g.traps) g.trapGrid[t.c] = t.id;
  g.dist = flow(g, false);
  g.distStone = flow(g, true);
}

function walkable(g, c, stones, extraBlock = -1) {
  if (c === extraBlock || g.trapGrid[c]) return false;
  const ch = g.tiles[c];
  return WALK.has(ch) || (stones && ch === '#');
}

const N8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];

// Distance (in cells) from every cell to the fruit for walking insects; Infinity where the fruit can't be reached.
function flow(g, stones, extraBlock = -1) {
  const d = new Float64Array(COLS * ROWS).fill(Infinity);
  const open = [];
  for (let c = 0; c < g.tiles.length; c++) if (g.tiles[c] === 'F') { d[c] = 0; open.push(c); }
  // Small grid: a simple "pick the smallest" Dijkstra is fast enough.
  const done = new Uint8Array(COLS * ROWS);
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (d[open[i]] < d[open[bi]]) bi = i;
    const c = open[bi];
    open[bi] = open[open.length - 1];
    open.pop();
    if (done[c]) continue;
    done[c] = 1;
    const x = c % COLS, y = (c / COLS) | 0;
    for (const [dx, dy, w] of N8) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const n = ny * COLS + nx;
      if (!walkable(g, n, stones, extraBlock)) continue;
      if (dx && dy && (!walkable(g, y * COLS + nx, stones, extraBlock) || !walkable(g, ny * COLS + x, stones, extraBlock))) continue;
      if (d[c] + w < d[n]) { d[n] = d[c] + w; open.push(n); }
    }
  }
  return d;
}

// Total route length from all burrows if cell c got a trap (for hints and the test bot).
export function routeLength(g, c = -1) {
  const d = flow(g, false, c);
  return g.spawns.reduce((a, s) => a + d[s], 0);
}

// ---------- building ----------
export function canBuild(g, kind, c) {
  const level = LEVELS[g.L];
  if (g.state === 'won' || g.state === 'lost') return 'over';
  if (!level.traps.includes(kind)) return 'locked';
  if (c < 0 || !BUILD.has(g.tiles[c])) return 'tile';
  if (g.trapGrid[c]) return 'busy';
  if (g.coins < TRAPS[kind].cost[0]) return 'coins';
  if (WALK.has(g.tiles[c])) {
    const d = flow(g, false, c);
    for (const s of g.spawns) if (d[s] === Infinity) return 'blocks';
    for (const e of g.enemies) {
      if (e.fly) continue;
      const here = cellOf(e.x, e.y);
      if (here === c || e.to === c) return 'blocks';
      if (here >= 0 && g.tiles[here] !== '#' && d[here] === Infinity && !ENEMIES[e.kind].stones) return 'blocks';
    }
  }
  return '';
}

export function build(g, kind, c) {
  if (canBuild(g, kind, c)) return null;
  const cost = TRAPS[kind].cost[0];
  g.coins -= cost;
  const t = { id: g.ids++, kind, lvl: 0, c, x: cx(c), y: cy(c), cd: 0.2, spent: cost, aim: -Math.PI / 2 };
  g.traps.push(t);
  rebuild(g);
  g.events.push({ t: 'build', kind, x: t.x, y: t.y });
  return t;
}

export function upgradeCost(t) { return t.lvl < 2 ? TRAPS[t.kind].cost[t.lvl + 1] : 0; }
export function sellValue(t) { return Math.floor(t.spent * SELL_BACK); }

export function upgrade(g, id) {
  const t = g.traps.find((q) => q.id === id);
  if (!t || t.lvl >= 2 || g.state === 'won' || g.state === 'lost') return false;
  const cost = upgradeCost(t);
  if (g.coins < cost) return false;
  g.coins -= cost;
  t.spent += cost;
  t.lvl++;
  g.events.push({ t: 'upgrade', kind: t.kind, x: t.x, y: t.y, lvl: t.lvl });
  return true;
}

export function sell(g, id) {
  const i = g.traps.findIndex((q) => q.id === id);
  if (i < 0 || g.state === 'won' || g.state === 'lost') return false;
  const t = g.traps[i];
  g.coins += sellValue(t);
  g.traps.splice(i, 1);
  rebuild(g);
  g.events.push({ t: 'sell', x: t.x, y: t.y, n: sellValue(t) });
  return true;
}

export const trapRange = (t) => TRAPS[t.kind].range[t.lvl];

// ---------- waves ----------
export function start(g) {
  if (g.state !== 'build') return;
  g.state = 'run';
  startWave(g);
}

export function canCallWave(g) {
  return g.state === 'run' && g.wave < g.waves.length - 1 && !g.queue.some((q) => q.wave === g.wave);
}

// Call the next wave early: a coin for every second saved.
export function callWave(g) {
  if (!canCallWave(g)) return 0;
  const bonus = Math.max(0, Math.floor(g.nextWaveAt - g.time));
  g.coins += bonus;
  startWave(g);
  return bonus;
}

function startWave(g) {
  g.wave++;
  const w = g.wave;
  const groups = g.waves[w];
  let end = g.time;
  let count = 0;
  for (const gr of groups) {
    for (let i = 0; i < gr.count; i++) {
      const t = g.time + gr.at + i * gr.every;
      g.queue.push({ t, kind: gr.kind, spawn: gr.spawn % g.spawns.length, wave: w });
      end = Math.max(end, t);
      count++;
    }
  }
  g.queue.sort((a, b) => a.t - b.t);
  g.waveLeft[w] = count;
  g.waveBitten[w] = false;
  g.nextWaveAt = end + WAVE_GAP;
  g.events.push({ t: 'wave', n: w + 1 });
}

function spawn(g, q) {
  const def = ENEMIES[q.kind];
  const s = g.spawns[q.spawn];
  const sx = s % COLS, sy = (s / COLS) | 0;
  // Start just outside the border, behind the burrow.
  let ox = 0, oy = 0;
  if (sx === 0) ox = -0.7; else if (sx === COLS - 1) ox = 0.7; else if (sy === 0) oy = -0.7; else oy = 0.7;
  const strength = levelStrength(g.L) * (1 + 0.025 * q.wave);
  const hp = Math.round(def.hp * strength);
  const e = {
    id: g.ids++, kind: q.kind, wave: q.wave, fly: !!def.fly,
    x: sx + 0.5 + ox, y: sy + 0.5 + oy, to: s,
    hp, max: hp, slowT: 0, slowF: 0, burnT: 0, burnD: 0, stunT: 0,
    head: Math.atan2(-oy, -ox), lane: (rnd(g) - 0.5) * 0.36, phase: rnd(g) * 6.28,
  };
  g.enemies.push(e);
}

// ---------- the main step ----------
export function step(g, dt = DT) {
  if (g.state !== 'run') return;
  g.time += dt;
  const frozen = g.freezeT > 0;
  if (g.shieldT > 0) g.shieldT = Math.max(0, g.shieldT - dt);
  if (frozen) {
    g.freezeT = Math.max(0, g.freezeT - dt);
    // The battle clock of the waves stands still while everything is frozen.
    for (const q of g.queue) q.t += dt;
    g.nextWaveAt += dt;
  }
  while (g.queue.length && g.queue[0].t <= g.time) spawn(g, g.queue.shift());
  if (g.wave < g.waves.length - 1 && g.time >= g.nextWaveAt) startWave(g);

  for (const k in g.charge) g.charge[k] = Math.min(1, g.charge[k] + dt / BONUSES[k].charge);

  zonesStep(g, dt);
  for (const e of g.enemies) moveEnemy(g, e, dt, frozen);
  for (const t of g.traps) trapStep(g, t, dt);
  shotsStep(g, dt);
  cleanup(g);

  if (g.hp <= 0) {
    g.hp = 0;
    g.state = 'lost';
    g.events.push({ t: 'lost' });
  } else if (g.wave === g.waves.length - 1 && !g.queue.length && !g.enemies.length) {
    g.state = 'won';
    g.events.push({ t: 'won' });
  }
}

function moveEnemy(g, e, dt, frozen) {
  const def = ENEMIES[e.kind];
  if (e.burnT > 0) {
    e.burnT -= dt;
    e.hp -= e.burnD * dt;
  }
  if (e.hitT > 0) e.hitT -= dt;
  if (def.regen && e.hp > 0) e.hp = Math.min(e.max, e.hp + def.regen * dt);
  if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slowF = 0; }
  if (e.stunT > 0) { e.stunT -= dt; return; }
  if (frozen || e.hp <= 0) return;
  let sp = def.speed * (1 - e.slowF) * dt;
  e.phase += sp * 9;
  if (e.fly) {
    const dx = g.fruit.x - e.x, dy = g.fruit.y - e.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.75) { bite(g, e); return; }
    const wob = Math.sin(e.phase * 0.35 + e.lane * 20) * 0.6;
    const a = Math.atan2(dy, dx) + wob * Math.min(1, d / 4);
    e.x += Math.cos(a) * sp;
    e.y += Math.sin(a) * sp;
    e.head = turn(e.head, a, dt * 6);
    return;
  }
  const dist = def.stones ? g.distStone : g.dist;
  // Walk to the centre of the target cell; at the centre pick the neighbour that is closest to the fruit.
  for (let guard = 0; guard < 3 && sp > 0; guard++) {
    const tx = cx(e.to), ty = cy(e.to);
    const dx = tx - e.x, dy = ty - e.y;
    const d = Math.hypot(dx, dy);
    if (d > sp) {
      e.x += (dx / d) * sp;
      e.y += (dy / d) * sp;
      e.head = turn(e.head, Math.atan2(dy, dx), dt * 10);
      return;
    }
    e.x = tx; e.y = ty; sp -= d;
    if (g.tiles[e.to] === 'F') { bite(g, e); return; }
    const nx = nextCell(g, e.to, dist, def.stones);
    if (nx < 0) return;
    e.to = nx;
  }
}

function nextCell(g, c, dist, stones) {
  const x = c % COLS, y = (c / COLS) | 0;
  let best = -1, bd = dist[c];
  if (bd === Infinity) bd = 1e9; // stranded: take any step that gets somewhere
  for (const [dx, dy, w] of N8) {
    const nx = x + dx, ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
    const n = ny * COLS + nx;
    if (!walkable(g, n, stones)) continue;
    if (dx && dy && (!walkable(g, y * COLS + nx, stones) || !walkable(g, ny * COLS + x, stones))) continue;
    const v = dist[n] + w * 0.001;
    if (v < bd) { bd = v; best = n; }
  }
  return best;
}

function turn(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * Math.min(1, k);
}

function bite(g, e) {
  const def = ENEMIES[e.kind];
  e.gone = true;
  if (g.shieldT > 0) {
    g.events.push({ t: 'blocked', x: e.x, y: e.y });
    return;
  }
  g.hp -= def.bite;
  g.waveBitten[e.wave] = true;
  g.events.push({ t: 'bite', kind: e.kind, x: e.x, y: e.y, n: def.bite });
}

// How far an insect still has to go: smaller = more dangerous. Traps shoot the most dangerous one in range.
export function remaining(g, e) {
  if (e.fly) return Math.hypot(g.fruit.x - e.x, g.fruit.y - e.y);
  const dist = ENEMIES[e.kind].stones ? g.distStone : g.dist;
  const d = dist[e.to];
  return (d === Infinity ? 99 : d) + Math.hypot(cx(e.to) - e.x, cy(e.to) - e.y);
}

function hits(kind, e) {
  const h = TRAPS[kind].hits;
  return h === 'both' || (h === 'air') === e.fly;
}

function inRange(t, e, r) { return (e.x - t.x) ** 2 + (e.y - t.y) ** 2 <= r * r; }

function trapStep(g, t, dt) {
  const def = TRAPS[t.kind];
  t.cd -= dt;
  if (t.cd > 0) return;
  const r = def.range[t.lvl];
  const lvl = t.lvl;
  if (t.kind === 'spiker' || t.kind === 'thistle') {
    let best = null, bd = Infinity;
    for (const e of g.enemies) {
      if (e.gone || e.hp <= 0 || !hits(t.kind, e) || !inRange(t, e, r)) continue;
      const d = remaining(g, e);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) { t.cd = 0.05; return; }
    t.aim = Math.atan2(best.y - t.y, best.x - t.x);
    g.shots.push({ kind: t.kind, lvl, x: t.x + Math.cos(t.aim) * 0.3, y: t.y + Math.sin(t.aim) * 0.3, target: best.id, tx: best.x, ty: best.y, dmg: def.dmg[lvl], speed: t.kind === 'thistle' ? 10 : 8 });
    g.events.push({ t: 'shoot', kind: t.kind, x: t.x, y: t.y, id: t.id });
    t.cd = 1 / def.rate[lvl];
  } else if (t.kind === 'slow') {
    let any = false;
    for (const e of g.enemies) {
      if (e.gone || e.fly || !inRange(t, e, r)) continue;
      any = true;
      e.slowT = 1.3;
      e.slowF = Math.max(e.slowF, def.slow[lvl]);
      if (def.dmg[lvl]) damage(g, e, def.dmg[lvl], false);
    }
    if (any) g.events.push({ t: 'pulse', x: t.x, y: t.y, r, id: t.id });
    t.cd = any ? 1 / def.rate[lvl] : 0.1;
  } else if (t.kind === 'pepper') {
    let any = false;
    for (const e of g.enemies) {
      if (e.gone || e.fly || !inRange(t, e, r)) continue;
      any = true;
      damage(g, e, def.dmg[lvl], true);
      e.burnT = 2;
      e.burnD = Math.max(e.burnD || 0, def.burn[lvl]);
    }
    if (any) g.events.push({ t: 'flame', x: t.x, y: t.y, r, id: t.id, lvl });
    t.cd = any ? 1 / def.rate[lvl] : 0.1;
  } else if (t.kind === 'storm') {
    let first = null, bd = Infinity;
    for (const e of g.enemies) {
      if (e.gone || e.hp <= 0 || !inRange(t, e, r)) continue;
      const d = remaining(g, e);
      if (d < bd) { bd = d; first = e; }
    }
    if (!first) { t.cd = 0.1; return; }
    const chain = [first];
    let cur = first;
    while (chain.length < def.chain[lvl]) {
      let nb = null, nd = 1.6 * 1.6;
      for (const e of g.enemies) {
        if (e.gone || e.hp <= 0 || chain.includes(e)) continue;
        const d = (e.x - cur.x) ** 2 + (e.y - cur.y) ** 2;
        if (d < nd) { nd = d; nb = e; }
      }
      if (!nb) break;
      chain.push(nb);
      cur = nb;
    }
    const pts = [[t.x, t.y], ...chain.map((e) => [e.x, e.y])];
    for (const e of chain) damage(g, e, def.dmg[lvl], true);
    g.events.push({ t: 'zap', pts, id: t.id, lvl });
    t.cd = 1 / def.rate[lvl];
  }
}

function shotsStep(g, dt) {
  for (const s of g.shots) {
    const e = g.enemies.find((q) => q.id === s.target && !q.gone && q.hp > 0);
    if (e) { s.tx = e.x; s.ty = e.y; }
    const dx = s.tx - s.x, dy = s.ty - s.y;
    const d = Math.hypot(dx, dy);
    const st = s.speed * dt;
    if (d <= st + 0.08) {
      s.done = true;
      if (e) damage(g, e, s.dmg, true);
      g.events.push({ t: 'hit', kind: s.kind, x: s.tx, y: s.ty });
    } else {
      s.x += (dx / d) * st;
      s.y += (dy / d) * st;
    }
  }
  g.shots = g.shots.filter((s) => !s.done);
}

function damage(g, e, dmg, armored) {
  if (e.gone || e.hp <= 0) return;
  const armor = armored ? ENEMIES[e.kind].armor || 0 : 0;
  e.hp -= Math.max(1, dmg - armor);
  e.hitT = 0.12;
}

function cleanup(g) {
  for (const e of g.enemies) {
    if (!e.gone && e.hp <= 0) {
      const def = ENEMIES[e.kind];
      e.gone = true;
      g.coins += def.reward;
      g.killScore += def.score;
      g.kills++;
      g.events.push({ t: 'kill', kind: e.kind, x: e.x, y: e.y, n: def.reward, fly: e.fly, head: e.head });
    }
  }
  if (g.enemies.some((e) => e.gone)) {
    for (const e of g.enemies) {
      if (!e.gone) continue;
      g.waveLeft[e.wave]--;
      if (g.waveLeft[e.wave] === 0 && !g.queue.some((q) => q.wave === e.wave) && !g.waveBitten[e.wave]) {
        g.safeWaves++;
        g.events.push({ t: 'safe', x: g.fruit.x, y: g.fruit.y - 1 });
      }
    }
    g.enemies = g.enemies.filter((e) => !e.gone);
  }
}

function zonesStep(g, dt) {
  for (const z of g.zones) {
    z.t -= dt;
    for (const e of g.enemies) {
      if (e.gone || (e.x - z.x) ** 2 + (e.y - z.y) ** 2 > z.r * z.r) continue;
      if (z.kind === 'spray') { e.hp -= z.dps * dt; e.hitT = 0.05; }
      if (z.kind === 'honey' && !e.fly) { e.slowT = 0.3; e.slowF = Math.max(e.slowF, z.slow); }
    }
  }
  g.zones = g.zones.filter((z) => z.t > 0);
}

// ---------- super-bonuses ----------
export const bonusReady = (g, k) => g.charge[k] >= 1;

export function useBonus(g, k, x, y) {
  if (g.state !== 'run' || !bonusReady(g, k)) return false;
  const b = BONUSES[k];
  const power = levelStrength(g.L);
  g.charge[k] = 0;
  if (k === 'spray') g.zones.push({ kind: 'spray', x, y, r: b.r, t: b.t, max: b.t, dps: b.dps * power });
  if (k === 'honey') g.zones.push({ kind: 'honey', x, y, r: b.r, t: b.t, max: b.t, slow: b.slow });
  if (k === 'cracker') {
    for (const e of g.enemies) if ((e.x - x) ** 2 + (e.y - y) ** 2 <= b.r * b.r) damage(g, e, b.dmg * power, false);
  }
  if (k === 'horn') for (const e of g.enemies) e.stunT = b.t;
  if (k === 'bolt') {
    const top = [...g.enemies].filter((e) => !e.gone).sort((a, c) => c.hp - a.hp).slice(0, b.n);
    for (const e of top) damage(g, e, b.dmg * power, false);
    g.events.push({ t: 'bolt', pts: top.map((e) => [e.x, e.y]) });
  }
  g.events.push({ t: 'bonus', kind: k, x, y, r: b.r });
  cleanup(g);
  return true;
}

// ---------- crystal shop (the crystals themselves live in the player's profile) ----------
export function applyShop(g, k) {
  if (g.state === 'won' || g.state === 'lost') return false;
  const s = SHOP[k];
  if (k === 'freeze') g.freezeT = s.t;
  if (k === 'shield') g.shieldT = s.t;
  if (k === 'armageddon') {
    for (const e of g.enemies) e.hp = 0;
    cleanup(g);
  }
  if (k === 'exchange') g.coins += s.coins;
  g.events.push({ t: 'shop', kind: k });
  return true;
}

// ---------- the result ----------
export function result(g) {
  const lines = {
    ants: g.killScore,
    safe: 200 * g.safeWaves,
    life: Math.round((1000 * g.hp) / g.maxHp),
    balance: g.coins * 10,
    unused: 100 * Object.values(g.charge).filter((c) => c >= 1).length,
  };
  const total = Object.values(lines).reduce((a, b) => a + b, 0);
  return { lines, total, crystals: g.state === 'won' ? Math.floor(total / 60) : 0 };
}

export { DT };
