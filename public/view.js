// Drawing, input, HUD and screens. The game state lives in game.js; this file only shows it and turns taps into actions.
import * as A from './art.js';
import {
  createGame, step, place, placeProblem, blockingCells, previewTrail, trail, upgrade, upgradeCost, removePlant, refund,
  startWave, wavePreview, usePower, collectDrop, stars, COLS, ROWS,
} from './game.js';
import { PLANTS, BUGS, LEVELS } from './data.js';

const T = {
  wave: (n, m) => `Волна ${n} / ${m}`, go: 'В бой!',
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
  hint1: 'Тапни по траве и выбери растение — жуки пойдут в обход',
  pick: 'Что посадить?',
  hint2: 'Посадки удлиняют путь. Когда готов — «В\u00a0бой!»',
  zoomHint: 'Поле можно приблизить двумя пальцами',
  won: 'Яблоко спасено!', lost: 'Жуки съели яблоко', retry: 'Ещё раз', levels: 'Уровни', nextLevel: 'Дальше', resume: 'Продолжить',
  pause: 'Пауза', restart: 'Заново', waveDone: (b) => `Волна пройдена  +${b}`, newPlant: 'Новое растение',
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
  FA = PORT ? [6, PTOP * uk, vw - 12, vh - (PTOP + PBOT) * uk] : [LLEFT * uk, 6, vw - (LLEFT + LRIGHT) * uk, vh - 12];
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
  fieldEdge(x);
  const [ex, ey] = cellCenter(...game.entry); if (PORT) A.hdAnthill(x, ex, ey - 14, 1); else A.hdAnthill(x, ex + 16, ey + 4, 1);
  x.setTransform(k, 0, 0, k, 0, 0);
  A.hdDapple(x); A.hdSun2(x); A.hdGrade(x); A.hdVignette(x);
  // a little more colour; done here, not as a CSS filter on the canvas: Safari renders filtered canvases blurry
  free(terrain);
  if ('filter' in x) { const [pop, y] = layer(VB[2], VB[3], k); y.filter = 'saturate(1.12) contrast(1.04)'; y.drawImage(cnv, 0, 0, VB[2], VB[3]); free(cnv); terrain = pop; } else terrain = cnv;
  terrainDirty = false; blockCache = null;
}
// Shade the grass outside the grid and outline it, so the plantable field reads as a board.
function fieldEdge(x) {
  const w = FW(), h = FH(), r = 14;
  x.save(); x.beginPath(); x.rect(VB[0], VB[1], VB[2], VB[3]); A.rrect(x, -3, -3, w + 6, h + 6, r);
  x.fillStyle = 'rgba(30,60,15,.26)'; x.fill('evenodd');
  for (const [d, a] of [[3, .1], [6, .07], [10, .05]]) { x.beginPath(); A.rrect(x, -3 - d, -3 - d, w + 6 + 2 * d, h + 6 + 2 * d, r + d); x.lineWidth = 6; x.strokeStyle = `rgba(30,60,15,${a})`; x.stroke(); }
  x.beginPath(); A.rrect(x, -3, -3, w + 6, h + 6, r); x.lineWidth = 2; x.strokeStyle = 'rgba(255,255,220,.45)'; x.stroke();
  x.restore();
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

// ---------- game flow ----------
function startLevel(n) {
  levelIdx = n; game = createGame(n, Date.now() & 0xffff); resize();
  sel = ghost = pop = null; fx = []; banners = []; angles.clear(); anim.clear(); speed = 1;
  grassLayer = null; terrainDirty = true; paused = false;
  showHome(false); showModal(null); ufx = []; zoom = 1; applyCam(); dropLayers();
  if (zmax > 1.4 && matchMedia('(pointer: coarse)').matches && !localStorage.getItem('fruit.zoomHint')) { banner(T.zoomHint, 5, true); localStorage.setItem('fruit.zoomHint', '1'); }
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
function openGuide(plants, bugs, pt, bt, back = null) {
  paused = true;
  showModal(`<div class="guide">${guideRows(plants, bugs, pt, bt)}</div><div class="row"><button class="btn" id="mOk">${T.ok}</button></div>`);
  $('mOk').onclick = () => { if (back) back(); else { showModal(null); paused = false; } };
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
  setUI();
  drawFx(dt, ufx);
  drawHud(t);
  drawBanners(dt);
  if (ghost) drawPicker(t);
  if (pop) drawPop();
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
  const r = Math.max(22, 22 / ws); ui.push({ x: x - r, y: y - r - 2, w: r * 2, h: r * 2, fn: () => collectDrop(game, d.id), s: 'w' });
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
  const w = Math.max(cols * (bw + gap) - gap + pad * 2, 190), h = 30 + rows * (bh + gap) - gap + pad;
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
  const g = ghost;
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
      case 'fly': { const [tx, ty] = DEW, e = k * k; const x = f.x + (tx - f.x) * e, y = f.y + (ty - f.y) * e - Math.sin(k * Math.PI) * 40; c.globalAlpha = 1; A.hdDrop(c, x, y, 7); break; }
      case 'flash': c.globalAlpha = 1; c.fillStyle = f.col + (.5 * (1 - k)) + ')'; c.fillRect(0, 0, UW, UH); break;
      case 'rain': { const y = f.y + k * UH * 1.6; c.globalAlpha = .7; c.strokeStyle = 'rgba(190,230,255,.9)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(f.x, y); c.lineTo(f.x - 4, y + 14); c.stroke(); break; }
    }
    c.restore();
  }
  if (list === fx) fx = fx.filter((f) => f.t < f.life); else ufx = ufx.filter((f) => f.t < f.life);
}
function drawBanners(dt) {
  let topY = PORT ? PTOP + 20 : 26; const midX = (FA[0] + FA[2] / 2) / uk;
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
  const build = game.phase === 'build', zb = zmax > 1.15;
  if (PORT) { // top: dew, fruit, wave or start, pause; bottom: powers, next wave, zoom, speed
    const by = UH - PBOT / 2;
    dewPill(6, 7, 86, 32); hpPill(98, 7, 70, 32);
    if (build) goButton(174, 7, UW - 174 - 46, 32, t); else waveBar(174, 9, UW - 174 - 46, 28, T.wave(game.wave, game.waves), 12);
    pauseBtn(UW - 22, 23);
    powerBtns([28, by], [74, by]);
    speedBtn(UW - 24, by); if (zb) zoomBtn(UW - 62, by);
    if (build) previewRow(102, by, UW - (zb ? 82 : 44) - 102);
  } else { // left: dew, fruit, wave, next wave, start; right: pause, speed, zoom, powers
    const x = 8, w = LLEFT - 16, cx = UW - LRIGHT / 2;
    dewPill(x, 8, w, 32); hpPill(x, 46, w, 32);
    waveBar(x, 86, w, 26, build ? `${game.wave + 1} / ${game.waves}` : T.wave(game.wave, game.waves), 12);
    if (build) { previewColumn(x, 120, w, UH - 120 - 58); goButton(x, UH - 50, w, 42, t); }
    pauseBtn(cx, 24); speedBtn(cx, 64); if (zb) zoomBtn(cx, 104);
    powerBtns([cx, UH - 74], [cx, UH - 28]);
  }
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
function goButton(x, y, w, h, t) {
  const pulse = 1 + Math.sin(t * 5) * .03;
  c.save(); c.translate(x + w / 2, y + h / 2); c.scale(pulse, pulse); c.shadowColor = 'rgba(80,200,40,.7)'; c.shadowBlur = 10; A.uiPanel(c, -w / 2, -h / 2, w, h, Math.min(h / 2, 16), '#5cc23e', { ol: '#1f6a17', olw: 2.5 }); c.restore();
  A.hdText(c, T.go, x + w / 2, y + h / 2 + .5, 16, '#fff', { stroke: '#1f5a14', sw: 4 });
  ui.push({ x: x - 4, y: y - 4, w: w + 8, h: h + 8, fn: () => { ghost = null; pop = null; startWave(game); }, s: 'u' });
}
function bugChip(k, n, cx, cy) {
  const s = bugSprite(k, 0), sc = k === 'rhino' ? .3 : .5;
  c.save(); c.translate(cx, cy); c.rotate(-Math.PI / 2); c.scale(sc, sc); blit(s, -s.w / 2, -s.h / 2); c.restore();
  A.hdText(c, '×' + n, cx + 12, cy + 3, 12, '#fff', { stroke: '#4a2a12', sw: 3.5, align: 'left' });
}
// who comes in the next wave: a row (portrait, bottom band) or a column (landscape, left band)
function previewRow(x, cy, w) {
  const prev = wavePreview(game), cw = 44, tw = prev.length * cw + 34, x0 = x + (w - tw) / 2;
  A.uiPanel(c, x0, cy - 15, tw, 30, 15, 'rgba(60,35,18,.78)', { ol: '#2a1a0e' });
  A.hdText(c, `${game.wave + 1}/${game.waves}`, x0 + 17, cy + .5, 11, '#ffe9a0', { stroke: null });
  prev.forEach(([k, n], i) => bugChip(k, n, x0 + 38 + i * cw, cy));
}
function previewColumn(x, y, w, hmax) {
  const prev = wavePreview(game), rh = Math.min(28, hmax / Math.max(1, prev.length));
  prev.forEach(([k, n], i) => { const cy = y + rh * i + rh / 2; A.uiPanel(c, x + 6, cy - 12, w - 12, 24, 12, 'rgba(60,35,18,.7)', { ol: '#2a1a0e', olw: 1.5 }); bugChip(k, n, x + 26, cy); });
}
function pauseBtn(x, y) { button(x, y, 16, '#7ac8ff', (bx, by) => { c.save(); c.fillStyle = '#fff'; c.strokeStyle = '#1f5a8a'; c.lineWidth = 1.5; for (const dx of [-5, 2]) { c.beginPath(); A.rrect(c, bx + dx, by - 6, 4, 12, 1.5); c.fill(); c.stroke(); } c.restore(); }, openPause); }
function speedBtn(x, y) { button(x, y, 16, speed > 1 ? '#ff9a2a' : '#ffcf3a', (bx, by) => A.hdText(c, '×' + speed, bx, by + 1, 13, '#fff', { stroke: '#8a5a00', sw: 3.5 }), () => { speed = speed > 1 ? 1 : 2; }); }
function zoomBtn(x, y) {
  const inn = zoom < 1.05;
  button(x, y, 16, '#fff3d6', (bx, by) => zoomIcon(bx, by, inn), () => { const cx = FA[0] + FA[2] / 2, cy = FA[1] + FA[3] / 2; zoomTo(inn ? Math.min(2, zmax) : 1, cx, cy); });
}
function powerBtns([fx0, fy0], [rx, ry]) {
  button(fx0, fy0, 19, '#8fd6ff', (x, y) => A.iconFrost(x, y, c), () => usePower(game, 'frost'), !game.powers.frost || game.phase !== 'wave');
  badge(fx0, fy0, 19, game.powers.frost);
  button(rx, ry, 19, '#4aa8ee', (x, y) => A.iconRain(x, y, c), () => usePower(game, 'rain'), !game.powers.rain);
  badge(rx, ry, 19, game.powers.rain);
}
// magnifier with a plus (zoom in) or a minus (back to the whole field)
function zoomIcon(x, y, plus) {
  c.save(); c.lineCap = 'round'; c.strokeStyle = '#6a3e1c';
  c.lineWidth = 4; c.beginPath(); c.moveTo(x + 4, y + 4); c.lineTo(x + 9, y + 9); c.stroke();
  c.lineWidth = 2.5; c.beginPath(); c.arc(x - 2, y - 2, 7, 0, A.TAU); c.fillStyle = '#ffffff'; c.fill(); c.stroke();
  c.lineWidth = 2.2; c.beginPath(); c.moveTo(x - 5.5, y - 2); c.lineTo(x + 1.5, y - 2); if (plus) { c.moveTo(x - 2, y - 5.5); c.lineTo(x - 2, y + 1.5); } c.stroke();
  c.restore();
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
  if (ptrs.size === 1) startPress(e.pointerId, e.clientX, e.clientY);
  else startPinch();
});
cv.addEventListener('pointermove', (e) => {
  const q = ptrs.get(e.pointerId); if (!q) return; q.x = e.clientX; q.y = e.clientY;
  if (!game || paused) { pinch = press = null; return; }
  if (pinch && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()];
    zoomTo(pinch.z0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d0, (a.x + b.x) / 2, (a.y + b.y) / 2, pinch.wx, pinch.wy);
    return;
  }
  if (!press || e.pointerId !== press.id || press.onUI) return;
  const dx = e.clientX - press.x, dy = e.clientY - press.y;
  if (!press.moved && Math.hypot(dx, dy) > 10) press.moved = true;
  if (press.moved && zoom > 1) { camX = press.cx - dx / ws; camY = press.cy - dy / ws; applyCam(); }
});
const release = (e) => {
  if (!ptrs.delete(e.pointerId)) return;
  if (pinch) { if (ptrs.size >= 2) startPinch(); else { pinch = null; zoomT = performance.now(); const [id, q] = [...ptrs.entries()][0] || []; press = null; if (q) startPress(id, q.x, q.y, true); } return; }
  if (press && e.pointerId === press.id) { const p = press; press = null; if (e.type === 'pointerup' && !p.moved && game && !paused) tap(p.x, p.y); }
};
cv.addEventListener('pointerup', release);
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
  showModal(`<h2>${T.pause}</h2><div class="row"><button class="btn" id="mResume">${T.resume}</button><button class="btn alt" id="mHelp">${T.help}</button><button class="btn alt" id="mRestart">${T.restart}</button><button class="btn alt" id="mHome">${T.levels}</button></div>`);
  $('mResume').onclick = () => { showModal(null); paused = false; };
  $('mRestart').onclick = () => startLevel(levelIdx);
  $('mHelp').onclick = () => openGuide(game.L.plants, bugsOf(game.L), T.plantsHere, T.bugsHere, openPause);
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
  if (new URLSearchParams(location.search).has('dev')) window.__fd = { get game() { return game; }, startLevel, set speed(v) { speed = v; }, cell: (i, j) => { const [x, y] = cellCenter(i, j); return [ox + x * ws, oy + y * ws]; }, scroll: () => {}, zoom: (z, x = innerWidth / 2, y = innerHeight / 2) => zoomTo(z, x, y), get view() { return { zoom, zmax, cell: CELL * ws, FA }; }, layout: () => ({ card: ui.filter((u) => u.card).map((u) => [(u.x + u.w / 2) * uk, (u.y + u.h / 2) * uk]) }) };
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
