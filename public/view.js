// Screen: draws the game, handles taps and drags, the panels, menus, shop and the player's profile.
import {
  COLS, ROWS, TRAPS, TRAP_ORDER, ENEMIES, BONUSES, BONUS_ORDER, SHOP, SHOP_ORDER, LEVELS, LOCATIONS,
} from './data.js';
import * as G from './game.js';
import { makeArt, paintBoard, PALETTES, iconURL, fruitURL, bugURL, iconImg } from './art.js';
import { t, pickLang, getLang, LANGS } from './i18n.js';
import * as S from './audio.js';

const $ = (id) => document.getElementById(id);
const PROFILE_KEY = 'fruit-defense';
const RUN_KEY = 'fruit-defense-run';
const icons = {};
const icon = (k) => (icons[k] ||= iconImg(k, 96));
const LONG = { caterpillar: { n: 6, gap: 0.11, r: 0.25 }, centipede: { n: 10, gap: 0.1, r: 0.26 } };

// ---------- profile ----------
const profile = (() => {
  const base = { open: 0, best: {}, crystals: 0, sound: true, lang: null, seen: {} };
  try { return { ...base, ...JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}') }; } catch { return base; }
})();
const saveProfile = () => { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch { /* private mode */ } };

// ---------- state ----------
const cv = $('cv');
const ctx = cv.getContext('2d');
let g = null;
let speed = 1;
let modalOpen = false;
let V = null; // layout: cs, ox, oy, portrait, dpr, art, board
let sel = null; // trap kind being placed
let drag = null; // {kind, id, moved, x0, y0, touch}
let hover = null; // {x, y} field coords under the pointer (with drag offset)
let picked = null; // id of the trap with the popup
let aim = null; // bonus kind waiting for a spot
let hintT = 0;
let fx = { parts: [], rings: [], texts: [], zaps: [], flames: [], decals: [] };
let fired = new Map();
let trails = new Map();
let fruitShake = 0;
let routeKey = null;
let routes = [];
let lastFrame = 0;
let acc = 0;
let clock = 0;

// ---------- layout ----------
function layout() {
  const r = $('field').getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  cv.width = Math.round(r.width * dpr);
  cv.height = Math.round(r.height * dpr);
  const portrait = r.height > r.width * 1.05;
  const cols = portrait ? ROWS : COLS, rows = portrait ? COLS : ROWS;
  const cs = Math.min(r.width / cols, r.height / rows);
  const ox = (r.width - cols * cs) / 2, oy = (r.height - rows * cs) / 2;
  const sameArt = V && V.cs === cs && V.dpr === dpr;
  V = { ...(sameArt ? V : {}), w: r.width, h: r.height, dpr, portrait, cs, ox, oy };
  if (!sameArt) { V.art = makeArt(cs * dpr); V.board = null; }
  if (g && !V.board) paint();
  const k = cs * dpr;
  V.T = portrait ? [0, k, -k, 0, (ox + ROWS * cs) * dpr, oy * dpr] : [k, 0, 0, k, ox * dpr, oy * dpr];
  placePop();
  if ($('float')) { $('float').dataset.top = ''; placeFloat(); }
}

function paint() {
  const level = LEVELS[g.L];
  V.board = paintBoard(level, PALETTES[LOCATIONS[level.loc].key], V.cs * V.dpr, 11 + g.L * 31);
}

function toScreen(x, y) {
  return V.portrait ? [V.ox + (ROWS - y) * V.cs, V.oy + x * V.cs] : [V.ox + x * V.cs, V.oy + y * V.cs];
}
function toField(sx, sy) {
  return V.portrait ? [(sy - V.oy) / V.cs, ROWS - (sx - V.ox) / V.cs] : [(sx - V.ox) / V.cs, (sy - V.oy) / V.cs];
}
function fieldPoint(ev, lift = 0) {
  const r = cv.getBoundingClientRect();
  const [x, y] = toField(ev.clientX - r.left, ev.clientY - r.top - lift);
  return { x, y, inside: ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom };
}

// ---------- drawing ----------
const base = () => ctx.setTransform(...V.T);
// In portrait the field is turned by 90°, so 'up on the screen' is -x on the field.
const upRot = () => (V.portrait ? -Math.PI / 2 : 0);
const up = (d) => (V.portrait ? [-d, 0] : [0, -d]);
function stamp(img, x, y, size, rot = 0, alpha = 1) {
  base();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.globalAlpha = 1;
}

function render(dt) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (!g) return;
  base();
  ctx.drawImage(V.board, 0, 0, COLS, ROWS);
  drawDecals();
  drawZones();
  if (sel || g.state === 'build') drawRoutes();
  drawTraps();
  for (const e of g.enemies) if (!e.fly) drawBug(e);
  drawFruit();
  drawShots();
  for (const e of g.enemies) if (e.fly) drawFlyerShadow(e);
  for (const e of g.enemies) if (e.fly) drawBug(e);
  drawFx(dt);
  if (g.shieldT > 0) drawShield();
  if (g.freezeT > 0) { base(); ctx.fillStyle = 'rgba(150,210,255,.18)'; ctx.fillRect(0, 0, COLS, ROWS); }
  drawPlacement();
  drawScreenOverlays();
}

function drawDecals() {
  for (const d of fx.decals) {
    const a = Math.min(1, d.life / 2) * d.alpha;
    base();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.rot);
    ctx.globalAlpha = a;
    if (d.kind === 'crater') {
      const gr = ctx.createRadialGradient(0, 0, 0, 0, 0, d.size);
      gr.addColorStop(0, 'rgba(30,15,5,.75)'); gr.addColorStop(0.6, 'rgba(60,30,10,.5)'); gr.addColorStop(1, 'rgba(60,30,10,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(0, 0, d.size, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = d.color;
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.ellipse(Math.cos(i * 1.7) * d.size * 0.5, Math.sin(i * 2.3) * d.size * 0.4, d.size * (0.35 - i * 0.04), d.size * 0.22, i, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}

function drawZones() {
  for (const z of g.zones) {
    const a = Math.min(1, z.t / 0.6, (z.max - z.t) / 0.3 + 0.2);
    base();
    ctx.globalAlpha = a;
    if (z.kind === 'honey') {
      const gr = ctx.createRadialGradient(z.x - z.r * 0.3, z.y - z.r * 0.3, 0, z.x, z.y, z.r);
      gr.addColorStop(0, 'rgba(255,230,140,.85)'); gr.addColorStop(0.7, 'rgba(230,150,20,.7)'); gr.addColorStop(1, 'rgba(180,100,10,.0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.fill();
    } else {
      for (let i = 0; i < 7; i++) {
        const a2 = clock * 0.6 + i * 0.9;
        const px = z.x + Math.cos(a2) * z.r * 0.45, py = z.y + Math.sin(a2 * 1.3) * z.r * 0.45;
        const gr = ctx.createRadialGradient(px, py, 0, px, py, z.r * 0.7);
        gr.addColorStop(0, 'rgba(170,230,90,.45)'); gr.addColorStop(1, 'rgba(120,200,60,0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(px, py, z.r * 0.7, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}

function computeRoutes() {
  const key = `${g.L}:${g.traps.map((q) => q.c).join(',')}`;
  if (key === routeKey) return;
  routeKey = key;
  routes = g.spawns.map((s) => {
    const pts = [];
    let c = s, guard = 0;
    while (c >= 0 && g.tiles[c] !== 'F' && guard++ < 300) {
      pts.push([(c % COLS) + 0.5, ((c / COLS) | 0) + 0.5]);
      const x = c % COLS, y = (c / COLS) | 0;
      let best = -1, bd = g.dist[c];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const n = G.cellOf(x + dx, y + dy);
        if (n < 0) continue;
        if (dx && dy && (g.dist[G.cellOf(x + dx, y)] === Infinity || g.dist[G.cellOf(x, y + dy)] === Infinity)) continue;
        if (g.dist[n] < bd) { bd = g.dist[n]; best = n; }
      }
      c = best;
    }
    if (c >= 0) pts.push([(c % COLS) + 0.5, ((c / COLS) | 0) + 0.5]);
    return pts;
  });
}

function drawRoutes() {
  computeRoutes();
  base();
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  for (const pts of routes) {
    let dist = (clock * 1.2) % 0.5;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const len = Math.hypot(bx - ax, by - ay);
      while (dist < len) {
        const k = dist / len;
        ctx.beginPath(); ctx.arc(ax + (bx - ax) * k, ay + (by - ay) * k, 0.045, 0, Math.PI * 2); ctx.fill();
        dist += 0.5;
      }
      dist -= len;
    }
  }
}

function drawTraps() {
  for (const tr of g.traps) {
    const f = fired.get(tr.id);
    const since = f ? clock - f : 9;
    let size = 1.02;
    if (tr.kind === 'spiker' || tr.kind === 'thistle') size *= 1 - Math.max(0, 0.12 - since) * 0.9;
    if (tr.kind === 'slow' || tr.kind === 'pepper') size *= 1 + Math.max(0, 0.2 - since) * 0.4;
    const rot = tr.kind === 'spiker' ? tr.aim : tr.kind === 'storm' ? clock * 0.4 : 0;
    stamp(V.art.trap(tr.kind, tr.lvl), tr.x, tr.y, size, rot);
    if (tr.kind === 'storm' && since < 0.25) {
      base();
      const gr = ctx.createRadialGradient(tr.x, tr.y, 0, tr.x, tr.y, 0.7);
      gr.addColorStop(0, 'rgba(200,240,255,.8)'); gr.addColorStop(1, 'rgba(120,200,255,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(tr.x, tr.y, 0.7, 0, Math.PI * 2); ctx.fill();
    }
    if (picked === tr.id) {
      base();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.05;
      ctx.beginPath(); ctx.arc(tr.x, tr.y, 0.52, 0, Math.PI * 2); ctx.stroke();
      rangeCircle(tr.x, tr.y, G.trapRange(tr), 'rgba(255,255,255,.14)');
    }
  }
}

function rangeCircle(x, y, r, fill) {
  base();
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 0.035;
  ctx.setLineDash([0.12, 0.1]); ctx.stroke(); ctx.setLineDash([]);
}

function bugPos(e) {
  const px = -Math.sin(e.head), py = Math.cos(e.head);
  return [e.x + px * e.lane, e.y + py * e.lane];
}

function drawBug(e) {
  const def = ENEMIES[e.kind];
  const [x, y] = e.fly ? [e.x, e.y] : bugPos(e);
  if (LONG[e.kind]) { drawLong(e, x, y); return; }
  const frame = e.fly ? Math.floor(clock * 30 + e.lane * 50) % 3 : Math.floor(e.phase) % 2;
  const size = def.size * 1.15;
  const img = V.art.bug(e.kind, frame, def.size);
  const [lx, ly] = e.fly ? up(0.12) : [0, 0];
  stamp(img, x + lx, y + ly, size, e.head);
  if (e.hitT > 0) {
    ctx.globalCompositeOperation = 'lighter';
    stamp(img, x + lx, y + ly, size, e.head, 0.45);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (e.stunT > 0 || g.freezeT > 0) {
    base(); ctx.fillStyle = 'rgba(190,230,255,.45)';
    ctx.beginPath(); ctx.arc(x + lx, y + ly, size * 0.4, 0, Math.PI * 2); ctx.fill();
  }
  if (e.burnT > 0) emberAt(x, y);
}

function drawFlyerShadow(e) {
  const def = ENEMIES[e.kind];
  base();
  ctx.fillStyle = 'rgba(30,15,0,.22)';
  ctx.beginPath(); ctx.ellipse(e.x + 0.22, e.y + 0.3, def.size * 0.4, def.size * 0.22, e.head, 0, Math.PI * 2); ctx.fill();
}

function drawLong(e, x, y) {
  const L = LONG[e.kind];
  let tr = trails.get(e.id);
  if (!tr) { tr = [[x, y]]; trails.set(e.id, tr); }
  const lastP = tr[tr.length - 1];
  if (Math.hypot(lastP[0] - x, lastP[1] - y) > 0.03) { tr.push([x, y]); if (tr.length > 80) tr.shift(); }
  // walk back along the trail to place the segments
  const segs = [[x, y, e.head]];
  let need = L.gap, i = tr.length - 1, px = x, py = y;
  while (segs.length < L.n && i >= 0) {
    const [qx, qy] = tr[i];
    const d = Math.hypot(qx - px, qy - py);
    if (d >= need) {
      const k = need / d;
      const nx = px + (qx - px) * k, ny = py + (qy - py) * k;
      segs.push([nx, ny, Math.atan2(py - ny, px - nx)]);
      px = nx; py = ny; need = L.gap;
    } else { need -= d; px = qx; py = qy; i--; }
  }
  while (segs.length < L.n) { const s0 = segs[segs.length - 1]; segs.push([s0[0] - Math.cos(e.head) * L.gap, s0[1] - Math.sin(e.head) * L.gap, e.head]); }
  const seg = V.art.seg(e.kind), head = V.art.head(e.kind);
  base();
  if (e.kind === 'centipede') {
    ctx.strokeStyle = '#3a0a40'; ctx.lineWidth = 0.025;
    segs.forEach(([sx, sy, a], k) => {
      const sw = Math.sin(e.phase * 1.5 + k * 1.2) * 0.06;
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(sx, sy);
        ctx.lineTo(sx - Math.sin(a) * s * 0.2 + Math.cos(a) * sw * s, sy + Math.cos(a) * s * 0.2 + Math.sin(a) * sw * s);
        ctx.stroke();
      }
    });
  }
  for (let k = segs.length - 1; k >= 0; k--) {
    const [sx, sy, a] = segs[k];
    const wob = e.kind === 'caterpillar' ? 1 + Math.sin(e.phase * 0.8 - k) * 0.08 : 1;
    stamp(k ? seg : head, sx, sy, L.r * (k ? wob : 1.15), a);
  }
  if (e.hitT > 0) { base(); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.arc(x, y, 0.18, 0, Math.PI * 2); ctx.fill(); }
  if (e.stunT > 0 || g.freezeT > 0) { base(); ctx.fillStyle = 'rgba(190,230,255,.4)'; for (const [sx, sy] of segs) { ctx.beginPath(); ctx.arc(sx, sy, 0.12, 0, Math.PI * 2); ctx.fill(); } }
  if (e.burnT > 0) emberAt(x, y);
}

function emberAt(x, y) {
  if (Math.random() < 0.25) fx.parts.push({ x: x + (Math.random() - 0.5) * 0.2, y, vx: 0, vy: -0.6, life: 0.4, max: 0.4, size: 0.05, color: '#ffa02a' });
}

function drawFruit() {
  const level = LEVELS[g.L];
  const img = V.art.fruit(level.fruit);
  const sh = fruitShake > 0 ? Math.sin(clock * 60) * 0.06 * fruitShake : 0;
  const squash = 1 + (fruitShake > 0 ? Math.sin(clock * 30) * 0.03 * fruitShake : 0);
  const [ux, uy] = up(0.1);
  stamp(img, g.fruit.x + sh + ux, g.fruit.y + uy, 2.25 * squash, upRot());
}

function drawShield() {
  base();
  const r = 1.25 + Math.sin(clock * 4) * 0.04;
  const gr = ctx.createRadialGradient(g.fruit.x, g.fruit.y, r * 0.6, g.fruit.x, g.fruit.y, r);
  gr.addColorStop(0, 'rgba(120,200,255,0)'); gr.addColorStop(0.85, 'rgba(140,210,255,.35)'); gr.addColorStop(1, 'rgba(220,245,255,.8)');
  ctx.fillStyle = gr;
  ctx.beginPath(); ctx.arc(g.fruit.x, g.fruit.y, r, 0, Math.PI * 2); ctx.fill();
}

function drawShots() {
  base();
  for (const s of g.shots) {
    const ang = Math.atan2(s.ty - s.y, s.tx - s.x);
    ctx.save();
    ctx.translate(s.x, s.y); ctx.rotate(ang);
    if (s.kind === 'thistle') {
      ctx.fillStyle = s.lvl === 2 ? '#fff' : '#ffe14a';
      ctx.beginPath(); ctx.moveTo(0.14, 0); ctx.lineTo(-0.08, -0.035); ctx.lineTo(-0.08, 0.035); ctx.fill();
    } else {
      ctx.fillStyle = ['#5aa82a', '#3a9ee0', '#e8f8ff'][s.lvl];
      ctx.beginPath(); ctx.ellipse(0, 0, 0.07, 0.05, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(-0.015, -0.015, 0.02, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
}

function drawFx(dt) {
  base();
  for (const r of fx.rings) {
    const k = 1 - r.life / r.max;
    ctx.strokeStyle = r.color; ctx.globalAlpha = (1 - k) * 0.8; ctx.lineWidth = r.w || 0.06;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * k, 0, Math.PI * 2); ctx.stroke();
    if (r.fill) { ctx.fillStyle = r.fill; ctx.globalAlpha = (1 - k) * 0.35; ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  for (const f of fx.flames) {
    const k = 1 - f.life / f.max;
    for (let i = 0; i < 10; i++) {
      const a = i * 0.63 + f.seed;
      const d = f.r * (0.3 + k * 0.7) * (0.6 + ((i * 37) % 10) / 25);
      const px = f.x + Math.cos(a) * d, py = f.y + Math.sin(a) * d;
      const gr = ctx.createRadialGradient(px, py, 0, px, py, 0.22);
      gr.addColorStop(0, `rgba(255,${200 - f.lvl * 20},80,${0.8 * (1 - k)})`); gr.addColorStop(1, 'rgba(255,80,0,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(px, py, 0.22, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.lineCap = 'round';
  for (const z of fx.zaps) {
    const k = z.life / z.max;
    for (const [w, col] of [[0.14, `rgba(120,200,255,${0.35 * k})`], [0.05, `rgba(255,255,255,${k})`]]) {
      ctx.strokeStyle = col; ctx.lineWidth = w;
      ctx.beginPath();
      for (let i = 1; i < z.pts.length; i++) {
        const [ax, ay] = z.pts[i - 1], [bx, by] = z.pts[i];
        if (i === 1) ctx.moveTo(ax, ay - (z.sky ? 6 : 0));
        const steps = 5;
        for (let s = 1; s <= steps; s++) {
          const kk = s / steps;
          const j = s < steps ? (Math.sin(z.seed + i * 7 + s * 3.1) * 0.18) : 0;
          ctx.lineTo(ax + (bx - ax) * kk + j, ay + (by - ay) * kk - j * 0.5);
        }
      }
      ctx.stroke();
    }
  }
  for (const p of fx.parts) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // age everything
  const age = (list) => { for (const q of list) q.life -= dt; return list.filter((q) => q.life > 0); };
  for (const p of fx.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94; }
  fx.parts = age(fx.parts);
  fx.rings = age(fx.rings);
  fx.flames = age(fx.flames);
  fx.zaps = age(fx.zaps);
  fx.texts = age(fx.texts);
  fx.decals = age(fx.decals);
  if (fruitShake > 0) fruitShake = Math.max(0, fruitShake - dt * 2.5);
}

function drawPlacement() {
  if (aim && hover) {
    const b = BONUSES[aim];
    base();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.05; ctx.setLineDash([0.15, 0.1]);
    ctx.beginPath(); ctx.arc(hover.x, hover.y, b.r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fill();
    return;
  }
  if (!sel || !hover) return;
  const c = G.cellOf(hover.x, hover.y);
  if (c < 0) return;
  const cx = (c % COLS) + 0.5, cy = ((c / COLS) | 0) + 0.5;
  const why = G.canBuild(g, sel, c);
  base();
  ctx.fillStyle = why ? 'rgba(255,60,40,.35)' : 'rgba(120,255,90,.3)';
  ctx.beginPath(); ctx.roundRect(cx - 0.48, cy - 0.48, 0.96, 0.96, 0.18); ctx.fill();
  rangeCircle(cx, cy, TRAPS[sel].range[0], why ? 'rgba(255,80,60,.1)' : 'rgba(255,255,255,.12)');
  stamp(V.art.trap(sel, 0), cx, cy, 1, sel === 'spiker' ? -Math.PI / 2 : 0, 0.75);
}

function drawScreenOverlays() {
  ctx.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
  // health bars of hurt insects, above them on screen
  for (const e of g.enemies) {
    if (e.hp >= e.max) continue;
    const [x, y] = e.fly ? [e.x + up(0.12)[0], e.y + up(0.12)[1]] : bugPos(e);
    const [sx, sy] = toScreen(x, y);
    const w = Math.max(14, ENEMIES[e.kind].size * V.cs * 0.9);
    const top = sy - ENEMIES[e.kind].size * V.cs * 0.55 - 6;
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(sx - w / 2 - 1, top - 1, w + 2, 5);
    const k = Math.max(0, e.hp / e.max);
    ctx.fillStyle = k > 0.5 ? '#7be04a' : k > 0.25 ? '#ffc23a' : '#ff5a3a';
    ctx.fillRect(sx - w / 2, top, w * k, 3);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const tx of fx.texts) {
    const k = 1 - tx.life / tx.max;
    const [sx, sy] = toScreen(tx.x, tx.y);
    ctx.globalAlpha = Math.min(1, tx.life / tx.max * 2);
    ctx.font = `900 ${tx.size || 15}px Nunito, system-ui, sans-serif`;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.45)';
    ctx.strokeText(tx.text, sx, sy - k * 26);
    ctx.fillStyle = tx.color;
    ctx.fillText(tx.text, sx, sy - k * 26);
  }
  ctx.globalAlpha = 1;
}

// ---------- events from the game: effects and sounds ----------
function burst(x, y, color, n = 8, speed = 1.6, size = 0.05) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.6);
    fx.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.45, max: 0.45, size: size * (0.6 + Math.random() * 0.6), color });
  }
}
const BUG_COLOR = { ant: '#2b2220', redant: '#d2471c', blueant: '#3a6ae0', beetle: '#9a3ad8', caterpillar: '#6ac83a', centipede: '#a02aa8', mosquito: '#6c5a4c', wasp: '#f2b21a', goldbug: '#3fbf6a' };

function handleEvents() {
  for (const ev of g.events) {
    switch (ev.t) {
      case 'shoot': fired.set(ev.id, clock); S.play('shoot'); break;
      case 'hit': burst(ev.x, ev.y, ev.kind === 'thistle' ? '#ffe14a' : '#d8ffb0', 3, 1, 0.03); break;
      case 'pulse': fired.set(ev.id, clock); fx.rings.push({ x: ev.x, y: ev.y, r0: 0.3, r1: ev.r, life: 0.5, max: 0.5, color: 'rgba(140,230,255,1)', fill: 'rgba(140,230,255,1)' }); S.play('pulse'); break;
      case 'flame': fired.set(ev.id, clock); fx.flames.push({ x: ev.x, y: ev.y, r: ev.r, life: 0.35, max: 0.35, seed: Math.random() * 6, lvl: ev.lvl }); S.play('flame'); break;
      case 'zap': fired.set(ev.id, clock); fx.zaps.push({ pts: ev.pts, life: 0.22, max: 0.22, seed: Math.random() * 100 }); S.play('zap'); break;
      case 'kill': {
        const big = ENEMIES[ev.kind].size;
        burst(ev.x, ev.y, BUG_COLOR[ev.kind], 8 + big * 10, 1.4, 0.04 + big * 0.04);
        if (!ev.fly) fx.decals.push({ kind: 'splat', x: ev.x, y: ev.y, rot: Math.random() * 6, size: big * 0.7, color: BUG_COLOR[ev.kind], alpha: 0.35, life: 6, max: 6 });
        if (fx.texts.length < 8) fx.texts.push({ x: ev.x, y: ev.y, text: `+${ev.n}`, color: '#ffe14a', size: 13, life: 0.7, max: 0.7 });
        S.play('kill'); S.play('coin');
        if (fx.decals.length > 140) fx.decals.splice(0, fx.decals.length - 140);
        break;
      }
      case 'bite':
        fruitShake = 1;
        burst(ev.x, ev.y, '#ff4a3a', 10, 2, 0.06);
        fx.texts.push({ x: g.fruit.x + up(0.9)[0], y: g.fruit.y + up(0.9)[1], text: `-${ev.n}`, color: '#ff6a5a', size: 20, life: 1, max: 1 });
        S.play('bite');
        if (navigator.vibrate) try { navigator.vibrate(40); } catch { /* ignore */ }
        break;
      case 'blocked': fx.rings.push({ x: g.fruit.x, y: g.fruit.y, r0: 1, r1: 1.4, life: 0.4, max: 0.4, color: '#bfe8ff' }); break;
      case 'safe': fx.texts.push({ x: g.fruit.x + up(1.3)[0], y: g.fruit.y + up(1.3)[1], text: t('safeBonus'), color: '#9ff07a', size: 17, life: 1.6, max: 1.6 }); S.play('safe'); break;
      case 'wave': S.play('wave'); saveRun(); break;
      case 'build': fx.rings.push({ x: ev.x, y: ev.y, r0: 0.2, r1: 0.7, life: 0.35, max: 0.35, color: 'rgba(255,240,200,.9)', w: 0.08 }); burst(ev.x, ev.y, '#c9a070', 8, 1.5, 0.05); S.play('build'); break;
      case 'upgrade': fx.rings.push({ x: ev.x, y: ev.y, r0: 0.2, r1: 0.9, life: 0.5, max: 0.5, color: '#bff0ff', w: 0.1 }); burst(ev.x, ev.y, '#ffffff', 12, 2, 0.05); S.play('upgrade'); break;
      case 'sell': burst(ev.x, ev.y, '#c9a070', 10, 1.5, 0.05); fx.texts.push({ x: ev.x, y: ev.y, text: `+${ev.n}`, color: '#ffe14a', life: 0.9, max: 0.9 }); S.play('sell'); break;
      case 'bonus':
        if (ev.kind === 'cracker') {
          fx.rings.push({ x: ev.x, y: ev.y, r0: 0.2, r1: ev.r * 1.3, life: 0.45, max: 0.45, color: '#ffd23a', fill: '#ffae3a', w: 0.15 });
          burst(ev.x, ev.y, '#ff9a2a', 30, 4, 0.08); burst(ev.x, ev.y, '#5a4030', 20, 3, 0.07);
          fx.decals.push({ kind: 'crater', x: ev.x, y: ev.y, rot: 0, size: ev.r * 0.8, alpha: 1, life: 25, max: 25 });
          S.play('boom');
        } else if (ev.kind === 'horn') {
          for (let i = 0; i < 3; i++) fx.rings.push({ x: g.fruit.x, y: g.fruit.y, r0: 0.5 + i, r1: 12 + i, life: 0.9, max: 0.9, color: 'rgba(255,255,255,.8)', w: 0.12 });
          S.play('horn');
        } else if (ev.kind === 'spray') S.play('spray');
        else if (ev.kind === 'honey') S.play('honey');
        break;
      case 'bolt':
        for (const p of ev.pts) fx.zaps.push({ pts: [p, p], sky: true, life: 0.4, max: 0.4, seed: Math.random() * 100 });
        for (const [x, y] of ev.pts) burst(x, y, '#e0f4ff', 14, 3, 0.06);
        S.play('bolt');
        break;
      case 'shop': S.play('shop'); break;
      case 'won': setTimeout(() => finish(true), 900); break;
      case 'lost': setTimeout(() => finish(false), 700); break;
      default: break;
    }
  }
  g.events.length = 0;
}

// ---------- the loop ----------
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - (lastFrame || now)) / 1000);
  lastFrame = now;
  clock += dt;
  if (!g || !V) return;
  if (!modalOpen && g.state === 'run' && !document.hidden) {
    acc += dt * speed;
    let n = 0;
    while (acc >= G.DT && n < 12) { G.step(g); acc -= G.DT; n++; }
    if (n >= 12) acc = 0;
  }
  handleEvents();
  for (const id of [...trails.keys()]) if (!g.enemies.some((e) => e.id === id)) trails.delete(id);
  render(modalOpen ? 0 : dt * (g.state === 'run' ? speed : 1));
  hud();
  if (hintT > 0 && (hintT -= dt) <= 0) $('hint').classList.remove('show');
}

// ---------- HUD ----------
let hudCache = {};
function setText(el, key, v) { if (hudCache[key] !== v) { hudCache[key] = v; el.textContent = v; } }

function hud() {
  setText($('coinsTxt'), 'coins', String(g.coins));
  setText($('gemsTxt'), 'gems', String(profile.crystals));
  setText($('waveTxt'), 'wave', `${Math.max(1, g.wave + 1)}/${g.waves.length}`);
  const hpk = g.hp / g.maxHp;
  if (hudCache.hp !== g.hp) {
    hudCache.hp = g.hp;
    $('hpbar').firstElementChild.style.width = `${hpk * 100}%`;
    $('hpbar').classList.toggle('low', hpk < 0.35);
  }
  for (const b of document.querySelectorAll('.tbtn')) b.classList.toggle('poor', g.coins < TRAPS[b.dataset.k].cost[0]);
  for (const b of document.querySelectorAll('.bbtn')) {
    const k = b.dataset.k;
    const p = Math.round(g.charge[k] * 100) / 100;
    if (b.dataset.p !== String(p)) { b.dataset.p = p; b.style.setProperty('--p', p); }
    b.classList.toggle('ready', p >= 1 && aim !== k);
    b.classList.toggle('aim', aim === k);
  }
  $('startBtn').hidden = g.state !== 'build';
  const can = G.canCallWave(g);
  $('callBtn').hidden = !can;
  if (can) setText($('callBtn'), 'call', `▶▶ ${t('callWave')} +${Math.max(0, Math.floor(g.nextWaveAt - g.time))}`);
  setText($('speedBtn'), 'speed', `${speed}×`);
  if (picked) updatePop();
}

function buildPanels() {
  const level = LEVELS[g.L];
  const tp = $('traps');
  tp.innerHTML = '';
  for (const k of TRAP_ORDER) {
    if (!level.traps.includes(k)) continue;
    const b = document.createElement('button');
    b.className = 'tbtn';
    b.dataset.k = k;
    b.innerHTML = `<img src="${iconURL(k, 0, 84)}" alt=""><b><i class="coin"></i>${TRAPS[k].cost[0]}</b>`;
    b.addEventListener('pointerdown', (ev) => trapDown(ev, k));
    tp.appendChild(b);
  }
  const bp = $('bonuses');
  bp.innerHTML = '';
  for (const k of BONUS_ORDER) {
    if (!level.bonuses.includes(k)) continue;
    const b = document.createElement('button');
    b.className = 'bbtn';
    b.dataset.k = k;
    b.title = t(`bonuses.${k}`)[0];
    b.innerHTML = `<img src="${icon(k)}" alt="">`;
    b.addEventListener('click', () => bonusTap(k));
    bp.appendChild(b);
  }
  $('hpIcon').src = fruitURL(level.fruit, 48);
  $('waveIcon').src = bugURL('ant', 48);
  hudCache = {};
  requestAnimationFrame(layout);
}

function hint(text) {
  $('hint').textContent = text;
  $('hint').classList.add('show');
  hintT = 1.8;
}

// ---------- input ----------
function selectTrap(k) {
  sel = sel === k ? null : k;
  aim = null;
  closePop();
  for (const b of document.querySelectorAll('.tbtn')) b.classList.toggle('sel', b.dataset.k === sel);
  if (sel) hint(t('tapField'));
}

function trapDown(ev, k) {
  S.unlock();
  ev.preventDefault();
  if (g.state === 'won' || g.state === 'lost') return;
  drag = { kind: k, id: ev.pointerId, moved: false, x0: ev.clientX, y0: ev.clientY, touch: ev.pointerType !== 'mouse', was: sel };
  sel = k; aim = null; closePop();
  for (const b of document.querySelectorAll('.tbtn')) b.classList.toggle('sel', b.dataset.k === sel);
}

window.addEventListener('pointermove', (ev) => {
  if (!g || !V) return;
  if (drag && ev.pointerId === drag.id) {
    if (Math.hypot(ev.clientX - drag.x0, ev.clientY - drag.y0) > 12) drag.moved = true;
    if (drag.moved) {
      const p = fieldPoint(ev, drag.touch ? V.cs * 0.9 : 0);
      hover = p.inside ? p : null;
    }
    return;
  }
  if (sel || aim) {
    const p = fieldPoint(ev);
    hover = p.inside ? p : null;
  }
});

window.addEventListener('pointerup', (ev) => {
  if (!drag || ev.pointerId !== drag.id) return;
  const d = drag;
  drag = null;
  if (d.moved) {
    if (hover) tryBuild(d.kind, G.cellOf(hover.x, hover.y));
    sel = null; hover = null;
  } else {
    sel = d.was === d.kind ? null : d.kind;
    if (sel) hint(t('tapField'));
  }
  for (const b of document.querySelectorAll('.tbtn')) b.classList.toggle('sel', b.dataset.k === sel);
});

function tryBuild(kind, c) {
  const why = G.canBuild(g, kind, c);
  if (!why) { G.build(g, kind, c); routeKey = null; return true; }
  if (why === 'blocks') hint(t('cantBlock'));
  else if (why === 'coins') hint(t('noCoins'));
  S.play('deny');
  return false;
}

cv.addEventListener('pointerdown', (ev) => {
  S.unlock();
  if (!g || modalOpen) return;
  const p = fieldPoint(ev);
  hover = p;
  if (aim) {
    if (G.useBonus(g, aim, p.x, p.y)) aim = null;
    return;
  }
  if (sel && !g.traps.some((q) => q.c === G.cellOf(p.x, p.y))) {
    if (tryBuild(sel, G.cellOf(p.x, p.y))) {
      sel = null;
      for (const b of document.querySelectorAll('.tbtn')) b.classList.remove('sel');
    }
    return;
  }
  sel = null;
  for (const b of document.querySelectorAll('.tbtn')) b.classList.remove('sel');
  const c = G.cellOf(p.x, p.y);
  const tr = g.traps.find((q) => q.c === c);
  if (tr) { picked = tr.id; S.play('click'); placePop(); updatePop(); } else closePop();
});

function bonusTap(k) {
  S.unlock();
  if (!g || g.state !== 'run' || !G.bonusReady(g, k)) {
    hint(`${t(`bonuses.${k}`)[0]}: ${t('bonusCharging')}`);
    return;
  }
  sel = null; closePop();
  for (const b of document.querySelectorAll('.tbtn')) b.classList.remove('sel');
  if (BONUSES[k].aim) {
    aim = aim === k ? null : k;
    if (aim) hint(`${t(`bonuses.${k}`)[0]}: ${t('aimHint')}`);
  } else G.useBonus(g, k, g.fruit.x, g.fruit.y);
}

// ---------- the trap popup ----------
// The Start / next-wave buttons sit at the end of the field farthest from the fruit, so they never cover it.
function placeFloat() {
  if (!g || !V) return;
  const [, fy] = toScreen(g.fruit.x, g.fruit.y);
  const top = fy > V.oy + (V.h - 2 * V.oy) / 2;
  const el = $('float');
  if (el.dataset.top === String(top)) return;
  el.dataset.top = String(top);
  el.style.top = top ? `${V.oy + 10}px` : '';
  el.style.bottom = top ? '' : `${V.oy + 10}px`;
}

function placePop() {
  if (!picked || !g || !V) return;
  const tr = g.traps.find((q) => q.id === picked);
  if (!tr) { closePop(); return; }
  const [sx, sy] = toScreen(tr.x, tr.y);
  const pop = $('pop');
  pop.hidden = false;
  const w = pop.offsetWidth || 150;
  const x = Math.max(w / 2 + 4, Math.min(V.w - w / 2 - 4, sx));
  const above = sy - V.cs * 0.6;
  pop.style.left = `${x}px`;
  pop.style.top = `${above < 70 ? sy + V.cs * 0.6 + 66 : above}px`;
}
function updatePop() {
  const tr = g.traps.find((q) => q.id === picked);
  if (!tr) { closePop(); return; }
  const cost = G.upgradeCost(tr);
  const key = `${tr.id}:${tr.lvl}:${g.coins >= cost}`;
  if (hudCache.pop === key) return;
  hudCache.pop = key;
  const up = $('upBtn');
  up.innerHTML = tr.lvl >= 2 ? `<span>${t('max')}</span><b>★★★</b>` : `<span>${t('upgrade')}</span><b>⬆ <i class="coin"></i>${cost}</b>`;
  up.disabled = tr.lvl >= 2 || g.coins < cost;
  $('sellBtn').innerHTML = `<span>${t('sell')}</span><b><i class="coin"></i>+${G.sellValue(tr)}</b>`;
}
function closePop() { picked = null; $('pop').hidden = true; hudCache.pop = ''; }
$('upBtn').addEventListener('click', () => { if (picked && G.upgrade(g, picked)) { hudCache.pop = ''; updatePop(); } });
$('sellBtn').addEventListener('click', () => { if (picked && G.sell(g, picked)) { routeKey = null; closePop(); } });

// ---------- buttons ----------
$('startBtn').addEventListener('click', () => { S.unlock(); G.start(g); });
$('callBtn').addEventListener('click', () => { const n = G.callWave(g); if (n) S.play('coin'); });
$('speedBtn').addEventListener('click', () => { speed = speed === 1 ? 2 : 1; S.play('click'); });
$('menuBtn').addEventListener('click', () => pauseMenu());
$('shopBtn').addEventListener('click', () => shopMenu());

// ---------- modals ----------
function modal(html, actions, onClose) {
  modalOpen = true;
  $('card').innerHTML = html;
  $('modal').hidden = false;
  for (const el of $('card').querySelectorAll('[data-act]')) {
    el.addEventListener('click', () => {
      S.unlock(); S.play('click');
      const fn = actions[el.dataset.act];
      if (fn && fn(el) === false) return;
      if (!el.dataset.keep) closeModal();
    });
  }
  closeModal.after = onClose;
}
function closeModal() {
  $('modal').hidden = true;
  modalOpen = false;
  lastFrame = 0;
  const f = closeModal.after; closeModal.after = null;
  if (f) f();
}

function settingsRows() {
  return `<div class="setrow">${t('sound')}: <button class="btn alt" data-act="sound" data-keep="1">${profile.sound ? t('on') : t('off')}</button></div>
  <div class="setrow">${t('language')}: ${Object.keys(LANGS).map((l) => `<button class="btn ${l === getLang() ? '' : 'alt'}" data-act="lang" data-lang="${l}">${l.toUpperCase()}</button>`).join('')}</div>`;
}
const settingsActions = (reopen) => ({
  sound: (el) => { profile.sound = !profile.sound; S.setSound(profile.sound); saveProfile(); el.textContent = profile.sound ? t('on') : t('off'); return false; },
  lang: (el) => { profile.lang = el.dataset.lang; pickLang(profile.lang); saveProfile(); applyTexts(); setTimeout(reopen, 0); },
});

function pauseMenu() {
  if (!g) return;
  saveRun();
  modal(`<h1>${t('paused')}</h1><p>${t(`level`, { n: g.L + 1 })} · ${t('wave', { n: Math.max(1, g.wave + 1), m: g.waves.length })}</p>
    <div class="row"><button class="btn" data-act="resume">${t('resume')}</button></div>
    <div class="row"><button class="btn alt" data-act="restart">${t('restart')}</button><button class="btn alt" data-act="levels">${t('levels')}</button></div>
    ${settingsRows()}`, {
    restart: () => startLevel(g.L),
    levels: () => { clearRun(); g = null; showHome(); },
    ...settingsActions(pauseMenu),
  });
}

function shopMenu() {
  if (!g || g.state === 'won' || g.state === 'lost') return;
  const rows = SHOP_ORDER.map((k) => {
    const [name, desc] = t(`shopItems.${k}`);
    return `<div class="shoprow"><img class="ic" src="${icon(k)}" alt=""><span class="tx"><b>${name}</b><span>${desc}</span></span>
      <button class="btn" data-act="buy" data-k="${k}" ${profile.crystals < SHOP[k].price ? 'disabled' : ''}><i class="gem"></i>${SHOP[k].price}</button></div>`;
  }).join('');
  modal(`<h2>${t('shop')}</h2><p>${t('youHave')}: <b style="color:#1a6ab8">${profile.crystals}</b> <i class="gem" style="display:inline-block;vertical-align:-3px"></i></p>${rows}
    <button class="btn alt" data-act="close">${t('close')}</button>`, {
    buy: (el) => {
      const k = el.dataset.k;
      if (profile.crystals < SHOP[k].price) return false;
      profile.crystals -= SHOP[k].price;
      saveProfile();
      G.applyShop(g, k);
      return undefined;
    },
  });
}

function introQueue(list, done) {
  if (!list.length) { done(); return; }
  const [kind, key, img] = list[0];
  const [name, desc] = kind === 'how' ? [t('title'), t('howTo')] : t(`${kind}.${key}`);
  const title = { traps: t('newTrap'), enemies: t('newEnemy'), bonuses: t('newBonus'), how: '' }[kind];
  const pic = `<img src="${img}" alt="">`;
  modal(`<div class="intro"><h2>${title}</h2>${pic}<h3>${name}</h3><p>${desc}</p></div>
    <button class="btn" data-act="ok">${t('gotIt')}</button>`, { ok: () => {} }, () => introQueue(list.slice(1), done));
}

function finish(won) {
  if (!g) return;
  const L = g.L;
  const r = G.result(g);
  clearRun();
  if (won) {
    const record = r.total > (profile.best[L] || 0);
    if (record) profile.best[L] = r.total;
    profile.crystals += r.crystals;
    profile.open = Math.max(profile.open, Math.min(LEVELS.length - 1, L + 1));
    saveProfile();
    S.play('won');
    const lines = Object.entries(r.lines).map(([k, v]) => `<tr><td>${t(`result.${k}`)}</td><td>${v}</td></tr>`).join('');
    const next = L + 1 < LEVELS.length;
    modal(`<h1 style="color:#2f8a28">${t('won')}</h1>
      <table class="res">${lines}<tr class="total"><td>${t('result.total')}</td><td>${r.total}</td></tr></table>
      <p><b style="color:#1a6ab8">${t('crystalsWon', { n: r.crystals })} <i class="gem" style="display:inline-block;vertical-align:-3px"></i></b>${record ? `<br><b style="color:#e0393f">${t('newRecord')}</b>` : ''}</p>
      <div class="row">${next ? `<button class="btn" data-act="next">${t('next')}</button>` : ''}<button class="btn alt" data-act="retry">${t('retry')}</button><button class="btn alt" data-act="levels">${t('levels')}</button></div>`, {
      next: () => startLevel(L + 1),
      retry: () => startLevel(L),
      levels: () => { g = null; showHome(); },
    });
  } else {
    S.play('lost');
    modal(`<h1>${t('lost')}</h1><p>${t('lostHint')}</p>
      <div class="row"><button class="btn" data-act="retry">${t('retry')}</button><button class="btn alt" data-act="levels">${t('levels')}</button></div>`, {
      retry: () => startLevel(L),
      levels: () => { g = null; showHome(); },
    });
  }
}

// ---------- saving a level in progress ----------
function saveRun() {
  if (!g || g.state === 'won' || g.state === 'lost') return;
  try { localStorage.setItem(RUN_KEY, G.serialize(g)); } catch { /* full */ }
}
function clearRun() { try { localStorage.removeItem(RUN_KEY); } catch { /* ignore */ } }
function loadRun() {
  try {
    const s = JSON.parse(localStorage.getItem(RUN_KEY) || 'null');
    if (s && s.v === G.VERSION && LEVELS[s.L]) return s;
  } catch { /* broken */ }
  return null;
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { saveRun(); if (g && g.state === 'run' && !modalOpen) pauseMenu(); }
});
window.addEventListener('pagehide', saveRun);

// ---------- levels ----------
function resetView() {
  $('float').dataset.top = '';
  sel = null; aim = null; hover = null; drag = null; picked = null;
  fx = { parts: [], rings: [], texts: [], zaps: [], flames: [], decals: [] };
  fired = new Map(); trails = new Map(); routeKey = null; fruitShake = 0; acc = 0;
  $('pop').hidden = true;
}

function startLevel(L) {
  clearRun();
  g = G.newGame(L);
  resetView();
  $('home').hidden = true;
  if (V) V.board = null;
  buildPanels();
  layout();
  placeFloat();
  const level = LEVELS[L];
  const list = [];
  if (L === 0 && !profile.seen.how) { list.push(['how', 'how', fruitURL(level.fruit, 128)]); profile.seen.how = 1; }
  if (L === 0) list.push(['traps', 'spiker', iconURL('spiker', 0, 128)]);
  if (level.newTrap) list.push(['traps', level.newTrap, iconURL(level.newTrap, 0, 128)]);
  if (level.newEnemy) list.push(['enemies', level.newEnemy, bugURL(level.newEnemy, 128)]);
  if (level.newBonus) list.push(['bonuses', level.newBonus, icon(level.newBonus)]);
  const fresh = list.filter(([k, key]) => !profile.seen[`${k}:${key}`]);
  for (const [k, key] of fresh) profile.seen[`${k}:${key}`] = 1;
  saveProfile();
  introQueue(fresh, () => {});
}

function resumeRun(saved) {
  g = G.restore(saved);
  resetView();
  $('home').hidden = true;
  if (V) V.board = null;
  buildPanels();
  layout();
  if (g.state === 'run') pauseMenu();
}

let homeLoc = 0;
function showHome() {
  closePop();
  $('home').hidden = false;
  $('homeGems').textContent = profile.crystals;
  const saved = loadRun();
  const cont = $('cont');
  cont.hidden = !saved;
  if (saved) { cont.textContent = `▶ ${t('continueRun', { n: saved.L + 1 })}`; cont.onclick = () => resumeRun(saved); }
  const tabs = $('tabs');
  tabs.innerHTML = '';
  LOCATIONS.forEach((loc, i) => {
    const has = LEVELS.some((l) => l.loc === i);
    const b = document.createElement('button');
    b.className = `tab${i === homeLoc ? ' on' : ''}`;
    b.disabled = !has;
    b.innerHTML = `<img src="${fruitURL(loc.fruits[0], 64)}" alt="">${t(`loc.${loc.key}`)}${has ? '' : ` · ${t('locSoon')}`}`;
    b.onclick = () => { homeLoc = i; showHome(); };
    tabs.appendChild(b);
  });
  const grid = $('grid');
  grid.innerHTML = '';
  LEVELS.forEach((l, i) => {
    if (l.loc !== homeLoc) return;
    const b = document.createElement('button');
    const best = profile.best[i];
    b.className = `lv${best ? ' done' : ''}`;
    b.disabled = i > profile.open;
    b.innerHTML = i > profile.open ? `<img src="${icon('lock')}" alt="" style="width:44%">` : `${l.n + 1}${best ? `<small>${best}</small>` : ''}`;
    b.onclick = () => { S.unlock(); startLevel(i); };
    grid.appendChild(b);
  });
}
$('homeSet').addEventListener('click', () => {
  const open = () => modal(`<h2>${t('settings')}</h2>${settingsRows()}<div class="row" style="margin-top:12px"><button class="btn alt" data-act="close">${t('close')}</button></div>`, settingsActions(open));
  open();
});

function applyTexts() {
  document.documentElement.lang = getLang();
  $('tagline').textContent = t('tagline');
  setText($('startBtn'), 'start', `▶ ${t('start')}`);
  hudCache = {};
  if (!$('home').hidden) showHome();
  if (g) buildPanels();
}

// ---------- boot ----------
pickLang(profile.lang);
S.setSound(profile.sound);
$('logoImg').src = fruitURL('strawberry', 140);
$('startBtn').textContent = `▶ ${t('start')}`;
applyTexts();
window.addEventListener('resize', () => requestAnimationFrame(layout));
new ResizeObserver(() => layout()).observe($('field'));
layout();
const saved = loadRun();
if (saved) resumeRun(saved); else showHome();
requestAnimationFrame(frame);
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');

// Test hooks (used by the screenshot scripts).
window.__fd = {
  get g() { return g; },
  start: (L) => startLevel(L),
  play: () => { closeModal(); G.start(g); },
  build: (k, x, y) => G.build(g, k, G.cellOf(x, y)),
  steps: (n) => { for (let i = 0; i < n && g.state === 'run'; i++) G.step(g); },
  closeModal,
  setSpeed: (s) => { speed = s; },
};
