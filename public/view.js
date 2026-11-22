// Drawing, input, HUD and screens. The game state lives in game.js; this file only shows it and turns taps into actions.
import * as A from './art.js';
import {
  createGame, step, plantOn, plantProblem, placeProblem, blockingCells, previewTrails, trails, upgrade, upgradeCost, removePlant, refund, isFresh,
  startWave, earlyBonus, wavePreview, usePower, stars, regrow, regrowCost, clearStub, stubAt, heal, healCost, bugHp, rewardOf, pstat, clearWeed,
  snapshot, restore, digTrails, digHills, COLS, ROWS, BREAK,
} from './game.js';
import { PLANTS, BUGS, LEVELS, PERKS, PERK_ORDER, PLANT_ORDER, WEED_COST, FERTILE, TUNE, FLY_HP } from './data.js';
import { initAudio, applyVolume, sfx, muffleMusic } from './audio.js';
import { createTelemetry } from './telemetry.js';
// party analytics (telemetry.js), not from a dev page or a copy run at home: their parties are not players' (?t=1
// records them all the same, to check the recording itself)
const tm = createTelemetry({ enabled: new URLSearchParams(location.search).has('t') || (!new URLSearchParams(location.search).has('dev') && /[a-z]\.[a-z]{2,}$/i.test(location.hostname) && !location.hostname.endsWith('.local')) }); // a name, not an address

const T = {
  wave: (n, m) => `Волна ${n} / ${m}`, go: 'В бой!', soon: (n, s) => `Волна ${n} через ${s} с`,
  plant: { pumpkin: 'Тыква', rose: 'Шиповник', aloe: 'Алоэ', corn: 'Кукуруза', mint: 'Мята', pepper: 'Перец', dandelion: 'Одуванчик', flytrap: 'Мухоловка', bell: 'Колокольчик' },
  eaten: { pumpkin: 'съедена', rose: 'съеден', aloe: 'съедено', corn: 'съедена', mint: 'съедена', pepper: 'съеден', dandelion: 'съеден', flytrap: 'съедена', bell: 'съеден' },
  // a few words for the card under the plant's name
  role: { pumpkin: 'Стена', rose: 'Метит шипами', aloe: 'Лекарь', corn: 'Бьёт по толпе', mint: 'Замедляет', pepper: 'Жжёт толпу', dandelion: 'Дальний, по летающим', flytrap: 'Глотает ослабленных', bell: 'Помощник' },
  about: {
    pumpkin: 'Живая стена. Не стреляет, зато крепкая и дешёвая: из тыкв строят лабиринт, чтобы жуки шли дольше.',
    rose: 'Колет шипами, и уколотый жук несколько секунд получает больше урона от всех растений. Сам бьёт слабо — ставь рядом с сильными. Достаёт и летающих.',
    aloe: 'Не воюет: лечит покусанные растения вокруг, а съеденные рядом с ним отрастают гораздо быстрее.',
    corn: 'Кидает початок навесом: зёрна задевают нескольких жуков рядом с целью. Хороша против толпы. Летающих не достаёт.',
    mint: 'Холодит: жуки рядом ползут медленнее и дольше остаются под обстрелом. Сама не бьёт — ставь рядом со стрелками.',
    pepper: 'Обжигает сразу всех жуков вокруг себя, сколько бы их ни было, и поджигает. Каждому достаётся немного: хорош против плотной толпы мелких. Огонь не замечает броню.',
    dandelion: 'Бьёт очень далеко и сильно — первыми сбивает летающих. Ползущих тоже бьёт, но только рядом с собой и слабее. Ставь так, чтобы доставал до яблока: туда летят все.',
    flytrap: 'Кусает одного жука очень сильно — броня не спасает. А жука, которого другие уже потрепали, глотает целиком, даже толстого. Потом жуёт. Боссов не глотает.',
    bell: 'Звенит — и растения на соседних клетках стреляют чаще. Сам не бьёт.',
  },
  // what the third level adds
  perk: {
    pumpkin: 'Колючая: кто её грызёт, сам теряет здоровье',
    rose: 'Стреляет сразу по двум жукам',
    aloe: 'Растения вокруг получают на 30% меньше урона',
    corn: 'Взрыв зёрен шире и задевает больше жуков',
    mint: 'Раз в 6 с замораживает жуков вокруг на секунду',
    pepper: 'Жуки горят в полтора раза дольше',
    dandelion: 'Пушинка оглушает летающего на полсекунды',
    flytrap: 'Ловит и летающих',
    bell: 'Звон слышен намного дальше',
  },
  bug: { ant: 'Муравей', aphid: 'Тля', beetle: 'Бронзовка', caterpillar: 'Гусеница', grasshopper: 'Кузнечик', snail: 'Улитка', pillbug: 'Мокрица', butterfly: 'Бабочка', wasp: 'Оса', firefly: 'Светлячок', cricket: 'Медведка', rhino: 'Жук-носорог', queen: 'Матка', slugking: 'Король слизней', hornet: 'Шершень', spider: 'Паучиха' },
  bugAbout: {
    ant: 'Обычный, зато их много.',
    aphid: 'Мелкая и слабая, но идёт толпой. Кукуруза и перец накрывают сразу многих.',
    beetle: 'В панцире: слабые удары почти не берут.',
    caterpillar: 'Грызёт растения рядом с тропинкой. Тыква держится дольше всех.',
    grasshopper: 'Быстрый, но хилый.',
    snail: 'Медленная и очень крепкая. Мята её не замедляет.',
    pillbug: 'Вся в броне: шипы от неё отскакивают. Жги перцем или бей сильными ударами.',
    butterfly: 'Летит напрямик над лабиринтом и не устаёт. Бьют её шиповник и одуванчик, мята замедляет.',
    wasp: 'Летит напрямик, быстрая и крепче бабочки.',
    firefly: 'Лечит жуков вокруг себя. Бей его первым!',
    cricket: 'Идёт к яблоку напрямик и прогрызает стены на пути — остальные жуки побегут в дыру. Выбирает растения послабее.',
    rhino: 'Босс. Огромный и в броне, время от времени разгоняется и несётся бегом.',
    queen: 'Босс. По пути выпускает муравьёв — чем дольше идёт, тем их больше.',
    slugking: 'Босс. Мята его не берёт, а когда лопнет — из него вылезут улитки.',
    hornet: 'Босс. Летит напрямик к яблоку и зовёт ос. Нужны шиповник и одуванчики у яблока.',
    spider: 'Босс. Опутывает паутиной растения рядом: они на время замирают. Дождь смывает паутину.',
  },
  feature: {
    fertile: ['Плодородная земля', 'На тёмных грядках растения на треть сильнее и крепче.'],
    mud: ['Грязь', 'В грязи жуки вязнут и ползут почти вдвое медленнее. Веди тропинку через лужи — а посадишь в грязь растение, лужа пропадёт зря.'],
    water: ['Пруды', 'В воду ничего не посадишь, и жуки её обходят. Летающим пруд не помеха.'],
    nettle: ['Крапива', 'На крапиве ничего не растёт, зато жуков она жалит. Пусть тропинка идёт через неё.'],
    twin: ['Два муравейника', 'Жуки идут с двух сторон. Сведи обе тропинки в одну — и стрелять по ним будут одни и те же растения.'],
    weed: ['Заросли', `Колючие кусты мешают сажать. Тапни по кусту — уберёшь его за ${WEED_COST} росы. А можно оставить стеной.`],
  },
  featureShort: { fertile: 'грядки', mud: 'грязь', water: 'пруды', nettle: 'крапива', twin: '2 муравейника', weed: 'заросли' },
  perkName: { dew: 'Утренняя роса', heart: 'Крепкое яблоко', roots: 'Живучие корни', clouds: 'Тучи наготове', refund: 'Бережный садовник' },
  perkAbout: {
    dew: (v) => `+${v} росы в начале уровня`, heart: (v) => `+${v} к здоровью яблока`, roots: (v) => `Корни отрастают на ${Math.round((1 - v) * 100)}% быстрее`,
    clouds: (v) => `+${v} мороз и +${v} дождь в начале уровня`, refund: (v) => `За проданное растение возвращается ${Math.round(v * 100)}% росы`,
    pumpkin: (v) => `Прочность +${Math.round((v - 1) * 100)}%`, rose: (v) => `Урон +${Math.round((v - 1) * 100)}%`, corn: (v) => `Урон +${Math.round((v - 1) * 100)}%`,
    aloe: (v) => `Лечит на ${Math.round((v - 1) * 100)}% быстрее`, mint: (v) => `Замедляет ещё на ${Math.round(v * 100)}%`, pepper: (v) => `Огонь жжёт на ${Math.round((v - 1) * 100)}% сильнее`,
    dandelion: (v) => `Урон +${Math.round((v - 1) * 100)}%`, flytrap: (v) => `Жуёт на ${Math.round((1 - v) * 100)}% быстрее`, bell: (v) => `Соседи стреляют ещё на ${Math.round(v * 100)}% чаще`,
  },
  fresh: (list) => `Новое: ${list.join(', ')}. Зажми, чтобы узнать подробнее`, freshBug: (list) => `Новый жук: ${list.join(', ')}. Зажми его, чтобы узнать подробнее`,
  boss: (name) => `Босс: ${name}!`,
  roots: (name) => `${name}: корни`, rootsHint: 'Корни отрастут сами. Тапни по ним — отрастут сразу, за росу. Держи немного росы про запас', powersBack: 'Мороз и дождь снова с тобой', regrown: 'Отросло!', lvl: (n) => `уровень ${n}`,
  problem: { same: 'Здесь уже такое растение', busy: 'Здесь занято', blocks: 'Нельзя закрыть жукам путь', poor: 'Не хватает росы', nettle: 'На крапиве ничего не растёт', outside: '' },
  swap: (n, lvl) => (lvl > 1 ? `замена ур. ${lvl}, вернётся ${n}` : `замена, вернётся ${n}`), swapAgain: 'Тапни ещё раз — заменить',
  gain: (n) => (n > 0 ? `путь +${n}` : n < 0 ? `путь ${n}` : 'путь тот же'),
  hint1: 'Перетащи растение с полки на поле. Первый уровень растения дешёвый — строй из них длинную петляющую тропинку. Готов — жми ▶',
  holdHint: 'Зажми растение или жука — узнаешь, кто это',
  dragHint: 'Сначала выбери растение на полке — или просто перетащи его на поле',
  hint2: 'Роса приходит за каждую пройденную волну. Дальше волны придут сами. Нажмёшь ▶ раньше — получишь ещё',
  digHint: 'Сверчки прогрызают растения насквозь. «!» над растением — здесь они пройдут. Нажми на сверчка в волне — покажу их путь. Выращенную тыкву грызть долго, и она колется',
  belled: (v) => `Звенит колокольчик: на ${Math.round(v * 100)}% чаще`,
  guarded: (v) => `Алоэ рядом: урона на ${Math.round(v * 100)}% меньше`,
  trailHint: 'Чем длиннее и извилистее тропинка, тем дольше жуки ползут мимо твоих растений. Ставь стрелков там, где тропинка проходит рядом несколько раз',
  upHint: 'Улучшения дорогие — копи росу и усиливай те растения, мимо которых жуки ползут дольше всего',
  growNote: `Жуки крепнут: каждая волна добавляет им ${Math.round(TUNE.hpGrowth * 100)}% начального здоровья (летающим — ${Math.round(TUNE.hpGrowth * FLY_HP * 100)}%), на всех уровнях одинаково.`,
  zoomHint: 'Поле можно приблизить двумя пальцами',
  undoHint: 'Ошиблась клеткой? Пока волна не началась, растение продаётся за полную цену',
  won: 'Яблоко спасено!', lost: 'Жуки съели яблоко', retry: 'Ещё раз', levels: 'Уровни', nextLevel: 'Дальше', resume: 'Продолжить',
  pause: 'Пауза', restart: 'Заново', waveDone: (b) => `Волна пройдена  +${b}`, early: (b) => `+${b} за смелость`,
  screams: ['Ай!', 'Ой-ой!', 'Больно!', 'Кусь?!', 'Ай-ай!'],
  up: 'Улучшить', sell: 'Продать', healBtn: 'Лечить', max: 'Максимум', lvl3: 'На 3 уровне', webbed: 'В паутине!', onFertile: 'На грядке: +30%', fullRefund: 'вернётся вся роса',
  weed: 'Убрать куст', perks: 'Улучшения', guide: 'Справочник', sound: 'Звук', music: 'Музыка', close: 'Закрыть', ok: 'Понятно', reset: 'Сбросить',
  newPlant: 'Новое растение', levelFeature: 'Особенность уровня', cont: (name, w) => `Продолжить: ${name}, волна ${w}`,
  starsFree: (free, all) => `Свободно <b>★ ${free}</b> из ${all}`, perksHint: 'Звёзды дают за уровни. Улучшения можно сбросить и раздать заново.',
  spend: 'У тебя есть свободные звёзды — потрать их в «Улучшениях»',
  plantsTab: 'Растения', bugsTab: 'Жуки', unknown: 'Ещё не встречался', locked: 'Откроется позже',
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
// sel: the plant picked on the shelf (taps on free cells plant it); drag: a plant being dragged from the shelf;
// pop: the plant or roots whose panel is open; infoT: seconds the picked plant's description stays up
let sel = null, drag = null, pop = null, blockCache = null, infoT = 0;
let fx = [], banners = [], terrain = null, grassLayer = null, terrainDirty = true;
const sprites = new Map(), angles = new Map(), anim = new Map();
const ui = []; // tap targets rebuilt every frame: {x, y, w, h, fn, s: 'u' | 'w'}
let ufx = []; // effects in UI space

// What the player keeps: stars per level, bought perks, bugs met; the sound settings; a level in progress.
const load = (k, d) => { try { return Object.assign(d, JSON.parse(localStorage.getItem(k) || '{}')); } catch { return d; } };
const progress = load('fruit.progress', { stars: [], perks: {}, bugs: {}, cards: {} });
const saveProgress = () => localStorage.setItem('fruit.progress', JSON.stringify(progress));
const audio = load('fruit.audio', { vol: .6, music: .35 });
const starsAll = () => progress.stars.reduce((a, b) => a + (b || 0), 0);
const starsSpent = () => PERK_ORDER.reduce((a, k) => a + PERKS[k].cost.slice(0, progress.perks[k] || 0).reduce((x, y) => x + y, 0), 0);
const levelOpen = (n) => n === 0 || (progress.stars[n - 1] || 0) > 0 || new URLSearchParams(location.search).has('all');
const plantOpen = (type) => LEVELS.some((L, n) => levelOpen(n) && L.plants.includes(type));
const SAVE = 'fruit.save';
const readSave = () => { try { return JSON.parse(localStorage.getItem(SAVE) || 'null'); } catch { return null; } };
const dropSave = () => localStorage.removeItem(SAVE);

// ---------- geometry ----------
// Landscape: the grid as it is, entrance on the right. Portrait: the grid turned a quarter, entrance at the top,
// fruit at the bottom. Game coordinates (x along the 14 columns, y along the 8 rows) map to logical screen pixels.
const sp = (x, y) => (PORT ? [y * CELL, (COLS - x) * CELL] : [x * CELL, y * CELL]);
const cellCenter = (i, j) => sp(i + .5, j + .5);
const FW = () => (PORT ? ROWS : COLS) * CELL, FH = () => (PORT ? COLS : ROWS) * CELL;
function cellAt(x, y) { const a = Math.floor(x / CELL), b = Math.floor(y / CELL); return PORT ? [COLS - 1 - b, a] : [a, b]; }
const screenAngle = (vx, vy) => (PORT ? Math.atan2(-vx, vy) : Math.atan2(vy, vx));
// The anthills stand outside the grid, in a strip of width E past the entrance edge (right in landscape, top in
// portrait); bugs come out of them at game x = COLS + .6 and the trails start there.
const E = CELL * 1.2, HILL_X = COLS + .6;
const hillPos = (e = 0) => sp(HILL_X, game.entries[e][1] + .5);
// the world kept on screen: the grid, a margin M round it and the anthill strip
const bounds = () => (PORT ? [-M, -M - E, FW() + M, FH() + M] : [-M, -M, FW() + M + E, FH() + M]);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// Room kept free, in UI units: TOPY above the top row (status bar), BOTY at the bottom (home bar), LX and RX at the
// sides (the notch of a phone on its side), CORN at the sides of a bottom shelf (rounded screen corners).
// TOPH: where the HUD ends and the field begins; TWO: the HUD takes two rows (always in portrait).
let TOPY = 0, BOTY = 0, CORN = 0, LX = 0, RX = 0, TOPH = 46, TWO = false;
// The shelf of plants: a row under the field or a column left of it, whichever leaves the bigger cells.
let TRAY = { mode: 'row', x: 0, y: 0, w: 0, h: 0, cols: 1, cw: 50, ch: 58 };
const trayList = () => (game ? game.L.plants : LEVELS[0].plants);
// The phone's safe areas (notch, home bar) in CSS px, read from CSS env() through a probe element.
function safeInsets() {
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.append(d); const cs = getComputedStyle(d), v = (k) => parseFloat(cs[k]) || 0;
  const r = { t: v('paddingTop'), r: v('paddingRight'), b: v('paddingBottom'), l: v('paddingLeft') }; d.remove();
  const q = new URLSearchParams(location.search), fake = q.has('dev') && q.get('insets'); // for checks: ?dev&insets=top,right,bottom,left
  if (fake) { const v = fake.split(',').map((x) => parseFloat(x) || 0); [r.t, r.r, r.b, r.l] = [0, 1, 2, 3].map((k) => v[k] || 0); }
  return r;
}
const toUI = (wx, wy) => [(ox + wx * ws) / uk, (oy + wy * ws) / uk];
const faUI = () => FA.map((v) => v / uk); // field area in UI units
// The camera keeps the grid (with its margin) covering the field area when zoomed in, and centred when it fits.
function applyCam() {
  ws = fit * zoom;
  const vw = FA[2] / ws, vh = FA[3] / ws, [x0, y0, x1, y1] = bounds();
  camX = x1 - x0 <= vw ? (x0 + x1) / 2 : clamp(camX, x0 + vw / 2, x1 - vw / 2);
  camY = y1 - y0 <= vh ? (y0 + y1) / 2 : clamp(camY, y0 + vh / 2, y1 - vh / 2);
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
// The game installed on an iPhone (as in the snake and the roll game): iOS makes the window shorter than the screen by the
// status bar, and the page can't draw below the window unless it is itself as tall as the screen. So then the page,
// the canvas and the screens take the screen's height (--app-h and the `tall` class; inside the page, absolute: iOS
// clips fixed elements at the short window's edge). Only when the width matches the screen and the difference is a
// strip, not a keyboard. The window height itself is not watched: iOS switches it back and forth.
const IOS_PWA = navigator.standalone === true && /iPhone|iPod/.test(navigator.userAgent || '');
// But on newer iOS (26.x, seen 2026-11-20) the window starts below the status bar (its safe-area top is 0) and iOS
// paints a frosted edge above it: stretching the page to the screen then pushed its bottom 55 pt off the screen. So
// the page is stretched only when it really lies under the status bar (safe-area top > 20).
let underBar = true;
function fullHeight() {
  const iw = innerWidth, ih = innerHeight;
  if (!IOS_PWA || !underBar || !screen.width || !screen.height) return ih;
  const portrait = ih >= iw, sh = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
  const sw = portrait ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height);
  return Math.abs(sw - iw) < 2 && sh > ih && sh - ih < 120 ? sh : ih;
}
function resize() {
  // installed on an iPhone: laid out to the screen's height even when the window is that tall itself right now (iOS
  // stretches and shortens it by turns; the layout must not follow)
  underBar = !IOS_PWA || safeInsets().t > 20 || innerWidth > innerHeight; // (on its side the status bar is hidden)
  const vw = innerWidth, vh = fullHeight(), was = PORT, sh = vh > vw ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
  const tall = IOS_PWA && (vh !== innerHeight || vh === sh);
  document.documentElement.style.setProperty('--app-h', tall ? `${vh}px` : '');
  document.documentElement.classList.toggle('tall', tall); if (tall) scrollTo(0, 0);
  PORT = vh > vw;
  dpr = Math.min(pixelRatio(vw), 5); seen = [vw, vh, devicePixelRatio, visualViewport?.scale || 1];
  uk = PORT ? clamp(Math.min(vw / 340, vh / 560), 1, 1.8) : clamp(Math.min(vw / 740, vh / 340), 1, 1.8);
  UW = vw / uk; UH = vh / uk;
  const n = document.createElement('canvas'); n.id = 'cv';
  n.width = Math.round(vw * dpr); n.height = Math.round(vh * dpr); n.style.width = vw + 'px'; n.style.height = vh + 'px';
  c = n.getContext('2d'); cv.replaceWith(n); free(cv); cv = n; bindCanvas();
  const [bx0, by0, bx1, by1] = bounds(), gw = bx1 - bx0, gh = by1 - by0;
  // Safe areas: the notch, the home bar. In the home-screen app the status bar lies over the page and frosts what is
  // under it, so the top row steps down 16 px more (the `pwa` class, set in index.html before the first paint).
  const ins = safeInsets(), pwa = document.documentElement.classList.contains('pwa');
  TOPY = (ins.t + (pwa && PORT ? 16 : 0)) / uk; BOTY = ins.b / uk; LX = ins.l / uk; RX = ins.r / uk; CORN = pwa && PORT ? 8 : 0;
  const innerW = UW - LX - RX, count = trayList().length;
  TWO = PORT || innerW < 600; TOPH = TOPY + (TWO ? 84 : 46);
  // the shelf as a row under the field…
  const rowH = 60, rcw = Math.min(52, (innerW - 8 - CORN * 2) / count);
  const row = { mode: 'row', cols: count, cw: rcw, ch: rowH - 8, w: rcw * count, h: rowH, fa: [LX + 4, TOPH, innerW - 8, UH - TOPH - rowH - BOTY - 2] };
  row.x = LX + (innerW - row.w) / 2; row.y = UH - BOTY - rowH + 1;
  // …or as a column (two, when one would make the cards too low) left of it
  const availH = UH - TOPH - Math.max(BOTY, 4) - 2; let cols = 1; while (cols < 3 && availH / Math.ceil(count / cols) < 46) cols++;
  const rows = Math.ceil(count / cols), cch = Math.min(62, availH / rows), ccw = 50;
  const col = { mode: 'col', cols, cw: ccw, ch: cch, w: cols * ccw, h: rows * cch, fa: [LX + cols * ccw + 8, TOPH, innerW - cols * ccw - 12, availH] };
  col.x = LX + 4; col.y = TOPH + (availH - col.h) / 2;
  const fitOf = (t) => Math.min(t.fa[2] * uk / gw, t.fa[3] * uk / gh);
  TRAY = (PORT ? fitOf(col) > fitOf(row) * 1.04 : fitOf(col) >= fitOf(row) * .97) ? col : row;
  FA = TRAY.fa.map((v) => v * uk);
  fit = Math.min(FA[2] / gw, FA[3] / gh);
  zmax = clamp(58 / (CELL * fit), 1, 3); // up to cells of about 58 CSS px
  if (was !== PORT) zoom = 1;
  zoom = clamp(zoom, 1, zmax);
  // world area to paint: the whole screen with the field fitted; zoomed views stay inside it
  const x0 = FA[0] + FA[2] / 2 - (bx0 + bx1) / 2 * fit, y0 = FA[1] + FA[3] / 2 - (by0 + by1) / 2 * fit;
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
  const [cnv, x] = layer(VB[2], VB[3], tk); A.setView(VB[2], VB[3]); A.setTheme(game.L.theme || 'meadow');
  A.hdGrass(x, { seed: 5 + levelIdx }); A.hdBorderBushes(x, 2 + levelIdx); grassLayer = cnv;
}
const obstacleAt = (i, j) => game.grid[j]?.[i]?.obstacle;
// the cell one step up / right / down / left on the screen
const screenStep = (i, j, dx, dy) => (PORT ? [i - dy, j + dx] : [i + dx, j + dy]);
function buildTerrain() {
  const want = terrainK();
  if (Math.abs(want - tk) > 1e-3) { for (const v of sprites.values()) free(v.cnv); sprites.clear(); free(grassLayer); grassLayer = null; } // new scale: redo all
  tk = want; if (!grassLayer) buildGrass();
  const k = tk, [cnv, x] = layer(VB[2], VB[3], k); A.setView(VB[2], VB[3]);
  x.drawImage(grassLayer, 0, 0, VB[2], VB[3]);
  x.setTransform(k, 0, 0, k, -VB[0] * k, -VB[1] * k); // world coordinates from here
  const water = (i, j, dx, dy) => obstacleAt(...screenStep(i, j, dx, dy)) === 'water';
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) if (obstacleAt(i, j) === 'water') {
    const [cx, cy] = cellCenter(i, j), w = (dx, dy, bit) => (water(i, j, dx, dy) ? bit : 0);
    A.hdWater(x, cx, cy, w(0, -1, 1) | w(1, 0, 2) | w(0, 1, 4) | w(-1, 0, 8), w(1, -1, 1) | w(1, 1, 2) | w(-1, 1, 4) | w(-1, -1, 8));
  }
  { // the trail of the bugs, quiet: narrower and half see-through over the grass
    const [pc, px] = layer(VB[2], VB[3], k); px.setTransform(k, 0, 0, k, -VB[0] * k, -VB[1] * k);
    game.entries.forEach((en, e) => { const pts = trail(e).map(([i, j]) => cellCenter(i, j)); pts.unshift(hillPos(e)); A.hdPath(px, A.chaikin(pts, 3), 24, 1 + levelIdx + e); });
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = .55; x.drawImage(pc, 0, 0); x.restore(); free(pc);
  }
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) { const tl = game.tiles[j][i]; if (tl && !(tl === 'mud' && game.grid[j][i])) A.hdTile(x, tl, ...cellCenter(i, j)); }
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    const o = game.grid[j][i]; if (!o) continue; const [cx, cy] = cellCenter(i, j);
    if (o.obstacle === 'rock') A.hdRock(x, cx, cy + 4, 1);
    else if (o.obstacle === 'stump') A.hdStump(x, cx, cy + 4, 15);
    else if (o.obstacle === 'weed') A.hdWeed(x, cx, cy + 4);
    else if (o.obstacle === 'log' && game.grid[j][i + 1]?.obstacle === 'log') {
      const [nx, ny] = cellCenter(i + 1, j); x.save(); x.translate((cx + nx) / 2, (cy + ny) / 2 + 4); if (PORT) x.rotate(-Math.PI / 2); A.hdLog(x, 0, 0, CELL * 2 - 8); x.restore();
    }
    else if (o.type) A.hdSoil(x, cx, cy + 15);
  }
  const [fx0, fy0] = cellCenter(...game.fruit); A.hdStump(x, fx0, fy0 + 12, 23);
  game.entries.forEach((en, e) => { const [hx, hy] = hillPos(e); A.hdAnthill(x, hx, hy + 8, 1.05); }); // the mound covers the trail's end
  x.setTransform(k, 0, 0, k, 0, 0);
  A.hdDapple(x); A.hdSun2(x); A.hdGrade(x); A.hdVignette(x);
  // a little more colour; done here, not as a CSS filter on the canvas: Safari renders filtered canvases blurry
  free(terrain);
  if ('filter' in x) { const [pop, y] = layer(VB[2], VB[3], k); y.filter = 'saturate(1.12) contrast(1.04)'; y.drawImage(cnv, 0, 0, VB[2], VB[3]); free(cnv); terrain = pop; } else terrain = cnv;
  terrainDirty = false; blockCache = null;
}
const trail = (e = 0) => trails(game)[e];

// ---------- sprites ----------
// plants: a 76×92 box with the plant's base at (38, 76); frame 1 is the flytrap with its jaws shut
const PW = 76, PH = 92, PBX = 38, PBY = 76;
const plantSprite = (type, lvl, frame = 0) => sprite(`p:${type}:${lvl}:${frame}`, PW, PH, (x) => A.hdPlant(x, type, PBX, PBY, 1, { noShadow: true, lvl, frame }));
const BUG_SIZE = { rhino: 1.3, queen: 1.25, spider: 1.25, slugking: 1.3, hornet: 1.2, snail: 1.25, beetle: 1.15, cricket: 1.2, pillbug: 1.1, caterpillar: 1 }, BUG_K = .78;
const isBoss = (kind) => !!BUGS[kind].boss;
// Walking bugs keep a small fixed offset from the trail's middle, so a faster bug visibly passes a slower one.
const LANE = [-.17, .17, 0, -.09, .09];
function bugPos(b) { if (b.fly || isBoss(b.kind)) return sp(b.x, b.y); const a = LANE[b.id % 5], d = LANE[(b.id * 3 + 1) % 5]; return sp(b.x + d, b.y + a); }
function bugSprite(kind, frame) {
  const s = (BUG_SIZE[kind] || 1) * BUG_K, box = Math.ceil((kind === 'caterpillar' ? 100 : 68) * s);
  return sprite(`b:${kind}:${frame}`, box, box, (x) => {
    A.setLeg(frame ? .8 : -.8);
    A.hdBug(x, kind, box / 2, box / 2, 0, s, { noShadow: true, ph: frame * 1.6, flap: frame ? .55 : 1 });
    A.setLeg(0);
  });
}
const appleBody = (bitten) => sprite(`appleBody:${bitten}`, 70, 70, (x) => A.hdApple(x, 35, 38, 24, { bite: bitten, noFace: true }));
// pictures for the HTML screens
const pics = new Map();
function pic(key, w, h, draw, k = 3) {
  if (!pics.has(key)) { const cnv = document.createElement('canvas'); cnv.width = w * k; cnv.height = h * k; const x = cnv.getContext('2d'); x.scale(k, k); draw(x); pics.set(key, cnv.toDataURL()); }
  return pics.get(key);
}
const plantPic = (type, lvl = 1) => pic(`p:${type}:${lvl}`, PW, PH, (x) => { A.setTheme('meadow'); A.hdPlant(x, type, PBX, PBY - 4, 1, { lvl }); });
const bugPic = (kind) => pic(`b:${kind}`, 72, 72, (x) => { const s = isBoss(kind) ? .95 : kind === 'caterpillar' ? 1 : 1.25; A.hdBug(x, kind, kind === 'caterpillar' ? 48 : 36, 36, -Math.PI / 2 + (kind === 'caterpillar' ? Math.PI / 2 : 0), s, { noShadow: true }); });

// ---------- game flow ----------
const metaNow = () => ({ ...progress.perks });
function enterLevel(g, resumed = false) {
  game = g; levelIdx = g.level; resize(); tm.start(g, resumed);
  sel = drag = pop = null; fx = []; banners = []; appleMood('idle', 0); angles.clear(); anim.clear(); speed = 1; bossSeen.clear();
  grassLayer = null; terrainDirty = true; paused = false;
  showHome(false); showModal(null); ufx = []; zoom = 1; applyCam(); dropLayers(); muffleMusic(false);
}
function startLevel(n) {
  dropSave(); enterLevel(createGame(n, Date.now() & 0xffff, metaNow()));
  // what is new on this level: plants never had before, and the ground of the level
  const cards = [], L = LEVELS[n], had = new Set(LEVELS.slice(0, n).flatMap((q) => q.plants)), hadF = new Set(LEVELS.slice(0, n).map((q) => q.feature));
  for (const p of L.plants) if (!had.has(p) && n > 0) cards.push({ tag: T.newPlant, title: T.plant[p], img: pic(`hero:${p}`, 110, 110, (x) => { A.setTheme('meadow'); A.hdPlant(x, p, 55, 98, 1.45, { lvl: 1 }); }), text: T.about[p], extra: `${T.lvl3}: ${T.perk[p].toLowerCase()}` });
  if (L.feature && !hadF.has(L.feature)) cards.push({ tag: T.levelFeature, title: T.feature[L.feature][0], img: featurePic(L.feature), text: T.feature[L.feature][1] });
  // each card is shown once, not on every retry
  const unseen = cards.filter((q) => !progress.cards[q.title]);
  if (unseen.length) { for (const q of unseen) progress.cards[q.title] = 1; saveProgress(); introCards(unseen); }
  if (zmax > 1.4 && matchMedia('(pointer: coarse)').matches && !localStorage.getItem('fruit.zoomHint')) { banner(T.zoomHint, 5, true); localStorage.setItem('fruit.zoomHint', '1'); }
  if (n === 0) hintOnce('start', T.hint1, 10);
  if (!localStorage.getItem('fruit.holdHint')) { banner(T.holdHint, 7, true); localStorage.setItem('fruit.holdHint', '1'); }
}
function resumeLevel() {
  const g = restore(readSave(), metaNow()); if (!g) { dropSave(); showHome(true); return; }
  enterLevel(g, true);
}
function featurePic(f) {
  return pic(`f:${f}`, 84, 84, (x) => {
    A.setTheme('meadow');
    if (f === 'water') { A.hdWater(x, 21, 42, 2); A.hdWater(x, 63, 42, 8); }
    else if (f === 'weed') A.hdWeed(x, 42, 50);
    else if (f === 'twin') { A.hdAnthill(x, 42, 30, .8); A.hdAnthill(x, 42, 68, .8); }
    else { x.translate(42, 42); x.scale(1.7, 1.7); A.hdTile(x, f, 0, 0); }
  }, 3);
}
const bugsOf = (L) => [...new Set(L.waves.flat().map((w) => w[0]))];
// Bugs of wave n (1-based) that the player has not met yet.
function newBugs(n) {
  const out = [...new Set(game.L.waves[n - 1].map((w) => w[0]))].filter((k) => !progress.bugs[k]);
  // the bugs a boss lets out are met with it
  let fresh = out.length > 0;
  for (const k of game.L.waves[n - 1].map((w) => w[0])) for (const q of [k, BUGS[k].brood?.[0], BUGS[k].split?.[0]]) if (q && !progress.bugs[q]) { progress.bugs[q] = 1; fresh = true; }
  if (fresh) saveProgress();
  return out;
}
function bugStats(kind, b) {
  const B = BUGS[kind], out = [];
  out.push(b ? `здоровье ${Math.ceil(b.hp)} / ${b.maxHp}` : game && $('home').hidden ? `здоровье ${bugHp(game, kind, Math.min(game.waves, game.wave + 1))}` : `здоровье ${B.hp}`); // as in the next wave
  out.push(B.speed >= 1.3 ? 'быстрый' : B.speed <= .5 ? 'очень медленный' : B.speed < .8 ? 'медленный' : 'обычная скорость');
  if (B.armor) out.push(`броня ${B.armor}`);
  if (B.fly) out.push('летает');
  if (B.dig) out.push('прогрызает стены');
  if (B.chew) out.push('кусает растения');
  if (B.mend) out.push('лечит жуков');
  out.push(`кусает яблоко на ${B.bite}`, `+${b ? rewardOf(b) : B.reward} росы`);
  return out;
}
// The numbers of a plant: [label, value at this level, value at the next one or null]. On the field (p given) they
// include the soil and the player's perks.
const num = (v) => String(Math.round(v * 10) / 10);
function statRows(type, lvl, p = null) {
  const P = PLANTS[type], g = game || { meta: metaNow(), tiles: [] }, at = (l) => ({ type, lvl: l, i: p ? p.i : -1, j: p ? p.j : -1 });
  // a plant on the field shows its stats as they are: a bell nearby makes it shoot (or bite) that much more often
  const quick = 1 + (p?.buff || 0), v = (name, l) => { const x = pstat(g, at(l), name); return name === 'rate' ? x * quick : name === 'eat' ? x / quick : x; }, rows = [], nx = lvl < 3 ? lvl + 1 : null;
  const add = (label, name, f = num) => { if (P[name] == null) return; const a = v(name, lvl), b = nx ? v(name, nx) : null; if (!a && !b) return; rows.push([label, f(a), b != null && f(b) !== f(a) ? f(b) : null, quick > 1 && (name === 'rate' || name === 'eat')]); };
  add('Урон', 'dmg'); add('Уколотый получает', 'mark', (s) => `+${Math.round(s * 100)}%`); add('Целей', 'multi'); add('Огонь/с', 'burn');
  add('Выстрелов/с', 'rate', (r) => num(r));
  add('Укус', 'chomp'); add('Глотает, если здоровья', 'gulp', (s) => `до ${Math.round(s * 100)}%`); add('Кусает раз в', 'eat', (s) => `${num(s)} с`);
  add('Замедление', 'slow', (s) => `${Math.round(s * 100)}%`);
  add('Лечит/с', 'heal'); add('Отращивает за', 'regrow', (s) => `${num(s)} с`);
  add('Соседи чаще на', 'buff', (s) => `${Math.round(s * 100)}%`);
  add('Взрыв', 'splash'); add('Задевает жуков', 'hits'); add('Дальность', 'range');
  add('Прочность', 'hp');
  return rows;
}
const statLine = (type, l = 1) => statRows(type, l).map(([a, b]) => `${a.toLowerCase()} ${b}`).concat(PLANTS[type].dmg ? [PLANTS[type].ground ? 'ползущих — рядом и слабее' : PLANTS[type].air ? 'бьёт и летающих' : 'летающих не бьёт'] : []);
// A hint (top) is short and stays a few seconds, a tap puts it away; most of them come once ever (hintOnce).
function banner(text, life = 2, top = false) {
  if (top) { if (banners.some((b) => b.top && b.text === text)) return; life = Math.min(life, 3 + text.split(' ').length * .28); }
  banners.push({ text, t: 0, life, top });
}
function hintOnce(key, text, life) { if (localStorage.getItem('fruit.hint.' + key)) return; localStorage.setItem('fruit.hint.' + key, '1'); banner(text, life, true); }
// Planting. A plant is dragged from the shelf onto a cell; or picked on the shelf with a tap, and then every tap on a
// free cell plants one. A mistake costs nothing: until the wave starts, a fresh plant sells for its full price.
function pick(type) {
  pop = null; banners = banners.filter((b) => !b.top); blockCache = null;
  if (sel === type) { sel = null; infoT = 0; sfx.tap(); return; }
  sel = type; infoT = 8; sfx.select();
}
// Planted: the pick is over (the shelf and its description close). On a plant of another kind the old one is sold.
function plantAt(type, i, j) {
  const problem = plantProblem(game, type, i, j);
  if (problem) { if (T.problem[problem]) say(T.problem[problem], i, j); sfx.cant(); return false; }
  if (!plantOn(game, type, i, j)) return false;
  sel = null; infoT = 0; pop = null;
  if (!localStorage.getItem('fruit.undoHint') && game.plants.length === 3) { banner(T.undoHint, 7, true); localStorage.setItem('fruit.undoHint', '1'); }
  return true;
}
// a short word over a cell
function say(text, i, j) { const [x, y] = cellCenter(i, j); fx = fx.filter((f) => f.k !== 'note'); fx.push({ k: 'note', x, y: y - 24, t: 0, life: 1.3, txt: text }); }
function tapCell(i, j) {
  const p = game.grid[j]?.[i];
  if (p && p.type && sel && sel !== p.type && !pop) { // a picked plant over an old one of another kind: a second tap confirms
    if (isFresh(game, p) || (swapAsk && swapAsk.p === p && swapAsk.type === sel && now - swapAsk.at < 3000)) { swapAsk = null; plantAt(sel, i, j); return; }
    const problem = plantProblem(game, sel, i, j); if (problem) { if (T.problem[problem]) say(T.problem[problem], i, j); sfx.cant(); return; }
    swapAsk = { p, type: sel, at: now }; say(`${T.swap(refund(game, p), p.lvl)}. ${T.swapAgain}`, i, j); sfx.tap(); return;
  }
  if (p && p.type) { pop = pop === p ? null : p; sfx.tap(); return; }
  if (p && p.obstacle === 'weed') { pop = pop === p ? null : p; sfx.tap(); return; }
  const st = p ? null : stubAt(game, i, j);
  if (st) { pop = pop === st ? null : st; sfx.tap(); return; } // roots of an eaten plant: grow it back or clear them
  if (pop) { pop = null; return; }
  if (p || (i === game.fruit[0] && j === game.fruit[1]) || game.entries.some((e) => e[0] === i && e[1] === j)) return;
  if (sel) plantAt(sel, i, j);
  else { const n = Number(localStorage.getItem('fruit.dragHints') || 0); if (n < 2) { localStorage.setItem('fruit.dragHints', String(n + 1)); banner(T.dragHint, 4, true); } trayPulse = 1.2; sfx.tap(); }
}
let trayPulse = 0, swapAsk = null;

// ---------- events -> effects ----------
const panOf = (x) => clamp((ox + x * ws) / (UW * uk) * 2 - 1, -1, 1) * .6; // where on the screen a world x is, for the sound
const bossSeen = new Set(), dmgFx = new WeakMap(); // dmgFx: the number now rising over a bug
function handleEvents() {
  tm.observe(game);
  for (const e of game.events) {
    switch (e.t) {
      case 'hit': if (e.src !== 'burn') {
        const [x, y] = bugPos(e.b), f = dmgFx.get(e.b);
        if (f && f.t < .35) { f.n += e.dmg; f.txt = `-${Math.round(f.n)}`; } else { const nf = { k: 'dmg', x: x + (Math.random() - .5) * 8, y: y - 16, t: 0, life: .6, n: e.dmg, txt: `-${Math.round(e.dmg)}` }; fx.push(nf); dmgFx.set(e.b, nf); }
        fx.push({ k: 'star', x, y: y - 4, t: 0, life: .15, r: 6 }); sfx.hit(panOf(x));
      } break;
      case 'kill': {
        const [x, y] = bugPos(e.b), boss = isBoss(e.b.kind);
        for (let n = 0; n < (boss ? 26 : 7); n++) fx.push({ k: 'puff', x, y, vx: (Math.random() - .5) * (boss ? 190 : 60), vy: (Math.random() - .5) * (boss ? 190 : 60) - 10, t: 0, life: boss ? .8 : .45, r: 3 + Math.random() * (boss ? 7 : 3) });
        fx.push({ k: 'gain', x, y: y - 10, t: 0, life: boss ? 1.6 : .8, txt: `+${e.reward}`, big: boss }); fx.push({ k: 'fly', x, y, t: 0, life: .55 }); angles.delete(e.b.id);
        if (!boss) sfx.kill(panOf(x));
        break;
      }
      case 'boss': {
        const k = e.b.kind; sfx.bossCome(); ufx.push({ k: 'flash', t: 0, life: .7, col: 'rgba(120,20,60,' });
        banner(T.boss(T.bug[k]), 2); if (!bossSeen.has(k)) { bossSeen.add(k); hintOnce('boss.' + k, T.bugAbout[k], 8); }
        break;
      }
      case 'bossDead': { sfx.bossDie(); const [x, y] = bugPos(e.b); for (let n = 0; n < 14; n++) { const a = n / 14 * A.TAU; fx.push({ k: 'spark', x: x + Math.cos(a) * 30, y: y + Math.sin(a) * 30, t: n * .03, life: .8 }); } ufx.push({ k: 'flash', t: 0, life: .5, col: 'rgba(255,240,170,' }); break; }
      case 'charge': { const [x, y] = bugPos(e.b); fx.push({ k: 'note', x, y: y - 30, t: 0, life: 1.1, txt: 'Разгон!' }); sfx.web(); break; }
      case 'brood': { const [x, y] = bugPos(e.b); for (let n = 0; n < 6; n++) fx.push({ k: 'dust', x, y, vx: (Math.random() - .5) * 70, vy: -10 - Math.random() * 30, t: 0, life: .5, r: 3 + Math.random() * 3 }); break; }
      case 'web': for (const p of e.plants) { const [x, y] = cellCenter(p.i, p.j); fx.push({ k: 'star', x, y: y - 10, t: 0, life: .25, r: 16 }); } sfx.web(); break;
      case 'eat': { const [x, y] = cellCenter(e.p.i, e.p.j); bump(e.p, .5, true); if (e.whole) fx.push({ k: 'note', x, y: y - 34, t: 0, life: .8, txt: 'Ам!' }); sfx.chomp(); break; }
      case 'chill': { const [x, y] = cellCenter(e.p.i, e.p.j); fx.push({ k: 'chill', x, y, t: 0, life: .5, r: pstat(game, e.p, 'range') * CELL }); bump(e.p, .25); sfx.frost(); break; }
      case 'weed': { dust({ i: e.i, j: e.j }); terrainDirty = true; pop = null; sfx.sell(); break; }
      case 'splash': { const [x, y] = sp(e.x, e.y); for (let n = 0; n < 8; n++) fx.push({ k: 'kern', x, y, vx: (Math.random() - .5) * 90 * e.r, vy: -30 - Math.random() * 50, t: 0, life: .4 }); break; }
      case 'fire': { const [x, y] = cellCenter(e.p.i, e.p.j); fx.push({ k: 'fire', x, y, t: 0, life: .45, r: pstat(game, e.p, 'range') * CELL }); bump(e.p, .2); sfx.fire(); break; }
      case 'shoot': bump(e.p, .12); sfx.shoot(PLANTS[e.p.type].shot, panOf(cellCenter(e.p.i, e.p.j)[0])); break;
      case 'bite': { angles.delete(e.b.id); const [x, y] = cellCenter(...game.fruit); fx.push({ k: 'dmg', x: x + 20, y: y - 30, t: 0, life: .9, txt: `-${BUGS[e.b.kind].bite}`, red: true }); appleMood('scream', .9); appleSay(T.screams[Math.floor(Math.random() * T.screams.length)]); sfx.bite(); hpShake = .5; break; }
      case 'place': bump(e.p, .35, true); dust(e.p); terrainDirty = true; sfx.plant(); break;
      case 'regrow': bump(e.p, .35, true); dust(e.p); terrainDirty = true; sfx.regrow(); if (e.free) { const [x, y] = cellCenter(e.p.i, e.p.j); fx.push({ k: 'gain', x, y: y - 26, t: 0, life: 1, txt: T.regrown }); } break;
      case 'heal':
      case 'upgrade': {
        const [x, y] = cellCenter(e.p.i, e.p.j); for (let n = 0; n < (e.t === 'upgrade' ? 12 : 6); n++) fx.push({ k: 'spark', x: x + (Math.random() - .5) * 34, y: y - 6 - Math.random() * 36, t: n * .04, life: .6 }); bump(e.p, .4, true);
        if (e.t === 'upgrade') { sfx.upgrade(); fx.push({ k: 'ringfx', x, y: y - 6, t: 0, life: .5, r: 30 }); fx.push({ k: 'note', x, y: y - 40, t: 0, life: 1.1, txt: e.p.lvl === 3 ? 'Максимум!' : `Уровень ${e.p.lvl}` }); } else sfx.heal();
        break;
      }
      case 'sell': case 'plantDead': dust(e.p); terrainDirty = true; if (pop === e.p) pop = null; if (e.t === 'sell') sfx.sell(); else { sfx.eaten(); banner(`${T.plant[e.p.type]} ${T.eaten[e.p.type]}!`, 1.4); if (!localStorage.getItem('fruit.rootsHint')) { banner(T.rootsHint, 8, true); localStorage.setItem('fruit.rootsHint', '1'); } } break;
      case 'chew': { const [x, y] = cellCenter(e.p.i, e.p.j); for (let n = 0; n < 6; n++) fx.push({ k: 'crumb', x, y: y - 6, vx: (Math.random() - .5) * 50, vy: -20 - Math.random() * 30, t: 0, life: .5, col: e.p.type === 'pumpkin' ? '#f7a23a' : '#6cc04a' }); bump(e.p, .2); sfx.chew(); break; }
      case 'wave': banner(T.wave(e.n, game.waves), 1.4); sfx.waveStart(); { const nb = newBugs(e.n).filter((k) => !isBoss(k)); if (nb.length && !(levelIdx === 0 && e.n === 1)) banner(T.freshBug(nb.map((k) => T.bug[k].toLowerCase())), 7, true); } if (AP.mood === 'happy') appleMood('idle', 0); break;
      case 'waveDone': appleMood('happy', 2.6); appleCheer(); banner(T.waveDone(e.bonus), 1.8); sfx.waveDone(); if (e.powers) hintOnce('powers', T.powersBack, 4); if (levelIdx === 0 && e.n === 1) { hintOnce('early', T.hint2, 6); hintOnce('trail', T.trailHint, 10); } if (levelIdx === 0 && e.n === 3) hintOnce('up', T.upHint, 9); break;
      case 'early': ufx.push({ k: 'gain', x: GO[0] + 30, y: GO[1] + 26, t: 0, life: 1.2, txt: T.early(e.bonus) }); sfx.early(e.bonus); break;
      case 'power': if (e.kind === 'frost') { ufx.push({ k: 'flash', t: 0, life: .6, col: 'rgba(190,240,255,' }); sfx.frost(); } else { for (let n = 0; n < 70; n++) ufx.push({ k: 'rain', x: Math.random() * UW, y: -Math.random() * UH, t: 0, life: 1.2 }); sfx.rain(); terrainDirty = true; } break;
      case 'won': case 'lost': { dropSave(); if (e.t === 'won') appleCheer(); const g = game; setTimeout(() => { if (game === g) endScreen(e.t === 'won'); }, 900); break; }
    }
  }
  // what is built between waves is kept too
  if (game.phase === 'build' && game.wave > 0 && game.events.some((e) => SAVED.has(e.t))) saveLevel();
  game.events.length = 0;
}
const SAVED = new Set(['place', 'upgrade', 'sell', 'weed', 'regrow', 'heal', 'waveDone']);
function saveLevel() { if (game && game.phase === 'build' && game.wave > 0 && game.wave < game.waves) localStorage.setItem(SAVE, JSON.stringify(snapshot(game))); }
let hpShake = 0;
function heart(x, y, r) {
  c.beginPath(); c.moveTo(x, y + r * .9); c.bezierCurveTo(x - r * 1.6, y - r * .1, x - r * .7, y - r * 1.3, x, y - r * .45); c.bezierCurveTo(x + r * .7, y - r * 1.3, x + r * 1.6, y - r * .1, x, y + r * .9);
  c.fillStyle = '#ff5a7a'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = '#a01838'; c.stroke();
}
function bump(p, k, grow = false) { anim.set(p.id, { t: 0, k, grow }); }
function dust(p) { const [x, y] = cellCenter(p.i, p.j); for (let n = 0; n < 8; n++) fx.push({ k: 'dust', x: x + (Math.random() - .5) * 20, y: y + 12, vx: (Math.random() - .5) * 50, vy: -10 - Math.random() * 20, t: 0, life: .5, r: 3 + Math.random() * 3 }); }

// ---------- frame ----------
function frame(ts) {
  const dt = Math.min(.1, (ts - (now || ts)) / 1000); now = ts;
  if (game) tm.tick(dt, speed, paused);
  if (game && !paused) {
    let acc = dt * speed; while (acc > 1e-6) { const h = Math.min(acc, 1 / 60); step(game, h); acc -= h; }
    handleEvents();
    if (infoT > 0) infoT -= dt; if (trayPulse > 0) trayPulse -= dt; if (hpShake > 0) hpShake -= dt;
  }
  if (innerWidth !== seen[0] || fullHeight() !== seen[1] || devicePixelRatio !== seen[2] || (visualViewport?.scale || 1) !== seen[3]) resize();
  // after a zoom settles, redraw the field and sprites at the new scale (while zooming they are stretched)
  if (terrain && !pinch && Math.abs(terrainK() - tk) > 1e-3 && performance.now() - zoomT > 220) dropLayers();
  try { if (game) draw(paused ? 0 : dt); } catch (e) { // a broken frame must not stop the game, nor leave the canvas turned or faint
    if (c.reset) c.reset(); else { c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; }
    if (now - (frame.errAt || -1e9) > 5000) { frame.errAt = now; console.error(e); }
  }
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
  if (sel || drag) drawGrid();
  if (pop && !game.plants.includes(pop) && !game.stubs.includes(pop) && game.grid[pop.j]?.[pop.i] !== pop) pop = null;
  if (pop && pop.type && game.plants.includes(pop) && PLANTS[pop.type].range) { // the reach now, and after the upgrade
    const r = pstat(game, pop, 'range'), r2 = pop.lvl < 3 ? pstat(game, { ...pop, lvl: pop.lvl + 1 }, 'range') : r;
    ring(...cellCenter(pop.i, pop.j), r * CELL); if (r2 > r + .01) ring(...cellCenter(pop.i, pop.j), r2 * CELL, true); groundRing(pop.type, ...cellCenter(pop.i, pop.j), r);
  }

  drawDigWay(dt);
  // depth-sorted things on the ground
  const items = [];
  for (const p of game.plants) items.push([cellCenter(p.i, p.j)[1] + 14, () => drawPlant(p, t)]);
  for (const st of game.stubs) items.push([cellCenter(st.i, st.j)[1] + 14, () => drawStub(st, t)]);
  for (const b of game.bugs) if (!b.fly) items.push([bugPos(b)[1], () => drawBug(b, t, dt)]);
  const [fxx, fyy] = cellCenter(...game.fruit); items.push([fyy + 12, () => drawApple(fxx, fyy, dt)]);
  items.sort((a, b) => a[0] - b[0]); for (const [, f] of items) f();
  for (const p of game.plants) if (p.hp < p.maxHp) { const [x, y] = cellCenter(p.i, p.j); A.hdHp(c, x, y - 32, 28, p.hp / p.maxHp, '#ffb03a'); }
  drawDigMarks(t);
  if (drag) drawDrag();
  for (const s of game.shots) drawShot(s);
  for (const b of game.bugs) if (b.fly) drawBug(b, t, dt);
  for (const b of game.bugs) if (b.hp < b.maxHp && emerge(b) > .3 && !isBoss(b.kind)) { const [x, y] = bugPos(b); A.hdHp(c, x, y - 18, 20, b.hp / b.maxHp, b.mended > 0 ? '#ffe14a' : '#7be05a'); }
  drawFx(dt, fx);
  setUI();
  drawFx(dt, ufx);
  drawHud(t);
  drawTray(t);
  drawBanners(dt);
  if (drag || (sel && infoT > 0)) drawInfo();
  if (pop) drawPop();
  if (tip) drawTip();
}
// Where the diggers (crickets) will eat through the garden, while they are in the coming wave or on the field: a little
// "!" over every plant they will eat, and it trembles (the weak spot of a maze: one plant between the anthill and a
// short run to the fruit). Their whole way only on a tap on a cricket in the coming wave, for a few seconds, as tracks of
// little feet. (Chosen by the owner from five marks and five ways; a red dashed line all the time was too loud.)
let digSeen = null, digCache = null, digShowT = 0;
function digState() {
  if (game.phase !== 'build' && game.phase !== 'wave') return null;
  const hills = digHills(game); if (!hills.size) return null;
  const sig = `${[...hills]}|${game.plants.map((p) => `${p.i},${p.j},${p.lvl}`).join(';')}|${game.stubs.length}`;
  if (!digCache || digCache.sig !== sig || digCache.g !== game) digCache = { sig, g: game, trails: digTrails(game).map((tr, e) => ({ ...tr, e, smooth: null })).filter((tr) => hills.has(tr.e)) };
  return digCache;
}
const digShake = new Set(); // the cells of the plants the diggers will eat: they tremble (drawPlant)
const pathLen = (pts) => { let L = 0; for (let k = 1; k < pts.length; k++) L += Math.sqrt((pts[k][0] - pts[k - 1][0]) ** 2 + (pts[k][1] - pts[k - 1][1]) ** 2); return L; };
// their way, under the plants: tracks of little feet, laid from the anthill to the fruit, then fading
function drawDigWay(dt) {
  if (digShowT <= 0) return; const st = digState(); if (!st) { digShowT = 0; return; }
  digShowT -= dt; const el = 3.5 - digShowT, a = Math.min(1, digShowT / .6);
  for (const tr of st.trails) {
    if (!tr.smooth) { const pts = tr.cells.map(([i, j]) => cellCenter(i, j)); pts.unshift(hillPos(tr.e)); tr.smooth = A.chaikin(pts, 3); tr.len = pathLen(tr.smooth); }
    const n = Math.floor(tr.len / 10), shown = Math.min(n, Math.floor(n * el / 1.1));
    c.save();
    for (let k = 0; k < shown; k++) {
      const p = A.along(tr.smooth, k / n), side = k % 2 ? 1 : -1, ox = -Math.sin(p.a) * 4.5 * side, oy = Math.cos(p.a) * 4.5 * side;
      c.save(); c.translate(p.x + ox, p.y + oy); c.rotate(p.a);
      c.fillStyle = `rgba(255,240,200,${.35 * a})`; c.beginPath(); c.ellipse(.6, .6, 3.8, 2.4, 0, 0, A.TAU); c.fill(); // a light rim, to stand out on the grass
      c.fillStyle = `rgba(55,30,10,${.8 * a})`; c.beginPath(); c.ellipse(0, 0, 3.2, 2, 0, 0, A.TAU); c.fill();
      c.beginPath(); c.arc(3.4, -1.6, .9, 0, A.TAU); c.arc(3.4, 1.6, .9, 0, A.TAU); c.fill(); // toes
      c.restore();
    }
    c.restore();
  }
}
// the marks, over the plants: a little "!" bubble over every plant they will eat (and it trembles)
function drawDigMarks(t) {
  digShake.clear(); const st = digState(); if (!st) return;
  if (!digSeen) { hintOnce('dig', T.digHint, 9); digSeen = true; }
  for (const tr of st.trails) for (const [i, j] of tr.eats) {
    digShake.add(`${i},${j}`);
    const [x, y] = cellCenter(i, j), bob = Math.sin(t * 3 + i) * 1.5; c.save(); c.translate(x + 12, y - 30 + bob);
    // the bubble as one shape: both parts outlined wide, then filled over, so that only the outer edge stays
    const ring = () => { c.beginPath(); c.arc(0, 0, 8.5, 0, A.TAU); }, tail = () => { c.beginPath(); c.moveTo(-4.5, 5.5); c.lineTo(-8, 12.5); c.lineTo(1.5, 7.5); c.closePath(); };
    c.lineJoin = 'round'; c.strokeStyle = '#7a4a1e'; c.lineWidth = 3.4; ring(); c.stroke(); tail(); c.stroke();
    c.fillStyle = '#fff6e0'; ring(); c.fill(); tail(); c.fill(); // each filled on its own: together they wind against each other
    c.fillStyle = '#c8381c'; c.beginPath(); A.rrect(c, -1.4, -5.6, 2.8, 7, 1.4); c.fill(); c.beginPath(); c.arc(0, 4.2, 1.6, 0, A.TAU); c.fill(); // the "!", drawn, in the middle
    c.restore();
  }
}
// the reach of a plant that hits walkers only close by (the dandelion): an inner ring
function groundRing(type, x, y, r) { const g = PLANTS[type].groundRange; if (g && g < r) { c.save(); c.beginPath(); c.arc(x, y, g * CELL, 0, A.TAU); c.fillStyle = 'rgba(255,230,150,.16)'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,240,190,.75)'; c.stroke(); c.restore(); } }
function ring(x, y, r, next = false) { c.save(); c.beginPath(); c.arc(x, y, r, 0, A.TAU); if (!next) { c.fillStyle = 'rgba(255,255,255,.13)'; c.fill(); } c.setLineDash(next ? [3, 7] : [8, 6]); c.lineWidth = 2.2; c.strokeStyle = next ? 'rgba(150,255,120,.9)' : 'rgba(255,255,255,.85)'; c.stroke(); c.restore(); }
function drawGrid() {
  if (game.phase === 'wave' && Math.floor(now / 500) !== blockCache?.tick) blockCache = null;
  if (!blockCache) { blockCache = new Set(blockingCells(game).map(([i, j]) => i + ',' + j)); blockCache.tick = Math.floor(now / 500); if (drag) drag.key = null; } // the field changed: refresh the preview too
  c.save();
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    if (game.grid[j][i] || (i === game.fruit[0] && j === game.fruit[1]) || game.entries.some((e) => e[0] === i && e[1] === j)) continue;
    const bad = blockCache.has(i + ',' + j) || game.tiles[j][i] === 'nettle', [cx, cy] = cellCenter(i, j), x = cx - CELL / 2, y = cy - CELL / 2;
    c.beginPath(); A.rrect(c, x + 4, y + 4, CELL - 8, CELL - 8, 8);
    if (bad) { c.fillStyle = 'rgba(235,70,70,.1)'; c.fill(); }
    c.lineWidth = 1; c.strokeStyle = bad ? 'rgba(200,40,40,.28)' : 'rgba(255,255,255,.17)'; c.stroke();
  }
  c.restore();
}
function drawPlant(p, t) {
  const s = plantSprite(p.type, p.lvl, p.busy > 0 ? 1 : 0), [x, y] = cellCenter(p.i, p.j), base = y + 14;
  let sx = 1, sy = 1; const a = anim.get(p.id);
  if (a) { a.t += 1 / 60; const e = Math.exp(-a.t * 9) * Math.cos(a.t * 26); sx = 1 + a.k * e * (a.grow ? .6 : -.4); sy = 1 - a.k * e * (a.grow ? -.8 : .5); if (a.t > .8) anim.delete(p.id); }
  if (p.hit > 0) { sx *= 1.08; sy *= .9; }
  if (p.busy > 0) { const q = Math.sin(t * 16) * .05; sx += q; sy -= q; }
  if (digShake.has(`${p.i},${p.j}`)) { const q = Math.sin(t * 34) * .035; sx += q; sy -= q * .5; } // the diggers will eat it
  const sway = p.web > 0 ? 0 : Math.sin(t * 1.7 + p.id * 1.3) * .035;
  if (p.buff > 0) { c.save(); c.globalAlpha = .5 + Math.sin(t * 5 + p.id) * .2; A.fxStar(c, x + 13, y - 26 + Math.sin(t * 3 + p.id) * 2, 4, '#ffe680'); c.restore(); }
  const pk = plantK(p.type, p.lvl);
  c.save(); c.translate(x, base); c.transform(sx * pk, 0, sway * pk, sy * pk, 0, 0); if (p.web > 0) c.globalAlpha = .8; blit(s, -PBX, -PBY); c.restore();
  if (p.web > 0) A.hdWeb(c, x, y, 19);
  if (p.lvl === 3) { const q = (t * .8 + p.id * .37) % 1; c.save(); c.globalAlpha = Math.sin(q * Math.PI) * .9; A.fxStar(c, x - 12 + ((p.id * 7) % 24), y - 30 + q * 14, 3.2, '#fff6b0'); c.restore(); }
}
// Roots of an eaten plant: a sprout in the soil, with a ring that fills while an aloe grows it back.
const stubSprite = () => sprite('stub', PW, PH, (x) => A.hdPlant(x, 'pumpkin', PBX, PBY, 1, { noShadow: true, stage: 0 }));
function drawStub(st, t) {
  const [x, y] = cellCenter(st.i, st.j), k = 1 + Math.sin(t * 5 + st.id) * .06;
  c.save(); c.translate(x, y + 14); c.scale(k, k); blit(stubSprite(), -PBX, -PBY); c.restore();
  c.save(); c.lineCap = 'round'; c.lineWidth = 3;
  c.beginPath(); c.arc(x, y + 4, 15, 0, A.TAU); c.setLineDash([4, 5]); c.strokeStyle = 'rgba(255,255,255,.75)'; c.stroke(); c.setLineDash([]);
  if (st.grow > 0) { c.beginPath(); c.arc(x, y + 4, 15, -Math.PI / 2, -Math.PI / 2 + A.TAU * st.grow); c.strokeStyle = '#7be05a'; c.stroke(); }
  c.restore();
}
// coming out of the anthill: small and faint at its hole, full size a step later
const emerge = (b) => (b.fly || b.brood ? 1 : clamp((HILL_X - b.x) / .55, 0, 1));
function drawBug(b, t, dt) {
  const [x, y] = bugPos(b), target = screenAngle(b.vx, b.vy);
  let a = angles.get(b.id); if (a == null) a = target;
  let d = target - a; while (d > Math.PI) d -= A.TAU; while (d < -Math.PI) d += A.TAU; a += d * Math.min(1, dt * 10); angles.set(b.id, a);
  const moving = !(b.frozen > 0) && !(b.chew > 0 || b.gnaw), fr = moving ? Math.floor(t * (b.fly ? 10 : b.rush > 0 ? 14 : 7) + b.id) % 2 : 0;
  const s = bugSprite(b.kind, fr), sc = (BUG_SIZE[b.kind] || 1) * BUG_K / 1.12 * (isBoss(b.kind) ? 1.7 : b.kind === 'aphid' ? .6 : 1);
  const lift = b.fly ? 16 : 0;
  c.save(); c.globalAlpha = (b.fly ? .18 : .25) * emerge(b); c.beginPath(); c.ellipse(x + 3 + lift * .6, y + 5 + lift, 15 * sc, 8 * sc, 0, 0, A.TAU); c.fillStyle = '#183008'; c.fill(); c.restore();
  if (b.slow < 1 && !b.fly) { c.save(); c.beginPath(); c.ellipse(x, y + 4, 17 * sc, 10 * sc, 0, 0, A.TAU); c.fillStyle = 'rgba(170,235,255,.35)'; c.fill(); c.restore(); }
  if (b.rush > 0) { c.save(); c.globalAlpha = .5; for (let n = 1; n <= 3; n++) { c.beginPath(); c.ellipse(x - Math.cos(a) * n * 9, y - Math.sin(a) * n * 9, 12 * sc / n, 7 * sc / n, a, 0, A.TAU); c.fillStyle = 'rgba(255,255,255,.35)'; c.fill(); } c.restore(); }
  const em = emerge(b); if (em <= 0) return;
  c.save(); c.globalAlpha = em; c.translate(x, y - (b.fly ? Math.sin(t * 6 + b.id) * 3 : 0)); c.rotate(a + (b.chew > 0 || b.gnaw ? Math.sin(t * 30) * .12 : 0)); if (em < 1) c.scale(.4 + em * .6, .4 + em * .6);
  if (b.hit > 0 || b.sting > 0) c.filter = 'brightness(1.8)';
  blit(s, -s.w / 2, -s.h / 2); c.restore();
  if (b.mark > 0) { c.save(); c.globalAlpha = Math.min(1, b.mark) * .9; c.translate(x + 9 * sc, y - 11 * sc); c.rotate(.5); c.beginPath(); c.moveTo(0, -6); c.lineTo(3, 3); c.lineTo(-3, 3); c.closePath(); c.fillStyle = '#e8336a'; c.fill(); c.lineWidth = 1; c.strokeStyle = '#7a1030'; c.stroke(); c.restore(); } // pricked by a rose
  if (b.frozen > 0) A.fxIced(c, x, y, 13 * sc);
  if (b.mended > 0 && Math.random() < .15) fx.push({ k: 'spark', x: x + (Math.random() - .5) * 12, y: y - 6, t: 0, life: .4 });
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
// A plant dragged from the shelf: over the field it snaps to the cell under the finger (a little above it on a touch
// screen, so the finger does not hide it) and shows what planting there would do: the reach and the new trails.
function dragCell() {
  const px = drag.x, py = drag.y - (drag.touch ? 34 : 0);
  if (px < FA[0] || py < FA[1] - 20 || px > FA[0] + FA[2] || py > FA[1] + FA[3]) return null;
  const wx = (px - ox) / ws, wy = (py - oy) / ws, [i, j] = cellAt(wx, wy);
  return wx >= 0 && wy >= 0 && i >= 0 && j >= 0 && i < COLS && j < ROWS ? [i, j] : null;
}
const drawDragCell = () => dragCell();
function drawDrag() {
  const cell = dragCell(), key = cell ? cell.join() : '';
  if (key !== drag.key) {
    drag.key = key; drag.cell = cell; drag.problem = null; drag.trails = null; drag.swap = null;
    if (cell) {
      const old = game.grid[cell[1]][cell[0]];
      drag.problem = plantProblem(game, drag.type, cell[0], cell[1]);
      if (!drag.problem && old?.type) { drag.swap = refund(game, old); drag.trails = null; } // over an old plant: the trail stays as it is
      else if (!drag.problem) { drag.trails = previewTrails(game, cell[0], cell[1]); drag.gain = drag.trails.reduce((a, tr) => a + tr.length, 0) - trails(game).reduce((a, tr) => a + tr.length, 0); }
    }
  }
  if (!drag.cell) return;
  const [i, j] = drag.cell, ok = !drag.problem, [x, y] = cellCenter(i, j);
  if (ok && drag.trails) drag.trails.forEach((tr, e) => { const pts = tr.map(([a, b]) => cellCenter(a, b)); pts.unshift(hillPos(e)); c.save(); c.shadowColor = 'rgba(255,200,40,.9)'; c.shadowBlur = 8; A.strokePts(c, A.chaikin(pts, 3), 4, '#ffd23a', { dash: [10, 7] }); c.restore(); });
  c.save(); c.beginPath(); A.rrect(c, x - 19, y - 19, 38, 38, 10); c.fillStyle = ok ? 'rgba(140,255,120,.35)' : 'rgba(255,80,70,.4)'; c.fill(); c.lineWidth = 3; c.strokeStyle = ok ? '#ffffff' : '#ff4a3a'; c.stroke(); c.restore();
  if (PLANTS[drag.type].range) { const r = pstat(game, { type: drag.type, lvl: 1, i, j }, 'range'); ring(x, y, r * CELL); groundRing(drag.type, x, y, r); }
  const pk = plantK(drag.type, 1); c.save(); c.globalAlpha = ok ? .9 : .45; c.translate(x, y + 14); c.scale(pk, pk); blit(plantSprite(drag.type, 1), -PBX, -PBY); c.restore();
  if (game.tiles[j][i] === 'fertile' && ok) A.hdText(c, '+30%', x, y + 26, 11 * Math.max(1, .8 / ws), '#eaffd8', { stroke: '#2a6a1a', sw: 3.5 });
}
// the dragged plant under the finger while it is not over a cell, in UI space
function drawDragFree() {
  if (!drag || drag.cell) return;
  const s = plantSprite(drag.type, 1), k = ws / uk * 1.1;
  c.save(); c.translate(drag.x / uk, (drag.y - (drag.touch ? 24 : 0)) / uk); c.scale(k, k); c.globalAlpha = .9; blit(s, -PBX, -PBY + 14); c.restore();
}
// ---------- the shelf of plants ----------
// The drawn part of a plant's picture inside its box (x0, y0, x1, y1), for fitting it on a card. Measured once.
const boxes = new Map();
function plantBox(type, lvl = 1) {
  const key = type + lvl;
  if (!boxes.has(key)) {
    const cv = document.createElement('canvas'); cv.width = PW; cv.height = PH; const x = cv.getContext('2d'); A.hdPlant(x, type, PBX, PBY, 1, { noShadow: true, lvl });
    const d = x.getImageData(0, 0, PW, PH).data; let x0 = PW, y0 = PH, x1 = 0, y1 = 0;
    for (let j = 0; j < PH; j++) for (let i = 0; i < PW; i++) if (d[(j * PW + i) * 4 + 3] > 40) { x0 = Math.min(x0, i); x1 = Math.max(x1, i + 1); y0 = Math.min(y0, j); y1 = Math.max(y1, j + 1); }
    boxes.set(key, x1 > x0 ? [x0, y0, x1, y1] : [0, 0, PW, PH]); free(cv);
  }
  return boxes.get(key);
}
// How much a plant is shrunk on the field, so a grown one does not hide its neighbours: it stays within about a cell
// (a little more at every level, so the level still shows in the size).
const fieldK = new Map();
function plantK(type, lvl) {
  const key = type + lvl;
  if (!fieldK.has(key)) { const [x0, y0, x1] = plantBox(type, lvl), mw = CELL * (.85 + .1 * (lvl - 1)), mh = CELL * (1 + .15 * (lvl - 1)); fieldK.set(key, Math.min(1, mw / (x1 - x0), mh / (PBY - y0))); }
  return fieldK.get(key);
}
function plantCard(type, x, y, w, h, on, poor) {
  c.save(); if (on) { c.shadowColor = 'rgba(255,220,60,.95)'; c.shadowBlur = 12; }
  A.uiPanel(c, x, y, w, h, 11, on ? '#fff0a8' : '#fbe7c2', { ol: on ? '#c88a10' : '#7a4a22', olw: on ? 3 : 2 }); c.restore();
  // the plant above, the price on a strip of its own below
  const PS = 14, s = plantSprite(type, 1), [bx0, by0, bx1, by1] = plantBox(type), aw = w - 6, ah = h - PS - 4, k = Math.min(aw / (bx1 - bx0), ah / (by1 - by0), 1.05);
  c.save(); c.beginPath(); A.rrect(c, x + 2, y + 2, w - 4, h - PS - 1, 9); c.clip();
  c.translate(x + w / 2 - (bx0 + bx1) / 2 * k, y + 3 + ah - by1 * k + Math.min(2, (ah - (by1 - by0) * k) / 2)); c.scale(k, k); blit(s, 0, 0); c.restore();
  c.save(); c.beginPath(); A.rrect(c, x + 2, y + 2, w - 4, h - 4, 9); c.clip(); c.fillStyle = poor ? 'rgba(160,60,40,.16)' : 'rgba(120,70,30,.12)'; c.fillRect(x, y + h - PS - 1, w, PS + 1); c.restore();
  const label = String(PLANTS[type].cost); c.save(); c.font = '900 10.5px Nunito'; const lw = c.measureText(label).width + 9; c.restore();
  const lx = x + w / 2 - lw / 2, ly = y + h - PS / 2 - 1.5;
  A.hdDrop(c, lx + 2, ly + .5, 3.2);
  A.hdText(c, label, lx + 7, ly + .5, 10.5, poor ? '#c0392b' : '#6a3e1c', { stroke: null, align: 'left' });
  if (poor) { c.save(); c.beginPath(); A.rrect(c, x, y, w, h, 11); c.fillStyle = 'rgba(60,40,30,.38)'; c.fill(); c.restore(); }
}
const cardRect = (k) => { const col = k % TRAY.cols, row = Math.floor(k / TRAY.cols); return [TRAY.x + col * TRAY.cw + 2, TRAY.y + row * TRAY.ch + 2, TRAY.cw - 4, TRAY.ch - 4]; };
function drawTray(t) {
  const list = trayList(), pad = 4, pulse = trayPulse > 0 ? Math.abs(Math.sin(trayPulse * 8)) : 0;
  c.save(); c.shadowColor = pulse ? `rgba(255,230,90,${pulse})` : 'rgba(0,0,0,.3)'; c.shadowBlur = pulse ? 18 : 8;
  A.uiPanel(c, TRAY.x - pad, TRAY.y - pad, TRAY.w + pad * 2, TRAY.h + pad * 2, 14, '#b9834d', { ol: '#5a3416', olw: 2.5 }); c.restore();
  ui.push({ x: TRAY.x - pad, y: TRAY.y - pad, w: TRAY.w + pad * 2, h: TRAY.h + pad * 2, fn: () => {}, s: 'u' });
  list.forEach((type, k) => {
    const [x, y, w, h] = cardRect(k), on = sel === type || drag?.type === type;
    plantCard(type, x, y - (on ? 2 : 0), w, h, on, game.dew < PLANTS[type].cost);
    ui.push({ x: x - 2, y: y - 2, w: w + 4, h: h + 4, fn: () => pick(type), s: 'u', card: type, tray: true });
  });
  drawDragFree();
}
// What the picked (or dragged) plant is, next to the shelf: name, a word about its part, what it does, its numbers
// and what its third level adds. While a plant is dragged over the field, also what planting there would do.
function drawInfo() {
  const type = drag ? drag.type : sel, k = trayList().indexOf(type); if (k < 0) return;
  if (drag?.cell) { // what planting here would do, right over the cell
    const [ux, uy] = toUI(...cellCenter(...drag.cell)), tag = drag.problem ? T.problem[drag.problem] : drag.swap != null ? T.swap(drag.swap, game.grid[drag.cell[1]][drag.cell[0]]?.lvl || 1) : T.gain(drag.gain), col = drag.problem ? '#e2483a' : drag.swap != null ? '#d07a20' : drag.gain > 0 ? '#3f9a2a' : '#8a7a5a';
    c.save(); c.font = '900 12px Nunito'; const gw = c.measureText(tag).width + 16, gx = clamp(ux - gw / 2, LX + 4, UW - RX - gw - 4), gy = Math.max(TOPY + 4, uy - CELL * ws / uk * 1.5 - 22);
    c.beginPath(); A.rrect(c, gx, gy, gw, 20, 10); c.fillStyle = col; c.fill(); c.lineWidth = 2; c.strokeStyle = '#fff'; c.stroke(); c.restore();
    A.hdText(c, tag, gx + gw / 2, gy + 10.5, 12, '#fff', { stroke: null });
  }
  const [cx, cy, cw, ch] = cardRect(k), w = Math.min(300, UW - LX - RX - 12 - (TRAY.mode === 'col' ? TRAY.w + 8 : 0)), tw = w - 22;
  c.save(); c.font = '800 12px Nunito'; const lines = wrap(T.about[type], tw); c.font = '900 11px Nunito'; const st = wrap(statLine(type).join(' · '), tw), pk = wrap(`★ ${T.lvl3}: ${T.perk[type].toLowerCase()}`, tw); c.restore();
  const h = 32 + lines.length * 15 + st.length * 14 + pk.length * 14 + 10;
  let x, y;
  if (TRAY.mode === 'row') { x = clamp(cx + cw / 2 - w / 2, LX + 6, UW - RX - w - 6); y = TRAY.y - h - 10; }
  else { x = TRAY.x + TRAY.w + 10; y = clamp(cy + ch / 2 - h / 2, TOPH + 4, UH - BOTY - h - 6); }
  // dragging over the field: keep clear of the finger
  if (drag) { const fy = drag.y / uk, fx0 = drag.x / uk; if (fx0 > x - 20 && fx0 < x + w + 20 && fy > y - 70 && fy < y + h + 30) { if (TRAY.mode === 'row') y = Math.max(TOPH + 4, fy - 90 - h); else x = Math.min(UW - RX - w - 6, fx0 + 50); if (fx0 > x - 20 && fx0 < x + w + 20 && fy > y - 70 && fy < y + h + 30) return; } }
  c.save(); c.globalAlpha = drag ? .93 : Math.min(1, infoT * 3); c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 12; A.uiPanel(c, x, y, w, h, 16, '#fff3d6', { ol: '#6a3e1c', olw: 2.5 }); c.shadowBlur = 0;
  A.hdText(c, T.plant[type], x + 11, y + 17, 15, '#6a3e1c', { stroke: null, align: 'left' });
  // the tag on the right: the plant's part, or what planting on the cell under the finger would do
  const tag = T.role[type], col = '#b0895a';
  if (tag) { c.font = '900 11px Nunito'; const gw = c.measureText(tag).width + 14; c.beginPath(); A.rrect(c, x + w - 9 - gw, y + 8, gw, 18, 9); c.fillStyle = col; c.fill(); A.hdText(c, tag, x + w - 9 - gw / 2, y + 17.5, 11, '#fff', { stroke: null }); }
  let yy = y + 36;
  for (const l of lines) { A.hdText(c, l, x + 11, yy, 12, '#8a5a32', { stroke: null, align: 'left', weight: 800 }); yy += 15; }
  yy += 2; for (const l of st) { A.hdText(c, l, x + 11, yy, 11, '#3f8a2a', { stroke: null, align: 'left' }); yy += 14; }
  for (const l of pk) { A.hdText(c, l, x + 11, yy, 11, '#c07a10', { stroke: null, align: 'left' }); yy += 14; }
  c.restore();
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
      case 'dmg': if (f.red) A.hdText(c, f.txt, f.x, f.y - k * 22, 16 * tz, '#ff6a6a', { stroke: '#5a1a08', sw: 4 }); else { c.globalAlpha *= .75; A.hdText(c, f.txt, f.x, f.y - k * 14, 9.5 * tz, '#fff2c4', { stroke: 'rgba(70,30,10,.6)', sw: 2.4 }); } break;
      case 'gain': if (!f.big) c.globalAlpha *= .8; A.hdText(c, f.txt, f.x, f.y - k * 18, (f.big ? 17 : 10) * tz, '#e8f7ff', { stroke: 'rgba(30,90,150,.75)', sw: f.big ? 4 : 2.4 }); break;
      case 'note': { const q = Math.min(1, f.t * 8); c.translate(f.x, f.y - k * 12); c.scale(q, q); A.hdText(c, f.txt, 0, 0, 12 * tz, '#ffffff', { stroke: '#5a3416', sw: 4 }); break; }
      case 'ringfx': c.beginPath(); c.arc(f.x, f.y, f.r * (.4 + k), 0, A.TAU); c.lineWidth = 4 * (1 - k); c.strokeStyle = '#fff6a0'; c.stroke(); break;
      case 'chill': c.beginPath(); c.arc(f.x, f.y, f.r * (.5 + k * .5), 0, A.TAU); c.fillStyle = `rgba(190,240,255,${.35 * (1 - k)})`; c.fill(); c.lineWidth = 2; c.strokeStyle = 'rgba(230,250,255,.9)'; c.stroke(); break;
      case 'star': A.fxStar(c, f.x, f.y, f.r * (1 - k * .5), '#ffffff'); break;
      case 'puff': case 'dust': c.beginPath(); c.arc(f.x, f.y, f.r * (1 + k), 0, A.TAU); c.fillStyle = f.k === 'dust' ? 'rgba(170,120,70,.55)' : 'rgba(255,255,255,.75)'; c.fill(); break;
      case 'kern': A.hdBall(c, f.x, f.y, 2.4, 2.4, '#ffd23f', { noOl: true, noSpec: true }); break;
      case 'crumb': c.beginPath(); c.arc(f.x, f.y, 2, 0, A.TAU); c.fillStyle = f.col; c.fill(); break;
      case 'fire': c.globalAlpha = 1 - k; A.fxFire(c, f.x, f.y, f.r * (.6 + k * .5)); break;
      case 'ember': c.beginPath(); c.arc(f.x, f.y, 2.2 * (1 - k), 0, A.TAU); c.fillStyle = '#ffb02e'; c.fill(); break;
      case 'spark': A.fxStar(c, f.x, f.y - k * 16, 5 * (1 - k), '#fff6a0'); break;
      case 'say': { const s = Math.min(1, f.t * 8) * (1 + Math.max(0, .15 - f.t) * 2); c.translate(f.x, f.y - k * 10); c.scale(s, s); A.hdText(c, f.txt, 0, 0, 15 * tz, '#ffffff', { stroke: '#a01818', sw: 5 }); break; }
      case 'heart': heart(f.x + Math.sin(f.t * 6) * 4, f.y - k * 26, 6 * (1 - k * .3)); break;
      case 'fly': { const [tx, ty] = DEW, e = k * k; const x = f.x + (tx - f.x) * e, y = f.y + (ty - f.y) * e - Math.sin(k * Math.PI) * 40; c.globalAlpha = 1; A.hdDrop(c, x, y, 5); break; }
      case 'flash': c.globalAlpha = 1; c.fillStyle = f.col + (.5 * (1 - k)) + ')'; c.fillRect(0, 0, UW, UH); break;
      case 'rain': { const y = f.y + k * UH * 1.6; c.globalAlpha = .7; c.strokeStyle = 'rgba(190,230,255,.9)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(f.x, y); c.lineTo(f.x - 4, y + 14); c.stroke(); break; }
    }
    c.restore();
  }
  if (list === fx) fx = fx.filter((f) => f.t < f.life); else ufx = ufx.filter((f) => f.t < f.life);
}
const hintRects = []; // [x, y, w, h, banner] of the hints on screen, UI space
function drawBanners(dt) {
  // hints go under the HUD (and under the anthill strip in portrait, and under a boss's bar), big words in the middle
  let topY = Math.max(TOPH, PORT ? toUI(0, 0)[1] : 0) + 20; const midX = (FA[0] + FA[2] / 2) / uk;
  let hints = 0; hintRects.length = 0;
  for (const b of banners) {
    if (b.top && hints++) continue; // hints come one after another
    if (b.gone) { b.t = Math.max(b.t, b.life - .2); }
    b.t += dt; const k = b.t / b.life; if (k >= 1) continue;
    const a = Math.min(1, b.t * 5, (1 - k) * 5); const text = typeof b.text === 'function' ? b.text() : b.text;
    c.save(); c.globalAlpha = a;
    if (b.top) {
      const fs = 12, room = Math.min(300, FA[2] / uk - 24); c.font = `800 ${fs}px Nunito`; const lines = wrap(text, room - 24), w = Math.min(room, Math.max(...lines.map((l) => c.measureText(l).width)) + 24), h = 10 + lines.length * 15, x = midX;
      c.globalAlpha = a * .9; A.uiPanel(c, x - w / 2, topY - 13, w, h, 12, '#fff3d6', { ol: 'rgba(106,62,28,.6)', olw: 1.5 });
      lines.forEach((l, k) => A.hdText(c, l, x, topY + k * 15 - 1 + (lines.length > 1 ? 1 : 0), fs, '#6a3e1c', { stroke: null, weight: 800 }));
      hintRects.push([x - w / 2, topY - 13, w, h, b]); topY += h + 6;
    }
    else { const s = 1 + Math.max(0, .3 - b.t) * 1.5; c.translate(midX, UH * .42); c.scale(Math.min(1, FA[2] / uk / 420), Math.min(1, FA[2] / uk / 420)); c.scale(s, s); c.globalAlpha = a * .9; A.hdText(c, text, 0, 0, 24, '#fff', { stroke: '#6a3a00', sw: 6, grad: ['#fff6a0', '#ffb02e'] }); }
    c.restore();
  }
  banners = banners.filter((b) => b.t < b.life);
}
// Bosses on the field: their names and health take the plate of the next wave in the HUD (it has nothing to start
// while a wave is on), so nothing lies over the field.
function bossPlate(x, y, w, h, list) {
  A.uiPanel(c, x, y, w, h, h / 2, '#3a1a2a', { ol: '#1a0a12', olw: 2 });
  const n = list.length, gap = 2, bh = (h - 8 - gap * (n - 1)) / n, ts = n === 1 ? 12 : 9;
  list.forEach((b, k) => {
    const bx = x + 6, by = y + 4 + k * (bh + gap), bw = w - 12;
    c.save(); c.beginPath(); A.rrect(c, bx, by, bw, bh, bh / 2); c.fillStyle = 'rgba(0,0,0,.35)'; c.fill();
    c.beginPath(); A.rrect(c, bx, by, Math.max(bh, bw * b.hp / b.maxHp), bh, bh / 2); const g = c.createLinearGradient(0, by, 0, by + bh); g.addColorStop(0, '#ff8ab0'); g.addColorStop(1, '#d0244a'); c.fillStyle = g; c.fill(); c.restore();
    A.hdText(c, `${T.bug[b.kind]}  ${Math.ceil(b.hp)}`, bx + bw / 2, by + bh / 2 + .5, ts, '#fff', { stroke: '#3a0a1a', sw: n === 1 ? 3 : 2.4 });
  });
}

// ---------- HUD ----------
// One row in a wide landscape: dew, fruit, wave, the next wave with its start button, frost and rain, speed, pause.
// Otherwise two rows: the second holds the next wave and the powers.
function drawHud(t) {
  const build = game.phase === 'build', waveText = build && game.nextIn != null ? T.soon(game.wave + 1, Math.ceil(game.nextIn)) : T.wave(build ? Math.min(game.waves, game.wave + 1) : game.wave, game.waves);
  const x0 = LX + 6, x1 = UW - RX - 6, y = TOPY, cy = y + 23;
  dewPill(x0, y + 7, 84, 32); hpPill(x0 + 88, y + 7, 66, 32);
  pauseBtn(x1 - 16, cy); speedBtn(x1 - 52, cy);
  const L = x0 + 160; let R = x1 - 74;
  if (TWO) {
    waveBar(L, y + 9, R - L, 28, R - L < 120 ? `${build ? Math.min(game.waves, game.wave + 1) : game.wave} / ${game.waves}` : waveText, 12);
    const y2 = y + 46; powerBtns([x1 - 56, y2 + 17], [x1 - 17, y2 + 17]); nextWave(x0, y2, x1 - 80 - x0, 34, t);
  } else {
    powerBtns([R - 55, cy], [R - 16, cy]); R -= 78;
    const ww = clamp((R - L) * .3, 110, 170); waveBar(L, y + 9, ww, 28, waveText, 12);
    nextWave(L + ww + 6, y + 6, R - (L + ww + 6), 34, t);
  }
}
// The next wave: ▶ with the countdown ring starts it (early: for the dew shown at the end), then who comes — hold a
// bug to read about it. While a wave is on, the plate shows the wave after it and ▶ is off.
let GO = [0, 0];
function nextWave(x, y, w, h, t) {
  const build = game.phase === 'build', last = game.wave >= game.waves, prev = wavePreview(game), bonus = earlyBonus(game), r = 13;
  const start = () => { pop = null; startWave(game); };
  if (!build) { const bosses = game.bugs.filter((b) => isBoss(b.kind) && b.hp > 0).slice(0, 2); if (bosses.length) { GO = [x + h / 2 + 1, y + h / 2]; bossPlate(x, y, w, h, bosses); return; } }
  A.uiPanel(c, x, y, w, h, h / 2, '#fff3d6', { ol: '#6a3e1c', olw: 2 });
  const cx = x + h / 2 + 1, cy = y + h / 2, p = build ? 1 + Math.sin(t * 5) * .06 : 1; GO = [cx, cy];
  c.save(); c.translate(cx, cy); c.scale(p, p);
  if (build) { c.shadowColor = 'rgba(80,200,40,.8)'; c.shadowBlur = 10; }
  c.beginPath(); c.arc(0, 0, r, 0, A.TAU); c.fillStyle = build ? '#5cc23e' : '#b9b3a2'; c.fill(); c.shadowBlur = 0;
  c.lineWidth = 2; c.strokeStyle = build ? '#1f6a17' : '#7a7466'; c.stroke();
  if (build && game.nextIn != null) { c.beginPath(); c.arc(0, 0, r - 3.2, -Math.PI / 2, -Math.PI / 2 + A.TAU * game.nextIn / BREAK); c.lineWidth = 2.6; c.lineCap = 'round'; c.strokeStyle = '#eaffd8'; c.stroke(); }
  c.beginPath(); c.moveTo(-3.5, -6); c.lineTo(7, 0); c.lineTo(-3.5, 6); c.closePath(); c.fillStyle = '#fff'; c.fill();
  c.restore();
  if (build && !last) ui.push({ x, y: y - 3, w: h + 6, h: h + 6, fn: start, s: 'u' });
  if (last) { if (!build) A.hdText(c, 'Последняя волна!', x + h + 4, cy + .5, 12, '#c0392b', { stroke: null, align: 'left' }); return; }
  // the end piece, then as many bugs as fit between
  const endW = build ? (bonus ? 50 : 62) : 0, room = w - h - 6 - (endW ? endW + 6 : 0), per = 42, fitN = Math.max(0, Math.min(prev.length, Math.floor(room / per)));
  let bx = x + h + 4;
  if (!build && room > per * prev.length + 40) { A.hdText(c, 'Дальше:', bx, cy + .5, 11, '#a08060', { stroke: null, align: 'left' }); bx += 46; }
  const shown = !build && bx > x + h + 4 ? Math.min(prev.length, Math.floor((x + w - 6 - bx) / per)) : fitN;
  prev.slice(0, shown).forEach(([kind, cnt], i) => bugChip(kind, cnt, bx + 12 + i * per, cy, BUGS[kind].dig ? () => { digShowT = 3.5; } : () => {})); // a tap on a digger: their way for a while
  if (shown < prev.length) A.hdText(c, `+${prev.length - shown}`, bx + shown * per + 4, cy + .5, 11, '#a08060', { stroke: null, align: 'left' });
  if (!endW) return;
  const ex = x + w - endW - 5, eh = 24, ey = cy - eh / 2;
  c.save(); c.beginPath(); A.rrect(c, ex, ey, endW, eh, eh / 2); c.fillStyle = bonus ? '#d8f0ff' : '#5cc23e'; c.fill(); c.restore();
  if (bonus) { A.hdDrop(c, ex + 10, cy + .5, 4.5); A.hdText(c, `+${bonus}`, ex + endW / 2 + 5, cy + .5, 12, '#2a6fa8', { stroke: null }); }
  else A.hdText(c, T.go, ex + endW / 2, cy + .5, 12, '#fff', { stroke: '#1f5a14', sw: 3 });
  ui.push({ x: ex - 2, y: y - 3, w: endW + 8, h: h + 6, fn: start, s: 'u' });
}
function dewPill(x, y, w, h) {
  DEW = [x + 18, y + h / 2];
  A.uiPanel(c, x, y, w, h, h / 2, '#fff3d6', { ol: '#6a3e1c' });
  A.hdDrop(c, x + 18, y + h / 2 + 1, 8.5); A.hdText(c, String(game.dew), x + w / 2 + 10, y + h / 2, game.dew > 9999 ? 15 : 19, '#ffffff', { stroke: '#2a6fa8', sw: 5 });
}
function hpPill(x, y, w, h) {
  if (hpShake > 0) x += Math.sin(hpShake * 60) * 2.5 * hpShake;
  A.uiPanel(c, x, y, w, h, h / 2, hpShake > 0 ? '#ffd0c8' : '#fff3d6', { ol: '#6a3e1c' });
  A.hdApple(c, x + 17, y + h / 2 + 1, 10, {});
  const bx = x + 32, bw = w - 40, k = game.hp / game.maxHp;
  c.save(); c.beginPath(); A.rrect(c, bx, y + h / 2 - 7, bw, 14, 7); c.fillStyle = 'rgba(60,20,10,.25)'; c.fill();
  c.beginPath(); A.rrect(c, bx, y + h / 2 - 7, Math.max(10, bw * k), 14, 7); const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#ff8a8a'); g.addColorStop(1, '#e02c3a'); c.fillStyle = g; c.fill(); c.restore();
  A.hdText(c, String(game.hp), bx + bw / 2, y + h / 2 + 1, 11, '#fff', { stroke: '#7a1010', sw: 3 });
}
function bugChip(k, n, cx, cy, fn) {
  const s = bugSprite(k, 0), sc = (isBoss(k) ? 34 : k === 'aphid' ? 22 : 30) / s.w * (k === 'caterpillar' ? 1.5 : 1);
  ui.push({ x: cx - 14, y: cy - 16, w: 40, h: 32, fn, s: 'u', info: { bug: k } });
  c.save(); c.translate(cx, cy); c.rotate(-Math.PI / 2); c.scale(sc, sc); blit(s, -s.w / 2, -s.h / 2); c.restore();
  A.hdText(c, '×' + n, cx + 11, cy + 3, 11, isBoss(k) ? '#ffd0d0' : '#fff', { stroke: isBoss(k) ? '#8a1020' : '#4a2a12', sw: 3.5, align: 'left' });
}
function pauseBtn(x, y) { button(x, y, 16, '#7ac8ff', (bx, by) => { c.save(); c.fillStyle = '#fff'; c.strokeStyle = '#1f5a8a'; c.lineWidth = 1.5; for (const dx of [-5, 2]) { c.beginPath(); A.rrect(c, bx + dx, by - 6, 4, 12, 1.5); c.fill(); c.stroke(); } c.restore(); }, openPause); }
function speedBtn(x, y) { button(x, y, 16, speed > 2 ? '#f2622a' : speed > 1 ? '#ff9a2a' : '#ffcf3a', (bx, by) => A.hdText(c, '×' + speed, bx, by + 1, 13, '#fff', { stroke: '#8a5a00', sw: 3.5 }), () => { speed = speed % 3 + 1; sfx.tap(); }); }
function powerBtns([fx0, fy0], [rx, ry]) {
  button(fx0, fy0, 16, '#8fd6ff', (x, y) => { c.save(); c.translate(x, y); c.scale(.85, .85); A.iconFrost(0, 0, c); c.restore(); }, () => usePower(game, 'frost'), !game.powers.frost || game.phase !== 'wave');
  badge(fx0, fy0, 16, game.powers.frost);
  button(rx, ry, 16, '#4aa8ee', (x, y) => { c.save(); c.translate(x, y); c.scale(.85, .85); A.iconRain(0, 0, c); c.restore(); }, () => usePower(game, 'rain'), !game.powers.rain);
  badge(rx, ry, 16, game.powers.rain);
}
function badge(x, y, r, n) { if (!n) return; c.save(); c.beginPath(); c.arc(x + r * .72, y - r * .68, 8, 0, A.TAU); c.fillStyle = '#ff4646'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#fff'; c.stroke(); c.restore(); A.hdText(c, String(n), x + r * .72, y - r * .68 + .5, 10, '#fff', { stroke: null }); }
function waveBar(x, y, w, h, text, ts) {
  A.uiPanel(c, x, y, w, h, h / 2, '#5a3a22', { ol: '#2a1a0e' });
  const done = game.phase !== 'wave' ? game.wave / game.waves : (game.wave - 1 + Math.min(1, game.waveTime / Math.max(1, (game.L.waves[game.wave - 1] || [[0, 1, 1, 0]]).reduce((s, [, n, gap, d]) => s + d + n * gap, 0)))) / game.waves;
  c.save(); c.beginPath(); A.rrect(c, x + 4, y + 4, Math.max(h - 8, (w - 8) * done), h - 8, (h - 8) / 2); const g = c.createLinearGradient(0, y + 4, 0, y + h - 4); g.addColorStop(0, '#a8f070'); g.addColorStop(1, '#4cb02e'); c.fillStyle = g; c.fill(); c.restore();
  // a mark for every boss wave
  for (const [at] of game.L.boss) { const bx = x + 4 + (w - 8) * (at - .5) / game.waves; c.save(); c.beginPath(); c.arc(bx, y + h / 2, 3.2, 0, A.TAU); c.fillStyle = at <= game.wave ? 'rgba(255,255,255,.5)' : '#ff5a7a'; c.fill(); c.restore(); }
  A.hdText(c, text, x + w / 2, y + h / 2 + .5, ts, '#ffffff', { stroke: '#2a1a0e', sw: 4 });
}
// A wide button with a word and a price in dew.
function wideBtn(x, y, w, h, col, ol, label, price, fn, disabled = false) {
  c.save(); if (disabled) c.globalAlpha = .55;
  A.uiPanel(c, x, y, w, h, h / 2, disabled ? '#b9b3a2' : col, { ol: disabled ? '#7a7466' : ol, olw: 2 });
  if (price != null) {
    c.font = '900 12px Nunito'; const lw = c.measureText(label).width, pw = c.measureText(String(price)).width + 13, x0 = x + (w - lw - pw - (label ? 6 : 0)) / 2;
    if (label) A.hdText(c, label, x0, y + h / 2 + .5, 12, '#fff', { stroke: ol, sw: 3, align: 'left' });
    const px = x0 + lw + (label ? 6 : 0); A.hdDrop(c, px + 4, y + h / 2 + .5, 4.2); A.hdText(c, String(price), px + 11, y + h / 2 + .5, 12, '#fff', { stroke: ol, sw: 3, align: 'left' });
  } else A.hdText(c, label, x + w / 2, y + h / 2 + .5, 12, '#fff', { stroke: ol, sw: 3 });
  c.restore();
  ui.push({ x, y: y - 3, w, h: h + 6, fn: disabled ? () => sfx.cant() : fn, s: 'u' });
}
// The panel of a plant on the field: what it has now and what the next level gives (green), the trick of the third
// level, and the buttons: upgrade, heal, sell. Roots and weeds get a small panel of their own.
function drawPop() {
  const p = pop, w = Math.min(236, UW - LX - RX - 12);
  const hc0 = CELL / 2 * ws / uk, [fx0, fy0, fw, fh] = faUI(), [ux, y0] = toUI(...cellCenter(p.i, p.j)), uy = clamp(y0, fy0 + hc0, fy0 + fh - hc0);
  // The panel keeps clear of the plant and its reach (the bigger ring, after the upgrade): it goes to the top or the
  // bottom of the field, or beside the ring, wherever it covers least of it; nearer to the plant when all are clear.
  const P = p.type ? PLANTS[p.type] : null, reach = P?.range && game.plants.includes(p) ? Math.max(pstat(game, p, 'range'), p.lvl < 3 ? pstat(game, { ...p, lvl: p.lvl + 1 }, 'range') : 0) : .5;
  const rr = reach * CELL * ws / uk + 6, ry = uy - hc0 * .6; // the circle to keep clear, a little raised for the plant's height
  const placeAt = (h) => {
    const top = TOPH + 4, bottom = (TRAY.mode === 'row' ? TRAY.y - 4 : UH - BOTY) - h - 6, minX = TRAY.mode === 'col' ? Math.min(TRAY.x + TRAY.w + 10, UW - RX - w - 6) : LX + 6, maxX = UW - RX - w - 6; // not over the shelf
    const near = clamp(ux - w / 2, minX, maxX), far = ux > (minX + maxX + w) / 2 ? minX : maxX, mid = clamp(ry - h / 2, top, Math.max(top, bottom));
    const spots = [[near, top], [near, bottom], [ux - rr - 8 - w, mid], [ux + rr + 8, mid], [far, top], [far, bottom]].filter(([x]) => x >= minX - .5 && x <= maxX + .5);
    const cover = (x, y) => { let n = 0; for (let a = 0; a < 8; a++) for (let b = 0; b < 8; b++) if (Math.hypot(x + (a + .5) * w / 8 - ux, y + (b + .5) * h / 8 - ry) < rr) n++; return n; };
    let best = null, bs = Infinity;
    for (const [x, y] of spots) { const sc = cover(x, y) * 1e4 + Math.hypot(x + w / 2 - ux, y + h / 2 - ry); if (sc < bs) { bs = sc; best = [x, y]; } }
    const [x, y] = best;
    ui.push({ x, y, w, h, fn: () => {}, s: 'u' });
    c.save(); c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 12; A.uiPanel(c, x, y, w, h, 16, '#fff3d6', { ol: '#6a3e1c', olw: 2.5 }); c.restore();
    return [x, y];
  };
  const close = (x, y) => button(x + w - 17, y + 17, 11, '#e0884a', (bx, by) => { c.save(); c.lineCap = 'round'; c.lineWidth = 2.6; c.strokeStyle = '#fff'; c.beginPath(); c.moveTo(bx - 3.6, by - 3.6); c.lineTo(bx + 3.6, by + 3.6); c.moveTo(bx + 3.6, by - 3.6); c.lineTo(bx - 3.6, by + 3.6); c.stroke(); c.restore(); }, () => { pop = null; });
  if (p.obstacle === 'weed') {
    const [x, y] = placeAt(74);
    A.hdText(c, T.feature.weed[0], x + 12, y + 18, 14, '#6a3e1c', { stroke: null, align: 'left' }); close(x, y);
    wideBtn(x + 10, y + 36, w - 20, 28, '#e0884a', '#7a3a10', T.weed, WEED_COST, () => { clearWeed(game, p.i, p.j); }, game.dew < WEED_COST);
    return;
  }
  if (game.stubs.includes(p)) { // roots: grow the plant back, or clear the cell for something else
    const cost = regrowCost(p), [x, y] = placeAt(74), bw = (w - 26) / 2;
    A.hdText(c, T.roots(T.plant[p.type]), x + 12, y + 18, 14, '#6a3e1c', { stroke: null, align: 'left' }); close(x, y);
    wideBtn(x + 10, y + 36, bw, 28, '#5cc23e', '#1f5a14', 'Вырастить', cost, () => { if (regrow(game, p)) pop = null; }, game.dew < cost || !!placeProblem(game, p.i, p.j));
    wideBtn(x + 16 + bw, y + 36, bw, 28, '#e0884a', '#7a3a10', 'Убрать', null, () => { clearStub(game, p); pop = null; sfx.sell(); });
    return;
  }
  const rows = statRows(p.type, p.lvl, p), up = upgradeCost(p), hc = healCost(p), fresh = isFresh(game, p), fert = game.tiles[p.j][p.i] === 'fertile';
  c.save(); c.font = '900 11px Nunito'; const perk = wrap(`${p.lvl === 3 ? '★' : `${T.lvl3}:`} ${T.perk[p.type]}`, w - 24); c.restore();
  const notes = (fert ? 1 : 0) + (p.web > 0 ? 1 : 0) + (p.buff > 0 ? 1 : 0) + (p.guard > 0 ? 1 : 0), h = 34 + rows.length * 16 + 6 + perk.length * 13 + notes * 14 + 8 + 30 + (hc ? 34 : 0) + 10;
  const [x, y] = placeAt(h);
  A.hdText(c, T.plant[p.type], x + 12, y + 18, 15, '#6a3e1c', { stroke: null, align: 'left' });
  // the level: three pips after the name
  c.save(); c.font = '900 15px Nunito'; const nw = c.measureText(T.plant[p.type]).width; c.restore();
  for (let k = 0; k < 3; k++) { c.beginPath(); c.arc(x + 22 + nw + k * 13, y + 18, 4.6, 0, A.TAU); c.fillStyle = k < p.lvl ? '#ffb81a' : '#e4d2ac'; c.fill(); c.lineWidth = 1.4; c.strokeStyle = k < p.lvl ? '#a06a00' : '#c0a878'; c.stroke(); }
  close(x, y);
  let yy = y + 42;
  for (const [label, cur, next, rung] of rows) { // rung: faster by a bell, in its colour
    A.hdText(c, label, x + 12, yy, 12, '#8a5a32', { stroke: null, align: 'left', weight: 800 });
    if (next) { A.hdText(c, next, x + w - 12, yy, 12.5, '#2f9a1f', { stroke: null, align: 'right' }); c.save(); c.font = '900 12.5px Nunito'; const nw2 = c.measureText(next).width; c.restore(); A.hdText(c, `${cur}  →`, x + w - 18 - nw2, yy, 12, rung ? '#3a6ab0' : '#6a3e1c', { stroke: null, align: 'right' }); }
    else A.hdText(c, cur, x + w - 12, yy, 12.5, rung ? '#3a6ab0' : '#6a3e1c', { stroke: null, align: 'right' });
    yy += 16;
  }
  yy += 4;
  for (const l of perk) { A.hdText(c, l, x + 12, yy, 11, p.lvl === 3 ? '#c07a10' : '#a08060', { stroke: null, align: 'left' }); yy += 13; }
  if (fert) { A.hdText(c, T.onFertile, x + 12, yy + 1, 11, '#3f8a2a', { stroke: null, align: 'left' }); yy += 14; }
  if (p.web > 0) { A.hdText(c, T.webbed, x + 12, yy + 1, 11, '#7a4ab0', { stroke: null, align: 'left' }); yy += 14; }
  if (p.buff > 0) { A.hdText(c, T.belled(p.buff), x + 12, yy + 1, 11, '#3a6ab0', { stroke: null, align: 'left' }); yy += 14; } // (the stats above already count it)
  if (p.guard > 0) { A.hdText(c, T.guarded(p.guard), x + 12, yy + 1, 11, '#3f8a2a', { stroke: null, align: 'left' }); yy += 14; }
  yy += 6;
  const bw = (w - 26) / 2;
  if (up == null) wideBtn(x + 10, yy, bw, 28, '#c8b070', '#8a6a10', T.max, null, () => {}, true);
  else wideBtn(x + 10, yy, bw, 28, '#5cc23e', '#1f5a14', T.up, up, () => { if (!upgrade(game, p)) sfx.cant(); }, game.dew < up);
  wideBtn(x + 16 + bw, yy, bw, 28, '#e0884a', '#7a3a10', `${T.sell} +${refund(game, p)}`, null, () => { removePlant(game, p); pop = null; });
  if (fresh) A.hdText(c, T.fullRefund, x + 16 + bw * 1.5, yy - 7, 9, '#a08060', { stroke: null });
  if (hc) wideBtn(x + 10, yy + 34, w - 20, 28, '#4aa8ee', '#1a4f8a', T.healBtn, hc, () => { if (!heal(game, p)) sfx.cant(); }, game.dew < hc);
}

// ---------- long-press info ----------
// Holding a finger on a plant (on the field or in the plant menu) or on a bug (on the field or in the next-wave list)
// shows what it is; letting go hides it.
let tip = null, lpTimer = 0;
const plantInfo = (type, p) => ({ title: T.plant[type] + (p ? ` · ${T.lvl(p.lvl)}` : ''), text: T.about[type], stats: statLine(type, p ? p.lvl : 1).join(' · ') + ` · ★ ${T.lvl3.toLowerCase()}: ${T.perk[type].toLowerCase()}` });
const bugInfo = (kind, b) => ({ title: T.bug[kind], text: T.bugAbout[kind], stats: bugStats(kind, b).join(' · ') });
function infoAt(px, py) {
  const u = hit(ui.filter((q) => q.s === 'u'), px / uk, py / uk);
  if (u) return u.card ? plantInfo(u.card) : u.info?.bug ? bugInfo(u.info.bug) : null;
  if (px < FA[0] || py < FA[1] || px > FA[0] + FA[2] || py > FA[1] + FA[3]) return null;
  const wx = (px - ox) / ws, wy = (py - oy) / ws;
  let best = null, bd = Math.max(CELL * .7, 22 / ws);
  for (const b of game.bugs) { if (emerge(b) < .3) continue; const [x, y] = bugPos(b), d = Math.hypot(x - wx, y - wy); if (d < bd) { bd = d; best = b; } }
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
let press = null, pinch = null, lastTouchEnd = -1e9;
const ptrs = new Map();
const hit = (list, x, y) => { for (let k = list.length - 1; k >= 0; k--) { const u = list[k]; if (x >= u.x && y >= u.y && x <= u.x + u.w && y <= u.y + u.h) return u; } return null; };
function tap(px, py) {
  for (const [x, y, w, h, b] of hintRects) if (px / uk >= x && px / uk <= x + w && py / uk >= y && py / uk <= y + h) b.gone = true;
  const u = hit(ui.filter((q) => q.s === 'u'), px / uk, py / uk); if (u) { u.fn(); return; }
  const wx = (px - ox) / ws, wy = (py - oy) / ws, w = hit(ui.filter((q) => q.s === 'w'), wx, wy); if (w) { w.fn(); return; }
  const [i, j] = cellAt(wx, wy);
  if (wx >= 0 && wy >= 0 && i >= 0 && j >= 0 && i < COLS && j < ROWS) tapCell(i, j); else pop = null;
}
const startPress = (id, x, y, moved = false, touch = false) => { const u = moved ? null : hit(ui.filter((q) => q.s === 'u'), x / uk, y / uk); press = { id, x, y, cx: camX, cy: camY, moved, onUI: !!u, card: u?.tray ? u.card : null, touch }; };
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
  if (drag) { drag = null; }
  if (ptrs.size === 1) {
    startPress(e.pointerId, e.clientX, e.clientY, false, e.pointerType !== 'mouse');
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
  if (!press || e.pointerId !== press.id) return;
  const dx = e.clientX - press.x, dy = e.clientY - press.y;
  if (press.card) { // a plant pulled off the shelf
    if (!drag && Math.hypot(dx, dy) > 8) { press.moved = true; clearTimeout(lpTimer); tip = null; pop = null; drag = { type: press.card, x: e.clientX, y: e.clientY, touch: press.touch, key: null, cell: null }; sfx.select(); }
    if (drag) { drag.x = e.clientX; drag.y = e.clientY; }
    return;
  }
  if (press.onUI || press.tip) return;
  if (!press.moved && Math.hypot(dx, dy) > 10) press.moved = true;
  if (press.moved && zoom > 1) { camX = press.cx - dx / ws; camY = press.cy - dy / ws; applyCam(); }
});
const release = (e) => {
  if (!ptrs.delete(e.pointerId)) return;
  clearTimeout(lpTimer); tip = null;
  if (drag && press && e.pointerId === press.id) { // let go: plant it where it is, or put it back
    const d = drag; drag = null; press = null;
    if (e.type === 'pointerup' && game && !paused) { const cell = (drag = d, drawDragCell()); drag = null; if (cell) plantAt(d.type, cell[0], cell[1]); }
    return;
  }
  if (pinch) { if (ptrs.size >= 2) startPinch(); else { pinch = null; zoomT = performance.now(); const [id, q] = [...ptrs.entries()][0] || []; press = null; if (q) startPress(id, q.x, q.y, true); } return; }
  if (press && e.pointerId === press.id) { const p = press; press = null; if (e.type === 'pointerup' && !p.moved && !p.tip && game && !paused) tap(p.x, p.y); }
};
cv.addEventListener('pointerup', release);
cv.addEventListener('contextmenu', (e) => e.preventDefault()); // a long press is ours, not the browser's menu
// iOS takes two quick taps for its double-tap gesture and shifts the page (seen 2026-11-21, 0.16.0): a second tap
// soon after the first is not the browser's (the game reads pointer events, so nothing of ours is lost)
cv.addEventListener('touchend', (e) => { const t = performance.now(); if (t - lastTouchEnd < 400) e.preventDefault(); lastTouchEnd = t; }, { passive: false });
cv.addEventListener('dblclick', (e) => e.preventDefault());
cv.addEventListener('pointercancel', release);
// Safari would zoom the whole page on a pinch: keep that gesture for the field
cv.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
cv.addEventListener('wheel', (e) => { e.preventDefault(); if (game && !paused) zoomTo(zoom * Math.exp(-e.deltaY * .0015), e.clientX, e.clientY); }, { passive: false });
}
bindCanvas();
for (const t of ['gesturestart', 'gesturechange']) document.addEventListener(t, (e) => { if (e.target === cv) e.preventDefault(); });
addEventListener('resize', resize);
visualViewport?.addEventListener('resize', resize);
addEventListener('pageshow', () => resize());
document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(resize, 300); });
// the page never moves: neither when it is taller than its window nor after a gesture iOS took for itself
const unscroll = () => { if (scrollX || scrollY) scrollTo(0, 0); };
addEventListener('scroll', unscroll); visualViewport?.addEventListener('scroll', unscroll);
document.addEventListener('dblclick', (e) => e.preventDefault());
document.addEventListener('visibilitychange', () => { if (document.hidden && game && $('home').hidden) saveLevel(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && game && !paused && game.phase !== 'won' && game.phase !== 'lost') openPause(); });

// ---------- screens (HTML) ----------
const $ = (id) => document.getElementById(id);
function showHome(on) {
  $('home').hidden = !on;
  if (!on) return;
  if (game) tm.quit(game); // the level is left for the home screen (after its end there is no party to leave)
  paused = true; muffleMusic(false);
  const free = starsAll() - starsSpent(), save = readSave();
  $('bPerks').innerHTML = `${T.perks}${free > 0 ? `<span class="badge">★ ${free}</span>` : ''}`;
  $('cont').hidden = !save || !LEVELS[save.level]; if (save && LEVELS[save.level]) $('cont').textContent = T.cont(LEVELS[save.level].name, save.wave + 1);
  const grid = $('levels'); grid.innerHTML = '';
  const next = LEVELS.findIndex((L, n) => levelOpen(n) && !(progress.stars[n] > 0));
  LEVELS.forEach((L, n) => {
    const st = progress.stars[n] || 0, open = levelOpen(n);
    const b = document.createElement('button'); b.className = 'lv' + (st ? ' done' : '') + (n === next ? ' next' : ''); b.disabled = !open;
    b.innerHTML = `<b>${n + 1}</b><span>${L.name}</span><i>${open ? '★'.repeat(st) + '☆'.repeat(3 - st) : LOCK}</i>${L.feature && open ? `<em>${T.featureShort[L.feature]}</em>` : ''}`;
    b.onclick = () => { goFullscreen(); sfx.tap(); startLevel(n); };
    grid.append(b);
  });
}
const LOCK = '<svg width="18" height="20" viewBox="0 0 18 20"><rect x="2" y="8" width="14" height="11" rx="3" fill="#8a6a4a"/><path d="M5 8V6a4 4 0 0 1 8 0v2" stroke="#8a6a4a" stroke-width="2.6" fill="none"/></svg>';
function showModal(html, wide = false) { $('modal').hidden = !html; $('card').className = 'card' + (wide ? ' wide' : ''); if (html) $('card').innerHTML = html; }
// iPhone home-screen app only: the sizes the layout is built from, to read off a screenshot when something is cut off
function screenInfo() {
  const i = safeInsets(), r = (v) => Math.round(v), h = getComputedStyle(document.documentElement).getPropertyValue('--app-h') || '-';
  return `окно ${innerWidth}×${innerHeight} · экран ${screen.width}×${screen.height} · vv ${r(visualViewport?.height || 0)} · safe ${r(i.t)}/${r(i.b)}/${r(i.l)}/${r(i.r)} · app-h ${h} · ${document.documentElement.className}`;
}
const soundRows = () => `<label class="set"><span>${T.sound}</span><input type="range" id="sVol" min="0" max="1" step="0.05" value="${audio.vol}"></label><label class="set"><span>${T.music}</span><input type="range" id="sMus" min="0" max="1" step="0.05" value="${audio.music}"></label>`;
function bindSound() {
  const save = () => { localStorage.setItem('fruit.audio', JSON.stringify(audio)); applyVolume(); };
  $('sVol').oninput = (e) => { audio.vol = Number(e.target.value); save(); }; $('sVol').onchange = () => sfx.preview();
  $('sMus').oninput = (e) => { audio.music = Number(e.target.value); save(); };
}
function openPause() {
  paused = true; sfx.tap(); muffleMusic(true);
  showModal(`<h2>${T.pause}</h2>${soundRows()}<div class="row" style="margin-top:10px"><button class="btn" id="mResume">${T.resume}</button><button class="btn alt" id="mRestart">${T.restart}</button><button class="btn alt" id="mHome">${T.levels}</button></div>${IOS_PWA ? `<p class="diag">${screenInfo()}</p>` : ''}`);
  bindSound();
  $('mResume').onclick = () => { showModal(null); paused = false; muffleMusic(false); };
  $('mRestart').onclick = () => startLevel(levelIdx);
  $('mHome').onclick = () => { showModal(null); showHome(true); };
}
function openSound() {
  showModal(`<h2>${T.sound}</h2>${soundRows()}<div class="row" style="margin-top:10px"><button class="btn" id="mOk">${T.close}</button></div>`);
  bindSound(); $('mOk').onclick = () => showModal(null);
}
// Cards shown one after another before a level: a new plant, the ground of the level. The game waits.
function introCards(cards) {
  paused = true;
  const show = (k) => {
    const q = cards[k];
    showModal(`<div><span class="tag">${q.tag}</span></div><h2 style="margin:0">${q.title}</h2><img class="hero" src="${q.img}" alt=""><p style="margin:6px 0 4px">${q.text}</p>${q.extra ? `<p style="margin:0 0 8px;color:#c07a10">★ ${q.extra}</p>` : ''}<div class="row foot"><button class="btn" id="mOk">${T.ok}</button></div>`);
    sfx.unlock();
    $('mOk').onclick = () => { sfx.tap(); if (k + 1 < cards.length) show(k + 1); else { showModal(null); paused = false; } };
  };
  show(0);
}
// Permanent perks for the stars of the levels.
function openPerks() {
  const all = starsAll(), free = all - starsSpent();
  const item = (k) => {
    const P = PERKS[k], tier = progress.perks[k] || 0, max = P.cost.length, isPlant = !!PLANTS[k], open = !isPlant || plantOpen(k), cost = P.cost[tier];
    const name = isPlant ? T.plant[k] : T.perkName[k], now = tier ? T.perkAbout[k](P.v[tier - 1]) : '', nxt = tier < max ? T.perkAbout[k](P.v[tier]) : '';
    const img = isPlant ? plantPic(k, 1) : perkPic(k);
    return `<div class="item${open ? '' : ' off'}"><img src="${img}" alt=""><div class="tx"><h3>${name} <span class="pips">${'●'.repeat(tier)}<s>${'●'.repeat(max - tier)}</s></span></h3>
      <p>${open ? (tier < max ? nxt : now) : T.locked}</p>${tier && tier < max ? `<div class="st">сейчас: ${now.toLowerCase()}</div>` : tier ? `<div class="st">${T.max}</div>` : ''}</div>
      ${tier < max && open ? `<button class="buy" data-k="${k}" ${cost > free ? 'disabled' : ''}>★ ${cost}</button>` : ''}</div>`;
  };
  const body = $('card').querySelector?.('.body'), top = body ? body.scrollTop : 0;
  showModal(`<h2 style="margin-bottom:4px">${T.perks}</h2><div class="totals">${T.starsFree(free, all)}</div><div class="body scroll">${PERK_ORDER.map(item).join('')}<p style="font-size:12px">${T.perksHint}</p></div>
    <div class="row foot"><button class="btn" id="mOk">${T.close}</button>${starsSpent() ? `<button class="btn alt" id="mReset">${T.reset}</button>` : ''}</div>`, true);
  $('card').querySelector('.body').scrollTop = top;
  for (const b of $('card').querySelectorAll('.buy')) b.onclick = () => { const k = b.dataset.k; progress.perks[k] = (progress.perks[k] || 0) + 1; saveProgress(); sfx.buy(); openPerks(); };
  $('mOk').onclick = () => { showModal(null); showHome(true); };
  if ($('mReset')) $('mReset').onclick = () => { progress.perks = {}; saveProgress(); sfx.sell(); openPerks(); };
}
function perkPic(k) {
  return pic(`perk:${k}`, 60, 60, (x) => {
    if (k === 'dew') A.hdDrop(x, 30, 32, 20);
    else if (k === 'heart') A.hdApple(x, 30, 34, 20, {});
    else if (k === 'roots') A.hdPlant(x, 'pumpkin', 30, 44, 2, { stage: 0 });
    else if (k === 'clouds') { x.beginPath(); x.arc(30, 30, 24, 0, A.TAU); x.fillStyle = '#4aa8ee'; x.fill(); x.translate(30, 30); x.scale(1.5, 1.5); A.iconRain(0, 0, x); }
    else { x.beginPath(); x.arc(30, 30, 24, 0, A.TAU); x.fillStyle = '#e0884a'; x.fill(); A.hdDrop(x, 30, 32, 13); }
  });
}
// The guide: every plant with its three levels side by side, and the bugs met so far.
let guideTab = 'plants';
function openGuide() {
  const plant = (k) => {
    if (!plantOpen(k)) return `<div class="item off"><img src="${plantPic(k, 1)}" alt=""><div class="tx"><h3>${T.plant[k]}</h3><p>${T.locked}</p></div></div>`;
    const lv = [1, 2, 3].map((l) => `<div><img src="${plantPic(k, l)}" alt=""><b>${l === 1 ? `${PLANTS[k].cost} росы` : `+${PLANTS[k].up[l - 2]} росы`}</b>${statRows(k, l).filter(([, , ]) => true).slice(0, 4).map(([a, v]) => `${a.toLowerCase()} ${v}`).join('<br>')}${l === 3 ? `<u>★ ${T.perk[k]}</u>` : ''}</div>`).join('');
    return `<div class="item" style="display:block"><h3>${T.plant[k]} <span class="tag" style="margin:0 0 0 4px">${T.role[k]}</span></h3><p>${T.about[k]}</p><div class="lvls">${lv}</div></div>`;
  };
  const bug = (k) => (progress.bugs[k]
    ? `<div class="item"><img src="${bugPic(k)}" alt=""><div class="tx"><h3>${T.bug[k]}${isBoss(k) ? ' <span class="tag" style="margin:0;background:#ffd0d8;color:#a01838">босс</span>' : ''}</h3><p>${T.bugAbout[k]}</p><div class="st">${bugStats(k).slice(1).join(' · ')}</div></div></div>`
    : `<div class="item off"><div class="tx"><h3>???</h3><p>${T.unknown}</p></div></div>`);
  showModal(`<div class="tabs"><button class="tab${guideTab === 'plants' ? ' on' : ''}" id="tP">${T.plantsTab}</button><button class="tab${guideTab === 'bugs' ? ' on' : ''}" id="tB">${T.bugsTab}</button></div>
    <div class="body scroll">${guideTab === 'plants' ? PLANT_ORDER.map(plant).join('') : `<p style="font-size:13px;margin:0 0 8px">${T.growNote}</p>` + Object.keys(BUGS).map(bug).join('')}</div><div class="row foot"><button class="btn" id="mOk">${T.close}</button></div>`, true);
  $('tP').onclick = () => { guideTab = 'plants'; sfx.tap(); openGuide(); }; $('tB').onclick = () => { guideTab = 'bugs'; sfx.tap(); openGuide(); };
  $('mOk').onclick = () => { showModal(null); if (!$('home').hidden) return; paused = false; };
}
function endScreen(won) {
  paused = true;
  let st = 0, gained = 0;
  if (won) { st = stars(game); gained = Math.max(0, st - (progress.stars[levelIdx] || 0)); progress.stars[levelIdx] = Math.max(progress.stars[levelIdx] || 0, st); saveProgress(); sfx.win(); } else { sfx.lose(); muffleMusic(true); }
  const hasNext = won && levelIdx + 1 < LEVELS.length, free = starsAll() - starsSpent();
  showModal(`<h1 class="${won ? 'win' : 'lose'}">${won ? T.won : T.lost}</h1>${won ? `<div class="stars">${[1, 2, 3].map((n) => `<span class="${n <= st ? '' : 'no'}">★</span>`).join('')}</div>` : ''}
    <p>${won ? `Жуков побеждено: ${game.stats.kills} · укусов: ${game.stats.bites}${game.stats.eaten ? ` · съедено растений: ${game.stats.eaten}` : ''}` : `Дошли до волны ${game.wave} из ${game.waves}. Попробуй длиннее лабиринт — или загляни в «Улучшения»`}</p>
    ${gained ? `<div class="gain">+${gained} ★ для улучшений</div>` : ''}${free > 0 ? `<p style="margin:2px 0 10px">${T.spend}</p>` : ''}
    <div class="row">${hasNext ? `<button class="btn" id="mNext">${T.nextLevel}</button>` : ''}<button class="btn ${hasNext ? 'alt' : ''}" id="mAgain">${T.retry}</button>${free > 0 ? `<button class="btn alt" id="mPerks">${T.perks} ★ ${free}</button>` : ''}<button class="btn alt" id="mHome">${T.levels}</button></div>`);
  if (won) [...$('card').querySelectorAll('.stars span')].forEach((el, k) => setTimeout(() => { el.classList.add('in'); if (k < st) sfx.star(k + 1); }, 500 + k * 380));
  if (hasNext) $('mNext').onclick = () => startLevel(levelIdx + 1);
  $('mAgain').onclick = () => startLevel(levelIdx);
  if ($('mPerks')) $('mPerks').onclick = () => { showHome(true); openPerks(); };
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
  initAudio(audio);
  // the page goes to the background or away: what waits is sent while it still can be
  // closed or reloaded in the middle of a level: the party is left (taken up again from the save, under the same id)
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') tm.flush(true); });
  // (kept in the browser's cache, the page comes back as it was, the party with it: nothing is left then)
  addEventListener('pagehide', (e) => { if (game && !e.persisted) tm.quit(game); tm.flush(true); }); tm.flush();
  resize(); drawLogo(); showHome(true);
  game = createGame(0); paused = true; // a field behind the menu
  $('bPerks').onclick = () => { sfx.tap(); openPerks(); }; $('bGuide').onclick = () => { sfx.tap(); guideTab = 'plants'; openGuide(); }; $('bSet').onclick = () => { sfx.tap(); openSound(); };
  $('cont').onclick = () => { goFullscreen(); sfx.tap(); resumeLevel(); };
  requestAnimationFrame(frame);
  if (new URLSearchParams(location.search).has('dev')) window.__fd = { get game() { return game; }, startLevel, set speed(v) { speed = v; }, cell: (i, j) => { const [x, y] = cellCenter(i, j); return [ox + x * ws, oy + y * ws]; }, apple: (m, life = 99) => appleMood(m, life), get pause() { return paused; }, set pause(v) { paused = v; }, zoom: (z, x = innerWidth / 2, y = innerHeight / 2) => zoomTo(z, x, y), get view() { return { zoom, zmax, cell: CELL * ws, FA, tray: TRAY.mode }; }, layout: () => ({ card: ui.filter((u) => u.card).map((u) => [(u.x + u.w / 2) * uk, (u.y + u.h / 2) * uk]), chips: ui.filter((u) => u.info).map((u) => [(u.x + 14) * uk, (u.y + u.h / 2) * uk]), go: [GO[0] * uk, GO[1] * uk] }), endScreen, openPerks, openGuide, progress, saveProgress };
  // A new version installs in the background and takes over at once (sw.js); the running page is still the old one, so
  // the home screen offers to reload. The game also asks for an update itself when it comes back to the screen.
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    let had = !!navigator.serviceWorker.controller; // the first take-over after a first visit is not an update
    navigator.serviceWorker.register('sw.js').then((reg) => document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); })).catch(() => {});
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) $('upd').hidden = false; had = true; });
    $('upd').onclick = () => location.reload();
  }
}
boot();
