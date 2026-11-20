// Drawing, input, HUD and screens. The game state lives in game.js; this file only shows it and turns taps into actions.
import * as A from './art.js';
import {
  createGame, step, place, placeProblem, blockingCells, previewTrail, trail, upgrade, upgradeCost, removePlant, refund,
  startWave, earlyBonus, wavePreview, usePower, collectDrop, stars, COLS, ROWS, BREAK,
} from './game.js';
import { PLANTS, BUGS, LEVELS } from './data.js';

const T = {
  wave: (n, m) => `Волна ${n} / ${m}`, go: 'В бой!', soon: (n, s) => `Волна ${n} через ${s} с`,
  plant: { pumpkin: 'Тыква', rose: 'Шиповник', clover: 'Клевер', corn: 'Кукуруза', mint: 'Мята', pepper: 'Перец', dandelion: 'Одуванчик' },
  eaten: { pumpkin: 'съедена', rose: 'съеден', clover: 'съеден', corn: 'съедена', mint: 'съедена', pepper: 'съеден', dandelion: 'съеден' },
  about: {
    pumpkin: 'Живая стена. Не стреляет, зато крепкая — из тыкв удобно строить лабиринт, чтобы жуки шли дольше.',
    rose: 'Стреляет шипами по одному жуку. Достаёт и летающих.',
    clover: 'Не воюет: время от времени даёт каплю росы. Тапни каплю, чтобы забрать сразу.',
    corn: 'Кидает зёрна навесом — попадает по нескольким жукам рядом. Летающих не достаёт.',
    mint: 'Холодит: жуки рядом ползут медленнее. Сама не бьёт — ставь рядом со стрелками.',
    pepper: 'Обжигает всех жуков вокруг себя и поджигает их. Бьёт только вблизи.',
    dandelion: 'Бьёт очень далеко и сильно, по летающим — вдвое.',
  },
  bug: { ant: 'Муравей', beetle: 'Бронзовка', caterpillar: 'Гусеница', grasshopper: 'Кузнечик', snail: 'Улитка', butterfly: 'Бабочка', rhino: 'Жук-носорог' },
  bugAbout: {
    ant: 'Обычный, зато их много.',
    beetle: 'В панцире: слабые удары почти не берут.',
    caterpillar: 'Грызёт растения рядом с тропинкой. Тыква держится дольше всех.',
    grasshopper: 'Быстрый, но хилый.',
    snail: 'Медленная и очень крепкая. Мята её не замедляет.',
    butterfly: 'Летит напрямик над лабиринтом. Бьют её шиповник, мята и одуванчик.',
    rhino: 'Босс: огромный и в броне.',
  },
  fresh: (list) => `Новое: ${list.join(', ')}. Зажми, чтобы узнать подробнее`, lvl: (n) => `уровень ${n}`,
  problem: { busy: 'Здесь занято', bug: 'Здесь жук', blocks: 'Нельзя закрыть жукам путь', poor: 'Не хватает росы' },
  gain: (n) => (n > 0 ? `путь +${n}` : n < 0 ? `путь ${n}` : 'путь тот же'),
  hint1: 'Тапни по траве и выбери растение — жуки пойдут в обход. Готов — жми ▶ у муравейника',
  holdHint: 'Зажми растение или жука — узнаешь, кто это',
  pick: 'Что посадить?', pickHint: 'Тапни растение — расскажу о нём',
  hint2: 'Дальше волны придут сами. Тапнешь ▶ раньше — получишь росу',
  zoomHint: 'Поле можно приблизить двумя пальцами',
  won: 'Яблоко спасено!', lost: 'Жуки съели яблоко', retry: 'Ещё раз', levels: 'Уровни', nextLevel: 'Дальше', resume: 'Продолжить',
  pause: 'Пауза', restart: 'Заново', waveDone: (b) => `Волна пройдена  +${b}`, early: (b) => `+${b} за смелость`,
  screams: ['Ай!', 'Ой-ой!', 'Больно!', 'Кусь?!', 'Ай-ай!'],
};

const CELL = 42, M = 10, MAXPX = 8e6; // M: world margin kept around the grid; MAXPX: field layer cap
// The canvas is made anew from code on every resize. With the <canvas> from the page itself, Chrome on iPhone showed
// the picture soft (as if at a third of the resolution), however the canvas was sized; a canvas made by script is sharp.
let cv = document.getElementById('cv'), c = null;
// Two coordinate spaces: the world (the field, CELL = 42 per cell, origin at the field's top-left corner) and the UI
// (HUD, shelf, panels). Each has its own scale: the field always fits whole (fit) and can be zoomed in up to zmax.
let dpr = 1, uk = 1, ws = 1, fit = 1, zoom = 1, zmax = 1, UW = 844, UH = 390, ox = 0, oy = 0, camX = 0, camY = 0, PORT = null, DEW = [28, 24];
let FA = [0, 0, 1, 1], VB = [0, 0, 1, 1], SPACE = 'u', tk = 0, zoomT = 0;
let game = null, levelIdx = 0, speed = 1, paused = true, now = 0;
let sel = null, ghost = null, pop = null, blockCache = null;
let fx = [], banners = [], terrain = null, grassLayer = null, terrainDirty = true;
const sprites = new Map(), angles = new Map(), anim = new Map();
const ui = []; // tap targets rebuilt every frame: {x, y, w, h, fn, s: 'u' | 'w'}
let ufx = []; // effects in UI space

const progress = JSON.parse(localStorage.getItem('fruit.progress') || '{"stars":[]}');
const saveProgress = () => localStorage.setItem('fruit.progress', JSON.stringify(progress));

// ---------- geometry ----------
// Landscape: the grid as it is, entrance on the right. Portrait: the grid turned a quarter, entrance at the top,
// fruit at the bottom. Game coordinates (x along the 18 columns, y along the 8 rows) map to logical screen pixels.
const sp = (x, y) => (PORT ? [y * CELL, (COLS - x) * CELL] : [x * CELL, y * CELL]);
const cellCenter = (i, j) => sp(i + .5, j + .5);
const FW = () => (PORT ? ROWS : COLS) * CELL, FH = () => (PORT ? COLS : ROWS) * CELL;
function cellAt(x, y) { const a = Math.floor(x / CELL), b = Math.floor(y / CELL); return PORT ? [COLS - 1 - b, a] : [a, b]; }
const screenAngle = (vx, vy) => (PORT ? Math.atan2(-vx, vy) : Math.atan2(vy, vx));
const offEntry = (first) => (PORT ? [first[0], -60] : [FW() + 40, first[1]]);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// HUD bands in UI units: portrait has a row on top and one at the bottom, landscape a column on each side
const PTOP = 46, PBOT = 52, LLEFT = 104, LRIGHT = 52;
// room kept free, in UI units: TOPY above the portrait top row, BOTY below the bottom buttons, CORN at the sides of the
// portrait bottom row (rounded screen corners of the home-screen app)
let TOPY = 0, BOTY = 0, CORN = 0;
// The phone's safe areas (notch, home bar) in CSS px, read from CSS env() through a probe element.
function safeInsets() {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.append(d); const cs = getComputedStyle(d), v = (k) => parseFloat(cs[k]) || 0;
  const r = { t: v('paddingTop'), r: v('paddingRight'), b: v('paddingBottom'), l: v('paddingLeft') }; d.remove(); return r;
}
const toUI = (wx, wy) => [(ox + wx * ws) / uk, (oy + wy * ws) / uk];
const faUI = () => FA.map((v) => v / uk); // field area in UI units
// The camera keeps the grid (with its margin) covering the field area when zoomed in, and centred when it fits.
function applyCam() {
  ws = fit * zoom;
  const vw = FA[2] / ws, vh = FA[3] / ws, gw = FW() + 2 * M, gh = FH() + 2 * M;
  camX = gw <= vw ? FW() / 2 : clamp(camX, -M + vw / 2, FW() + M - vw / 2);
  camY = gh <= vh ? FH() / 2 : clamp(camY, -M + vh / 2, FH() + M - vh / 2);
  ox = FA[0] + FA[2] / 2 - camX * ws; oy = FA[1] + FA[3] / 2 - camY * ws;
}
// zoom to z keeping the world point under the screen point (px, py) in place
function zoomTo(z, px, py, wx = (px - ox) / ws, wy = (py - oy) / ws) {
  zoom = clamp(z, 1, zmax); ws = fit * zoom;
  camX = wx + (FA[0] + FA[2] / 2 - px) / ws; camY = wy + (FA[1] + FA[3] / 2 - py) / ws;
  applyCam(); zoomT = performance.now();
}
// world rect of the field area that is on screen now
const visField = () => [(FA[0] - ox) / ws, (FA[1] - oy) / ws, FA[2] / ws, FA[3] / ws];
function resize() {
  const vw = innerWidth, vh = innerHeight, was = PORT;
  PORT = vh > vw;
  dpr = Math.min(pixelRatio(vw), 5); seen = [vw, vh, devicePixelRatio, visualViewport?.scale || 1];
  uk = PORT ? clamp(Math.min(vw / 340, vh / 560), 1, 1.8) : clamp(Math.min(vw / 740, vh / 340), 1, 1.8);
  UW = vw / uk; UH = vh / uk;
  const n = document.createElement('canvas'); n.id = 'cv';
  n.width = Math.round(vw * dpr); n.height = Math.round(vh * dpr); n.style.width = vw + 'px'; n.style.height = vh + 'px';
  c = n.getContext('2d'); cv.replaceWith(n); free(cv); cv = n; bindCanvas();
  // the field area: everything but the HUD bands
  const gw = FW() + 2 * M, gh = FH() + 2 * M;
  // An iPhone home-screen app blurs the top of the page under the status bar: keep the top row below that.
  const ins = safeInsets(), edge = PORT && navigator.standalone ? 36 : 0;
  // the home-screen app also has its rounded screen corners and the home bar right at the page's bottom
  const app = !!navigator.standalone;
  TOPY = PORT ? (ins.t + edge) / uk : 0; BOTY = Math.max(app ? 14 : 0, ins.b - 8) / uk; CORN = app ? 10 : 0;
  // landscape: equal bands on both sides, so the field sits in the middle of the screen
  const side = Math.max(LLEFT, LRIGHT) * uk;
  FA = PORT ? [6, (TOPY + PTOP) * uk, vw - 12, vh - (TOPY + PTOP + PBOT + BOTY) * uk] : [side, 6, vw - side * 2, vh - 12];
  fit = Math.min(FA[2] / gw, FA[3] / gh);
  zmax = clamp(58 / (CELL * fit), 1, 3); // up to cells of about 58 CSS px
  if (was !== PORT) zoom = 1;
  zoom = clamp(zoom, 1, zmax);
  // world area to paint: the whole screen with the field fitted; zoomed views stay inside it
  const x0 = FA[0] + FA[2] / 2 - FW() / 2 * fit, y0 = FA[1] + FA[3] / 2 - FH() / 2 * fit;
  VB = [-x0 / fit - 4, -y0 / fit - 4, vw / fit + 8, vh / fit + 8];
  applyCam();
  dropLayers();
}
function dropLayers() { for (const v of sprites.values()) free(v.cnv); sprites.clear(); free(grassLayer); grassLayer = null; terrainDirty = true; }
const terrainK = () => Math.min(ws * dpr, Math.sqrt(MAXPX / (VB[2] * VB[3])));
// iOS counts canvas memory until garbage collection, so give the pixels back right away
// Real device pixels per CSS pixel. Chrome on iOS with page zoom narrows the page but keeps devicePixelRatio, and
// pinch zoom enlarges the canvas without telling it: both would make the picture soft.
function pixelRatio(vw) {
  let r = (devicePixelRatio || 1) * Math.max(1, visualViewport?.scale || 1);
  if (matchMedia('(pointer: coarse)').matches && screen.width) {
    const sw = PORT ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height), z = sw / vw;
    if (z > 1.02 && z < 3) r *= z;
  }
  return r;
}
function free(cnv) { if (cnv && cnv.width) { cnv.width = 0; cnv.height = 0; } }
let seen = [0, 0, 0, 1];
function layer(w, h, k = Math.max(ws, uk) * dpr) {
  const cnv = document.createElement('canvas');
  cnv.width = Math.ceil(w * k); cnv.height = Math.ceil(h * k);
  const x = cnv.getContext('2d'); x.setTransform(k, 0, 0, k, 0, 0); return [cnv, x];
}
const setWorld = () => { c.setTransform(dpr * ws, 0, 0, dpr * ws, dpr * ox, dpr * oy); SPACE = 'w'; };
const setUI = () => { c.setTransform(dpr * uk, 0, 0, dpr * uk, 0, 0); SPACE = 'u'; };
function sprite(key, w, h, draw) {
  let s = sprites.get(key);
  if (!s) { const [cnv, x] = layer(w, h); draw(x); s = { cnv, w, h }; sprites.set(key, s); }
  return s;
}
const blit = (s, x, y) => c.drawImage(s.cnv, x, y, s.w, s.h);

// ---------- terrain ----------
function buildGrass() {
  const [cnv, x] = layer(VB[2], VB[3], tk); A.setView(VB[2], VB[3]);
  A.hdGrass(x, { seed: 5 + levelIdx }); A.hdBorderBushes(x, 2 + levelIdx); grassLayer = cnv;
}
function buildTerrain() {
  const want = terrainK();
  if (Math.abs(want - tk) > 1e-3) { for (const v of sprites.values()) free(v.cnv); sprites.clear(); free(grassLayer); grassLayer = null; } // new scale: redo all
  tk = want; if (!grassLayer) buildGrass();
  const k = tk, [cnv, x] = layer(VB[2], VB[3], k); A.setView(VB[2], VB[3]);
  x.drawImage(grassLayer, 0, 0, VB[2], VB[3]);
  x.setTransform(k, 0, 0, k, -VB[0] * k, -VB[1] * k); // world coordinates from here
  const cells = trail(game), pts = cells.map(([i, j]) => cellCenter(i, j));
  pts.unshift(offEntry(pts[0]));
  A.hdPath(x, A.chaikin(pts, 3), 30, 1 + levelIdx);
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    const o = game.grid[j][i]; if (!o) continue; const [cx, cy] = cellCenter(i, j);
    if (o.obstacle === 'rock') A.hdRock(x, cx, cy + 4, 1);
    else if (o.obstacle === 'stump') A.hdStump(x, cx, cy + 4, 15);
    else if (o.obstacle === 'log' && game.grid[j][i + 1]?.obstacle === 'log') {
      const [nx, ny] = cellCenter(i + 1, j); x.save(); x.translate((cx + nx) / 2, (cy + ny) / 2 + 4); if (PORT) x.rotate(-Math.PI / 2); A.hdLog(x, 0, 0, CELL * 2 - 8); x.restore();
    }
    else if (o.type) A.hdSoil(x, cx, cy + 15);
  }
  const [fx0, fy0] = cellCenter(...game.fruit); A.hdStump(x, fx0, fy0 + 12, 23);
  const [ex, ey] = cellCenter(...game.entry); if (PORT) A.hdAnthill(x, ex, ey - 14, 1); else A.hdAnthill(x, ex + 16, ey + 4, 1);
  x.setTransform(k, 0, 0, k, 0, 0);
  A.hdDapple(x); A.hdSun2(x); A.hdGrade(x); A.hdVignette(x);
  // a little more colour; done here, not as a CSS filter on the canvas: Safari renders filtered canvases blurry
  free(terrain);
  if ('filter' in x) { const [pop, y] = layer(VB[2], VB[3], k); y.filter = 'saturate(1.12) contrast(1.04)'; y.drawImage(cnv, 0, 0, VB[2], VB[3]); free(cnv); terrain = pop; } else terrain = cnv;
  terrainDirty = false; blockCache = null;
}

// ---------- sprites ----------
const plantSprite = (type, lvl) => sprite(`p:${type}:${lvl}`, 70, 84, (x) => A.hdPlant(x, type, 35, 66, 1, { noShadow: true, lvl: lvl > 1 ? lvl : 0 }));
const BUG_SIZE = { rhino: 2.1, snail: 1.25, beetle: 1.15 }, BUG_K = .78;
// Walking bugs keep a small fixed offset from the trail's middle, so a faster bug visibly passes a slower one.
const LANE = [-.17, .17, 0, -.09, .09];
function bugPos(b) { if (b.fly) return sp(b.x, b.y); const a = LANE[b.id % 5], d = LANE[(b.id * 3 + 1) % 5]; return sp(b.x + d, b.y + a); }
function bugSprite(kind, frame) {
  const s = (BUG_SIZE[kind] || 1) * BUG_K, box = Math.ceil(64 * s);
  return sprite(`b:${kind}:${frame}`, box, box, (x) => {
    A.setLeg(frame ? .8 : -.8);
    const k = kind === 'rhino' ? 'beetle' : kind;
    A.hdBug(x, k, box / 2, box / 2, 0, s, { noShadow: true, ph: frame * 1.6, flap: frame ? .55 : 1, color: kind === 'rhino' ? '#8a3ad0' : undefined });
    if (kind === 'rhino') { x.save(); x.translate(box / 2, box / 2); x.scale(s, s); A.hdBlob(x, (cc) => { cc.moveTo(14, -2); cc.quadraticCurveTo(22, -3, 23, -9); cc.quadraticCurveTo(20, -1, 14, 2); cc.closePath(); }, '#5a2a8a', 18, -3, 5); x.restore(); }
    A.setLeg(0);
  });
}
const appleBody = (bitten) => sprite(`appleBody:${bitten}`, 70, 70, (x) => A.hdApple(x, 35, 38, 24, { bite: bitten, noFace: true }));

// ---------- game flow ----------
function startLevel(n) {
  levelIdx = n; game = createGame(n, Date.now() & 0xffff); resize();
  sel = ghost = pop = null; fx = []; banners = []; appleMood('idle', 0); angles.clear(); anim.clear(); speed = 1;
  grassLayer = null; terrainDirty = true; paused = false;
  showHome(false); showModal(null); ufx = []; zoom = 1; applyCam(); dropLayers();
  if (zmax > 1.4 && matchMedia('(pointer: coarse)').matches && !localStorage.getItem('fruit.zoomHint')) { banner(T.zoomHint, 5, true); localStorage.setItem('fruit.zoomHint', '1'); }
  if (n === 0) banner(T.hint1, 9, true);
  else {
    const plants = LEVELS[n].plants.filter((p) => !LEVELS[n - 1].plants.includes(p));
    const seen = new Set(LEVELS.slice(0, n).flatMap(bugsOf)), bugs = bugsOf(LEVELS[n]).filter((b) => !seen.has(b));
    if (plants.length || bugs.length) banner(T.fresh([...plants.map((p) => T.plant[p]), ...bugs.map((b) => T.bug[b])].map((w) => w.toLowerCase())), 7, true);
  }
  if (!localStorage.getItem('fruit.holdHint')) { banner(T.holdHint, 7, true); localStorage.setItem('fruit.holdHint', '1'); }
}
const bugsOf = (L) => [...new Set(L.waves.flat().map((w) => w[0]))];
function bugStats(kind, b) {
  const B = BUGS[kind], out = [];
  out.push(b ? `здоровье ${Math.ceil(b.hp)} / ${b.maxHp}` : `здоровье ${Math.round(B.hp * (1 + game.L.hpGrowth * game.wave))}`); // as in the next wave
  out.push(B.speed >= 1.3 ? 'быстрый' : B.speed <= .5 ? 'очень медленный' : B.speed < .8 ? 'медленный' : 'обычная скорость');
  if (B.armor) out.push(`броня ${B.armor}`);
  if (B.fly) out.push('летает');
  out.push(`кусает на ${B.bite}`, `+${B.reward} росы`);
  return out;
}
function statLine(type, l = 1) {
  const P = PLANTS[type], out = [], v = (a) => a[l - 1];
  if (P.dmg) out.push(`урон ${v(P.dmg)}`);
  if (P.range) out.push(`дальность ${v(P.range)}`);
  if (P.rate) out.push(v(P.rate) >= 1 ? `${v(P.rate)} выстр./с` : `раз в ${(1 / v(P.rate)).toFixed(1)} с`);
  if (P.slow) out.push(`замедляет на ${Math.round(v(P.slow) * 100)}%`);
  if (P.value) out.push(`+${v(P.value)} росы раз в ${v(P.period)} с`);
  if (type === 'pumpkin') out.push(`прочность ${v(P.hp)}`);
  if (P.range && !P.slow) out.push(P.air ? 'бьёт летающих' : 'летающих не бьёт');
  return out;
}
function banner(text, life = 2, top = false) { banners.push({ text, t: 0, life, top }); }
// Planting: tap a free cell, a menu of plants pops up next to it. Picking a plant shows it on the cell with the new
// trail; tapping the same plant (or the cell) again plants it. The last plant stays picked for the next cell.
function openPick(i, j) {
  pop = null; banners = banners.filter((b) => !b.top); blockCache = null;
  ghost = { i, j, t: 0 }; if (sel && game.dew >= PLANTS[sel].cost) choose(sel, false);
}
function choose(type, confirm = true) {
  if (!ghost) return;
  if (confirm && ghost.type === type && ghost.ok) { confirmGhost(); return; }
  sel = type; const { i, j } = ghost;
  const problem = placeProblem(game, i, j) || (game.dew < PLANTS[type].cost ? 'poor' : null);
  const tr = problem ? null : previewTrail(game, i, j);
  Object.assign(ghost, { type, ok: !problem, problem, trail: tr, gain: tr ? tr.length - trail(game).length : 0 });
}
function tapCell(i, j) {
  const p = game.grid[j]?.[i];
  if (p && p.type) { ghost = null; pop = pop === p ? null : p; return; }
  pop = null;
  if (p || (i === game.fruit[0] && j === game.fruit[1]) || (i === game.entry[0] && j === game.entry[1])) { ghost = null; return; }
  if (ghost && ghost.i === i && ghost.j === j) { if (ghost.type && ghost.ok) confirmGhost(); else ghost = null; return; }
  openPick(i, j);
}
function confirmGhost() {
  if (!ghost || !ghost.type) return;
  if (place(game, ghost.type, ghost.i, ghost.j)) { terrainDirty = true; ghost = null; }
  else { ghost.ok = false; ghost.problem = placeProblem(game, ghost.i, ghost.j) || 'poor'; }
}

// ---------- events -> effects ----------
function handleEvents() {
  for (const e of game.events) {
    switch (e.t) {
      case 'hit': if (e.src !== 'burn') { const [x, y] = bugPos(e.b); fx.push({ k: 'dmg', x: x + (Math.random() - .5) * 10, y: y - 18, t: 0, life: .7, txt: `-${Math.round(e.dmg)}` }); fx.push({ k: 'star', x, y: y - 4, t: 0, life: .18, r: 9 }); } break;
      case 'kill': { const [x, y] = bugPos(e.b); for (let n = 0; n < 7; n++) fx.push({ k: 'puff', x, y, vx: (Math.random() - .5) * 60, vy: (Math.random() - .5) * 60 - 10, t: 0, life: .45, r: 3 + Math.random() * 3 }); fx.push({ k: 'gain', x, y: y - 10, t: 0, life: .8, txt: `+${e.reward}` }); angles.delete(e.b.id); break; }
      case 'splash': { const [x, y] = sp(e.x, e.y); for (let n = 0; n < 8; n++) fx.push({ k: 'kern', x, y, vx: (Math.random() - .5) * 90, vy: -30 - Math.random() * 50, t: 0, life: .4 }); break; }
      case 'fire': { const [x, y] = cellCenter(e.p.i, e.p.j); fx.push({ k: 'fire', x, y, t: 0, life: .45, r: PLANTS.pepper.range[e.p.lvl - 1] * CELL }); bump(e.p, .2); break; }
      case 'shoot': bump(e.p, .12); break;
      case 'bite': { angles.delete(e.b.id); const [x, y] = cellCenter(...game.fruit); fx.push({ k: 'dmg', x: x + 20, y: y - 30, t: 0, life: .9, txt: `-${BUGS[e.b.kind].bite}`, red: true }); appleMood('scream', .9); appleSay(T.screams[Math.floor(Math.random() * T.screams.length)]); break; }
      case 'collect': { const [x, y] = toUI(...sp(e.d.x, e.d.y)); ufx.push({ k: 'fly', x, y, t: 0, life: .5 }); break; }
      case 'place': bump(e.p, .35, true); dust(e.p); terrainDirty = true; break;
      case 'upgrade': { const [x, y] = cellCenter(e.p.i, e.p.j); for (let n = 0; n < 6; n++) fx.push({ k: 'spark', x: x + (Math.random() - .5) * 30, y: y - 10 - Math.random() * 30, t: n * .05, life: .5 }); bump(e.p, .3, true); break; }
      case 'sell': case 'plantDead': dust(e.p); terrainDirty = true; if (pop === e.p) pop = null; if (e.t === 'plantDead') banner(`${T.plant[e.p.type]} ${T.eaten[e.p.type]}!`, 1.4); break;
      case 'chew': { const [x, y] = cellCenter(e.p.i, e.p.j); for (let n = 0; n < 6; n++) fx.push({ k: 'crumb', x, y: y - 6, vx: (Math.random() - .5) * 50, vy: -20 - Math.random() * 30, t: 0, life: .5, col: e.p.type === 'pumpkin' ? '#f7a23a' : '#6cc04a' }); bump(e.p, .2); break; }
      case 'wave': banner(T.wave(e.n, game.waves), 1.4); if (AP.mood === 'happy') appleMood('idle', 0); break;
      case 'waveDone': appleMood('happy', 2.6); appleCheer(); banner(T.waveDone(e.bonus), 1.8); if (levelIdx === 0 && e.n === 1) banner(T.hint2, 6, true); break;
      case 'early': ufx.push({ k: 'gain', x: GOB[0] + GOB[2] / 2, y: GOB[1] - 8, t: 0, life: 1.2, txt: T.early(e.bonus) }); break;
      case 'power': if (e.kind === 'frost') ufx.push({ k: 'flash', t: 0, life: .6, col: 'rgba(190,240,255,' }); else for (let n = 0; n < 70; n++) ufx.push({ k: 'rain', x: Math.random() * UW, y: -Math.random() * UH, t: 0, life: 1.2 }); break;
      case 'won': case 'lost': { if (e.t === 'won') appleCheer(); const g = game; setTimeout(() => { if (game === g) endScreen(e.t === 'won'); }, 900); break; }
    }
  }
  game.events.length = 0;
}
function heart(x, y, r) {
  c.beginPath(); c.moveTo(x, y + r * .9); c.bezierCurveTo(x - r * 1.6, y - r * .1, x - r * .7, y - r * 1.3, x, y - r * .45); c.bezierCurveTo(x + r * .7, y - r * 1.3, x + r * 1.6, y - r * .1, x, y + r * .9);
  c.fillStyle = '#ff5a7a'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = '#a01838'; c.stroke();
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
  if (innerWidth !== seen[0] || innerHeight !== seen[1] || devicePixelRatio !== seen[2] || (visualViewport?.scale || 1) !== seen[3]) resize();
  // after a zoom settles, redraw the field and sprites at the new scale (while zooming they are stretched)
  if (terrain && !pinch && Math.abs(terrainK() - tk) > 1e-3 && performance.now() - zoomT > 220) dropLayers();
  if (game) draw(paused ? 0 : dt);
  requestAnimationFrame(frame);
}

function draw(dt) {
  if (terrainDirty) buildTerrain();
  ui.length = 0;
  // the field layer is copied pixel for pixel at a whole-pixel offset: any resampling would soften it
  c.setTransform(1, 0, 0, 1, 0, 0);
  const k = ws * dpr, tx = dpr * (ox + VB[0] * ws), ty = dpr * (oy + VB[1] * ws);
  if (Math.abs(k - tk) < 1e-3) c.drawImage(terrain, Math.round(tx), Math.round(ty));
  else c.drawImage(terrain, tx, ty, terrain.width * k / tk, terrain.height * k / tk);
  setWorld();
  const t = now / 1000;
  if (ghost) drawGrid();
  if (pop && PLANTS[pop.type].range) ring(...cellCenter(pop.i, pop.j), PLANTS[pop.type].range[pop.lvl - 1] * CELL);

  // depth-sorted things on the ground
  const items = [];
  for (const p of game.plants) items.push([cellCenter(p.i, p.j)[1] + 14, () => drawPlant(p, t)]);
  for (const b of game.bugs) if (!b.fly) items.push([bugPos(b)[1], () => drawBug(b, t, dt)]);
  const [fxx, fyy] = cellCenter(...game.fruit); items.push([fyy + 12, () => drawApple(fxx, fyy, dt)]);
  items.sort((a, b) => a[0] - b[0]); for (const [, f] of items) f();
  for (const p of game.plants) if (p.hp < p.maxHp) { const [x, y] = cellCenter(p.i, p.j); A.hdHp(c, x, y - 32, 28, p.hp / p.maxHp, '#ffb03a'); }
  if (ghost) drawGhost(t);
  for (const d of game.drops) drawDrop(d, t);
  for (const s of game.shots) drawShot(s);
  for (const b of game.bugs) if (b.fly) drawBug(b, t, dt);
  for (const b of game.bugs) if (b.hp < b.maxHp) { const [x, y] = bugPos(b); A.hdHp(c, x, y - (b.kind === 'rhino' ? 34 : 18), b.kind === 'rhino' ? 44 : 20, b.hp / b.maxHp, b.kind === 'rhino' ? '#ff5a5a' : '#7be05a'); }
  drawFx(dt, fx);
  setUI();
  drawFx(dt, ufx);
  drawHud(t);
  if (game.phase === 'build') { GOB = goLayout(); GO = [GOB[0] + GO_DX, GOB[1] + GOB[3] / 2]; } // before the banners: they keep clear of it
  drawBanners(dt);
  if (game.phase === 'build') goIcon(t); // over the hints: they talk about it
  if (ghost) drawPicker(t);
  if (pop) drawPop();
  if (tip) drawTip();
}
function vignette() { const g = c.createRadialGradient(UW / 2, UH / 2, Math.min(UW, UH) * .45, UW / 2, UH / 2, Math.max(UW, UH) * .62); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(20,40,10,.3)'); c.fillStyle = g; c.fillRect(0, 0, UW, UH); }
function ring(x, y, r) { c.save(); c.beginPath(); c.arc(x, y, r, 0, A.TAU); c.fillStyle = 'rgba(255,255,255,.13)'; c.fill(); c.setLineDash([8, 6]); c.lineWidth = 2.2; c.strokeStyle = 'rgba(255,255,255,.85)'; c.stroke(); c.restore(); }
function drawGrid() {
  if (game.phase === 'wave' && Math.floor(now / 500) !== blockCache?.tick) blockCache = null;
  if (!blockCache) { blockCache = new Set(blockingCells(game).map(([i, j]) => i + ',' + j)); blockCache.tick = Math.floor(now / 500); if (ghost?.type) choose(ghost.type, false); } // the field changed: refresh the preview too
  if (!blockCache) blockCache = new Set(blockingCells(game).map(([i, j]) => i + ',' + j));
  c.save();
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    if (game.grid[j][i] || (i === game.fruit[0] && j === game.fruit[1]) || (i === game.entry[0] && j === game.entry[1])) continue;
    const bad = blockCache.has(i + ',' + j), [cx, cy] = cellCenter(i, j), x = cx - CELL / 2, y = cy - CELL / 2;
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
  const [x, y] = bugPos(b), target = screenAngle(b.vx, b.vy);
  let a = angles.get(b.id); if (a == null) a = target;
  let d = target - a; while (d > Math.PI) d -= A.TAU; while (d < -Math.PI) d += A.TAU; a += d * Math.min(1, dt * 10); angles.set(b.id, a);
  const moving = !(b.frozen > 0) && !(b.chew > 0), fr = moving ? Math.floor(t * (b.kind === 'butterfly' ? 10 : 7) + b.id) % 2 : 0;
  const s = bugSprite(b.kind, fr), sc = (BUG_SIZE[b.kind] || 1) * BUG_K / 1.12;
  const lift = b.fly ? 16 : 0;
  c.save(); c.globalAlpha = b.fly ? .18 : .25; c.beginPath(); c.ellipse(x + 3 + lift * .6, y + 5 + lift, 15 * sc, 8 * sc, 0, 0, A.TAU); c.fillStyle = '#183008'; c.fill(); c.restore();
  if (b.slow < 1 && !b.fly) { c.save(); c.beginPath(); c.ellipse(x, y + 4, 17 * sc, 10 * sc, 0, 0, A.TAU); c.fillStyle = 'rgba(170,235,255,.35)'; c.fill(); c.restore(); }
  c.save(); c.translate(x, y - (b.fly ? Math.sin(t * 6 + b.id) * 3 : 0)); c.rotate(a + (b.chew > 0 ? Math.sin(t * 30) * .12 : 0));
  if (b.hit > 0) c.filter = 'brightness(1.8)';
  blit(s, -s.w / 2, -s.h / 2); c.restore();
  if (b.frozen > 0) A.fxIced(c, x, y, 13 * sc);
  if (b.burn > 0 && Math.random() < .4) fx.push({ k: 'ember', x: x + (Math.random() - .5) * 14, y: y - 4, vx: 0, vy: -30, t: 0, life: .35 });
}
// ---------- the apple ----------
// The apple watches the nearest bug, gets scared as bugs come close, screams when bitten, jumps for joy when a wave is
// beaten and cries when the level is lost. The body is a cached sprite, the face is drawn live.
const AP = { mood: 'idle', mt: 0, blink: 2, look: [1, 0], t: 0 }; // t: the apple's own clock, stopped on pause
function appleMood(mood, life) { AP.mood = mood; AP.mt = life; }
function appleSay(text) { const [x, y] = cellCenter(...game.fruit); fx = fx.filter((f) => f.k !== 'say'); fx.push({ k: 'say', x, y: y - 46, t: 0, life: 1, txt: text }); }
function appleCheer() {
  const [x, y] = cellCenter(...game.fruit);
  for (let n = 0; n < 10; n++) { const a = n / 10 * A.TAU; fx.push({ k: 'spark', x: x + Math.cos(a) * 26, y: y - 14 + Math.sin(a) * 22, t: n * .04, life: .7 }); }
  fx.push({ k: 'heart', x: x - 18, y: y - 30, t: .1, life: 1.3 }); fx.push({ k: 'heart', x: x + 20, y: y - 36, t: .35, life: 1.3 });
}
function drawApple(x, y, dt) {
  AP.t += dt; const t = AP.t;
  if (AP.mt > 0) AP.mt -= dt;
  if (game.phase === 'won') AP.mood = 'happy'; else if (game.phase === 'lost') AP.mood = 'sad'; else if (AP.mt <= 0) AP.mood = 'idle';
  const cy = y - 9; // the apple's centre (the sprite stands on the stump at y + 12)
  let nb = null, nd = 1e9;
  for (const b of game.bugs) { const [bx, by] = bugPos(b), d = Math.hypot(bx - x, by - cy); if (d < nd) { nd = d; nb = [bx, by]; } }
  const fear = AP.mood === 'idle' && nb ? clamp((3.8 - nd / CELL) / 2.6, 0, 1) : 0;
  // eyes: on the nearest bug, else a lazy look around
  let tx = Math.sin(t * .7) * .7, ty = Math.sin(t * .43) * .4;
  if (nb) { const l = Math.hypot(nb[0] - x, nb[1] - cy) || 1; tx = (nb[0] - x) / l; ty = (nb[1] - cy) / l; }
  const e = Math.min(1, dt * 9); AP.look[0] += (tx - AP.look[0]) * e; AP.look[1] += (ty - AP.look[1]) * e;
  AP.blink -= dt; if (AP.blink < -.13) AP.blink = 1.8 + Math.random() * 3.2;
  // the body: breathing, jumping, trembling, stretching in a scream
  let dx = 0, dy = 0, sx = 1, sy = 1; const br = Math.sin(t * 2.4) * .018; sx -= br; sy += br;
  if (AP.mood === 'happy') { const h = Math.abs(Math.sin(t * 7)); dy = -h * 10; const land = h < .2 ? 1 - h / .2 : 0; sx += land * .12; sy -= land * .14; }
  else if (AP.mood === 'scream') { const k = Math.min(1, AP.mt * 3); dx = Math.sin(t * 70) * 2.6 * k; sx -= .08 * k; sy += .12 * k; }
  else if (AP.mood === 'sad') { sx += .04; sy -= .05; }
  else if (fear) { dx = Math.sin(t * 48) * fear * 1.5; sy -= fear * .04; }
  c.save(); c.translate(x + dx, y + 12 + dy); c.scale(sx, sy);
  blit(appleBody(game.hp < game.maxHp), -35, -59);
  c.translate(0, -21); appleFace(24, AP.mood, fear, t);
  c.restore();
}
function appleFace(r, mood, fear, t) {
  const ink = '#4a1010', L = AP.look, blink = AP.blink < 0, eyes = [[-r * .25, -r * .04], [r * .22, -r * .04]], er = r * .2;
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = ink;
  // blush
  c.save(); c.globalAlpha = mood === 'happy' ? .75 : .5; for (const sg of [-1, 1]) { c.beginPath(); c.ellipse(sg * r * .45, r * .25, r * .13, r * .075, 0, 0, A.TAU); c.fillStyle = '#ff8f98'; c.fill(); } c.restore();
  // eyes
  c.lineWidth = 2;
  for (const [ex, ey] of eyes) {
    if (mood === 'happy') { c.beginPath(); c.arc(ex, ey + er * .35, er * .8, Math.PI + .35, -.35); c.stroke(); continue; } // ^ ^
    if (mood === 'scream') { const s = ex < 0 ? 1 : -1; c.beginPath(); c.moveTo(ex - er * .8 * s, ey - er * .7); c.lineTo(ex + er * .6 * s, ey); c.lineTo(ex - er * .8 * s, ey + er * .7); c.stroke(); continue; } // > <
    if (mood === 'sad' || blink) { c.beginPath(); if (mood === 'sad') c.arc(ex, ey - er * .2, er * .75, .35, Math.PI - .35); else { c.moveTo(ex - er * .8, ey); c.lineTo(ex + er * .8, ey); } c.stroke(); continue; }
    const grow = 1 + fear * .18;
    c.beginPath(); c.ellipse(ex, ey, er * .9 * grow, er * 1.08 * grow, 0, 0, A.TAU); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 1.6; c.stroke();
    const pr = er * (.56 - fear * .2), px = ex + L[0] * er * .42, py = ey + L[1] * er * .5;
    c.beginPath(); c.arc(px, py, pr, 0, A.TAU); c.fillStyle = '#2a1408'; c.fill();
    c.beginPath(); c.arc(px - pr * .35, py - pr * .4, pr * .38, 0, A.TAU); c.fillStyle = '#fff'; c.fill();
  }
  // brows
  c.lineWidth = 2;
  if (fear > .25 || mood === 'scream' || mood === 'sad') {
    const k = mood === 'idle' ? fear : 1;
    for (const [ex, ey] of eyes) { const s = ex < 0 ? 1 : -1; c.beginPath(); c.moveTo(ex - er * s, ey - er * 1.5 + k * 1); c.lineTo(ex + er * .6 * s, ey - er * 1.5 - k * 3.5); c.stroke(); }
  } else if (mood === 'happy') for (const [ex, ey] of eyes) { c.beginPath(); c.arc(ex, ey - er * .9, er * .9, Math.PI + .5, -.5); c.stroke(); }
  // mouth
  if (mood === 'scream') {
    const o = 1 + Math.sin(t * 30) * .08; c.beginPath(); c.ellipse(0, r * .36, r * .2 * o, r * .27 * o, 0, 0, A.TAU); c.fillStyle = '#5a0f0f'; c.fill(); c.lineWidth = 1.6; c.stroke();
    c.beginPath(); c.ellipse(0, r * .5, r * .12, r * .08, 0, 0, A.TAU); c.fillStyle = '#ff7a8a'; c.fill();
  } else if (mood === 'happy') {
    c.beginPath(); c.moveTo(-r * .24, r * .2); c.quadraticCurveTo(0, r * .62, r * .24, r * .2); c.closePath(); c.fillStyle = '#5a0f0f'; c.fill(); c.lineWidth = 1.6; c.stroke();
    c.save(); c.clip(); c.beginPath(); c.ellipse(0, r * .44, r * .13, r * .09, 0, 0, A.TAU); c.fillStyle = '#ff7a8a'; c.fill(); c.restore();
  } else if (mood === 'sad') { c.beginPath(); c.arc(0, r * .48, r * .15, Math.PI + .4, -.4); c.stroke(); }
  else if (fear > .2) { const q = 1 + Math.sin(t * 22) * .1; c.beginPath(); c.ellipse(0, r * .34, (r * .06 + fear * r * .07) * q, (r * .07 + fear * r * .09) / q, 0, 0, A.TAU); c.fillStyle = '#5a0f0f'; c.fill(); } // a small trembling "o"
  else { c.beginPath(); c.arc(0, r * .2, r * .17, .25, Math.PI - .25); c.stroke(); }
  // sweat and tears
  if ((mood === 'idle' && fear > .5) || mood === 'scream') { const k = (t * 1.3) % 1; A.hdDrop(c, r * .66, -r * .45 + k * r * .4, 2.6 + (1 - k)); }
  if (mood === 'sad' || mood === 'scream') for (const s of [-1, 1]) { const k = (t * 1.6 + (s > 0 ? .5 : 0)) % 1; c.save(); c.globalAlpha = 1 - k; A.hdDrop(c, s * r * .3, r * .08 + k * r * .5, 2.2); c.restore(); }
  c.restore();
}
function drawDrop(d, t) {
  const [x, y0] = sp(d.x, d.y), y = y0 - 6 + Math.sin(t * 4 + d.id) * 3;
  if (d.age > 4 && Math.floor(t * 8) % 2) return;
  c.save(); const g = c.createRadialGradient(x, y, 1, x, y, 18); g.addColorStop(0, 'rgba(200,245,255,.7)'); g.addColorStop(1, 'rgba(200,245,255,0)'); c.fillStyle = g; c.fillRect(x - 18, y - 18, 36, 36); c.restore();
  A.hdDrop(c, x, y, 8);
  const r = Math.max(22, 22 / ws); ui.push({ x: x - r, y: y - r - 2, w: r * 2, h: r * 2, fn: () => collectDrop(game, d.id), s: 'w' });
}
function drawShot(s) {
  // shots fly to the bug as drawn, in its lane: blend in the lane offset as the shot gets closer
  let [x, y] = sp(s.x, s.y), [tx, ty] = sp(s.tx, s.ty);
  if (s.target && !s.target.fly) {
    const [bx, by] = bugPos(s.target), [cx, cy] = sp(s.target.x, s.target.y), tot = Math.hypot(s.tx - s.sx, s.ty - s.sy) || 1, k = clamp(1 - Math.hypot(s.tx - s.x, s.ty - s.y) / tot, 0, 1);
    x += (bx - cx) * k; y += (by - cy) * k; tx += bx - cx; ty += by - cy;
  }
  const ang = Math.atan2(ty - y, tx - x);
  if (s.kind === 'thorn') A.fxThorn(c, x, y, ang, 22);
  else if (s.kind === 'kernel') { const tot = Math.hypot(s.tx - s.sx, s.ty - s.sy) || 1, done = 1 - Math.hypot(s.tx - s.x, s.ty - s.y) / tot; A.hdBall(c, x, y - Math.sin(Math.max(0, Math.min(1, done)) * Math.PI) * 34, 4.4, 4.4, '#ffd23f', { olk: .7 }); }
  else { c.save(); c.translate(x, y); c.rotate(ang); c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1.2; for (let k = 0; k < 7; k++) { c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(k) * 6, Math.sin(k) * 6); c.stroke(); } A.hdLine(c, [0, 0, -12, 0], 'rgba(230,225,210,.9)', 1.4); c.restore(); }
}
function drawGhost(t) {
  const { i, j, ok } = ghost, [x, y] = cellCenter(i, j);
  ghost.t += 1 / 60;
  if (ok && ghost.trail) { const pts = ghost.trail.map(([a, b]) => cellCenter(a, b)); pts.unshift(offEntry(pts[0])); c.save(); c.shadowColor = 'rgba(255,200,40,.9)'; c.shadowBlur = 8; A.strokePts(c, A.chaikin(pts, 3), 4, '#ffd23a', { dash: [10, 7] }); c.restore(); }
  c.save(); c.beginPath(); A.rrect(c, x - 19, y - 19, 38, 38, 10); c.fillStyle = !ghost.type ? 'rgba(255,255,255,.3)' : ok ? 'rgba(140,255,120,.35)' : 'rgba(255,80,70,.4)'; c.fill(); c.lineWidth = 3; c.strokeStyle = ok || !ghost.type ? '#ffffff' : '#ff4a3a'; c.stroke(); c.restore();
  if (!ghost.type) return;
  if (PLANTS[ghost.type].range) ring(x, y, PLANTS[ghost.type].range[0] * CELL);
  c.save(); c.globalAlpha = ok ? .85 : .45; blit(plantSprite(ghost.type, 1), x - 35, y + 14 - 66); c.restore();
}
// Where to put buttons and a label next to a cell, in UI units: below the cell if there is room, else above.
function nearCell(i, j) {
  const h = CELL / 2 * ws / uk, [fx0, fy0, fw, fh] = faUI(), [ux, y0] = toUI(...cellCenter(i, j)), uy = clamp(y0, fy0 + h, fy0 + fh - h);
  const below = uy + h + 44 < fy0 + fh, top = uy - h * 2.4; // top: above the plant drawn on the cell
  const by = below ? uy + h + 22 : top - 22;
  let ly = below ? top - 14 : uy + h + 16;
  if (ly < fy0 + 12) ly = by + 34; // no room above: the label goes under the buttons
  else if (ly > fy0 + fh - 12) ly = by - 36; // no room below: over the buttons
  return { x: clamp(ux, fx0 + 66, fx0 + fw - 66), by, ly };
}
// The plant menu by the picked cell: a title line (what the plant does, how the trail changes) and the plant buttons.
function drawPicker(t) {
  const list = game.L.plants, n = list.length, bw = 50, bh = 58, gap = 6, pad = 8;
  const cols = n * (bw + gap) - gap + pad * 2 <= UW - 12 ? n : Math.ceil(n / 2), rows = Math.ceil(n / cols);
  const w = Math.max(cols * (bw + gap) - gap + pad * 2, 190), g = ghost, tw0 = w - pad * 2 - 34;
  // under the buttons: what the chosen plant does (until it is planted), and the close button at the bottom right
  // the height fits the longest description, so the buttons stay put when a plant is chosen
  const text = (tp) => { c.save(); c.font = '800 12px Nunito'; const a = wrap(T.about[tp], tw0); c.font = '900 11px Nunito'; const b = wrap(statLine(tp).join(' · '), tw0); c.restore(); return [a, b]; };
  const [lines, stats] = g.type ? text(g.type) : [[], []];
  const most = Math.max(...list.map((tp) => { const [a, b] = text(tp); return a.length * 15 + b.length * 14; }));
  const top2 = 30 + rows * (bh + gap) - gap, foot = Math.max(40, 12 + most), h = top2 + foot;
  const hc = CELL / 2 * ws / uk, [fx0, fy0, fw, fh] = faUI(), [ux, y0] = toUI(...cellCenter(ghost.i, ghost.j)), uy = clamp(y0, fy0 + hc, fy0 + fh - hc);
  // above the plant on the cell if it fits, else below; on a screen too small for both, the side that overflows less
  const yUp = uy - hc * 2.3 - h - 8, yDown = uy + hc + 10, over = yDown + h - (UH - 4);
  const above = yUp >= 4 || (over > 0 && 4 - yUp < over), x = clamp(ux - w / 2, 6, UW - w - 6), y = above ? Math.max(4, yUp) : Math.min(yDown, UH - h - 4);
  ui.push({ x, y, w, h, fn: () => {}, s: 'u' }); // taps on the panel itself do nothing
  c.save(); c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 12; A.uiPanel(c, x, y, w, h, 16, '#fff3d6', { ol: '#6a3e1c', olw: 2.5 }); c.restore();
  // pointer towards the cell
  const tx = clamp(ux, x + 18, x + w - 18); c.save(); c.beginPath();
  if (above) { c.moveTo(tx - 9, y + h - 1.5); c.lineTo(tx, y + h + 8); c.lineTo(tx + 9, y + h - 1.5); } else { c.moveTo(tx - 9, y + 1.5); c.lineTo(tx, y - 8); c.lineTo(tx + 9, y + 1.5); }
  c.fillStyle = '#fff3d6'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = '#6a3e1c'; c.stroke(); c.restore();
  // title
  if (!g.type) A.hdText(c, T.pick, x + w / 2, y + 16, 14, '#6a3e1c', { stroke: null });
  else {
    const tag = g.ok ? T.gain(g.gain) : T.problem[g.problem] || '', col = !g.ok ? '#e2483a' : g.gain > 0 ? '#3f9a2a' : '#8a7a5a';
    c.save(); c.font = '900 12px Nunito'; const tw = c.measureText(tag).width + 16; c.restore();
    A.hdText(c, T.plant[g.type], x + pad + 2, y + 16, 14, '#6a3e1c', { stroke: null, align: 'left' });
    c.save(); c.beginPath(); A.rrect(c, x + w - pad - tw, y + 7, tw, 18, 9); c.fillStyle = col; c.fill(); c.restore();
    A.hdText(c, tag, x + w - pad - tw / 2, y + 16.5, 12, '#fff', { stroke: null });
  }
  list.forEach((type, k) => {
    const r = Math.floor(k / cols), inRow = Math.min(cols, n - r * cols), rx = x + (w - (inRow * (bw + gap) - gap)) / 2;
    const bx = rx + (k - r * cols) * (bw + gap), by = y + 30 + r * (bh + gap), on = g.type === type, poor = game.dew < PLANTS[type].cost;
    plantButton(type, bx, by, bw, bh, on, poor, on && g.ok, t);
    ui.push({ x: bx - gap / 2, y: by - gap / 2, w: bw + gap, h: bh + gap, fn: () => choose(type), s: 'u', card: type });
  });
  const dy = y + top2 + 16;
  if (!g.type) A.hdText(c, T.pickHint, x + pad + 2, dy, 12, '#a08060', { stroke: null, align: 'left', weight: 800 });
  lines.forEach((l, k) => A.hdText(c, l, x + pad + 2, dy + k * 15, 12, '#8a5a32', { stroke: null, align: 'left', weight: 800 }));
  stats.forEach((l, k) => A.hdText(c, l, x + pad + 2, dy + 2 + lines.length * 15 + k * 14, 11, '#3f8a2a', { stroke: null, align: 'left' }));
  const cx = x + w - pad - 13, cy = y + h - pad - 11;
  button(cx, cy, 13, '#e0884a', (bx, by) => { c.save(); c.lineCap = 'round'; c.lineWidth = 3; c.strokeStyle = '#fff'; c.beginPath(); c.moveTo(bx - 4.5, by - 4.5); c.lineTo(bx + 4.5, by + 4.5); c.moveTo(bx + 4.5, by - 4.5); c.lineTo(bx - 4.5, by + 4.5); c.stroke(); c.restore(); }, () => { ghost = null; });
}
function plantButton(type, x, y, w, h, on, poor, ready, t) {
  c.save(); if (on) { c.shadowColor = ready ? 'rgba(90,220,60,.9)' : 'rgba(255,220,60,.9)'; c.shadowBlur = 12; }
  A.uiPanel(c, x, y, w, h, 12, ready ? '#e4ffd0' : on ? '#fff0b8' : '#fbe7c2', { ol: ready ? '#2f8a1f' : on ? '#c88a10' : '#7a4a22', olw: on ? 3 : 2 }); c.restore();
  const s = plantSprite(type, 1), k = Math.min((w - 6) / 44, (h - 14) / 46);
  c.save(); c.beginPath(); A.rrect(c, x + 2, y + 2, w - 4, h - 4, 10); c.clip(); c.translate(x + w / 2, y + h - 13); c.scale(k, k); blit(s, -35, -64); c.restore();
  const label = String(PLANTS[type].cost); c.save(); c.font = '900 12px Nunito'; const lw = c.measureText(label).width + 22; c.restore();
  const lx = x + w / 2 - lw / 2, ly = y + h - 15;
  c.save(); c.beginPath(); A.rrect(c, lx, ly, lw, 16, 8); c.fillStyle = ready ? '#3fa52a' : 'rgba(40,25,10,.82)'; c.fill(); c.restore();
  if (ready) A.hdText(c, '✓', lx + 8, ly + 8.5, 12, '#fff', { stroke: null }); else A.hdDrop(c, lx + 8, ly + 8.5, 4.2);
  A.hdText(c, label, lx + lw / 2 + 5, ly + 8.5, 12, poor ? '#ff9a8a' : '#fff', { stroke: null });
  if (ready) { // tap again to plant: a pulsing check in the corner
    const p = 1 + Math.sin(t * 6) * .08, bx = x + w - 6, by = y + 6; c.save(); c.translate(bx, by); c.scale(p, p);
    c.beginPath(); c.arc(0, 0, 10, 0, A.TAU); c.fillStyle = '#5cc23e'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#fff'; c.stroke(); c.restore();
    A.hdText(c, '✓', bx, by + 1, 12, '#fff', { stroke: '#1f5a14', sw: 2.5 });
  }
  if (poor) { c.save(); c.beginPath(); A.rrect(c, x, y, w, h, 12); c.fillStyle = 'rgba(60,40,30,.35)'; c.fill(); c.restore(); }
}
function wrap(text, maxW) {
  const out = []; let line = '';
  for (const w of text.split(' ')) { const tr = line ? line + ' ' + w : w; if (c.measureText(tr).width > maxW && line) { out.push(line); line = w; } else line = tr; }
  if (line) out.push(line); return out;
}
function labelPill(txt, x, y, col, ol) {
  c.save(); c.font = '900 13px Nunito'; const w = Math.max(70, c.measureText(txt).width + 26); c.restore();
  const xx = clamp(x, w / 2 + 4, UW - w / 2 - 4);
  A.uiPanel(c, xx - w / 2, y - 13, w, 26, 13, col, { ol }); A.hdText(c, txt, xx, y, 13, '#fff', { stroke: ol, sw: 3.5 });
}
function button(x, y, r, col, drawIcon, fn, disabled = false) {
  A.uiRound(c, x, y, r, disabled ? '#9a9a90' : col, drawIcon);
  if (!disabled) ui.push({ x: x - r - 4, y: y - r - 4, w: r * 2 + 8, h: r * 2 + 8, fn, s: SPACE });
}

// ---------- effects ----------
function drawFx(dt, list) {
  for (const f of list) {
    f.t += dt; if (f.t < 0) continue; const k = f.t / f.life; if (k >= 1) continue;
    if (f.vx != null) { f.x += f.vx * dt; f.y += f.vy * dt; if (f.k !== 'ember') f.vy += 160 * dt; }
    c.save(); c.globalAlpha = Math.min(1, (1 - k) * 1.6);
    const tz = list === fx ? Math.max(1, .8 / ws) : 1; // numbers stay readable when the field is small
    switch (f.k) {
      case 'dmg': A.hdText(c, f.txt, f.x, f.y - k * 22, (f.red ? 18 : 13) * tz, f.red ? '#ff6a6a' : '#ffe14a', { stroke: '#5a1a08', sw: 4 }); break;
      case 'gain': A.hdText(c, f.txt, f.x, f.y - k * 26, 12 * tz, '#dff6ff', { stroke: '#2a6fa8', sw: 3.5 }); break;
      case 'star': A.fxStar(c, f.x, f.y, f.r * (1 - k * .5), '#ffffff'); break;
      case 'puff': case 'dust': c.beginPath(); c.arc(f.x, f.y, f.r * (1 + k), 0, A.TAU); c.fillStyle = f.k === 'dust' ? 'rgba(170,120,70,.55)' : 'rgba(255,255,255,.75)'; c.fill(); break;
      case 'kern': A.hdBall(c, f.x, f.y, 2.4, 2.4, '#ffd23f', { noOl: true, noSpec: true }); break;
      case 'crumb': c.beginPath(); c.arc(f.x, f.y, 2, 0, A.TAU); c.fillStyle = f.col; c.fill(); break;
      case 'fire': c.globalAlpha = 1 - k; A.fxFire(c, f.x, f.y, f.r * (.6 + k * .5)); break;
      case 'ember': c.beginPath(); c.arc(f.x, f.y, 2.2 * (1 - k), 0, A.TAU); c.fillStyle = '#ffb02e'; c.fill(); break;
      case 'spark': A.fxStar(c, f.x, f.y - k * 16, 5 * (1 - k), '#fff6a0'); break;
      case 'say': { const s = Math.min(1, f.t * 8) * (1 + Math.max(0, .15 - f.t) * 2); c.translate(f.x, f.y - k * 10); c.scale(s, s); A.hdText(c, f.txt, 0, 0, 15 * tz, '#ffffff', { stroke: '#a01818', sw: 5 }); break; }
      case 'heart': heart(f.x + Math.sin(f.t * 6) * 4, f.y - k * 26, 6 * (1 - k * .3)); break;
      case 'fly': { const [tx, ty] = DEW, e = k * k; const x = f.x + (tx - f.x) * e, y = f.y + (ty - f.y) * e - Math.sin(k * Math.PI) * 40; c.globalAlpha = 1; A.hdDrop(c, x, y, 7); break; }
      case 'flash': c.globalAlpha = 1; c.fillStyle = f.col + (.5 * (1 - k)) + ')'; c.fillRect(0, 0, UW, UH); break;
      case 'rain': { const y = f.y + k * UH * 1.6; c.globalAlpha = .7; c.strokeStyle = 'rgba(190,230,255,.9)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(f.x, y); c.lineTo(f.x - 4, y + 14); c.stroke(); break; }
    }
    c.restore();
  }
  if (list === fx) fx = fx.filter((f) => f.t < f.life); else ufx = ufx.filter((f) => f.t < f.life);
}
function drawBanners(dt) {
  // portrait: below the anthill and its start button
  let topY = PORT ? Math.max(TOPY + PTOP + 40, game.phase === 'build' ? GOB[1] + GOB[3] + 26 : 0) : 26; const midX = (FA[0] + FA[2] / 2) / uk;
  for (const b of banners) {
    b.t += dt; const k = b.t / b.life; if (k >= 1) continue;
    const a = Math.min(1, b.t * 5, (1 - k) * 5); const text = typeof b.text === 'function' ? b.text() : b.text;
    c.save(); c.globalAlpha = a;
    if (b.top) {
      const fs = PORT ? 13 : 14, room = FA[2] / uk; c.font = `900 ${fs}px Nunito`; const lines = wrap(text, room - 32), w = Math.min(room, Math.max(...lines.map((l) => c.measureText(l).width)) + 30), h = 12 + lines.length * 18, x = midX;
      A.uiPanel(c, x - w / 2, topY - 15, w, h, 15, '#fff3d6', { ol: '#6a3e1c' });
      lines.forEach((l, k) => A.hdText(c, l, x, topY + k * 18 - 1 + (lines.length > 1 ? 2 : 0), fs, '#6a3e1c', { stroke: null })); topY += h + 8;
    }
    else { const s = 1 + Math.max(0, .3 - b.t) * 1.5; c.translate(midX, UH * .42); if (PORT) c.scale(.8, .8); c.scale(s, s); A.hdText(c, text, 0, 0, 30, '#fff', { stroke: '#6a3a00', sw: 8, grad: ['#fff6a0', '#ffb02e'] }); }
    c.restore();
  }
  banners = banners.filter((b) => b.t < b.life);
}

// ---------- HUD ----------
function drawHud(t) {
  const build = game.phase === 'build', waveText = build && game.nextIn != null ? T.soon(game.wave + 1, Math.ceil(game.nextIn)) : T.wave(build ? game.wave + 1 : game.wave, game.waves);
  if (PORT) { // top: dew, fruit, wave, pause; bottom: powers, next wave, speed
    const by = UH - BOTY - PBOT / 2, ty = TOPY;
    dewPill(6, ty + 7, 86, 32); hpPill(98, ty + 7, 70, 32);
    waveBar(174, ty + 9, UW - 174 - 46, 28, waveText, 12);
    pauseBtn(UW - 22, ty + 23);
    powerBtns([28 + CORN, by], [74 + CORN, by]);
    speedBtn(UW - 24 - CORN, by);
  } else { // left: dew, fruit, wave, next wave; right: pause, speed, powers
    const x = 8, w = LLEFT - 16, cx = UW - LRIGHT / 2;
    dewPill(x, 8, w, 32); hpPill(x, 46, w, 32);
    waveBar(x, 86, w, 26, build && game.nextIn != null ? `${game.wave + 1}/${game.waves} · ${Math.ceil(game.nextIn)} с` : `${build ? game.wave + 1 : game.wave} / ${game.waves}`, 12);
    pauseBtn(cx, 24); speedBtn(cx, 64);
    powerBtns([cx, UH - BOTY - 74], [cx, UH - BOTY - 28]);
  }
}
// The next wave is called from a round button by the anthill; it shows the countdown and the dew for starting early.
let GO = [0, 0];
// The start button sits next to the anthill (not on it) with who comes next and the dew for starting early:
// [▶ 2/6 ant×10 beetle×2 +14]. The whole plate starts the wave; holding a bug shows what it is.
let GOB = [0, 0, 0, 0]; const GO_R = 15, GO_DX = 6 + GO_R; // the ▶ circle: radius and centre from the plate's left
function goLayout() {
  const prev = wavePreview(game), bonus = earlyBonus(game), end = bonus ? 52 : 56, w = 40 + 30 + prev.length * 42 + end, h = 36;
  const [ex, ey] = cellCenter(...game.entry), [ax, ay] = toUI(...(PORT ? [ex, ey - 14] : [ex + 16, ey + 4]));
  const [fx0, fy0, fw, fh] = faUI(), hc = CELL / 2 * ws / uk;
  let x, y;
  if (PORT) { // beside the anthill, on the side with more room; under it if neither side fits
    const right = ax < fx0 + fw / 2; x = right ? ax + hc * 1.3 : ax - hc * 1.3 - w; y = ay - h / 2 + 2;
    if (x < fx0 + 2 || x + w > fx0 + fw - 2) { x = ax - w / 2; y = ay + hc * 1.4; }
  } else { // above the anthill, or under it on the top rows
    x = ax + hc - w; y = ay - hc * 1.4 - h; if (y < fy0 + 2) y = ay + hc * 1.3;
  }
  return [clamp(x, fx0 + 2, fx0 + fw - w - 2), clamp(y, fy0 + 2, fy0 + fh - h - 2), w, h];
}
function goIcon(t) {
  const [x, y, w, h] = GOB, cy = y + h / 2, r = GO_R, cx = x + GO_DX, bonus = earlyBonus(game), start = () => { ghost = null; pop = null; startWave(game); };
  c.save(); c.shadowColor = 'rgba(0,0,0,.3)'; c.shadowBlur = 8; A.uiPanel(c, x, y, w, h, h / 2, '#fff3d6', { ol: '#6a3e1c', olw: 2.5 }); c.restore();
  const k = game.nextIn != null ? game.nextIn / BREAK : 1, p = 1 + Math.sin(t * 5) * .05;
  c.save(); c.translate(cx, cy); c.scale(p, p);
  c.shadowColor = 'rgba(80,200,40,.8)'; c.shadowBlur = 10; c.beginPath(); c.arc(0, 0, r, 0, A.TAU); c.fillStyle = '#5cc23e'; c.fill(); c.shadowBlur = 0;
  c.lineWidth = 2.2; c.strokeStyle = '#1f6a17'; c.stroke();
  if (game.nextIn != null) { c.beginPath(); c.arc(0, 0, r - 3.5, -Math.PI / 2, -Math.PI / 2 + A.TAU * k); c.lineWidth = 3; c.lineCap = 'round'; c.strokeStyle = '#eaffd8'; c.stroke(); }
  c.beginPath(); c.moveTo(-4, -7); c.lineTo(8, 0); c.lineTo(-4, 7); c.closePath(); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 1.8; c.lineJoin = 'round'; c.strokeStyle = '#1f5a14'; c.stroke();
  c.restore();
  A.hdText(c, `${game.wave + 1}/${game.waves}`, x + 54, cy + .5, 11, '#8a5a32', { stroke: null });
  const prev = wavePreview(game);
  prev.forEach(([kind, n], i) => { const bx = x + 78 + i * 42; bugChip(kind, n, bx, cy, () => {}); }); // hold for info
  const ex = x + 72 + prev.length * 42, ew = w - (ex - x) - 6;
  if (bonus) { c.save(); c.beginPath(); A.rrect(c, ex, cy - 10, ew, 20, 10); c.fillStyle = '#d8f0ff'; c.fill(); c.restore(); A.hdDrop(c, ex + 10, cy + .5, 4.5); A.hdText(c, `+${bonus}`, ex + ew / 2 + 5, cy + .5, 12, '#2a6fa8', { stroke: null }); }
  else { c.save(); c.beginPath(); A.rrect(c, ex, cy - 11, ew, 22, 11); c.fillStyle = '#5cc23e'; c.fill(); c.restore(); A.hdText(c, T.go, ex + ew / 2, cy + .5, 12, '#fff', { stroke: '#1f5a14', sw: 3 }); }
  ui.push({ x: x + 2, y, w: 42, h, fn: start, s: 'u' }); // only ▶ starts the wave
  const gx = x + 72 + prev.length * 42; ui.push({ x: gx - 2, y, w: x + w - gx + 2, h, fn: start, s: 'u' }); // and the bonus / «В бой!» end
}
function dewPill(x, y, w, h) {
  DEW = [x + 18, y + h / 2];
  A.uiPanel(c, x, y, w, h, h / 2, '#fff3d6', { ol: '#6a3e1c' });
  A.hdDrop(c, x + 18, y + h / 2 + 1, 8.5); A.hdText(c, String(game.dew), x + w / 2 + 10, y + h / 2, 19, '#ffffff', { stroke: '#2a6fa8', sw: 5 });
}
function hpPill(x, y, w, h) {
  A.uiPanel(c, x, y, w, h, h / 2, '#fff3d6', { ol: '#6a3e1c' });
  A.hdApple(c, x + 17, y + h / 2 + 1, 10, {});
  const bx = x + 32, bw = w - 40, k = game.hp / game.maxHp;
  c.save(); c.beginPath(); A.rrect(c, bx, y + h / 2 - 7, bw, 14, 7); c.fillStyle = 'rgba(60,20,10,.25)'; c.fill();
  c.beginPath(); A.rrect(c, bx, y + h / 2 - 7, Math.max(10, bw * k), 14, 7); const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#ff8a8a'); g.addColorStop(1, '#e02c3a'); c.fillStyle = g; c.fill(); c.restore();
  A.hdText(c, String(game.hp), bx + bw / 2, y + h / 2 + 1, 11, '#fff', { stroke: '#7a1010', sw: 3 });
}
function bugChip(k, n, cx, cy, fn) {
  const s = bugSprite(k, 0), sc = (k === 'rhino' ? 46 : 38) / s.w;
  ui.push({ x: cx - 14, y: cy - 16, w: 40, h: 32, fn, s: 'u', info: { bug: k } });
  c.save(); c.translate(cx, cy); c.rotate(-Math.PI / 2); c.scale(sc, sc); blit(s, -s.w / 2, -s.h / 2); c.restore();
  A.hdText(c, '×' + n, cx + 12, cy + 3, 12, '#fff', { stroke: '#4a2a12', sw: 3.5, align: 'left' });
}
function pauseBtn(x, y) { button(x, y, 16, '#7ac8ff', (bx, by) => { c.save(); c.fillStyle = '#fff'; c.strokeStyle = '#1f5a8a'; c.lineWidth = 1.5; for (const dx of [-5, 2]) { c.beginPath(); A.rrect(c, bx + dx, by - 6, 4, 12, 1.5); c.fill(); c.stroke(); } c.restore(); }, openPause); }
function speedBtn(x, y) { button(x, y, 16, speed > 1 ? '#ff9a2a' : '#ffcf3a', (bx, by) => A.hdText(c, '×' + speed, bx, by + 1, 13, '#fff', { stroke: '#8a5a00', sw: 3.5 }), () => { speed = speed > 1 ? 1 : 2; }); }
function powerBtns([fx0, fy0], [rx, ry]) {
  button(fx0, fy0, 19, '#8fd6ff', (x, y) => A.iconFrost(x, y, c), () => usePower(game, 'frost'), !game.powers.frost || game.phase !== 'wave');
  badge(fx0, fy0, 19, game.powers.frost);
  button(rx, ry, 19, '#4aa8ee', (x, y) => A.iconRain(x, y, c), () => usePower(game, 'rain'), !game.powers.rain);
  badge(rx, ry, 19, game.powers.rain);
}
function badge(x, y, r, n) { if (!n) return; c.save(); c.beginPath(); c.arc(x + r * .72, y - r * .68, 9, 0, A.TAU); c.fillStyle = '#ff4646'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#fff'; c.stroke(); c.restore(); A.hdText(c, String(n), x + r * .72, y - r * .68 + .5, 11, '#fff', { stroke: null }); }
// One line: wave progress, and while building also who comes next and the start button.
function waveBar(x, y, w, h, text, ts) {
  A.uiPanel(c, x, y, w, h, h / 2, '#5a3a22', { ol: '#2a1a0e' });
  const done = game.phase !== 'wave' ? game.wave / game.waves : (game.wave - 1 + Math.min(1, game.waveTime / Math.max(1, (game.L.waves[game.wave - 1] || [[0, 1, 1, 0]]).reduce((s, [, n, gap, d]) => s + d + n * gap, 0)))) / game.waves;
  c.save(); c.beginPath(); A.rrect(c, x + 4, y + 4, Math.max(h - 8, (w - 8) * done), h - 8, (h - 8) / 2); const g = c.createLinearGradient(0, y + 4, 0, y + h - 4); g.addColorStop(0, '#a8f070'); g.addColorStop(1, '#4cb02e'); c.fillStyle = g; c.fill(); c.restore();
  A.hdText(c, text, x + w / 2, y + h / 2 + .5, ts, '#ffffff', { stroke: '#2a1a0e', sw: 4 });
}
function drawPop() {
  const p = pop, up = upgradeCost(p), { x, by, ly } = nearCell(p.i, p.j);
  A.uiPanel(c, x - 62, by - 26, 124, 52, 18, '#fff3d6', { ol: '#6a3e1c' });
  button(x - 30, by, 18, up == null ? '#c8b070' : '#5cc23e', (bx, yy) => { if (up == null) A.hdText(c, '★', bx, yy + 1, 16, '#fff', { stroke: '#8a6a10', sw: 3 }); else { A.hdText(c, '⬆', bx, yy - 4, 13, '#fff', { stroke: '#1f5a14', sw: 3 }); A.hdText(c, String(up), bx, yy + 8, 10, '#fff', { stroke: '#1f5a14', sw: 3 }); } }, () => { upgrade(game, p); }, up == null || game.dew < up);
  button(x + 30, by, 18, '#e0884a', (bx, yy) => { A.hdText(c, '✕', bx, yy - 4, 12, '#fff', { stroke: '#7a3a10', sw: 3 }); A.hdText(c, '+' + refund(p), bx, yy + 8, 10, '#fff', { stroke: '#7a3a10', sw: 3 }); }, () => { removePlant(game, p); pop = null; });
  labelPill(T.plant[p.type], x, ly, '#8a5a32', '#4a2a12');
}

// ---------- long-press info ----------
// Holding a finger on a plant (on the field or in the plant menu) or on a bug (on the field or in the next-wave list)
// shows what it is; letting go hides it.
let tip = null, lpTimer = 0;
const plantInfo = (type, p) => ({ title: T.plant[type] + (p ? ` · ${T.lvl(p.lvl)}` : ''), text: T.about[type], stats: statLine(type, p ? p.lvl : 1).join(' · ') });
const bugInfo = (kind, b) => ({ title: T.bug[kind], text: T.bugAbout[kind], stats: bugStats(kind, b).join(' · ') });
function infoAt(px, py) {
  const u = hit(ui.filter((q) => q.s === 'u'), px / uk, py / uk);
  if (u) return u.card ? plantInfo(u.card) : u.info?.bug ? bugInfo(u.info.bug) : null;
  if (px < FA[0] || py < FA[1] || px > FA[0] + FA[2] || py > FA[1] + FA[3]) return null;
  const wx = (px - ox) / ws, wy = (py - oy) / ws;
  let best = null, bd = Math.max(CELL * .7, 22 / ws);
  for (const b of game.bugs) { const [x, y] = bugPos(b), d = Math.hypot(x - wx, y - wy); if (d < bd) { bd = d; best = b; } }
  if (best) return bugInfo(best.kind, best);
  const [i, j] = cellAt(wx, wy), p = game.grid[j]?.[i];
  return p?.type ? plantInfo(p.type, p) : null;
}
function drawTip() {
  const w = Math.min(UW - 16, 300);
  c.save(); c.font = '800 12px Nunito'; const lines = wrap(tip.text, w - 24); c.font = '900 11px Nunito'; const st = wrap(tip.stats, w - 24); c.restore();
  const h = 32 + lines.length * 15 + st.length * 14 + 6, x = clamp(tip.x - w / 2, 8, UW - w - 8);
  let y = tip.y - 56 - h; if (y < 4) y = Math.min(tip.y + 44, UH - h - 4);
  c.save(); c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 12; A.uiPanel(c, x, y, w, h, 16, '#fff3d6', { ol: '#6a3e1c', olw: 2.5 }); c.restore();
  A.hdText(c, tip.title, x + 12, y + 17, 15, '#6a3e1c', { stroke: null, align: 'left' });
  lines.forEach((l, k) => A.hdText(c, l, x + 12, y + 35 + k * 15, 12, '#8a5a32', { stroke: null, align: 'left', weight: 800 }));
  st.forEach((l, k) => A.hdText(c, l, x + 12, y + 38 + lines.length * 15 + k * 14, 11, '#3f8a2a', { stroke: null, align: 'left' }));
}

// ---------- input ----------
// Taps act on release. One finger drags the field when it is zoomed in; two fingers (or the mouse wheel) zoom.
let press = null, pinch = null;
const ptrs = new Map();
const hit = (list, x, y) => { for (let k = list.length - 1; k >= 0; k--) { const u = list[k]; if (x >= u.x && y >= u.y && x <= u.x + u.w && y <= u.y + u.h) return u; } return null; };
function tap(px, py) {
  const u = hit(ui.filter((q) => q.s === 'u'), px / uk, py / uk); if (u) { u.fn(); return; }
  const wx = (px - ox) / ws, wy = (py - oy) / ws, w = hit(ui.filter((q) => q.s === 'w'), wx, wy); if (w) { w.fn(); return; }
  const [i, j] = cellAt(wx, wy);
  if (wx >= 0 && wy >= 0 && i >= 0 && j >= 0 && i < COLS && j < ROWS) tapCell(i, j); else { ghost = null; pop = null; }
}
const startPress = (id, x, y, moved = false) => { press = { id, x, y, cx: camX, cy: camY, moved, onUI: !moved && !!hit(ui.filter((q) => q.s === 'u'), x / uk, y / uk) }; };
function startPinch() {
  const [a, b] = [...ptrs.values()], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  pinch = { d0: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), z0: zoom, wx: (mx - ox) / ws, wy: (my - oy) / ws };
  if (press) press.moved = true;
}
function bindCanvas() {
cv.addEventListener('pointerdown', (e) => {
  if (!game || paused) return;
  if (e.isPrimary) { ptrs.clear(); pinch = null; press = null; } // a first finger: forget pointers that never came up
  try { cv.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  clearTimeout(lpTimer); tip = null;
  if (ptrs.size === 1) {
    startPress(e.pointerId, e.clientX, e.clientY);
    const pr = press;
    lpTimer = setTimeout(() => { if (press !== pr || pr.moved || pinch || paused) return; const inf = infoAt(pr.x, pr.y); if (inf) { tip = { ...inf, x: pr.x / uk, y: pr.y / uk }; pr.tip = true; navigator.vibrate?.(8); } }, 420);
  } else startPinch();
});
cv.addEventListener('pointermove', (e) => {
  const q = ptrs.get(e.pointerId); if (!q) return; q.x = e.clientX; q.y = e.clientY;
  if (!game || paused) { pinch = press = null; return; }
  if (pinch && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()];
    zoomTo(pinch.z0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d0, (a.x + b.x) / 2, (a.y + b.y) / 2, pinch.wx, pinch.wy);
    return;
  }
  if (!press || e.pointerId !== press.id || press.onUI || press.tip) return;
  const dx = e.clientX - press.x, dy = e.clientY - press.y;
  if (!press.moved && Math.hypot(dx, dy) > 10) press.moved = true;
  if (press.moved && zoom > 1) { camX = press.cx - dx / ws; camY = press.cy - dy / ws; applyCam(); }
});
const release = (e) => {
  if (!ptrs.delete(e.pointerId)) return;
  clearTimeout(lpTimer); tip = null;
  if (pinch) { if (ptrs.size >= 2) startPinch(); else { pinch = null; zoomT = performance.now(); const [id, q] = [...ptrs.entries()][0] || []; press = null; if (q) startPress(id, q.x, q.y, true); } return; }
  if (press && e.pointerId === press.id) { const p = press; press = null; if (e.type === 'pointerup' && !p.moved && !p.tip && game && !paused) tap(p.x, p.y); }
};
cv.addEventListener('pointerup', release);
cv.addEventListener('contextmenu', (e) => e.preventDefault()); // a long press is ours, not the browser's menu
cv.addEventListener('pointercancel', release);
// Safari would zoom the whole page on a pinch: keep that gesture for the field
cv.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
cv.addEventListener('wheel', (e) => { e.preventDefault(); if (game && !paused) zoomTo(zoom * Math.exp(-e.deltaY * .0015), e.clientX, e.clientY); }, { passive: false });
}
bindCanvas();
for (const t of ['gesturestart', 'gesturechange']) document.addEventListener(t, (e) => { if (e.target === cv) e.preventDefault(); });
addEventListener('resize', resize);
visualViewport?.addEventListener('resize', resize);
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
    <div class="row">${hasNext ? `<button class="btn" id="mNext">${T.nextLevel}</button>` : ''}<button class="btn ${hasNext ? 'alt' : ''}" id="mAgain">${T.retry}</button><button class="btn alt" id="mHome">${T.levels}</button></div>`);
  if (hasNext) $('mNext').onclick = () => startLevel(levelIdx + 1);
  $('mAgain').onclick = () => startLevel(levelIdx);
  $('mHome').onclick = () => { showModal(null); showHome(true); };
}
function goFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen && matchMedia('(pointer: coarse)').matches) {
    el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
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
  if (new URLSearchParams(location.search).has('dev')) window.__fd = { get game() { return game; }, startLevel, set speed(v) { speed = v; }, cell: (i, j) => { const [x, y] = cellCenter(i, j); return [ox + x * ws, oy + y * ws]; }, scroll: () => {}, apple: (m, life = 99) => appleMood(m, life), get pause() { return paused; }, set pause(v) { paused = v; }, zoom: (z, x = innerWidth / 2, y = innerHeight / 2) => zoomTo(z, x, y), get view() { return { zoom, zmax, cell: CELL * ws, FA }; }, layout: () => ({ card: ui.filter((u) => u.card).map((u) => [(u.x + u.w / 2) * uk, (u.y + u.h / 2) * uk]), chips: ui.filter((u) => u.info).map((u) => [(u.x + 14) * uk, (u.y + u.h / 2) * uk]), go: [GO[0] * uk, GO[1] * uk] }) };
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
