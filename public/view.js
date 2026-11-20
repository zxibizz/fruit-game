// Drawing, input, HUD and screens. The game state lives in game.js; this file only shows it and turns taps into actions.
import * as A from './art.js';
import {
  createGame, step, place, placeProblem, blockingCells, previewTrail, trail, upgrade, upgradeCost, removePlant, refund,
  startWave, wavePreview, usePower, collectDrop, stars, COLS, ROWS, VERSION,
} from './game.js';
import { PLANTS, BUGS, LEVELS } from './data.js';

const T = {
  wave: (n, m) => `Волна ${n} / ${m}`, build: 'Стройка', go: 'В бой!', next: 'Волна',
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
  plantsHere: 'Растения', newPlants: 'Новые растения', newBugs: 'Новые жуки', bugsHere: 'Жуки', ok: 'Понятно', help: 'Справочник',
  role: { pumpkin: 'стена, держит путь', rose: 'шипы, бьёт и летающих', clover: 'даёт росу', corn: 'зёрна навесом, по площади', mint: 'холод: замедляет', pepper: 'огонь вокруг себя', dandelion: 'снайпер, вдвое по летающим' },
  problem: { busy: 'Здесь занято', bug: 'Здесь жук', blocks: 'Нельзя закрыть жукам путь', poor: 'Не хватает росы' },
  gain: (n) => (n > 0 ? `путь +${n}` : n < 0 ? `путь ${n}` : 'путь тот же'),
  hint1: () => `Выбери растение ${PORT ? 'внизу' : 'слева'} и посади на траву — жуки пойдут в обход`,
  hint2: 'Посадки удлиняют путь. Когда готов — «В бой!»',
  panV: 'Поле листается пальцем вверх-вниз', panH: 'Поле листается пальцем влево-вправо',
  won: 'Яблоко спасено!', lost: 'Жуки съели яблоко', again: 'Ещё раз', levels: 'Уровни', nextLevel: 'Дальше', resume: 'Продолжить',
  pause: 'Пауза', restart: 'Заново', waveDone: (b) => `Волна пройдена  +${b}`, newPlant: 'Новое растение',
};

const CELL = 42, TRAY = 80;
const cv = document.getElementById('cv'), c = cv.getContext('2d');
// Two coordinate spaces: the world (the field, CELL = 42 per cell, origin at the field's top-left corner) and the UI
// (HUD, shelf, panels). Each has its own scale, so the UI stays big while the field fits or scrolls.
let dpr = 1, uk = 1, ws = 1, UW = 844, UH = 390, ox = 0, oy = 0, cam = 0, camMax = 0, PORT = null, DEW = [28, 24];
let BASE = [0, 0], FBOX = [0, 0, 1, 1], VB = [0, 0, 1, 1], SPACE = 'u';
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
const PTOP = 74, LTOP = 46, MIN_CELL = 38; let PBOT = 80; // portrait: HUD rows on top, card shelf below; smallest cell in CSS px
const toUI = (wx, wy) => [(ox + wx * ws) / uk, (oy + wy * ws) / uk];
function applyCam() { ox = BASE[0] - (PORT ? 0 : cam); oy = BASE[1] - (PORT ? cam : 0); }
// world rect of the field area that is on screen now
const visField = () => [(FBOX[0] - ox) / ws, (FBOX[1] - oy) / ws, FBOX[2] / ws, FBOX[3] / ws];
function resize() {
  const vw = innerWidth, vh = innerHeight, was = PORT;
  PORT = vh > vw;
  dpr = Math.min(pixelRatio(vw), 5, Q.dpr || 9); seen = [vw, vh, devicePixelRatio, visualViewport?.scale || 1]; DIAG.resizes++;
  uk = PORT ? clamp(Math.min(vw / 340, vh / 560), 1, 1.8) : clamp(Math.min(vw / 740, vh / 340), 1, 1.8);
  UW = vw / uk; const sz = cardSize(); PBOT = sz[1] + 16;
  UW = vw / uk; UH = vh / uk;
  cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr); cv.style.width = vw + 'px'; cv.style.height = vh + 'px';
  const fl = PORT ? 4 : TRAY * uk, ft = (PORT ? PTOP : LTOP) * uk, aw = vw - fl - (PORT ? 4 : 6), ah = vh - ft - (PORT ? PBOT * uk : 4);
  FBOX = [fl, ft, aw, ah];
  const fw = FW(), fh = FH(), cross = PORT ? aw / fw : ah / fh, long = PORT ? ah / fh : aw / fw;
  ws = Math.min(cross, Math.max(long, MIN_CELL / CELL));
  camMax = Math.max(0, (PORT ? fh : fw) * ws - (PORT ? ah : aw));
  BASE = PORT ? [fl + (aw - fw * ws) / 2, ft + Math.max(0, (ah - fh * ws) / 2)] : [fl + Math.max(0, (aw - fw * ws) / 2), ft + (ah - fh * ws) / 2];
  if (was !== PORT) cam = PORT ? camMax : 0; // start where the fruit is
  cam = clamp(cam, 0, camMax); applyCam();
  // world area to paint: the whole screen at both ends of the scroll
  const xs = [], ys = [];
  for (const cc of [0, camMax]) { const x0 = BASE[0] - (PORT ? 0 : cc), y0 = BASE[1] - (PORT ? cc : 0); xs.push(-x0 / ws, (vw - x0) / ws); ys.push(-y0 / ws, (vh - y0) / ws); }
  VB = [Math.min(...xs) - 4, Math.min(...ys) - 4, Math.max(...xs) - Math.min(...xs) + 8, Math.max(...ys) - Math.min(...ys) + 8];
  for (const v of sprites.values()) free(v.cnv); sprites.clear(); free(grassLayer); grassLayer = null; terrainDirty = true;
}
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
function cardSize() { const n = game ? game.L.plants.length : 4, cw = Math.min(64, (UW - 16 - 6 * (n - 1)) / n); return [cw, Math.min(66, cw + 6)]; }
function free(cnv) { if (cnv && cnv.width) { cnv.width = 0; cnv.height = 0; } }
let seen = [0, 0, 0];
// ?diag draws a 1:1 test patch and live numbers in the corner; ?dpr=2 caps the canvas density
const Q = Object.fromEntries(new URLSearchParams(location.search)); Q.dpr = Number(Q.dpr) || 0;
const DIAG = { on: 'diag' in Q, resizes: 0, frames: 0, fps: 0, t0: 0 };
function drawDiag(ts) {
  DIAG.frames++; if (ts - DIAG.t0 > 1000) { DIAG.fps = DIAG.frames * 1000 / (ts - DIAG.t0); DIAG.frames = 0; DIAG.t0 = ts; }
  if (!DIAG.on) return;
  c.setTransform(1, 0, 0, 1, 0, 0);
  const x0 = Math.round(8 * dpr), y0 = Math.round((PORT ? PTOP + 30 : 50) * uk * dpr), w = Math.round(250 * dpr), h = Math.round(64 * dpr);
  c.fillStyle = '#fff8ea'; c.fillRect(x0, y0, w, h);
  for (let i = 0; i < 24; i++) { c.fillStyle = i % 2 ? '#000' : '#fff'; c.fillRect(x0 + Math.round(6 * dpr) + i, y0 + Math.round(6 * dpr), 1, Math.round(20 * dpr)); }
  c.fillStyle = '#5a3a1c'; c.font = `700 ${Math.round(13 * dpr)}px system-ui`; c.textBaseline = 'top';
  c.fillText(`fps ${DIAG.fps.toFixed(0)} · пересозданий ${DIAG.resizes}`, x0 + Math.round(40 * dpr), y0 + Math.round(8 * dpr));
  c.fillText(`холст ${cv.width}×${cv.height} @${dpr.toFixed(2)} ui ${uk.toFixed(2)} поле ${ws.toFixed(2)}`, x0 + Math.round(6 * dpr), y0 + Math.round(36 * dpr));
}
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
  const [cnv, x] = layer(VB[2], VB[3], ws * dpr); A.setView(VB[2], VB[3]);
  A.hdGrass(x, { seed: 5 + levelIdx }); A.hdBorderBushes(x, 2 + levelIdx); grassLayer = cnv;
}
function buildTerrain() {
  if (!grassLayer) buildGrass();
  const k = ws * dpr, [cnv, x] = layer(VB[2], VB[3], k); A.setView(VB[2], VB[3]);
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
  levelIdx = n; game = createGame(n, Date.now() & 0xffff); resize();
  sel = ghost = pop = null; fx = []; banners = []; angles.clear(); anim.clear(); speed = 1;
  grassLayer = null; terrainDirty = true; paused = false;
  showHome(false); showModal(null); ufx = []; cam = PORT ? camMax : 0; applyCam();
  if (camMax > 0) banner(PORT ? T.panV : T.panH, 4, true);
  if (n === 0) banner(T.hint1, 8, true);
  const plants = n ? LEVELS[n].plants.filter((p) => !LEVELS[n - 1].plants.includes(p)) : LEVELS[n].plants;
  const seen = new Set(LEVELS.slice(0, n).flatMap(bugsOf)), bugs = bugsOf(LEVELS[n]).filter((b) => !seen.has(b));
  if (plants.length || bugs.length) openGuide(plants, bugs, n ? T.newPlants : T.plantsHere, n ? T.newBugs : T.bugsHere);
}
const bugsOf = (L) => [...new Set(L.waves.flat().map((w) => w[0]))];
function statLine(type) {
  const P = PLANTS[type], out = [];
  if (P.dmg) out.push(`урон ${P.dmg[0]}`);
  if (P.range) out.push(`дальность ${P.range[0]}`);
  if (P.rate) out.push(P.rate[0] >= 1 ? `${P.rate[0]} выстр./с` : `раз в ${(1 / P.rate[0]).toFixed(1)} с`);
  if (P.slow) out.push(`замедляет на ${Math.round(P.slow[0] * 100)}%`);
  if (P.value) out.push(`+${P.value[0]} росы раз в ${P.period[0]} с`);
  if (type === 'pumpkin') out.push(`прочность ${P.hp[0]}`);
  if (P.range && !P.slow) out.push(P.air ? 'бьёт летающих' : 'летающих не бьёт');
  return out;
}
function iconURL(kind, draw) {
  const key = 'url:' + kind; if (sprites.has(key)) return sprites.get(key);
  const k = 2, cnv = document.createElement('canvas'); cnv.width = cnv.height = 64 * k; const x = cnv.getContext('2d'); x.scale(k, k); draw(x);
  const url = cnv.toDataURL(); sprites.set(key, url); return url;
}
const plantURL = (t) => iconURL('p' + t, (x) => { A.hdSoil(x, 32, 52); A.hdPlant(x, t, 32, 51, 1, { noShadow: true }); });
const bugURL = (b) => iconURL('b' + b, (x) => A.hdBug(x, b === 'rhino' ? 'beetle' : b, 32, 32, -Math.PI / 2 + .3, b === 'rhino' ? 1.25 : 1.15, { noShadow: true, color: b === 'rhino' ? '#8a3ad0' : undefined }));
function guideRows(plants, bugs, pt, bt) {
  let h = '';
  if (plants.length) h += `<h3>${pt}</h3>` + plants.map((p) => `<div class="gi"><img src="${plantURL(p)}" alt=""><div><b>${T.plant[p]}</b> <span class="cost"><i class="drop"></i>${PLANTS[p].cost}</span><p>${T.about[p]}</p><small>${statLine(p).join(' · ')}</small></div></div>`).join('');
  if (bugs.length) h += `<h3>${bt}</h3>` + bugs.map((b) => `<div class="gi"><img src="${bugURL(b)}" alt=""><div><b>${T.bug[b]}</b><p>${T.bugAbout[b]}</p></div></div>`).join('');
  return h;
}
function openGuide(plants, bugs, pt, bt) {
  paused = true;
  showModal(`<div class="guide">${guideRows(plants, bugs, pt, bt)}</div><div class="row"><button class="btn" id="mOk">${T.ok}</button></div>`);
  $('mOk').onclick = () => { showModal(null); paused = false; };
}
function banner(text, life = 2, top = false) { banners.push({ text, t: 0, life, top }); }
function selectCard(type) {
  pop = null; ghost = null; blockCache = null; banners = banners.filter((b) => !b.top);
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
      case 'hit': if (e.src !== 'burn') { const [x, y] = sp(e.b.x, e.b.y); fx.push({ k: 'dmg', x: x + (Math.random() - .5) * 10, y: y - 18, t: 0, life: .7, txt: `-${Math.round(e.dmg)}` }); fx.push({ k: 'star', x, y: y - 4, t: 0, life: .18, r: 9 }); } break;
      case 'kill': { const [x, y] = sp(e.b.x, e.b.y); for (let n = 0; n < 7; n++) fx.push({ k: 'puff', x, y, vx: (Math.random() - .5) * 60, vy: (Math.random() - .5) * 60 - 10, t: 0, life: .45, r: 3 + Math.random() * 3 }); fx.push({ k: 'gain', x, y: y - 10, t: 0, life: .8, txt: `+${e.reward}` }); angles.delete(e.b.id); break; }
      case 'splash': { const [x, y] = sp(e.x, e.y); for (let n = 0; n < 8; n++) fx.push({ k: 'kern', x, y, vx: (Math.random() - .5) * 90, vy: -30 - Math.random() * 50, t: 0, life: .4 }); break; }
      case 'fire': { const [x, y] = cellCenter(e.p.i, e.p.j); fx.push({ k: 'fire', x, y, t: 0, life: .45, r: PLANTS.pepper.range[e.p.lvl - 1] * CELL }); bump(e.p, .2); break; }
      case 'shoot': bump(e.p, .12); break;
      case 'bite': { angles.delete(e.b.id); const [x, y] = cellCenter(...game.fruit); fx.push({ k: 'dmg', x, y: y - 40, t: 0, life: .9, txt: `-${BUGS[e.b.kind].bite}`, red: true }); anim.set('apple', 0); break; }
      case 'collect': { const [x, y] = toUI(...sp(e.d.x, e.d.y)); ufx.push({ k: 'fly', x, y, t: 0, life: .5 }); break; }
      case 'place': bump(e.p, .35, true); dust(e.p); terrainDirty = true; break;
      case 'upgrade': { const [x, y] = cellCenter(e.p.i, e.p.j); for (let n = 0; n < 6; n++) fx.push({ k: 'spark', x: x + (Math.random() - .5) * 30, y: y - 10 - Math.random() * 30, t: n * .05, life: .5 }); bump(e.p, .3, true); break; }
      case 'sell': case 'plantDead': dust(e.p); terrainDirty = true; if (pop === e.p) pop = null; if (e.t === 'plantDead') banner(`${T.plant[e.p.type]} ${T.eaten[e.p.type]}!`, 1.4); break;
      case 'chew': { const [x, y] = cellCenter(e.p.i, e.p.j); for (let n = 0; n < 6; n++) fx.push({ k: 'crumb', x, y: y - 6, vx: (Math.random() - .5) * 50, vy: -20 - Math.random() * 30, t: 0, life: .5, col: e.p.type === 'pumpkin' ? '#f7a23a' : '#6cc04a' }); bump(e.p, .2); break; }
      case 'wave': banner(T.wave(e.n, game.waves), 1.4); break;
      case 'waveDone': banner(T.waveDone(e.bonus), 1.8); if (levelIdx === 0 && e.n === 1) banner(T.hint2, 5, true); break;
      case 'power': if (e.kind === 'frost') ufx.push({ k: 'flash', t: 0, life: .6, col: 'rgba(190,240,255,' }); else for (let n = 0; n < 70; n++) ufx.push({ k: 'rain', x: Math.random() * UW, y: -Math.random() * UH, t: 0, life: 1.2 }); break;
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
  if (innerWidth !== seen[0] || innerHeight !== seen[1] || devicePixelRatio !== seen[2] || (visualViewport?.scale || 1) !== seen[3]) resize();
  if (game) draw(paused ? 0 : dt);
  drawDiag(ts);
  requestAnimationFrame(frame);
}

function draw(dt) {
  if (terrainDirty) buildTerrain();
  ui.length = 0;
  // the field layer is copied pixel for pixel at a whole-pixel offset: any resampling would soften it
  c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(terrain, Math.round(dpr * (ox + VB[0] * ws)), Math.round(dpr * (oy + VB[1] * ws)));
  setWorld();
  const t = now / 1000;
  if (sel) drawGrid();
  if (pop && PLANTS[pop.type].range) ring(...cellCenter(pop.i, pop.j), PLANTS[pop.type].range[pop.lvl - 1] * CELL);

  // depth-sorted things on the ground
  const items = [];
  for (const p of game.plants) items.push([cellCenter(p.i, p.j)[1] + 14, () => drawPlant(p, t)]);
  for (const b of game.bugs) if (!b.fly) items.push([sp(b.x, b.y)[1], () => drawBug(b, t, dt)]);
  const [fxx, fyy] = cellCenter(...game.fruit); items.push([fyy + 12, () => drawApple(fxx, fyy, dt)]);
  items.sort((a, b) => a[0] - b[0]); for (const [, f] of items) f();
  for (const p of game.plants) if (p.hp < p.maxHp) { const [x, y] = cellCenter(p.i, p.j); A.hdHp(c, x, y - 32, 28, p.hp / p.maxHp, '#ffb03a'); }
  if (ghost) drawGhost(t);
  for (const d of game.drops) drawDrop(d, t);
  for (const s of game.shots) drawShot(s);
  for (const b of game.bugs) if (b.fly) drawBug(b, t, dt);
  for (const b of game.bugs) if (b.hp < b.maxHp) A.hdHp(c, sp(b.x, b.y)[0], sp(b.x, b.y)[1] - (b.kind === 'rhino' ? 44 : 24), b.kind === 'rhino' ? 56 : 26, b.hp / b.maxHp, b.kind === 'rhino' ? '#ff5a5a' : '#7be05a');
  drawFx(dt, fx);
  if (pop) drawPop();
  setUI();
  drawFx(dt, ufx);
  drawHud(t);
  if (sel && !ghost) drawInfo(sel);
  drawBanners(dt);
  drawScroll();
}
function vignette() { const g = c.createRadialGradient(UW / 2, UH / 2, Math.min(UW, UH) * .45, UW / 2, UH / 2, Math.max(UW, UH) * .62); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(20,40,10,.3)'); c.fillStyle = g; c.fillRect(0, 0, UW, UH); }
function drawScroll() {
  if (!camMax) return;
  const [fx0, fy0, fw, fh] = FBOX.map((v) => v / uk), tot = (PORT ? FH() : FW()) * ws / uk, vis = PORT ? fh : fw, len = Math.max(30, vis * vis / tot), pos = cam / uk / (tot - vis) * (vis - len);
  c.save(); c.globalAlpha = .55; c.fillStyle = '#2a1a0e'; c.beginPath();
  if (PORT) A.rrect(c, UW - 7, fy0 + pos, 4, len, 2); else A.rrect(c, fx0 + pos, UH - 6, len, 4, 2);
  c.fill(); c.restore();
}

function ring(x, y, r) { c.save(); c.beginPath(); c.arc(x, y, r, 0, A.TAU); c.fillStyle = 'rgba(255,255,255,.13)'; c.fill(); c.setLineDash([8, 6]); c.lineWidth = 2.2; c.strokeStyle = 'rgba(255,255,255,.85)'; c.stroke(); c.restore(); }
function drawGrid() {
  if (game.phase === 'wave' && Math.floor(now / 500) !== blockCache?.tick) blockCache = null;
  if (!blockCache) { blockCache = new Set(blockingCells(game).map(([i, j]) => i + ',' + j)); blockCache.tick = Math.floor(now / 500); }
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
  const [x, y] = sp(b.x, b.y), target = screenAngle(b.vx, b.vy);
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
  const [x, y0] = sp(d.x, d.y), y = y0 - 6 + Math.sin(t * 4 + d.id) * 3;
  if (d.age > 4 && Math.floor(t * 8) % 2) return;
  c.save(); const g = c.createRadialGradient(x, y, 1, x, y, 18); g.addColorStop(0, 'rgba(200,245,255,.7)'); g.addColorStop(1, 'rgba(200,245,255,0)'); c.fillStyle = g; c.fillRect(x - 18, y - 18, 36, 36); c.restore();
  A.hdDrop(c, x, y, 8);
  ui.push({ x: x - 22, y: y - 24, w: 44, h: 44, fn: () => collectDrop(game, d.id), s: 'w' });
}
function drawShot(s) {
  const [x, y] = sp(s.x, s.y), [tx, ty] = sp(s.tx, s.ty), ang = Math.atan2(ty - y, tx - x);
  if (s.kind === 'thorn') A.fxThorn(c, x, y, ang, 22);
  else if (s.kind === 'kernel') { const tot = Math.hypot(s.tx - s.sx, s.ty - s.sy) || 1, done = 1 - Math.hypot(s.tx - s.x, s.ty - s.y) / tot; A.hdBall(c, x, y - Math.sin(Math.max(0, Math.min(1, done)) * Math.PI) * 34, 4.4, 4.4, '#ffd23f', { olk: .7 }); }
  else { c.save(); c.translate(x, y); c.rotate(ang); c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1.2; for (let k = 0; k < 7; k++) { c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(k) * 6, Math.sin(k) * 6); c.stroke(); } A.hdLine(c, [0, 0, -12, 0], 'rgba(230,225,210,.9)', 1.4); c.restore(); }
}
function drawGhost(t) {
  const { i, j, ok } = ghost, [x, y] = cellCenter(i, j);
  ghost.t += 1 / 60;
  if (ok && ghost.trail) { const pts = ghost.trail.map(([a, b]) => cellCenter(a, b)); pts.unshift(offEntry(pts[0])); c.save(); c.shadowColor = 'rgba(255,200,40,.9)'; c.shadowBlur = 8; A.strokePts(c, A.chaikin(pts, 3), 4, '#ffd23a', { dash: [10, 7] }); c.restore(); }
  c.save(); c.beginPath(); A.rrect(c, x - 19, y - 19, 38, 38, 10); c.fillStyle = ok ? 'rgba(140,255,120,.35)' : 'rgba(255,80,70,.4)'; c.fill(); c.lineWidth = 3; c.strokeStyle = ok ? '#ffffff' : '#ff4a3a'; c.stroke(); c.restore();
  if (PLANTS[sel].range) ring(x, y, PLANTS[sel].range[0] * CELL);
  c.save(); c.globalAlpha = ok ? .85 : .45; blit(plantSprite(sel, 1), x - 35, y + 14 - 66); c.restore();
  // buttons below the cell (above on the bottom row), the label above (below on the top row)
  const vf = visField(), below = y + 56 < Math.min(FH(), vf[1] + vf[3]), above = y - 60 > Math.max(0, vf[1]) - 8;
  const by = below ? y + 38 : y - 38, ly = above ? (below ? y - 44 : y - 76) : (below ? y + 74 : y + 44);
  if (ok) {
    labelPill(T.gain(ghost.gain), x, ly, ghost.gain > 0 ? '#5cc23e' : '#8a9a7a', ghost.gain > 0 ? '#1f6a17' : '#4a5a3a');
    button(x - 22, by, 16, '#5cc23e', () => A.hdText(c, '✓', x - 22, by + 1, 18, '#fff', { stroke: '#1f5a14', sw: 3 }), confirmGhost);
    button(x + 22, by, 16, '#ff5a4a', () => A.hdText(c, '✕', x + 22, by + 1, 15, '#fff', { stroke: '#7a1010', sw: 3 }), () => { ghost = null; });
  } else labelPill(T.problem[ghost.problem] || '', x, ly, '#e2483a', '#7a1010');
}
function wrap(text, maxW) {
  const out = []; let line = '';
  for (const w of text.split(' ')) { const tr = line ? line + ' ' + w : w; if (c.measureText(tr).width > maxW && line) { out.push(line); line = w; } else line = tr; }
  if (line) out.push(line); return out;
}
function drawInfo(type) {
  const w = PORT ? UW - 16 : 400, x = PORT ? 8 : TRAY + 8, y = PORT ? PTOP + 4 : LTOP + 4;
  c.save(); c.font = '800 12px Nunito'; const lines = wrap(T.about[type], w - 84); c.font = '900 11px Nunito'; const stats = wrap(statLine(type).join(' · '), w - 84); c.restore();
  const h = 30 + lines.length * 15 + stats.length * 14 + 8;
  c.save(); c.shadowColor = 'rgba(0,0,0,.3)'; c.shadowBlur = 10; A.uiPanel(c, x, y, w, h, 16, '#fff3d6', { ol: '#6a3e1c', olw: 2.5 }); c.restore();
  const s = plantSprite(type, 1); c.save(); c.translate(x + 36, y + h / 2 + 22); c.scale(.85, .85); blit(s, -35, -66); c.restore();
  A.hdText(c, T.plant[type], x + 74, y + 16, 15, '#6a3e1c', { stroke: null, align: 'left' });
  lines.forEach((l, k) => A.hdText(c, l, x + 74, y + 33 + k * 15, 12, '#8a5a32', { stroke: null, align: 'left', weight: 800 }));
  stats.forEach((l, k) => A.hdText(c, l, x + 74, y + 36 + lines.length * 15 + k * 14, 11, '#3f8a2a', { stroke: null, align: 'left' }));
}
function labelPill(txt, x, y, col, ol) {
  c.save(); c.font = '900 13px Nunito'; const w = Math.max(70, c.measureText(txt).width + 26); c.restore();
  const vf = visField(), xx = Math.max(vf[0] + w / 2 + 4, Math.min(vf[0] + vf[2] - w / 2 - 4, x));
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
      case 'fly': { const [tx, ty] = DEW, e = k * k; const x = f.x + (tx - f.x) * e, y = f.y + (ty - f.y) * e - Math.sin(k * Math.PI) * 40; c.globalAlpha = 1; A.hdDrop(c, x, y, 7); break; }
      case 'flash': c.globalAlpha = 1; c.fillStyle = f.col + (.5 * (1 - k)) + ')'; c.fillRect(0, 0, UW, UH); break;
      case 'rain': { const y = f.y + k * UH * 1.6; c.globalAlpha = .7; c.strokeStyle = 'rgba(190,230,255,.9)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(f.x, y); c.lineTo(f.x - 4, y + 14); c.stroke(); break; }
    }
    c.restore();
  }
  if (list === fx) fx = fx.filter((f) => f.t < f.life); else ufx = ufx.filter((f) => f.t < f.life);
}
function drawBanners(dt) {
  let topY = PORT ? PTOP + 22 : 64; const midX = PORT ? UW / 2 : TRAY + (UW - TRAY) / 2;
  for (const b of banners) {
    b.t += dt; const k = b.t / b.life; if (k >= 1) continue;
    if (b.top && sel && !ghost) continue; // the plant info panel is in that spot
    const a = Math.min(1, b.t * 5, (1 - k) * 5); const text = typeof b.text === 'function' ? b.text() : b.text;
    c.save(); c.globalAlpha = a;
    if (b.top) {
      const fs = PORT ? 13 : 14; c.font = `900 ${fs}px Nunito`; const lines = wrap(text, UW - 44), w = Math.min(UW - 12, Math.max(...lines.map((l) => c.measureText(l).width)) + 30), h = 12 + lines.length * 18, x = midX;
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
  // layout: [dew panel], [wave bar], [fruit hp panel], buttons y and x (help, speed, pause)
  const L = PORT
    ? { dew: [6, 6, 86, 30], wave: [6, 41, UW - 12, 28], hp: [98, 6, 92, 30], by: 21, bx: [UW - 88, UW - 54, UW - 20], ts: 12 }
    : { dew: [8, 7, 112, 32], wave: [128, 8, UW - 128 - 252, 30], hp: [UW - 242, 7, 120, 32], by: 23, bx: [UW - 98, UW - 60, UW - 22], ts: 14 };
  const [dx, dy, dw, dh] = L.dew; DEW = [dx + 20, dy + dh / 2];
  A.uiPanel(c, dx, dy, dw, dh, dh / 2, '#fff3d6', { ol: '#6a3e1c' });
  A.hdDrop(c, dx + 20, dy + dh / 2 + 1, 8.5); A.hdText(c, String(game.dew), dx + dw / 2 + 12, dy + dh / 2, 20, '#ffffff', { stroke: '#2a6fa8', sw: 5 });
  drawWaveRow(...L.wave, L.ts, t);
  // fruit hp
  const [hx, hy, hw, hh] = L.hp, bw = hw - 44;
  A.uiPanel(c, hx, hy, hw, hh, hh / 2, '#fff3d6', { ol: '#6a3e1c' });
  A.hdApple(c, hx + 18, hy + hh / 2 + 1, 10, {});
  c.save(); c.beginPath(); A.rrect(c, hx + 34, hy + hh / 2 - 6, bw, 13, 6.5); c.fillStyle = 'rgba(60,20,10,.25)'; c.fill();
  c.beginPath(); A.rrect(c, hx + 34, hy + hh / 2 - 6, Math.max(8, bw * game.hp / game.maxHp), 13, 6.5); const hg = c.createLinearGradient(0, hy, 0, hy + hh); hg.addColorStop(0, '#ff8a8a'); hg.addColorStop(1, '#e02c3a'); c.fillStyle = hg; c.fill(); c.restore();
  A.hdText(c, String(game.hp), hx + 34 + bw / 2, hy + hh / 2 + 1, 11, '#fff', { stroke: '#7a1010', sw: 3 });
  const [bh, bs, bp] = L.bx, by = L.by;
  button(bs, by, 15, speed > 1 ? '#ff9a2a' : '#ffcf3a', (x, y) => A.hdText(c, '×' + speed, x, y + 1, 13, '#fff', { stroke: '#8a5a00', sw: 3.5 }), () => { speed = speed > 1 ? 1 : 2; });
  button(bh, by, 15, '#8fd06a', (x, y) => A.hdText(c, '?', x, y + 1, 17, '#fff', { stroke: '#2a6a1a', sw: 3.5 }), () => openGuide(game.L.plants, bugsOf(game.L), T.plantsHere, T.bugsHere));
  button(bp, by, 15, '#7ac8ff', (x, y) => { c.save(); c.fillStyle = '#fff'; c.strokeStyle = '#1f5a8a'; c.lineWidth = 1.5; for (const dx of [-5, 2]) { c.beginPath(); A.rrect(c, x + dx, y - 6, 4, 12, 1.5); c.fill(); c.stroke(); } c.restore(); }, openPause);
  drawCards();
  // powers: bottom right, above the shelf in portrait
  const py0 = PORT ? UH - PBOT - 26 : UH - 34, pr = PORT ? 19 : 21;
  button(UW - (PORT ? 74 : 86), py0, pr, '#8fd6ff', (x, y) => A.iconFrost(x, y, c), () => usePower(game, 'frost'), !game.powers.frost || game.phase !== 'wave');
  badge(UW - (PORT ? 74 : 86), py0, pr, game.powers.frost);
  button(UW - (PORT ? 28 : 34), py0, pr, '#4aa8ee', (x, y) => A.iconRain(x, y, c), () => usePower(game, 'rain'), !game.powers.rain);
  badge(UW - (PORT ? 28 : 34), py0, pr, game.powers.rain);
}
function badge(x, y, r, n) { if (!n) return; c.save(); c.beginPath(); c.arc(x + r * .72, y - r * .68, 9, 0, A.TAU); c.fillStyle = '#ff4646'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#fff'; c.stroke(); c.restore(); A.hdText(c, String(n), x + r * .72, y - r * .68 + .5, 11, '#fff', { stroke: null }); }
function drawCards() {
  const list = game.L.plants, n = list.length, gap = 6;
  let cw, ch, pos;
  if (PORT) {
    [cw, ch] = cardSize();
    const top = UH - PBOT + (PBOT - ch) / 2 + 2, x0 = (UW - (n * cw + (n - 1) * gap)) / 2; pos = (k, on) => [x0 + k * (cw + gap), on ? top - 6 : top];
    shelf(-14, UH - PBOT, UW + 28, PBOT + 20, 0, 0, 0, UH + 20);
  } else {
    const top = 46; ch = Math.min(56, (UH - top - 8 - (gap - 1) * (n - 1)) / n); cw = 62; pos = (k, on) => [on ? 10 : 5, top + k * (ch + gap - 1)];
    shelf(-14, top - 6, TRAY - 2, UH - top + 20, 0, 0, TRAY, 0);
  }
  list.forEach((type, k) => {
    const P = PLANTS[type], on = sel === type, [x, y] = pos(k, on), poor = game.dew < P.cost;
    c.save(); if (on) { c.shadowColor = 'rgba(255,220,60,.95)'; c.shadowBlur = 14; }
    A.uiPanel(c, x, y, cw, ch, 12, on ? '#fff0b8' : '#fbe7c2', { ol: on ? '#c88a10' : '#7a4a22', olw: on ? 3 : 2 }); c.restore();
    // the plant sprite is 70x84 with its base at (35, 66); fit it above the price
    const s = plantSprite(type, 1), k2 = Math.min((cw - 6) / 44, (ch - 14) / 46);
    c.save(); c.beginPath(); A.rrect(c, x + 2, y + 2, cw - 4, ch - 4, 10); c.clip(); c.translate(x + cw / 2, y + ch - 13); c.scale(k2, k2); blit(s, -35, -64); c.restore();
    const label = String(P.cost); c.save(); c.font = '900 12px Nunito'; const bw = c.measureText(label).width + 22; c.restore();
    const bx = x + cw / 2 - bw / 2, by = y + ch - 15;
    c.save(); c.beginPath(); A.rrect(c, bx, by, bw, 16, 8); c.fillStyle = 'rgba(40,25,10,.82)'; c.fill(); c.restore();
    A.hdDrop(c, bx + 8, by + 8.5, 4.2); A.hdText(c, label, bx + bw / 2 + 5, by + 8.5, 12, poor ? '#ff9a8a' : '#fff', { stroke: null });
    if (poor) { c.save(); c.beginPath(); A.rrect(c, x, y, cw, ch, 12); c.fillStyle = 'rgba(60,40,30,.35)'; c.fill(); c.restore(); }
    ui.push(PORT ? { x: x - gap / 2, y: y - 8, w: cw + gap, h: ch + 16, fn: () => selectCard(type), s: 'u' } : { x: 0, y, w: TRAY, h: ch + gap, fn: () => selectCard(type), s: 'u' });
  });
}
function shelf(x, y, w, h, gx0_, gy0_, gx1, gy1) {
  c.save(); c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 10; c.beginPath(); A.rrect(c, x, y, w, h, 16);
  const tg = c.createLinearGradient(gx0_, gy0_ || y, gx1, gy1 || y); tg.addColorStop(0, '#7a4a26'); tg.addColorStop(1, '#a8703c'); c.fillStyle = tg; c.fill(); c.restore();
  c.save(); c.beginPath(); A.rrect(c, x, y, w, h, 16); c.lineWidth = 2.5; c.strokeStyle = '#4a2a12'; c.stroke(); c.restore();
}
// One line: wave progress, and while building also who comes next and the start button.
function waveBar(x, y, w, h, text, ts) {
  A.uiPanel(c, x, y, w, h, h / 2, '#5a3a22', { ol: '#2a1a0e' });
  const done = game.phase === 'build' ? game.wave / game.waves : (game.wave - 1 + Math.min(1, game.waveTime / Math.max(1, (game.L.waves[game.wave - 1] || [[0, 1, 1, 0]]).reduce((s, [, n, gap, d]) => s + d + n * gap, 0)))) / game.waves;
  c.save(); c.beginPath(); A.rrect(c, x + 4, y + 4, Math.max(h - 8, (w - 8) * done), h - 8, (h - 8) / 2); const g = c.createLinearGradient(0, y + 4, 0, y + h - 4); g.addColorStop(0, '#a8f070'); g.addColorStop(1, '#4cb02e'); c.fillStyle = g; c.fill(); c.restore();
  A.hdText(c, text, x + w / 2, y + h / 2 + .5, ts, '#ffffff', { stroke: '#2a1a0e', sw: 4 });
}
function drawWaveRow(x, y, w, h, ts, t) {
  if (game.phase !== 'build') { const bw = Math.min(w, 220); waveBar(x + (w - bw) / 2, y, bw, h, T.wave(game.wave, game.waves), ts); return; }
  const prev = wavePreview(game), chipW = 46, bw = 88, barW = Math.max(64, w - bw - prev.length * chipW - 10);
  c.save(); c.font = `900 ${ts}px Nunito`; const long = `${T.next} ${game.wave + 1} / ${game.waves}`, txt = c.measureText(long).width + 16 < barW ? long : `${game.wave + 1} / ${game.waves}`; c.restore();
  waveBar(x, y, barW, h, txt, ts);
  prev.forEach(([k, n], i) => {
    const cx = x + barW + 6 + i * chipW + 12, cy = y + h / 2, s = bugSprite(k, 0), sc = (k === 'rhino' ? .3 : .55) * h / 28;
    c.save(); c.translate(cx, cy); c.rotate(-Math.PI / 2); c.scale(sc, sc); blit(s, -s.w / 2, -s.h / 2); c.restore();
    A.hdText(c, '×' + n, cx + 18, cy + 4, 12, '#fff', { stroke: '#4a2a12', sw: 3.5 });
  });
  const bx = x + w - bw, pulse = 1 + Math.sin(t * 5) * .03;
  c.save(); c.translate(bx + bw / 2, y + h / 2); c.scale(pulse, pulse); c.shadowColor = 'rgba(80,200,40,.7)'; c.shadowBlur = 10; A.uiPanel(c, -bw / 2, -h / 2, bw, h, h / 2, '#5cc23e', { ol: '#1f6a17', olw: 2.5 }); c.restore();
  A.hdText(c, T.go, bx + bw / 2, y + h / 2 + .5, 15, '#fff', { stroke: '#1f5a14', sw: 4 });
  ui.push({ x: bx - 4, y: y - 6, w: bw + 8, h: h + 12, fn: () => { sel = null; ghost = null; pop = null; startWave(game); }, s: 'u' });
}
function drawPop() {
  const p = pop, vf = visField(), [x0, y] = cellCenter(p.i, p.j), x = clamp(x0, vf[0] + 66, vf[0] + vf[2] - 66), up = upgradeCost(p), yy = y - 96 > vf[1] ? y - 56 : y + 50;
  A.uiPanel(c, x - 62, yy - 26, 124, 52, 18, '#fff3d6', { ol: '#6a3e1c' });
  button(x - 30, yy, 17, up == null ? '#c8b070' : '#5cc23e', (bx, by) => { if (up == null) A.hdText(c, '★', bx, by + 1, 16, '#fff', { stroke: '#8a6a10', sw: 3 }); else { A.hdText(c, '⬆', bx, by - 4, 13, '#fff', { stroke: '#1f5a14', sw: 3 }); A.hdText(c, String(up), bx, by + 8, 10, '#fff', { stroke: '#1f5a14', sw: 3 }); } }, () => { upgrade(game, p); }, up == null || game.dew < up);
  button(x + 30, yy, 17, '#e0884a', (bx, by) => { A.hdText(c, '✕', bx, by - 4, 12, '#fff', { stroke: '#7a3a10', sw: 3 }); A.hdText(c, '+' + refund(p), bx, by + 8, 10, '#fff', { stroke: '#7a3a10', sw: 3 }); }, () => { removePlant(game, p); pop = null; });
  A.hdText(c, T.plant[p.type], x, yy - 34, 12, '#fff', { stroke: '#4a2a12', sw: 3.5 });
}

// ---------- input ----------
// Taps act on release; a drag across the field scrolls it when it does not fit.
let press = null;
const hit = (list, x, y) => { for (let k = list.length - 1; k >= 0; k--) { const u = list[k]; if (x >= u.x && y >= u.y && x <= u.x + u.w && y <= u.y + u.h) return u; } return null; };
function tap(px, py) {
  const u = hit(ui.filter((q) => q.s === 'u'), px / uk, py / uk); if (u) { u.fn(); return; }
  const wx = (px - ox) / ws, wy = (py - oy) / ws, w = hit(ui.filter((q) => q.s === 'w'), wx, wy); if (w) { w.fn(); return; }
  const [i, j] = cellAt(wx, wy);
  if (wx >= 0 && wy >= 0 && i >= 0 && j >= 0 && i < COLS && j < ROWS) tapCell(i, j); else { ghost = null; pop = null; }
}
cv.addEventListener('pointerdown', (e) => {
  if (!game || paused) return;
  press = { id: e.pointerId, x: e.clientX, y: e.clientY, cam0: cam, moved: false, onUI: !!hit(ui.filter((q) => q.s === 'u'), e.clientX / uk, e.clientY / uk) };
});
cv.addEventListener('pointermove', (e) => {
  if (!press || e.pointerId !== press.id || !camMax || press.onUI) return;
  const d = PORT ? e.clientY - press.y : e.clientX - press.x;
  if (!press.moved && Math.abs(d) > 10) press.moved = true;
  if (press.moved) { cam = clamp(press.cam0 - d, 0, camMax); applyCam(); }
});
cv.addEventListener('pointerup', (e) => { if (!press || e.pointerId !== press.id) return; const p = press; press = null; if (!p.moved && game && !paused) tap(p.x, p.y); });
cv.addEventListener('pointercancel', () => { press = null; });
cv.addEventListener('wheel', (e) => { if (!camMax) return; cam = clamp(cam + (e.deltaY || e.deltaX), 0, camMax); applyCam(); }, { passive: true });
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
  showModal(`<h2>${T.pause}</h2><div class="diag">${VERSION} · ${innerWidth}×${innerHeight} @${devicePixelRatio} · холст ${cv.width}×${cv.height} · ui ${uk.toFixed(2)} · поле ${ws.toFixed(2)}${visualViewport && visualViewport.scale !== 1 ? ' · зум ' + visualViewport.scale.toFixed(2) : ''}</div><div class="row"><button class="btn" id="mResume">${T.resume}</button><button class="btn alt" id="mRestart">${T.restart}</button><button class="btn alt" id="mHome">${T.levels}</button></div>`);
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
  $('diag').textContent = `${VERSION} · ${innerWidth}×${innerHeight} @${devicePixelRatio} → ${dpr.toFixed(2)} · экран ${screen.width}×${screen.height}`;
  game = createGame(0); paused = true; // a field behind the menu
  requestAnimationFrame(frame);
  if (new URLSearchParams(location.search).has('dev')) window.__fd = { get game() { return game; }, startLevel, set speed(v) { speed = v; }, cell: (i, j) => { const [x, y] = cellCenter(i, j); return [ox + x * ws, oy + y * ws]; }, scroll: (v) => { cam = clamp(v, 0, camMax); applyCam(); }, get camMax() { return camMax; }, layout: () => ({ card: ui.filter((u) => u.s === 'u' && u.h > 40 && u.w < 90).map((u) => [(u.x + u.w / 2) * uk, (u.y + u.h / 2) * uk]) }) };
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
