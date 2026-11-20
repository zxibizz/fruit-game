// Drawing, input, HUD and screens. The game state lives in game.js; this file only shows it and turns taps into actions.
import * as A from './art.js';
import {
  createGame, step, place, placeProblem, blockingCells, previewTrail, trail, upgrade, upgradeCost, removePlant, refund,
  startWave, wavePreview, usePower, collectDrop, stars, COLS, ROWS,
} from './game.js';
import { PLANTS, BUGS, LEVELS } from './data.js';

const T = {
  wave: (n, m) => `Волна ${n} / ${m}`, build: 'Стройка', go: 'В бой!', next: 'Волна',
  plant: { pumpkin: 'Тыква', rose: 'Шиповник', clover: 'Клевер', corn: 'Кукуруза', mint: 'Мята', pepper: 'Перец', dandelion: 'Одуванчик' },
  eaten: { pumpkin: 'съедена', rose: 'съеден', clover: 'съеден', corn: 'съедена', mint: 'съедена', pepper: 'съеден', dandelion: 'съеден' },
  role: { pumpkin: 'стена, держит путь', rose: 'шипы, бьёт и летающих', clover: 'даёт росу', corn: 'зёрна навесом, по площади', mint: 'холод: замедляет', pepper: 'огонь вокруг себя', dandelion: 'снайпер, вдвое по летающим' },
  problem: { busy: 'Здесь занято', bug: 'Здесь жук', blocks: 'Нельзя закрыть жукам путь', poor: 'Не хватает росы' },
  gain: (n) => (n > 0 ? `путь +${n}` : n < 0 ? `путь ${n}` : 'путь тот же'),
  hint1: 'Выбери растение слева и посади на траву — жуки пойдут в обход',
  hint2: 'Посадки удлиняют путь. Когда готов — «В бой!»',
  won: 'Яблоко спасено!', lost: 'Жуки съели яблоко', again: 'Ещё раз', levels: 'Уровни', nextLevel: 'Дальше', resume: 'Продолжить',
  pause: 'Пауза', restart: 'Заново', waveDone: (b) => `Волна пройдена  +${b}`, newPlant: 'Новое растение',
};

const CELL = 42, TRAY = 80;
const cv = document.getElementById('cv'), c = cv.getContext('2d');
let dpr = 1, scale = 1, W = 844, H = 390, gx0 = 80, gy0 = 48;
let game = null, levelIdx = 0, speed = 1, paused = true, now = 0;
let sel = null, ghost = null, pop = null, blockCache = null;
let fx = [], banners = [], terrain = null, grassLayer = null, terrainDirty = true;
const sprites = new Map(), angles = new Map(), anim = new Map();
const ui = []; // tap targets rebuilt every frame: {x, y, w, h, r, fn}

const progress = JSON.parse(localStorage.getItem('fruit.progress') || '{"stars":[]}');
const saveProgress = () => localStorage.setItem('fruit.progress', JSON.stringify(progress));

// ---------- geometry ----------
const px = (x) => gx0 + x * CELL, py = (y) => gy0 + y * CELL;
const cellCenter = (i, j) => [px(i + .5), py(j + .5)];
function resize() {
  const vw = innerWidth, vh = innerHeight;
  scale = Math.min(vw / 844, vh / 390); W = vw / scale; H = vh / scale;
  dpr = Math.min(devicePixelRatio || 1, 2.5);
  cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr); cv.style.width = vw + 'px'; cv.style.height = vh + 'px';
  A.setView(W, H);
  gx0 = TRAY + Math.max(0, (W - TRAY - COLS * CELL - 8) / 2);
  gy0 = 46 + Math.max(0, (H - 46 - ROWS * CELL - 4) / 2);
  sprites.clear(); grassLayer = null; terrainDirty = true;
}
function layer(w = W, h = H) {
  const k = scale * dpr, cnv = document.createElement('canvas');
  cnv.width = Math.ceil(w * k); cnv.height = Math.ceil(h * k);
  const x = cnv.getContext('2d'); x.setTransform(k, 0, 0, k, 0, 0); return [cnv, x];
}
function sprite(key, w, h, draw) {
  let s = sprites.get(key);
  if (!s) { const [cnv, x] = layer(w, h); draw(x); s = { cnv, w, h }; sprites.set(key, s); }
  return s;
}
const blit = (s, x, y) => c.drawImage(s.cnv, x, y, s.w, s.h);

// ---------- terrain ----------
function buildGrass() {
  const [cnv, x] = layer(); A.hdGrass(x, { seed: 5 + levelIdx }); A.hdBorderBushes(x, 2 + levelIdx); grassLayer = cnv;
}
function buildTerrain() {
  if (!grassLayer) buildGrass();
  const [cnv, x] = layer(); x.drawImage(grassLayer, 0, 0, W, H);
  const cells = trail(game), pts = cells.map(([i, j]) => cellCenter(i, j));
  pts.unshift([W + 40, pts[0][1]]);
  A.hdPath(x, A.chaikin(pts, 3), 30, 1 + levelIdx);
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    const o = game.grid[j][i]; if (!o) continue; const [cx, cy] = cellCenter(i, j);
    if (o.obstacle === 'rock') A.hdRock(x, cx, cy + 4, 1);
    else if (o.obstacle === 'stump') A.hdStump(x, cx, cy + 4, 15);
    else if (o.obstacle === 'log' && game.grid[j][i + 1]?.obstacle === 'log') A.hdLog(x, cx + CELL / 2, cy + 4, CELL * 2 - 8);
    else if (o.type) A.hdSoil(x, cx, cy + 15);
  }
  const [fx0, fy0] = cellCenter(...game.fruit); A.hdStump(x, fx0, fy0 + 12, 23);
  const [ex, ey] = cellCenter(...game.entry); A.hdAnthill(x, Math.min(W - 26, ex + 16), ey + 4, 1);
  A.hdDapple(x); A.hdSun2(x); A.hdGrade(x); A.hdVignette(x);
  terrain = cnv; terrainDirty = false; blockCache = null;
}

// ---------- sprites ----------
const plantSprite = (type, lvl) => sprite(`p:${type}:${lvl}`, 70, 84, (x) => A.hdPlant(x, type, 35, 66, 1, { noShadow: true, lvl: lvl > 1 ? lvl : 0 }));
const BUG_SIZE = { rhino: 2.1, snail: 1.25, beetle: 1.15 };
function bugSprite(kind, frame) {
  const s = (BUG_SIZE[kind] || 1) * 1.12, box = Math.ceil(64 * s);
  return sprite(`b:${kind}:${frame}`, box, box, (x) => {
    A.setLeg(frame ? .8 : -.8);
    const k = kind === 'rhino' ? 'beetle' : kind;
    A.hdBug(x, k, box / 2, box / 2, 0, s, { noShadow: true, ph: frame * 1.6, flap: frame ? .55 : 1, color: kind === 'rhino' ? '#8a3ad0' : undefined });
    if (kind === 'rhino') { x.save(); x.translate(box / 2, box / 2); x.scale(s, s); A.hdBlob(x, (cc) => { cc.moveTo(14, -2); cc.quadraticCurveTo(22, -3, 23, -9); cc.quadraticCurveTo(20, -1, 14, 2); cc.closePath(); }, '#5a2a8a', 18, -3, 5); x.restore(); }
    A.setLeg(0);
  });
}
function appleSprite(mood) {
  return sprite(`apple:${mood}`, 70, 70, (x) => A.hdApple(x, 35, 38, 24, { bite: mood > 0, worried: mood > 1, sweat: mood > 2, look: [1, 0] }));
}
const cardSprite = (type) => sprite(`card:${type}`, 50, 52, (x) => A.hdPlant(x, type, 22, 44, .74, { noShadow: true }));

// ---------- game flow ----------
function startLevel(n) {
  levelIdx = n; game = createGame(n, Date.now() & 0xffff);
  sel = ghost = pop = null; fx = []; banners = []; angles.clear(); anim.clear(); speed = 1;
  grassLayer = null; terrainDirty = true; paused = false;
  showHome(false); showModal(null);
  if (n === 0) banner(T.hint1, 6, true);
  else { const fresh = LEVELS[n].plants.filter((p) => !LEVELS[n - 1].plants.includes(p)); if (fresh.length) banner(`${T.newPlant}: ${fresh.map((p) => T.plant[p]).join(', ')}`, 5, true); }
}
function banner(text, life = 2, top = false) { banners.push({ text, t: 0, life, top }); }
function selectCard(type) {
  pop = null; ghost = null; blockCache = null;
  sel = sel === type ? null : type;
}
function tapCell(i, j) {
  const p = game.grid[j]?.[i];
  if (p && p.type) { sel = null; ghost = null; pop = pop === p ? null : p; return; }
  pop = null;
  if (!sel) return;
  if (ghost && ghost.i === i && ghost.j === j && ghost.ok) { confirmGhost(); return; }
  const problem = placeProblem(game, i, j) || (game.dew < PLANTS[sel].cost ? 'poor' : null);
  const tr = problem ? null : previewTrail(game, i, j);
  ghost = { i, j, ok: !problem, problem, trail: tr, gain: tr ? tr.length - trail(game).length : 0, t: 0 };
}
function confirmGhost() {
  if (!ghost || !sel) return;
  if (place(game, sel, ghost.i, ghost.j)) { terrainDirty = true; ghost = null; if (game.dew < PLANTS[sel].cost) sel = null; }
  else { const pr = placeProblem(game, ghost.i, ghost.j) || 'poor'; ghost.ok = false; ghost.problem = pr; }
}

// ---------- events -> effects ----------
function handleEvents() {
  for (const e of game.events) {
    switch (e.t) {
      case 'hit': if (e.src !== 'burn') { const [x, y] = [px(e.b.x), py(e.b.y)]; fx.push({ k: 'dmg', x: x + (Math.random() - .5) * 10, y: y - 18, t: 0, life: .7, txt: `-${Math.round(e.dmg)}` }); fx.push({ k: 'star', x, y: y - 4, t: 0, life: .18, r: 9 }); } break;
      case 'kill': { const x = px(e.b.x), y = py(e.b.y); for (let n = 0; n < 7; n++) fx.push({ k: 'puff', x, y, vx: (Math.random() - .5) * 60, vy: (Math.random() - .5) * 60 - 10, t: 0, life: .45, r: 3 + Math.random() * 3 }); fx.push({ k: 'gain', x, y: y - 10, t: 0, life: .8, txt: `+${e.reward}` }); angles.delete(e.b.id); break; }
      case 'splash': { const x = px(e.x), y = py(e.y); for (let n = 0; n < 8; n++) fx.push({ k: 'kern', x, y, vx: (Math.random() - .5) * 90, vy: -30 - Math.random() * 50, t: 0, life: .4 }); break; }
      case 'fire': { const [x, y] = cellCenter(e.p.i, e.p.j); fx.push({ k: 'fire', x, y, t: 0, life: .45, r: PLANTS.pepper.range[e.p.lvl - 1] * CELL }); bump(e.p, .2); break; }
      case 'shoot': bump(e.p, .12); break;
      case 'bite': { angles.delete(e.b.id); const [x, y] = cellCenter(...game.fruit); fx.push({ k: 'dmg', x, y: y - 40, t: 0, life: .9, txt: `-${BUGS[e.b.kind].bite}`, red: true }); anim.set('apple', 0); break; }
      case 'collect': { const x = px(e.d.x), y = py(e.d.y); fx.push({ k: 'fly', x, y, t: 0, life: .5 }); break; }
      case 'place': bump(e.p, .35, true); dust(e.p); terrainDirty = true; break;
      case 'upgrade': { const [x, y] = cellCenter(e.p.i, e.p.j); for (let n = 0; n < 6; n++) fx.push({ k: 'spark', x: x + (Math.random() - .5) * 30, y: y - 10 - Math.random() * 30, t: n * .05, life: .5 }); bump(e.p, .3, true); break; }
      case 'sell': case 'plantDead': dust(e.p); terrainDirty = true; if (pop === e.p) pop = null; if (e.t === 'plantDead') banner(`${T.plant[e.p.type]} ${T.eaten[e.p.type]}!`, 1.4); break;
      case 'chew': { const [x, y] = cellCenter(e.p.i, e.p.j); for (let n = 0; n < 6; n++) fx.push({ k: 'crumb', x, y: y - 6, vx: (Math.random() - .5) * 50, vy: -20 - Math.random() * 30, t: 0, life: .5, col: e.p.type === 'pumpkin' ? '#f7a23a' : '#6cc04a' }); bump(e.p, .2); break; }
      case 'wave': banner(T.wave(e.n, game.waves), 1.4); break;
      case 'waveDone': banner(T.waveDone(e.bonus), 1.8); if (levelIdx === 0 && e.n === 1) banner(T.hint2, 5, true); break;
      case 'power': if (e.kind === 'frost') fx.push({ k: 'flash', t: 0, life: .6, col: 'rgba(190,240,255,' }); else for (let n = 0; n < 70; n++) fx.push({ k: 'rain', x: Math.random() * W, y: -Math.random() * H, t: 0, life: 1.2 }); break;
      case 'won': case 'lost': { const g = game; setTimeout(() => { if (game === g) endScreen(e.t === 'won'); }, 900); break; }
    }
  }
  game.events.length = 0;
}
function bump(p, k, grow = false) { anim.set(p.id, { t: 0, k, grow }); }
function dust(p) { const [x, y] = cellCenter(p.i, p.j); for (let n = 0; n < 8; n++) fx.push({ k: 'dust', x: x + (Math.random() - .5) * 20, y: y + 12, vx: (Math.random() - .5) * 50, vy: -10 - Math.random() * 20, t: 0, life: .5, r: 3 + Math.random() * 3 }); }

// ---------- frame ----------
function frame(ts) {
  const dt = Math.min(.1, (ts - (now || ts)) / 1000); now = ts;
  if (game && !paused) {
    let acc = dt * speed; while (acc > 1e-6) { const h = Math.min(acc, 1 / 60); step(game, h); acc -= h; }
    handleEvents();
  }
  if (game) draw(paused ? 0 : dt);
  requestAnimationFrame(frame);
}

function draw(dt) {
  if (terrainDirty) buildTerrain();
  c.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  c.drawImage(terrain, 0, 0, W, H);
  ui.length = 0;
  const t = now / 1000;
  if (sel) drawGrid();
  if (pop && PLANTS[pop.type].range) ring(...cellCenter(pop.i, pop.j), PLANTS[pop.type].range[pop.lvl - 1] * CELL);

  // depth-sorted things on the ground
  const items = [];
  for (const p of game.plants) items.push([py(p.j + .5) + 14, () => drawPlant(p, t)]);
  for (const b of game.bugs) if (!b.fly) items.push([py(b.y), () => drawBug(b, t, dt)]);
  const [fxx, fyy] = cellCenter(...game.fruit); items.push([fyy + 12, () => drawApple(fxx, fyy, dt)]);
  items.sort((a, b) => a[0] - b[0]); for (const [, f] of items) f();
  for (const p of game.plants) if (p.hp < p.maxHp) { const [x, y] = cellCenter(p.i, p.j); A.hdHp(c, x, y - 32, 28, p.hp / p.maxHp, '#ffb03a'); }
  if (ghost) drawGhost(t);
  for (const d of game.drops) drawDrop(d, t);
  for (const s of game.shots) drawShot(s);
  for (const b of game.bugs) if (b.fly) drawBug(b, t, dt);
  for (const b of game.bugs) if (b.hp < b.maxHp) A.hdHp(c, px(b.x), py(b.y) - (b.kind === 'rhino' ? 44 : 24), b.kind === 'rhino' ? 56 : 26, b.hp / b.maxHp, b.kind === 'rhino' ? '#ff5a5a' : '#7be05a');
  drawFx(dt);
  drawHud(t);
  drawBanners(dt);
}

function ring(x, y, r) { c.save(); c.beginPath(); c.arc(x, y, r, 0, A.TAU); c.fillStyle = 'rgba(255,255,255,.13)'; c.fill(); c.setLineDash([8, 6]); c.lineWidth = 2.2; c.strokeStyle = 'rgba(255,255,255,.85)'; c.stroke(); c.restore(); }
function drawGrid() {
  if (game.phase === 'wave' && Math.floor(now / 500) !== blockCache?.tick) blockCache = null;
  if (!blockCache) { blockCache = new Set(blockingCells(game).map(([i, j]) => i + ',' + j)); blockCache.tick = Math.floor(now / 500); }
  if (!blockCache) blockCache = new Set(blockingCells(game).map(([i, j]) => i + ',' + j));
  c.save();
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    if (game.grid[j][i] || (i === game.fruit[0] && j === game.fruit[1]) || (i === game.entry[0] && j === game.entry[1])) continue;
    const bad = blockCache.has(i + ',' + j), x = px(i), y = py(j);
    c.beginPath(); A.rrect(c, x + 3, y + 3, CELL - 6, CELL - 6, 9); c.fillStyle = bad ? 'rgba(235,70,70,.22)' : 'rgba(255,255,255,.14)'; c.fill();
    c.lineWidth = 1.2; c.strokeStyle = bad ? 'rgba(200,30,30,.5)' : 'rgba(255,255,255,.35)'; c.stroke();
  }
  c.restore();
}
function drawPlant(p, t) {
  const s = plantSprite(p.type, p.lvl), [x, y] = cellCenter(p.i, p.j), base = y + 14;
  let sx = 1, sy = 1; const a = anim.get(p.id);
  if (a) { a.t += 1 / 60; const e = Math.exp(-a.t * 9) * Math.cos(a.t * 26); sx = 1 + a.k * e * (a.grow ? .6 : -.4); sy = 1 - a.k * e * (a.grow ? -.8 : .5); if (a.t > .8) anim.delete(p.id); }
  if (p.hit > 0) { sx *= 1.08; sy *= .9; }
  const sway = Math.sin(t * 1.7 + p.id * 1.3) * .035;
  c.save(); c.translate(x, base); c.transform(sx, 0, sway, sy, 0, 0); blit(s, -35, -66); c.restore();
}
function drawBug(b, t, dt) {
  const x = px(b.x), y = py(b.y), target = Math.atan2(b.vy, b.vx);
  let a = angles.get(b.id); if (a == null) a = target;
  let d = target - a; while (d > Math.PI) d -= A.TAU; while (d < -Math.PI) d += A.TAU; a += d * Math.min(1, dt * 10); angles.set(b.id, a);
  const moving = !(b.frozen > 0) && !(b.chew > 0), fr = moving ? Math.floor(t * (b.kind === 'butterfly' ? 10 : 7) + b.id) % 2 : 0;
  const s = bugSprite(b.kind, fr), sc = (BUG_SIZE[b.kind] || 1);
  const lift = b.fly ? 16 : 0;
  c.save(); c.globalAlpha = b.fly ? .18 : .25; c.beginPath(); c.ellipse(x + 3 + lift * .6, y + 5 + lift, 15 * sc, 8 * sc, 0, 0, A.TAU); c.fillStyle = '#183008'; c.fill(); c.restore();
  if (b.slow < 1 && !b.fly) { c.save(); c.beginPath(); c.ellipse(x, y + 4, 17 * sc, 10 * sc, 0, 0, A.TAU); c.fillStyle = 'rgba(170,235,255,.35)'; c.fill(); c.restore(); }
  c.save(); c.translate(x, y - (b.fly ? Math.sin(t * 6 + b.id) * 3 : 0)); c.rotate(a + (b.chew > 0 ? Math.sin(t * 30) * .12 : 0));
  if (b.hit > 0) c.filter = 'brightness(1.8)';
  blit(s, -s.w / 2, -s.h / 2); c.restore();
  if (b.frozen > 0) A.fxIced(c, x, y, 13 * sc);
  if (b.burn > 0 && Math.random() < .4) fx.push({ k: 'ember', x: x + (Math.random() - .5) * 14, y: y - 4, vx: 0, vy: -30, t: 0, life: .35 });
}
function drawApple(x, y, dt) {
  const r = game.hp / game.maxHp, mood = r < .3 ? 3 : r < .55 ? 2 : r < .8 ? 1 : 0, s = appleSprite(mood);
  let dx = 0; const a = anim.get('apple'); if (a != null) { const at = a + dt; anim.set('apple', at); dx = Math.sin(at * 50) * 4 * Math.max(0, 1 - at * 3); if (at > .4) anim.delete('apple'); }
  blit(s, x - 35 + dx, y - 47);
}
function drawDrop(d, t) {
  const x = px(d.x), y = py(d.y) - 6 + Math.sin(t * 4 + d.id) * 3;
  if (d.age > 4 && Math.floor(t * 8) % 2) return;
  c.save(); const g = c.createRadialGradient(x, y, 1, x, y, 18); g.addColorStop(0, 'rgba(200,245,255,.7)'); g.addColorStop(1, 'rgba(200,245,255,0)'); c.fillStyle = g; c.fillRect(x - 18, y - 18, 36, 36); c.restore();
  A.hdDrop(c, x, y, 8);
  ui.push({ x: x - 22, y: y - 24, w: 44, h: 44, fn: () => collectDrop(game, d.id) });
}
function drawShot(s) {
  const x = px(s.x), y = py(s.y);
  if (s.kind === 'thorn') A.fxThorn(c, x, y, Math.atan2(s.ty - s.y, s.tx - s.x), 22);
  else if (s.kind === 'kernel') { const tot = Math.hypot(s.tx - s.sx, s.ty - s.sy) || 1, done = 1 - Math.hypot(s.tx - s.x, s.ty - s.y) / tot; A.hdBall(c, x, y - Math.sin(Math.max(0, Math.min(1, done)) * Math.PI) * 34, 4.4, 4.4, '#ffd23f', { olk: .7 }); }
  else { c.save(); c.translate(x, y); c.rotate(Math.atan2(s.ty - s.y, s.tx - s.x)); c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1.2; for (let k = 0; k < 7; k++) { c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(k) * 6, Math.sin(k) * 6); c.stroke(); } A.hdLine(c, [0, 0, -12, 0], 'rgba(230,225,210,.9)', 1.4); c.restore(); }
}
function drawGhost(t) {
  const { i, j, ok } = ghost, [x, y] = cellCenter(i, j);
  ghost.t += 1 / 60;
  if (ok && ghost.trail) { const pts = ghost.trail.map(([a, b]) => cellCenter(a, b)); pts.unshift([W + 30, pts[0][1]]); c.save(); c.shadowColor = 'rgba(255,200,40,.9)'; c.shadowBlur = 8; A.strokePts(c, A.chaikin(pts, 3), 4, '#ffd23a', { dash: [10, 7] }); c.restore(); }
  c.save(); c.beginPath(); A.rrect(c, x - 19, y - 19, 38, 38, 10); c.fillStyle = ok ? 'rgba(140,255,120,.35)' : 'rgba(255,80,70,.4)'; c.fill(); c.lineWidth = 3; c.strokeStyle = ok ? '#ffffff' : '#ff4a3a'; c.stroke(); c.restore();
  if (PLANTS[sel].range) ring(x, y, PLANTS[sel].range[0] * CELL);
  c.save(); c.globalAlpha = ok ? .85 : .45; blit(plantSprite(sel, 1), x - 35, y + 14 - 66); c.restore();
  // buttons below the cell (above on the bottom row), the label above (below on the top row)
  const by = j < ROWS - 1 ? y + 38 : y - 38, ly = j === 0 ? y + 74 : j === ROWS - 1 ? y - 76 : y - 44;
  if (ok) {
    labelPill(T.gain(ghost.gain), x, ly, ghost.gain > 0 ? '#5cc23e' : '#8a9a7a', ghost.gain > 0 ? '#1f6a17' : '#4a5a3a');
    button(x - 22, by, 16, '#5cc23e', () => A.hdText(c, '✓', x - 22, by + 1, 18, '#fff', { stroke: '#1f5a14', sw: 3 }), confirmGhost);
    button(x + 22, by, 16, '#ff5a4a', () => A.hdText(c, '✕', x + 22, by + 1, 15, '#fff', { stroke: '#7a1010', sw: 3 }), () => { ghost = null; });
  } else labelPill(T.problem[ghost.problem] || '', x, ly, '#e2483a', '#7a1010');
}
function labelPill(txt, x, y, col, ol) {
  c.save(); c.font = '900 13px Nunito'; const w = Math.max(70, c.measureText(txt).width + 26); c.restore();
  const xx = Math.max(gx0 + w / 2, Math.min(W - w / 2 - 4, x));
  A.uiPanel(c, xx - w / 2, y - 13, w, 26, 13, col, { ol }); A.hdText(c, txt, xx, y, 13, '#fff', { stroke: ol, sw: 3.5 });
}
function button(x, y, r, col, drawIcon, fn, disabled = false) {
  A.uiRound(c, x, y, r, disabled ? '#9a9a90' : col, drawIcon);
  if (!disabled) ui.push({ x: x - r - 4, y: y - r - 4, w: r * 2 + 8, h: r * 2 + 8, fn });
}

// ---------- effects ----------
function drawFx(dt) {
  for (const f of fx) {
    f.t += dt; if (f.t < 0) continue; const k = f.t / f.life; if (k >= 1) continue;
    if (f.vx != null) { f.x += f.vx * dt; f.y += f.vy * dt; if (f.k !== 'ember') f.vy += 160 * dt; }
    c.save(); c.globalAlpha = Math.min(1, (1 - k) * 1.6);
    switch (f.k) {
      case 'dmg': A.hdText(c, f.txt, f.x, f.y - k * 22, f.red ? 18 : 13, f.red ? '#ff6a6a' : '#ffe14a', { stroke: '#5a1a08', sw: 4 }); break;
      case 'gain': A.hdText(c, f.txt, f.x, f.y - k * 26, 12, '#dff6ff', { stroke: '#2a6fa8', sw: 3.5 }); break;
      case 'star': A.fxStar(c, f.x, f.y, f.r * (1 - k * .5), '#ffffff'); break;
      case 'puff': case 'dust': c.beginPath(); c.arc(f.x, f.y, f.r * (1 + k), 0, A.TAU); c.fillStyle = f.k === 'dust' ? 'rgba(170,120,70,.55)' : 'rgba(255,255,255,.75)'; c.fill(); break;
      case 'kern': A.hdBall(c, f.x, f.y, 2.4, 2.4, '#ffd23f', { noOl: true, noSpec: true }); break;
      case 'crumb': c.beginPath(); c.arc(f.x, f.y, 2, 0, A.TAU); c.fillStyle = f.col; c.fill(); break;
      case 'fire': c.globalAlpha = 1 - k; A.fxFire(c, f.x, f.y, f.r * (.6 + k * .5)); break;
      case 'ember': c.beginPath(); c.arc(f.x, f.y, 2.2 * (1 - k), 0, A.TAU); c.fillStyle = '#ffb02e'; c.fill(); break;
      case 'spark': A.fxStar(c, f.x, f.y - k * 16, 5 * (1 - k), '#fff6a0'); break;
      case 'fly': { const tx = 30, ty = 24, e = k * k; const x = f.x + (tx - f.x) * e, y = f.y + (ty - f.y) * e - Math.sin(k * Math.PI) * 40; c.globalAlpha = 1; A.hdDrop(c, x, y, 7); break; }
      case 'flash': c.globalAlpha = 1; c.fillStyle = f.col + (.5 * (1 - k)) + ')'; c.fillRect(0, 0, W, H); break;
      case 'rain': { const y = f.y + k * H * 1.6; c.globalAlpha = .7; c.strokeStyle = 'rgba(190,230,255,.9)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(f.x, y); c.lineTo(f.x - 4, y + 14); c.stroke(); break; }
    }
    c.restore();
  }
  fx = fx.filter((f) => f.t < f.life);
}
function drawBanners(dt) {
  let topY = 64;
  for (const b of banners) {
    b.t += dt; const k = b.t / b.life; if (k >= 1) continue;
    const a = Math.min(1, b.t * 5, (1 - k) * 5);
    c.save(); c.globalAlpha = a;
    if (b.top) { c.font = `900 14px Nunito`; const w = c.measureText(b.text).width + 30, x = gx0 + COLS * CELL / 2; A.uiPanel(c, x - w / 2, topY - 15, w, 30, 15, '#fff3d6', { ol: '#6a3e1c' }); A.hdText(c, b.text, x, topY, 14, '#6a3e1c', { stroke: null }); topY += 38; }
    else { const s = 1 + Math.max(0, .3 - b.t) * 1.5; c.translate(gx0 + COLS * CELL / 2, H * .42); c.scale(s, s); A.hdText(c, b.text, 0, 0, 30, '#fff', { stroke: '#6a3a00', sw: 8, grad: ['#fff6a0', '#ffb02e'] }); }
    c.restore();
  }
  banners = banners.filter((b) => b.t < b.life);
}

// ---------- HUD ----------
function drawHud(t) {
  // dew
  A.uiPanel(c, 8, 7, 112, 32, 16, '#fff3d6', { ol: '#6a3e1c' });
  A.hdDrop(c, 28, 24, 8.5); A.hdText(c, String(game.dew), 76, 23, 20, '#ffffff', { stroke: '#2a6fa8', sw: 5 });
  // wave progress
  const ww = 244, wx = Math.max(130, Math.min(W / 2 - ww / 2, W - 330 - ww));
  A.uiPanel(c, wx, 9, ww, 26, 13, '#5a3a22', { ol: '#2a1a0e' });
  const done = game.phase === 'build' ? game.wave / game.waves : (game.wave - 1 + Math.min(1, game.waveTime / Math.max(1, (game.L.waves[game.wave - 1] || [[0, 1, 1, 0]]).reduce((s, [, n, gap, d]) => s + d + n * gap, 0)))) / game.waves;
  c.save(); c.beginPath(); A.rrect(c, wx + 5, 15, Math.max(14, (ww - 10) * done), 14, 7); const g = c.createLinearGradient(0, 15, 0, 29); g.addColorStop(0, '#a8f070'); g.addColorStop(1, '#4cb02e'); c.fillStyle = g; c.fill(); c.restore();
  for (let k = 1; k < game.waves; k++) { c.beginPath(); c.arc(wx + 5 + (ww - 10) * k / game.waves, 22, 2.6, 0, A.TAU); c.fillStyle = 'rgba(255,255,255,.55)'; c.fill(); }
  A.hdText(c, game.phase === 'build' ? `${T.build} · ${game.wave + 1} / ${game.waves}` : T.wave(game.wave, game.waves), wx + ww / 2, 22.5, 14, '#ffffff', { stroke: '#2a1a0e', sw: 4 });
  // fruit hp
  const hx = W - 204;
  A.uiPanel(c, hx, 7, 120, 32, 16, '#fff3d6', { ol: '#6a3e1c' });
  A.hdApple(c, hx + 18, 24, 10, {});
  c.save(); c.beginPath(); A.rrect(c, hx + 34, 17, 76, 13, 6.5); c.fillStyle = 'rgba(60,20,10,.25)'; c.fill();
  c.beginPath(); A.rrect(c, hx + 34, 17, Math.max(8, 76 * game.hp / game.maxHp), 13, 6.5); const hg = c.createLinearGradient(0, 17, 0, 30); hg.addColorStop(0, '#ff8a8a'); hg.addColorStop(1, '#e02c3a'); c.fillStyle = hg; c.fill(); c.restore();
  A.hdText(c, String(game.hp), hx + 72, 24, 11, '#fff', { stroke: '#7a1010', sw: 3 });
  button(W - 60, 23, 15, speed > 1 ? '#ff9a2a' : '#ffcf3a', (x, y) => A.hdText(c, '×' + speed, x, y + 1, 13, '#fff', { stroke: '#8a5a00', sw: 3.5 }), () => { speed = speed > 1 ? 1 : 2; });
  button(W - 22, 23, 15, '#7ac8ff', (x, y) => { c.save(); c.fillStyle = '#fff'; c.strokeStyle = '#1f5a8a'; c.lineWidth = 1.5; for (const dx of [-5, 2]) { c.beginPath(); A.rrect(c, x + dx, y - 6, 4, 12, 1.5); c.fill(); c.stroke(); } c.restore(); }, openPause);
  drawCards();
  // powers
  button(W - 86, H - 34, 21, '#8fd6ff', (x, y) => A.iconFrost(x, y, c), () => usePower(game, 'frost'), !game.powers.frost || game.phase !== 'wave');
  badge(W - 86, H - 34, 21, game.powers.frost);
  button(W - 34, H - 34, 21, '#4aa8ee', (x, y) => A.iconRain(x, y, c), () => usePower(game, 'rain'), !game.powers.rain);
  badge(W - 34, H - 34, 21, game.powers.rain);
  if (game.phase === 'build') drawWavePanel(t);
  if (pop) drawPop();
}
function badge(x, y, r, n) { if (!n) return; c.save(); c.beginPath(); c.arc(x + r * .72, y - r * .68, 9, 0, A.TAU); c.fillStyle = '#ff4646'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#fff'; c.stroke(); c.restore(); A.hdText(c, String(n), x + r * .72, y - r * .68 + .5, 11, '#fff', { stroke: null }); }
function drawCards() {
  const list = game.L.plants, n = list.length, top = 46, gap = 5, ch = Math.min(52, (H - top - 8 - gap * (n - 1)) / n), cw = 62;
  c.save(); c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 10; c.beginPath(); A.rrect(c, -14, top - 6, TRAY - 2, H - top + 20, 16);
  const tg = c.createLinearGradient(0, 0, TRAY, 0); tg.addColorStop(0, '#7a4a26'); tg.addColorStop(1, '#a8703c'); c.fillStyle = tg; c.fill(); c.restore();
  c.save(); c.beginPath(); A.rrect(c, -14, top - 6, TRAY - 2, H - top + 20, 16); c.lineWidth = 2.5; c.strokeStyle = '#4a2a12'; c.stroke(); c.restore();
  list.forEach((type, k) => {
    const P = PLANTS[type], on = sel === type, x = on ? 10 : 5, y = top + k * (ch + gap), poor = game.dew < P.cost;
    c.save(); if (on) { c.shadowColor = 'rgba(255,220,60,.95)'; c.shadowBlur = 14; }
    A.uiPanel(c, x, y, cw, ch, 11, on ? '#fff0b8' : '#fbe7c2', { ol: on ? '#c88a10' : '#7a4a22', olw: on ? 3 : 2 }); c.restore();
    c.save(); c.beginPath(); A.rrect(c, x + 2, y + 2, cw - 4, ch - 4, 9); c.clip(); const s = cardSprite(type), k2 = Math.min(1, ch / 52); c.translate(x + 2, y + ch - 52 * k2); c.scale(k2, k2); blit(s, 0, 0); c.restore();
    c.save(); c.beginPath(); A.rrect(c, x + cw - 31, y + ch - 17, 29, 15, 7.5); c.fillStyle = 'rgba(40,25,10,.8)'; c.fill(); c.restore();
    A.hdText(c, String(P.cost), x + cw - 16, y + ch - 9.5, 11, poor ? '#ff9a8a' : '#fff', { stroke: null }); A.hdDrop(c, x + cw - 35, y + ch - 10, 4);
    if (poor) { c.save(); c.beginPath(); A.rrect(c, x, y, cw, ch, 11); c.fillStyle = 'rgba(60,40,30,.35)'; c.fill(); c.restore(); }
    ui.push({ x: 0, y, w: TRAY, h: ch + gap, fn: () => selectCard(type) });
  });
}
function drawWavePanel(t) {
  const prev = wavePreview(game), pw = Math.max(250, 110 + prev.length * 62), ph = 56, x = gx0 + COLS * CELL / 2 - pw / 2, y = H - ph - 8;
  c.save(); c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 12; A.uiPanel(c, x, y, pw, ph, 18, '#fff3d6', { ol: '#6a3e1c', olw: 2.5 }); c.restore();
  prev.forEach(([k, n], i) => { const bx = x + 30 + i * 62, by = y + ph / 2; const s = bugSprite(k === 'rhino' ? 'rhino' : k, 0); c.save(); c.translate(bx, by); c.rotate(-Math.PI / 2); const sc = k === 'rhino' ? .45 : .8; c.scale(sc, sc); blit(s, -s.w / 2, -s.h / 2); c.restore(); A.hdText(c, '×' + n, bx + 22, by + 12, 13, '#fff', { stroke: '#6a3e1c', sw: 4 }); });
  const bw = 96, bx = x + pw - bw - 10, by = y + 12, pulse = 1 + Math.sin(t * 5) * .03;
  c.save(); c.translate(bx + bw / 2, by + 16); c.scale(pulse, pulse); c.shadowColor = 'rgba(80,200,40,.7)'; c.shadowBlur = 12; A.uiPanel(c, -bw / 2, -16, bw, 32, 16, '#5cc23e', { ol: '#1f6a17', olw: 2.5 }); c.restore();
  A.hdText(c, T.go, bx + bw / 2, by + 16, 17, '#fff', { stroke: '#1f5a14', sw: 4.5 });
  ui.push({ x: bx - 4, y: by - 4, w: bw + 8, h: 40, fn: () => { sel = null; ghost = null; pop = null; startWave(game); } });
}
function drawPop() {
  const p = pop, [x, y] = cellCenter(p.i, p.j), up = upgradeCost(p), yy = p.j > 0 ? y - 56 : y + 50;
  A.uiPanel(c, x - 62, yy - 26, 124, 52, 18, '#fff3d6', { ol: '#6a3e1c' });
  button(x - 30, yy, 17, up == null ? '#c8b070' : '#5cc23e', (bx, by) => { if (up == null) A.hdText(c, '★', bx, by + 1, 16, '#fff', { stroke: '#8a6a10', sw: 3 }); else { A.hdText(c, '⬆', bx, by - 4, 13, '#fff', { stroke: '#1f5a14', sw: 3 }); A.hdText(c, String(up), bx, by + 8, 10, '#fff', { stroke: '#1f5a14', sw: 3 }); } }, () => { upgrade(game, p); }, up == null || game.dew < up);
  button(x + 30, yy, 17, '#e0884a', (bx, by) => { A.hdText(c, '✕', bx, by - 4, 12, '#fff', { stroke: '#7a3a10', sw: 3 }); A.hdText(c, '+' + refund(p), bx, by + 8, 10, '#fff', { stroke: '#7a3a10', sw: 3 }); }, () => { removePlant(game, p); pop = null; });
  A.hdText(c, T.plant[p.type], x, yy - 34, 12, '#fff', { stroke: '#4a2a12', sw: 3.5 });
}

// ---------- input ----------
cv.addEventListener('pointerdown', (e) => {
  if (!game || paused) return;
  const x = e.clientX / scale, y = e.clientY / scale;
  for (let k = ui.length - 1; k >= 0; k--) { const u = ui[k]; if (x >= u.x && y >= u.y && x <= u.x + u.w && y <= u.y + u.h) { u.fn(); return; } }
  const i = Math.floor((x - gx0) / CELL), j = Math.floor((y - gy0) / CELL);
  if (i >= 0 && j >= 0 && i < COLS && j < ROWS) tapCell(i, j); else { ghost = null; pop = null; }
});
addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => { if (document.hidden && game && !paused && game.phase !== 'won' && game.phase !== 'lost') openPause(); });

// ---------- screens (HTML) ----------
const $ = (id) => document.getElementById(id);
function showHome(on) {
  $('home').hidden = !on;
  if (!on) return;
  paused = true;
  const grid = $('levels'); grid.innerHTML = '';
  LEVELS.forEach((L, n) => {
    const st = progress.stars[n] || 0, open = n === 0 || (progress.stars[n - 1] || 0) > 0;
    const b = document.createElement('button'); b.className = 'lv' + (st ? ' done' : ''); b.disabled = !open;
    b.innerHTML = `<b>${n + 1}</b><span>${L.name}</span><i>${open ? '★'.repeat(st) + '☆'.repeat(3 - st) : LOCK}</i>`;
    b.onclick = () => { goFullscreen(); startLevel(n); };
    grid.append(b);
  });
}
const LOCK = '<svg width="18" height="20" viewBox="0 0 18 20"><rect x="2" y="8" width="14" height="11" rx="3" fill="#8a6a4a"/><path d="M5 8V6a4 4 0 0 1 8 0v2" stroke="#8a6a4a" stroke-width="2.6" fill="none"/></svg>';
function showModal(html) { $('modal').hidden = !html; if (html) $('card').innerHTML = html; }
function openPause() {
  paused = true;
  showModal(`<h2>${T.pause}</h2><div class="row"><button class="btn" id="mResume">${T.resume}</button><button class="btn alt" id="mRestart">${T.restart}</button><button class="btn alt" id="mHome">${T.levels}</button></div>`);
  $('mResume').onclick = () => { showModal(null); paused = false; };
  $('mRestart').onclick = () => startLevel(levelIdx);
  $('mHome').onclick = () => { showModal(null); showHome(true); };
}
function endScreen(won) {
  paused = true;
  let st = 0; if (won) { st = stars(game); progress.stars[levelIdx] = Math.max(progress.stars[levelIdx] || 0, st); saveProgress(); }
  const hasNext = won && levelIdx + 1 < LEVELS.length;
  showModal(`<h1 class="${won ? 'win' : 'lose'}">${won ? T.won : T.lost}</h1>${won ? `<div class="stars">${'★'.repeat(st)}<s>${'★'.repeat(3 - st)}</s></div>` : ''}
    <p>${won ? `Жуков: ${game.stats.kills} · укусов: ${game.stats.bites}` : `Дошли до волны ${game.wave} из ${game.waves}`}</p>
    <div class="row">${hasNext ? `<button class="btn" id="mNext">${T.nextLevel}</button>` : ''}<button class="btn ${hasNext ? 'alt' : ''}" id="mAgain">${T.again}</button><button class="btn alt" id="mHome">${T.levels}</button></div>`);
  if (hasNext) $('mNext').onclick = () => startLevel(levelIdx + 1);
  $('mAgain').onclick = () => startLevel(levelIdx);
  $('mHome').onclick = () => { showModal(null); showHome(true); };
}
function goFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen && matchMedia('(pointer: coarse)').matches) {
    el.requestFullscreen({ navigationUI: 'hide' }).then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
  }
}
function drawLogo() {
  const k = 2, cnv = document.createElement('canvas'); cnv.width = 90 * k; cnv.height = 90 * k;
  const x = cnv.getContext('2d'); x.scale(k, k); A.hdApple(x, 45, 50, 32, { look: [.6, -.2] }); $('logo').src = cnv.toDataURL();
}

async function boot() {
  try { await document.fonts.load('900 16px Nunito'); } catch { /* font is optional */ }
  resize(); drawLogo(); showHome(true);
  game = createGame(0); paused = true; // a field behind the menu
  requestAnimationFrame(frame);
  if (new URLSearchParams(location.search).has('dev')) window.__fd = { get game() { return game; }, startLevel, set speed(v) { speed = v; } };
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
