// All game graphics, drawn by code: volume shading, sprites, terrain, effects and UI pieces.
// Logical units: the design frame is 844x390; setView() widens it to the screen's aspect.

// Shared drawing helpers for Fruit Defense concept mockups.
const TAU = Math.PI * 2;

// ---------- colour ----------
function hex2rgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(x => x + x).join(''); const n = parseInt(h, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function rgb2hex(r, g, b) { return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
function mix(a, b, t) { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }
const lighten = (c, t) => mix(c, '#ffffff', t);
const darken = (c, t) => mix(c, '#000000', t);
function alpha(c, a) { const [r, g, b] = hex2rgb(c); return `rgba(${r},${g},${b},${a})`; }

// ---------- styles ----------
// ol: outline colour, 'auto' (darker fill) or null; paper: cut-paper sticker look; glow: neon look.
const STYLES = {
  cartoon: { ol: '#3a2414', lw: 2.2 },
  soft: { ol: 'auto', lw: 1.3 },
  flat: { ol: null, lw: 0 },
  paper: { ol: null, lw: 0, paper: true },
  neon: { ol: null, lw: 0, glow: true },
};

// Fill one shape in the given style. build(c) adds the path.
function shape(c, st, build, fill, o = {}) {
  c.save();
  if (st.paper && !o.plain) {
    c.save(); c.translate(1.6, 2.6); c.beginPath(); build(c); c.fillStyle = 'rgba(70,45,20,.30)'; c.fill(); c.restore();
    c.beginPath(); build(c); c.lineWidth = o.border ?? 3.2; c.lineJoin = 'round'; c.strokeStyle = '#fffaf0'; c.stroke();
  }
  c.beginPath(); build(c);
  if (st.glow && !o.plain) {
    c.shadowColor = fill; c.shadowBlur = o.blur ?? 12;
    c.fillStyle = alpha(fill, o.fillA ?? 0.32); c.fill();
    c.lineWidth = 1.6; c.strokeStyle = lighten(fill, 0.25); c.stroke();
  } else {
    c.fillStyle = fill; c.fill();
    const ol = st.ol === 'auto' ? darken(fill, 0.35) : st.ol;
    if (ol && !o.noOl) { c.lineWidth = o.lw ?? st.lw; c.lineJoin = 'round'; c.strokeStyle = ol; c.stroke(); }
  }
  c.restore();
}
function line(c, st, pts, color, w) {
  c.save(); c.beginPath(); c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = w;
  if (st.glow) { c.shadowColor = color; c.shadowBlur = 8; c.strokeStyle = lighten(color, .2); }
  else c.strokeStyle = color;
  c.stroke(); c.restore();
}
const circ = (x, y, r) => c => c.arc(x, y, r, 0, TAU);
const ell = (x, y, rx, ry, rot = 0) => c => c.ellipse(x, y, rx, ry, rot, 0, TAU);
function rrect(c, x, y, w, h, r) { c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
const rr = (x, y, w, h, r) => c => rrect(c, x, y, w, h, r);

function shadow(c, x, y, rx, ry, a = 0.22) { c.save(); c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fillStyle = `rgba(20,30,10,${a})`; c.fill(); c.restore(); }

// Seeded random so mockups are stable.
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// ---------- paths ----------
function chaikin(pts, it = 4) {
  for (let k = 0; k < it; k++) {
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      out.push([x0 * .75 + x1 * .25, y0 * .75 + y1 * .25], [x0 * .25 + x1 * .75, y0 * .25 + y1 * .75]);
    }
    out.push(pts[pts.length - 1]); pts = out;
  }
  return pts;
}
function along(pts, t) {
  let total = 0; const seg = [];
  for (let i = 0; i < pts.length - 1; i++) { const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); seg.push(d); total += d; }
  let d = t * total;
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) {
      const k = seg[i] ? d / seg[i] : 0, [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, a: Math.atan2(y1 - y0, x1 - x0) };
    }
    d -= seg[i];
  }
}
function strokePts(c, pts, w, color, o = {}) {
  c.save(); c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts) c.lineTo(p[0], p[1]);
  c.lineCap = o.cap || 'round'; c.lineJoin = 'round'; c.lineWidth = w; c.strokeStyle = color;
  if (o.dash) c.setLineDash(o.dash);
  if (o.glow) { c.shadowColor = color; c.shadowBlur = o.glow; }
  c.stroke(); c.restore();
}

function star5(x, y, r) { return c => { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr2 = i % 2 ? r * .45 : r; c.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); } c.closePath(); }; }

let LW = 844, LH = 390;
// Canvas blur filters are missing in some browsers (Safari and Chrome on iOS): soft effects then use gradients.
export const CAN_BLUR = (() => { try { const x = document.createElement('canvas').getContext('2d'); x.filter = 'blur(2px)'; return x.filter === 'blur(2px)'; } catch { return false; } })();
function softBlob(c, x, y, rx, ry, rot, rgb, a) { c.save(); c.translate(x, y); c.rotate(rot); c.scale(rx, ry); const g = c.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(.55, `rgba(${rgb},${a * .7})`); g.addColorStop(1, `rgba(${rgb},0)`); c.fillStyle = g; c.beginPath(); c.arc(0, 0, 1, 0, TAU); c.fill(); c.restore(); }
export function setView(w, h) { LW = w; LH = h; }
const FONT = 'Nunito, Rubik, system-ui, sans-serif';
const HS = {
  juicy: { ol: true, olw: 2.2, shade: .6, spec: .8, blurSh: false, name: 'juicy' },
  toy: { ol: false, olw: 0, shade: .95, spec: .55, blurSh: true, name: 'toy' },
};
let S = HS.juicy;
let SUN = { dx: 3, dy: 4, sx: 1, a: .28 }; // shadow offset and stretch

// ---------- themes: the colours of the ground, trail, hedge and light; gameplay objects keep their own ----------
// patch: light / dark soft spots (rgb) with their alphas; dapple: shade rgb, alpha, light rgb, alpha; sun: cast shadows.
const THEMES = {
  meadow: {
    grass: ['#97d968', '#72c24a'], patch: ['230,255,170', '40,110,30'], patchA: [.22, .16],
    blades: ['rgba(50,120,30,.45)', 'rgba(170,230,110,.5)', 'rgba(110,190,70,.6)'],
    flowers: ['#ffffff', '#ffe0f0', '#fff3a0', '#d8e8ff'], flowerN: 34, clover: ['#6fc54c', '#5bb341'], tuft: ['#5aa83e', '#86d05c'],
    daisyN: 14, leafN: 9, leaves: ['#e8b040', '#d47a2c', '#c8542a'], shroomN: 4, petalN: 0, dampN: 0,
    path: { glow: '30,70,15', edge: '#6e4426', fill: '#c08852', mid: '238,200,145', blades: ['#4f9e36', '#79c652'] },
    bush: { shade: '20,60,15', shadeA: .45, back: '#2f7a26', front: ['#45a036', '#3d952f'], leaf: '#5cb446', flowers: ['#ff6f91', '#fff07a', '#ffffff', '#b38cff'] },
    dapple: ['70,110,90', .42, '255,250,200', .12], grade: ['rgba(255,225,160,.32)', 'rgba(70,120,190,.28)'], sun2: ['255,248,200', .26],
    sun: { dx: 3, dy: 4, sx: 1, a: .28 },
  },
  forest: {
    grass: ['#62b24c', '#3f8c3c'], patch: ['200,240,140', '10,55,30'], patchA: [.15, .26],
    blades: ['rgba(20,78,30,.5)', 'rgba(125,200,100,.45)', 'rgba(64,146,66,.6)'],
    flowers: ['#ffffff', '#d8c8ff', '#bfe0ff', '#fff3a0'], flowerN: 16, clover: ['#4fa648', '#3f9240'], tuft: ['#3a8436', '#68b656'],
    daisyN: 4, leafN: 16, leaves: ['#b8862e', '#9a5a24', '#7c4a22'], shroomN: 12, petalN: 0, dampN: 0,
    path: { glow: '10,45,15', edge: '#573620', fill: '#b98a58', mid: '236,204,156', blades: ['#35802f', '#5fae4c'] },
    bush: { shade: '8,40,18', shadeA: .6, back: '#1f5c2a', front: ['#2f8038', '#297434'], leaf: '#48994a', flowers: ['#ffffff', '#d0b8ff', '#ffe98a'] },
    dapple: ['24,74,64', .62, '226,255,186', .2], grade: ['rgba(206,236,170,.2)', 'rgba(16,64,104,.38)'], sun2: ['222,255,200', .16],
    sun: { dx: 3, dy: 4, sx: 1, a: .34 },
  },
  orchard: {
    grass: ['#c6dc60', '#9fc646'], patch: ['255,240,150', '112,128,26'], patchA: [.26, .15],
    blades: ['rgba(108,136,28,.45)', 'rgba(238,236,120,.5)', 'rgba(172,200,66,.6)'],
    flowers: ['#ffffff', '#ffd0d8', '#ffe27a', '#ffc0a0'], flowerN: 26, clover: ['#9cc646', '#86b43c'], tuft: ['#86ae38', '#c8dc68'],
    daisyN: 9, leafN: 30, leaves: ['#f0b83a', '#e0822a', '#d2542a', '#c23a2a'], shroomN: 2, petalN: 46, dampN: 0,
    path: { glow: '80,70,10', edge: '#73421f', fill: '#c2804a', mid: '246,206,150', blades: ['#84ac38', '#bcd660'] },
    bush: { shade: '60,70,10', shadeA: .4, back: '#58882a', front: ['#7aaa36', '#6c9c30'], leaf: '#9cc24a', flowers: ['#ff4f44', '#ffd23f', '#ff4f44', '#ff9a5a'] },
    dapple: ['130,120,60', .26, '255,240,170', .16], grade: ['rgba(255,214,120,.4)', 'rgba(150,118,86,.22)'], sun2: ['255,236,170', .32],
    sun: { dx: 3.5, dy: 4, sx: 1.05, a: .27 },
  },
  marsh: {
    grass: ['#5cc898', '#35a380'], patch: ['190,255,224', '8,78,80'], patchA: [.18, .24],
    blades: ['rgba(12,92,80,.5)', 'rgba(146,236,194,.5)', 'rgba(56,170,130,.6)'],
    flowers: ['#ffffff', '#c8f0ff', '#fff3a0', '#e0d0ff'], flowerN: 22, clover: ['#3fb088', '#2f9a76'], tuft: ['#2a8a6a', '#70d2a6'],
    daisyN: 5, leafN: 4, leaves: ['#b8a040', '#8a9a3a', '#6a7a3a'], shroomN: 6, petalN: 0, dampN: 11,
    path: { glow: '6,60,50', edge: '#5a3e26', fill: '#ba8a5a', mid: '234,206,160', blades: ['#2c8e6e', '#62c69a'] },
    bush: { shade: '6,56,50', shadeA: .5, back: '#1f6a56', front: ['#2f9070', '#288466'], leaf: '#52b890', flowers: ['#ffffff', '#bfe8ff', '#fff07a', '#ffb0d8'] },
    dapple: ['26,88,98', .5, '212,255,240', .14], grade: ['rgba(190,240,220,.24)', 'rgba(26,86,150,.34)'], sun2: ['216,255,240', .2],
    sun: { dx: 3, dy: 4, sx: 1, a: .3 },
  },
  sunset: {
    grass: ['#c0d06a', '#86b056'], patch: ['255,206,160', '74,70,96'], patchA: [.3, .14],
    blades: ['rgba(66,94,48,.5)', 'rgba(244,222,140,.5)', 'rgba(150,182,80,.6)'],
    flowers: ['#fff0e0', '#ffc8d8', '#ffe08a', '#f0c8ff'], flowerN: 30, clover: ['#88b450', '#74a048'], tuft: ['#6c9844', '#b6d06a'],
    daisyN: 10, leafN: 8, leaves: ['#e8a040', '#d4702c', '#c0502a'], shroomN: 3, petalN: 0, dampN: 0,
    path: { glow: '60,40,60', edge: '#693a2a', fill: '#cc8858', mid: '252,202,150', blades: ['#6c9844', '#aaca62'] },
    bush: { shade: '50,30,60', shadeA: .5, back: '#3a6a3a', front: ['#5a9040', '#4f8438'], leaf: '#7aaa4a', flowers: ['#ff8aa8', '#ffd27a', '#fff0e0', '#d8a0ff'] },
    dapple: ['128,92,128', .3, '255,198,160', .2], grade: ['rgba(255,150,136,.4)', 'rgba(120,80,170,.3)'], sun2: ['255,188,150', .38],
    sun: { dx: 7, dy: 5, sx: 1.3, a: .3 },
  },
};
export const THEME_NAMES = Object.keys(THEMES);
let T = THEMES.meadow;
// Pick the look of the level before building the terrain; unknown names fall back to 'meadow'. Returns the name in use.
export function setTheme(name) { const n = THEMES[name] ? name : 'meadow'; T = THEMES[n]; SUN = T.sun; return n; }

const olOf = col => mix(darken(col, .5), '#2a1430', .2);

// ---------- volume primitives ----------
function hdGrad(c, cx, cy, r, col, k = 1) {
  const g = c.createRadialGradient(cx - r * .38, cy - r * .48, r * .06, cx, cy, r * 1.18);
  g.addColorStop(0, lighten(col, .42 * S.shade * k + .06)); g.addColorStop(.5, col); g.addColorStop(1, darken(col, .38 * S.shade * k));
  return g;
}
function hdSpec(c, x, y, rx, ry, rot = -.5, a = 1) {
  if (!S.spec) return; c.save(); c.globalAlpha = S.spec * a; c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); c.restore();
}
function hdBall(c, x, y, rx, ry, col, o = {}) {
  c.save(); c.translate(x, y); if (o.rot) c.rotate(o.rot);
  const r = Math.max(rx, ry);
  c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, TAU); c.fillStyle = hdGrad(c, 0, 0, r, col, o.k ?? 1); c.fill();
  if (S.ol && !o.noOl) { c.lineWidth = S.olw * (o.olk ?? 1); c.strokeStyle = olOf(col); c.stroke(); }
  if (!o.noSpec) hdSpec(c, -rx * .38, -ry * .5, rx * .32, ry * .18, -.5, o.specA ?? 1);
  c.restore();
}
// Arbitrary path with volume shading; (cx, cy, r) give the light frame.
function hdBlob(c, build, col, cx, cy, r, o = {}) {
  c.save(); c.beginPath(); build(c); c.fillStyle = hdGrad(c, cx, cy, r, col, o.k ?? 1); c.fill();
  if (S.ol && !o.noOl) { c.lineWidth = S.olw * (o.olk ?? 1); c.lineJoin = 'round'; c.strokeStyle = olOf(col); c.stroke(); }
  c.restore();
}
function hdLeaf(c, x, y, len, ang, col, o = {}) {
  const w = o.w ?? .42;
  c.save(); c.translate(x, y); c.rotate(ang);
  c.beginPath(); c.moveTo(0, 0); c.bezierCurveTo(len * .25, -len * w, len * .75, -len * w * .8, len, 0); c.bezierCurveTo(len * .75, len * w * .8, len * .25, len * w, 0, 0);
  const g = c.createLinearGradient(0, -len * w, 0, len * w); g.addColorStop(0, lighten(col, .3 * S.shade)); g.addColorStop(.5, col); g.addColorStop(1, darken(col, .3 * S.shade));
  c.fillStyle = g; c.fill(); if (S.ol && !o.noOl) { c.lineWidth = S.olw * .85; c.strokeStyle = olOf(col); c.stroke(); }
  c.beginPath(); c.moveTo(len * .08, 0); c.quadraticCurveTo(len * .5, -len * .04, len * .9, 0); c.strokeStyle = alpha(lighten(col, .45), .8); c.lineWidth = 1.1; c.stroke();
  c.restore();
}
function hdShadow(c, x, y, rx, ry, a = 1) {
  c.save(); if (S.blurSh) c.filter = 'blur(3px)';
  c.beginPath(); c.ellipse(x + SUN.dx, y + SUN.dy * .3, rx * SUN.sx, ry, 0, 0, TAU); c.fillStyle = `rgba(25,45,10,${SUN.a * a})`; c.fill(); c.restore();
}
function hdLine(c, pts, col, w) { c.save(); c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = w; c.strokeStyle = col; c.stroke(); c.restore(); }
function hdCurve(c, pts, col, w) { c.save(); c.beginPath(); c.moveTo(pts[0], pts[1]); c.quadraticCurveTo(pts[2], pts[3], pts[4], pts[5]); c.lineCap = 'round'; c.lineWidth = w; c.strokeStyle = col; c.stroke(); c.restore(); }
function hdEye(c, x, y, r, look = [1, 0]) {
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
  if (S.ol) { c.lineWidth = 1.2; c.strokeStyle = '#2a1430'; c.stroke(); }
  c.beginPath(); c.arc(x + look[0] * r * .3, y + look[1] * r * .3, r * .62, 0, TAU); c.fillStyle = '#1c1020'; c.fill();
  c.beginPath(); c.arc(x + look[0] * r * .3 - r * .22, y + look[1] * r * .3 - r * .25, r * .24, 0, TAU); c.fillStyle = '#ffffff'; c.fill();
}
function hdText(c, s, x, y, size, col = '#ffffff', o = {}) {
  c.save(); c.font = `${o.weight ?? 900} ${size}px ${FONT}`; c.textAlign = o.align || 'center'; c.textBaseline = 'middle';
  if (o.stroke !== null) { c.lineJoin = 'round'; c.lineWidth = o.sw ?? size * .28; c.strokeStyle = o.stroke ?? 'rgba(60,30,10,.9)'; c.strokeText(s, x, y); }
  if (o.grad) { const g = c.createLinearGradient(0, y - size / 2, 0, y + size / 2); g.addColorStop(0, o.grad[0]); g.addColorStop(1, o.grad[1]); c.fillStyle = g; } else c.fillStyle = col;
  c.fillText(s, x, y); c.restore();
}

// Shared pieces of the newer bugs.
// A little crown seen from above: a golden star ring with a gem.
function crownTop(c, x, y, r) {
  c.save(); c.translate(x, y);
  hdBlob(c, cc => { for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5, q = i % 2 ? r * .6 : r; cc.lineTo(Math.cos(a) * q, Math.sin(a) * q); } cc.closePath(); }, '#ffc928', 0, 0, r, { olk: .7 });
  for (let i = 0; i < 5; i++) { const a = i * TAU / 5; c.beginPath(); c.arc(Math.cos(a) * r * .92, Math.sin(a) * r * .92, r * .2, 0, TAU); c.fillStyle = '#fff6c0'; c.fill(); c.lineWidth = .7; c.strokeStyle = '#8a5a10'; c.stroke(); }
  hdBall(c, 0, 0, r * .36, r * .36, '#ff4a6a', { olk: .55, noBounce: true });
  c.restore();
}
// Half-closed eyelid: a grumpy, funny look for the bosses.
function hdLid(c, x, y, r, sg, col) {
  c.save(); c.translate(x, y); c.rotate(sg * .7); c.beginPath(); c.arc(0, 0, r + .5, Math.PI * .78, Math.PI * 1.42); c.closePath();
  c.fillStyle = col; c.fill(); c.lineWidth = 1.1; c.strokeStyle = '#2a1430'; c.stroke(); c.restore();
}
// Striped flyer (wasp, hornet): P = { body, stripe, thorax, head, sting, ant, grumpy }.
function waspLike(c, o, P) {
  const f = o.flap ?? 1, legC = '#3a1f14';
  const abd = cc => { cc.moveTo(0, 0); cc.bezierCurveTo(0, -8.4, -12, -7.6, -20, 0); cc.bezierCurveTo(-12, 7.6, 0, 8.4, 0, 0); };
  hdBlob(c, cc => { cc.moveTo(-17, -1.8); cc.lineTo(-17 - P.sting, 0); cc.lineTo(-17, 1.8); cc.closePath(); }, '#4a2c22', -19, 0, 4, { olk: .7 });
  hdBlob(c, abd, P.body, -8, 0, 11);
  c.save(); c.beginPath(); abd(c); c.clip(); c.strokeStyle = P.stripe; c.lineWidth = 2.7;
  for (const sx of [-4.5, -9.6, -14.6]) { c.beginPath(); c.moveTo(sx + 1.6, -9); c.quadraticCurveTo(sx - 1.6, 0, sx + 1.6, 9); c.stroke(); }
  c.restore();
  hdSpec(c, -8, -3.5, 5, 1.2, .1, .8);
  for (const sg of [-1, 1]) for (const [len, wd, sweep, rx] of [[12, 3.8, .7, -1], [18, 5.4, 1.2, 2]]) {
    c.save(); c.translate(rx, sg * 2.5); c.rotate(sg * (Math.PI - sweep * f)); c.beginPath(); c.ellipse(len / 2 + 1, 0, len / 2, wd * (.7 + .3 * f), 0, 0, TAU);
    const g = c.createLinearGradient(0, 0, len, 0); g.addColorStop(0, 'rgba(255,255,255,.8)'); g.addColorStop(1, 'rgba(196,232,255,.6)'); c.fillStyle = g; c.fill();
    c.lineWidth = 1.1; c.strokeStyle = 'rgba(50,90,140,.85)'; c.stroke();
    c.beginPath(); c.moveTo(2, 0); c.lineTo(len * .85, 0); c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = .8; c.stroke(); c.restore();
  }
  hdBall(c, 3.5, 0, 5.4, 5.2, P.thorax);
  hdBall(c, 10.5, 0, 4.8, 5.2, P.head);
  hdAntennae(c, 13.5, P.ant, legC);
  hdEye(c, 12, -3.1, 2.5, [1, -.2]); hdEye(c, 12, 3.1, 2.5, [1, .2]);
  if (P.grumpy) for (const sg of [-1, 1]) hdLid(c, 12, sg * 3.1, 2.5, sg, P.head);
}
// ---------- bugs: top-down, facing +x ----------
function hdLegs(c, xs, len, col, w = 1.7) {
  for (const x of xs) for (const s of [-1, 1]) {
    c.save(); c.beginPath(); c.moveTo(x, s * 2); c.quadraticCurveTo(x + len * .35, s * len * .9, x - len * .1, s * len * 1.35);
    c.lineCap = 'round'; c.lineWidth = w; c.strokeStyle = col; c.stroke(); c.restore();
  }
}
function hdAntennae(c, x, len, col) { for (const s of [-1, 1]) { hdCurve(c, [x, s * 2, x + len * .6, s * len * .2, x + len, s * len * .55], col, 1.3); c.beginPath(); c.arc(x + len, s * len * .55, 1.6, 0, TAU); c.fillStyle = col; c.fill(); } }
const BUG_SHADOW = { aphid: .6, rhino: 1.8, queen: 1.8, spider: 1.75, slugking: 1.9, hornet: 1.6 };
// o: { color, ph (animation phase), flap (wing openness .55..1 for flyers), fly, crumb, noShadow }.
// Regular kinds stay within 24 px of the centre at s = 1, bosses (rhino, queen, spider, slugking, hornet) within 32 px.
function hdBug(c, kind, x, y, a = 0, s = 1, o = {}) {
  c.save(); c.translate(x, y);
  if (!o.noShadow) { const fly = o.fly ? 14 : 0, k = s * (BUG_SHADOW[kind] || 1); c.save(); c.translate(fly * .6, fly); hdShadow(c, 0, 4, 15 * k, 8 * k, o.fly ? .55 : .8); c.restore(); }
  c.rotate(a); c.scale(s, s);
  const legC = '#3a1f14';
  switch (kind) {
    case 'ant': {
      const col = o.color || '#9a3a22';
      hdLegs(c, [-1, 2, 4], 9, legC, 1.6); hdAntennae(c, 11, 9, legC);
      hdBall(c, -11, 0, 8.5, 7, col);
      hdBall(c, -2.5, 0, 2.6, 2.2, darken(col, .2), { noSpec: true, olk: .7 });
      hdBall(c, 2, 0, 4.6, 3.8, col, { olk: .8 });
      hdBall(c, 10, 0, 5.6, 5.4, col);
      hdEye(c, 12, -3, 2.6, [1, -.2]); hdEye(c, 12, 3, 2.6, [1, .2]);
      if (o.crumb) hdBall(c, 18, 0, 4, 3.4, '#f0c070', { rot: .4 });
      break;
    }
    case 'beetle': {
      const col = o.color || '#2fa07a';
      hdLegs(c, [-6, 0, 6], 12, legC, 2); hdAntennae(c, 15, 8, legC);
      hdBall(c, 13, 0, 5.5, 5.5, darken(col, .5));
      hdBall(c, 6, 0, 6, 8.5, darken(col, .25), { olk: .9 });
      for (const sg of [-1, 1]) {
        c.save(); c.beginPath(); c.moveTo(4, 0); c.bezierCurveTo(4, sg * 13, -14, sg * 14, -17, sg * 1); c.lineTo(-17, 0); c.closePath();
        const g = c.createLinearGradient(0, sg * 14, 0, 0); g.addColorStop(0, darken(col, .35)); g.addColorStop(.45, lighten(col, .25)); g.addColorStop(1, col);
        c.fillStyle = g; c.fill(); if (S.ol) { c.lineWidth = S.olw; c.strokeStyle = olOf(col); c.stroke(); } c.restore();
        hdSpec(c, -5, sg * 6.5, 7, 1.6, 0, .9);
      }
      hdEye(c, 15, -3.2, 2.4); hdEye(c, 15, 3.2, 2.4);
      break;
    }
    case 'cricket': {
      // mole cricket: long earth-brown body, a shield behind the head, two digging claws in front
      const col = o.color || '#9a6a3a', sw = Math.sin(o.ph || 0) * .22;
      hdLegs(c, [-9, -3], 10, legC, 1.8);
      for (let i = 4; i >= 0; i--) hdBall(c, -8 - i * 4.4, 0, 5.2, 6.6 - i * .55, i % 2 ? col : darken(col, .12), { olk: .8, noSpec: i > 1 });
      for (const sg of [-1, 1]) { c.save(); c.globalAlpha = .55; hdLeaf(c, -7, sg * 2.6, 15, Math.PI + sg * .12, '#e8d2a0', { w: .22, noOl: true }); c.restore(); }
      hdBall(c, 1, 0, 7.6, 7.8, darken(col, .22), { specA: .55 });
      hdBall(c, 9.5, 0, 5.2, 5.6, lighten(col, .06));
      for (const sg of [-1, 1]) {
        c.save(); c.translate(8, sg * 6.5); c.rotate(sg * (.55 + sw));
        hdBlob(c, cc => { cc.moveTo(-2, -2.6); cc.lineTo(7, -3.4); cc.lineTo(10.5, -1.6); cc.lineTo(8, -.4); cc.lineTo(10.8, .8); cc.lineTo(8, 1.6); cc.lineTo(10, 3.2); cc.lineTo(6, 3.6); cc.lineTo(-2, 2.6); cc.closePath(); }, '#d8a45a', 4, 0, 8);
        c.restore();
      }
      hdAntennae(c, 12, 6, legC);
      hdEye(c, 11.5, -2.8, 2.3); hdEye(c, 11.5, 2.8, 2.3);
      break;
    }
    case 'caterpillar': {
      const col = o.color || '#86d23c';
      for (let i = 6; i >= 1; i--) {
        const cx = -i * 6.6, cy = Math.sin(i * 1.2 + (o.ph || 0)) * 2.4;
        for (const sg of [-1, 1]) { c.beginPath(); c.arc(cx, cy + sg * 6, 1.4, 0, TAU); c.fillStyle = darken(col, .5); c.fill(); }
        hdBall(c, cx, cy, 6, 6, i % 2 ? col : mix(col, '#f3e34a', .3), { olk: .8 });
        c.beginPath(); c.arc(cx + 1, cy - 3, 1.3, 0, TAU); c.fillStyle = '#ffd23a'; c.fill();
      }
      hdBall(c, 5, 0, 7.4, 7.6, lighten(col, .08));
      hdAntennae(c, 9, 7, '#3a1f14');
      hdEye(c, 8, -3.4, 2.8); hdEye(c, 8, 3.4, 2.8);
      c.save(); c.globalAlpha = .55; for (const sg of [-1, 1]) { c.beginPath(); c.ellipse(4, sg * 5.6, 2, 1.3, 0, 0, TAU); c.fillStyle = '#ff7a8a'; c.fill(); } c.restore();
      break;
    }
    case 'snail': {
      hdBall(c, 2, 0, 16, 6, '#e6cfa6', { olk: .9 });
      for (const sg of [-1, 1]) { hdLine(c, [14, sg * 2, 21, sg * 6], '#cdb38a', 2); hdEye(c, 21, sg * 6, 2.2); }
      hdBall(c, -3, 0, 11, 11, o.color || '#d98b4a');
      c.save(); c.beginPath(); for (let t = 0; t < 13; t += .2) { const r = 9 - t * .66; c.lineTo(-3 + Math.cos(t) * r, Math.sin(t) * r); } c.strokeStyle = alpha('#fff0d0', .8); c.lineWidth = 1.6; c.stroke(); c.restore();
      break;
    }
    case 'butterfly': {
      const a1 = o.color || '#ff7ac8', a2 = o.color2 || '#ffd54a', f = o.flap ?? 1;
      for (const sg of [-1, 1]) {
        for (const [cx, cy, rx, ry, col, rot] of [[3, sg * 10 * f, 10, 12 * f, a1, sg * .5], [-7, sg * 8 * f, 7, 8 * f, a2, -sg * .5]]) {
          c.save(); c.translate(cx, cy); c.rotate(rot); c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, TAU);
          const g = c.createRadialGradient(0, -sg * ry * .7, 1, 0, 0, Math.max(rx, ry) * 1.1); g.addColorStop(0, lighten(col, .5)); g.addColorStop(.6, col); g.addColorStop(1, darken(col, .25));
          c.fillStyle = g; c.fill(); if (S.ol) { c.lineWidth = S.olw; c.strokeStyle = olOf(col); c.stroke(); } c.restore();
        }
        hdBall(c, 5, sg * 11 * f, 3, 3, '#ffffff', { noSpec: true, olk: .6 });
      }
      hdBall(c, 0, 0, 11, 3.2, '#3a1f24');
      for (const sg of [-1, 1]) { hdCurve(c, [9, sg, 14, sg * 4, 17, sg * 7], '#3a1f24', 1.2); }
      break;
    }
    case 'grasshopper': {
      const col = o.color || '#6cc04a';
      for (const sg of [-1, 1]) { hdLine(c, [0, sg * 4, -9, sg * 13, -22, sg * 7], darken(col, .3), 3.4); }
      hdLegs(c, [5, 9], 7, legC, 1.4);
      hdBall(c, -4, 0, 15, 5, col);
      hdBall(c, 12, 0, 6, 5.2, lighten(col, .1));
      hdAntennae(c, 15, 12, legC);
      hdEye(c, 14, -3.2, 2.5); hdEye(c, 14, 3.2, 2.5);
      break;
    }
    case 'aphid': {
      // tiny pale pear: narrow head end, plump rear with two little tubes
      const col = o.color || '#bfe98c';
      hdLegs(c, [-3, 0, 3], 5.2, legC, 1);
      for (const sg of [-1, 1]) hdLine(c, [-7, sg * 2.6, -11, sg * 4.6], darken(col, .4), 1.7);
      hdBlob(c, cc => { cc.moveTo(8.5, 0); cc.bezierCurveTo(8.5, -4.4, 3, -4.2, -1, -6.4); cc.bezierCurveTo(-6, -8.6, -10.5, -4.5, -10.5, 0); cc.bezierCurveTo(-10.5, 4.5, -6, 8.6, -1, 6.4); cc.bezierCurveTo(3, 4.2, 8.5, 4.4, 8.5, 0); }, col, -2, 0, 9.5);
      hdSpec(c, -5, -3.4, 2.6, 1.2, -.3);
      for (const sg of [-1, 1]) hdCurve(c, [7, sg * 1.5, 10, sg * 2, 11.5, sg * 4.5], legC, 1.1);
      hdEye(c, 5.6, -2.5, 2.2, [1, -.2]); hdEye(c, 5.6, 2.5, 2.2, [1, .2]);
      c.save(); c.globalAlpha = .5; for (const sg of [-1, 1]) { c.beginPath(); c.ellipse(1.5, sg * 4, 1.6, 1, 0, 0, TAU); c.fillStyle = '#ff8a9a'; c.fill(); } c.restore();
      break;
    }
    case 'wasp': {
      waspLike(c, o, { body: o.color || '#ffd22e', stripe: '#2a1c1a', thorax: '#3a2a26', head: '#ffcf2a', sting: 5.5, ant: 6 });
      break;
    }
    case 'hornet': {
      // boss: the same build, bigger, orange, with a long stinger and heavy eyelids
      c.translate(3, 0); c.scale(1.4, 1.4);
      waspLike(c, o, { body: o.color || '#ff8a1c', stripe: '#2a1614', thorax: '#5a2a1a', head: '#ff9c2a', sting: 7, ant: 5, grumpy: true });
      hdBall(c, 3.5, 0, 2.6, 3.4, '#ffb347', { noSpec: true, olk: .6, noBounce: true });
      break;
    }
    case 'firefly': {
      // dark wing covers in front, a glowing lantern behind
      const col = o.color || '#4a3a56', pulse = .8 + .2 * Math.sin((o.ph || 0) * 1.3);
      c.save(); const g = c.createRadialGradient(-10, 0, 2, -10, 0, 21); g.addColorStop(0, `rgba(236,255,120,${.75 * pulse})`); g.addColorStop(.45, `rgba(210,255,90,${.34 * pulse})`); g.addColorStop(1, 'rgba(210,255,90,0)'); c.fillStyle = g; c.beginPath(); c.arc(-10, 0, 21, 0, TAU); c.fill(); c.restore();
      hdLegs(c, [-2, 2, 6], 8, legC, 1.4); hdAntennae(c, 14, 7, legC);
      hdBall(c, -10, 0, 7.6, 6.6, '#e4ff52', { olk: .9 });
      c.save(); const g2 = c.createRadialGradient(-11, -1, .5, -11, -1, 5); g2.addColorStop(0, 'rgba(255,255,235,.95)'); g2.addColorStop(1, 'rgba(255,255,235,0)'); c.fillStyle = g2; c.beginPath(); c.arc(-11, -1, 5, 0, TAU); c.fill(); c.restore();
      for (const sg of [-1, 1]) {
        hdBlob(c, cc => { cc.moveTo(7, 0); cc.bezierCurveTo(7, sg * 8.5, -5, sg * 9, -9, sg * 1.2); cc.lineTo(-9, 0); cc.closePath(); }, col, 0, sg * 3, 10);
        hdSpec(c, -1, sg * 4.6, 4.5, 1.1, 0, .7);
      }
      hdBall(c, 8.5, 0, 4.2, 6.2, '#ff7d4a', { olk: .9 });
      hdBall(c, 13.5, 0, 3.8, 4.2, darken(col, .2));
      hdEye(c, 15, -2.7, 2.3, [1, -.2]); hdEye(c, 15, 2.7, 2.3, [1, .2]);
      break;
    }
    case 'pillbug': {
      // woodlouse: a row of overlapping grey plates, many short legs
      const col = o.color || '#8e97a8';
      for (let i = 0; i < 7; i++) for (const sg of [-1, 1]) { const lx = -13 + i * 4.2, sw = ((i + (sg > 0 ? 1 : 0)) % 2 ? 1 : -1) * LEG * 1.6; hdLine(c, [lx, sg * 7, lx + sw, sg * 12.6], '#22100a', 3.2); hdLine(c, [lx, sg * 7, lx + sw, sg * 12.6], '#6a4a3a', 1.5); }
      for (const sg of [-1, 1]) hdLine(c, [-16, sg * 2, -20, sg * 3.6], darken(col, .45), 2.2);
      hdAntennae(c, 16, 6, legC);
      hdBall(c, 14.5, 0, 4.6, 5.8, darken(col, .3));
      for (let i = 0; i < 7; i++) { const t = i / 6, ry = 6.4 + 4.4 * Math.sin(Math.PI * (.14 + .72 * t)); hdBall(c, -14 + i * 4.3, 0, 4.7, ry, i % 2 ? col : lighten(col, .14), { olk: .9, specA: .75, noBounce: true }); }
      c.save(); c.globalAlpha = .5; hdLine(c, [-15, 0, 10, 0], darken(col, .45), 1.1); c.restore();
      for (const sg of [-1, 1]) for (let i = 1; i < 6; i += 2) { c.beginPath(); c.arc(-14 + i * 4.3, sg * 6.6, .9, 0, TAU); c.fillStyle = alpha(darken(col, .55), .7); c.fill(); }
      hdEye(c, 16, -3, 2.2, [1, -.2]); hdEye(c, 16, 3, 2.2, [1, .2]);
      break;
    }
    case 'rhino': {
      // boss: armoured beetle with a forked horn
      const col = o.color || '#84406e', dk = darken(col, .42);
      c.translate(-6.6, 0); c.scale(1.38, 1.38);
      hdLegs(c, [-7, 0, 6], 12.5, legC, 2.3);
      hdBlob(c, cc => { cc.moveTo(13, -3.2); cc.lineTo(20, -2.2); cc.lineTo(24.4, -6.4); cc.lineTo(27, -3.6); cc.lineTo(23.8, 0); cc.lineTo(27, 3.6); cc.lineTo(24.4, 6.4); cc.lineTo(20, 2.2); cc.lineTo(13, 3.2); cc.closePath(); }, '#e0b98c', 20, -1, 9, { olk: .9 });
      hdSpec(c, 18.5, -1, 3.6, .7, 0, .8);
      hdBall(c, 12.5, 0, 5.2, 5.8, darken(col, .25));
      hdBall(c, 5.5, 0, 6.6, 9.8, darken(col, .22), { olk: .95 });
      for (const sg of [-1, 1]) {
        c.save(); c.beginPath(); c.moveTo(4, 0); c.bezierCurveTo(4, sg * 14.5, -14, sg * 15.5, -17, sg * 1); c.lineTo(-17, 0); c.closePath();
        const g = c.createLinearGradient(0, sg * 15, 0, 0); g.addColorStop(0, darken(col, .38)); g.addColorStop(.45, lighten(col, .28)); g.addColorStop(1, col);
        c.fillStyle = g; c.fill(); if (S.ol) { c.lineWidth = S.olw; c.strokeStyle = olOf(col); c.stroke(); } c.restore();
        hdSpec(c, -5, sg * 7.2, 7.5, 1.6, 0, .9);
        for (const [px, py] of [[-11, 4.6], [-4, 10.4], [1, 5]]) { c.beginPath(); c.arc(px, sg * py, .95, 0, TAU); c.fillStyle = alpha(darken(col, .5), .55); c.fill(); }
      }
      hdBall(c, 8.2, 0, 1.9, 2.6, lighten(col, .22), { noSpec: true, olk: .6, noBounce: true });
      hdEye(c, 14.6, -3.7, 2.6, [1, -.1]); hdEye(c, 14.6, 3.7, 2.6, [1, .1]);
      for (const sg of [-1, 1]) hdLid(c, 14.6, sg * 3.7, 2.6, sg, dk);
      c.translate(-.6, 0);
      break;
    }
    case 'queen': {
      // boss: ant queen with a swollen striped abdomen, small wings and a crown
      const col = o.color || '#b8452a';
      c.translate(-1.5, 0);
      hdLegs(c, [4, 8.5, 13], 13, legC, 2.1); hdAntennae(c, 24, 6.5, legC);
      hdBall(c, -12.5, 0, 16, 13, col);
      c.save(); c.beginPath(); c.ellipse(-12.5, 0, 16, 13, 0, 0, TAU); c.clip(); c.strokeStyle = alpha('#ffd9a8', .42); c.lineWidth = 3;
      for (const sx of [-23, -16, -9, -2]) { c.beginPath(); c.moveTo(sx + 2, -14); c.quadraticCurveTo(sx - 2.5, 0, sx + 2, 14); c.stroke(); }
      c.restore();
      hdBall(c, 3.6, 0, 3, 2.7, darken(col, .2), { noSpec: true, olk: .7 });
      for (const sg of [-1, 1]) {
        c.save(); c.translate(8, sg * 3.5); c.rotate(sg * 2.55); c.beginPath(); c.ellipse(7.5, 0, 7.5, 3.4, 0, 0, TAU);
        c.fillStyle = 'rgba(235,248,255,.7)'; c.fill(); c.lineWidth = 1.1; c.strokeStyle = 'rgba(50,90,140,.85)'; c.stroke(); c.restore();
      }
      hdBall(c, 9.5, 0, 6.6, 5.8, col, { olk: .9 });
      hdBall(c, 20.5, 0, 7.4, 7.2, lighten(col, .05));
      hdEye(c, 23.2, -4, 3, [1, -.2]); hdEye(c, 23.2, 4, 3, [1, .2]);
      for (const sg of [-1, 1]) for (const da of [-.5, 0, .5]) { const a = sg * (1.75 + da); hdLine(c, [23.2 + Math.cos(a) * 3, sg * 4 + Math.sin(a) * 3, 23.2 + Math.cos(a) * 5, sg * 4 + Math.sin(a) * 5], '#2a1430', 1); }
      crownTop(c, 16.5, 0, 6);
      break;
    }
    case 'spider': {
      // boss: fat round spider, eight striped legs, many eyes, a pattern on the back
      const col = o.color || '#70509a', A8 = [.7, 1.25, 1.85, 2.45], B8 = [-.5, -.25, .3, .55];
      c.translate(-3, 0);
      for (const pass of [0, 1, 2]) for (const sg of [-1, 1]) A8.forEach((a0, i) => {
        const a = a0 + ((i + (sg > 0 ? 1 : 0)) % 2 ? 1 : -1) * LEG * .13, bx = 9 - i * 2.6, by = sg * 4;
        const kx = bx + Math.cos(a) * 13, ky = by + sg * Math.sin(a) * 13, fx = kx + Math.cos(a + B8[i]) * 12.5, fy = ky + sg * Math.sin(a + B8[i]) * 12.5;
        c.save(); c.beginPath(); c.moveTo(bx, by); c.lineTo(kx, ky); c.lineTo(fx, fy); c.lineJoin = 'round'; c.lineCap = pass === 2 ? 'butt' : 'round';
        if (pass === 2) { c.setLineDash([2.6, 4.2]); c.lineDashOffset = -3; }
        c.lineWidth = [5.4, 3.3, 3.3][pass]; c.strokeStyle = ['#22100a', darken(col, .3), '#f6d868'][pass]; c.stroke(); c.restore();
      });
      hdBall(c, -8, 0, 14.5, 13.6, col);
      c.save(); c.fillStyle = '#f6d868'; c.strokeStyle = alpha(darken(col, .55), .8); c.lineWidth = .9;
      for (const [px, r] of [[-1.5, 2.2], [-7, 3.6], [-14, 2.8]]) { c.beginPath(); c.moveTo(px + r, 0); c.lineTo(px, -r * .9); c.lineTo(px - r, 0); c.lineTo(px, r * .9); c.closePath(); c.fill(); c.stroke(); }
      for (const sg of [-1, 1]) for (const [px, py, r] of [[-4, 6, 1.5], [-11, 7.4, 1.7], [-17, 4.6, 1.3]]) { c.beginPath(); c.arc(px, sg * py, r, 0, TAU); c.fill(); c.stroke(); }
      c.restore();
      hdBall(c, 9, 0, 8.2, 7.8, lighten(col, .1));
      for (const sg of [-1, 1]) { hdEye(c, 9.6, sg * 5.7, 1.9, [1, sg * .3]); c.beginPath(); c.arc(16.4, sg * 1.3, 1.1, 0, TAU); c.fillStyle = '#1c1020'; c.fill(); }
      hdEye(c, 13.2, -3.1, 3, [1, -.1]); hdEye(c, 13.2, 3.1, 3, [1, .1]);
      break;
    }
    case 'slugking': {
      // boss: a fat glossy slug without a shell, eyes on stalks, a crown, slime all around
      const col = o.color || '#e6c545', w = Math.sin(o.ph || 0) * 1.6;
      const body = (cc, g) => { cc.moveTo(23 + g, 0); cc.bezierCurveTo(23 + g, -14 - g, 5, -16.5 - g, -8, -14 - g); cc.bezierCurveTo(-19, -12 - g, -27, -5 - g + w, -29 - g, w * 1.4); cc.bezierCurveTo(-27, 5 + g + w, -19, 12 + g, -8, 14 + g); cc.bezierCurveTo(5, 16.5 + g, 23 + g, 14 + g, 23 + g, 0); };
      c.save(); c.beginPath(); body(c, 1.4); c.fillStyle = 'rgba(214,246,255,.6)'; c.fill(); c.lineWidth = 1; c.strokeStyle = 'rgba(255,255,255,.75)'; c.stroke(); c.restore();
      for (const sg of [-1, 1]) { hdLine(c, [19, sg * 5, 27, sg * 10], '#2a1430', 5.2); hdLine(c, [19, sg * 5, 27, sg * 10], lighten(col, .12), 3); hdLine(c, [22, sg * 2, 28, sg * 3], '#2a1430', 3.4); hdLine(c, [22, sg * 2, 28, sg * 3], lighten(col, .12), 1.6); }
      hdBlob(c, cc => body(cc, -1.2), col, -2, 0, 27);
      c.save(); c.beginPath(); body(c, -1.2); c.clip();
      for (const [px, py, r] of [[-22, 2, 1.6], [-17, -5, 2], [-13, 6, 2.3], [-8, -9, 1.7], [-5, 9, 1.5], [-19, 7 + w, 1.3]]) { c.beginPath(); c.arc(px, py, r, 0, TAU); c.fillStyle = alpha(darken(col, .32), .6); c.fill(); }
      c.restore();
      c.save(); c.globalAlpha = .55; hdCurve(c, [-27, w, -12, -1.5, -4, 0], darken(col, .3), 1.6); c.restore();
      hdBlob(c, cc => { cc.moveTo(19, 0); cc.bezierCurveTo(19, -11, 4, -12.5, -3, -9); cc.quadraticCurveTo(-7, 0, -3, 9); cc.bezierCurveTo(4, 12.5, 19, 11, 19, 0); }, mix(col, '#d8963a', .45), 8, 0, 13, { olk: .8 });
      c.beginPath(); c.arc(2, 6.5, 1.3, 0, TAU); c.fillStyle = alpha(darken(col, .55), .7); c.fill();
      hdSpec(c, 6, -6.5, 6, 1.5, .05, .85);
      hdSpec(c, -13, -7.5, 8, 1.7, .16, .85); hdSpec(c, -22, -3 + w * .5, 3, 1.1, .5, .7);
      for (const sg of [-1, 1]) hdEye(c, 27.6, sg * 10.4, 3.3, [1, sg * .1]);
      crownTop(c, 13, 0, 6.2);
      break;
    }
  }
  c.restore();
}

// ---------- plants: side view, base at x,y ----------
// Levels 1 and 2 differ by count and size; at 3 and 4 the branch (o.br) gives a plant a look of its own, and the top
// (level 4) adds gold and more of it, so the branch and the level read at a glance.
// At s = 1 every plant of any level stays inside x -36..36, y -72..12 around its base point.
const GOLD = '#ffc928';
const LVL_K = [1, 1.08, 1.16, 1.24];
function rosette(c, x, y, r, col) {
  hdBall(c, x, y, r, r * .92, col);
  c.save(); c.strokeStyle = alpha(darken(col, .35), .85); c.lineWidth = 1.2; c.beginPath();
  for (let t = 0; t < 9; t += .25) { const rr2 = r * .75 * (1 - t / 10); c.lineTo(x + Math.cos(t * 1.4) * rr2 * .9, y + Math.sin(t * 1.4) * rr2 * .8); } c.stroke(); c.restore();
  hdSpec(c, x - r * .4, y - r * .45, r * .28, r * .14);
}
function bushBase(c, col, w = 1) {
  for (const [dx, dy, r] of [[-9, -9, 9], [9, -10, 9], [0, -6, 10], [-5, -18, 9.5], [6, -19, 9.5], [0, -26, 8]]) hdBall(c, dx * w, dy, r * w, r, dy < -15 ? lighten(col, .08) : col, { specA: .4 });
}
function bush(c, col, u) { c.save(); c.scale(u, u); bushBase(c, col); c.restore(); }
// A bush filling a cell of the field (nothing grows there, bugs do not go there), a little different every time.
function hdBush(c, x, y) {
  const R = rng(hash2(x, y) + 11); c.save(); c.translate(x + (R() - .5) * 4, y + 12); hdShadow(c, 0, 1, 18, 6, 1);
  bush(c, ['#3f8a3a', '#468f3c', '#3a7f40'][Math.floor(R() * 3)], .95 + R() * .15);
  if (R() > .6) for (let n = 0; n < 3; n++) { c.beginPath(); c.arc((R() - .5) * 18, -12 - R() * 14, 1.8, 0, TAU); c.fillStyle = R() > .5 ? '#fff4f8' : '#ffd84a'; c.fill(); }
  c.restore();
}
function sparkle(c, x, y, r, col = '#fff3a8') {
  c.save(); c.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, q = i % 2 ? r * .32 : r; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } c.closePath();
  c.fillStyle = col; c.fill(); c.lineWidth = .7; c.strokeStyle = 'rgba(140,90,10,.65)'; c.stroke(); c.restore();
}
function snowflake(c, x, y, r) {
  for (const [col, w] of [['#3f9fd2', 3.4], ['#ffffff', 1.7]]) {
    c.save(); c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; c.beginPath(); c.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r); c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); c.stroke(); }
    c.restore();
  }
}
function iceCrystal(c, x, y, u) {
  c.save(); c.translate(x, y); c.scale(u, u);
  c.beginPath(); c.moveTo(0, -8); c.lineTo(4.8, -2.5); c.lineTo(0, 7); c.lineTo(-4.8, -2.5); c.closePath();
  const g = c.createLinearGradient(-4, -8, 4, 7); g.addColorStop(0, '#ffffff'); g.addColorStop(.5, '#bfeaff'); g.addColorStop(1, '#5fbcf0'); c.fillStyle = g; c.fill();
  c.lineJoin = 'round'; c.lineWidth = 1.3; c.strokeStyle = '#2f86bd'; c.stroke();
  c.beginPath(); c.moveTo(-4.8, -2.5); c.lineTo(4.8, -2.5); c.moveTo(-1.6, -2.5); c.lineTo(0, 7); c.moveTo(1.6, -2.5); c.lineTo(0, -8); c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = .8; c.stroke();
  c.restore();
}
function pumpkinOne(c, x, u, o = {}) {
  c.save(); c.translate(x, 0); c.scale(u, u);
  const [a, b, m] = o.rich ? ['#dd6410', '#f17c1a', '#ff9a2a'] : ['#e2771a', '#f08a24', '#f7a23a'];
  if (!o.bare) { hdLeaf(c, -4, -16, 14, -2.5, '#4fae3a'); hdLeaf(c, 4, -18, 12, -.6, '#5fbf45'); }
  hdBall(c, -11, -11, 9, 10, a, { specA: .5 }); hdBall(c, 11, -11, 9, 10, a, { specA: .5 });
  hdBall(c, -5, -11, 9, 11, b, { specA: .6 }); hdBall(c, 5, -11, 9, 11, b, { specA: .6 });
  hdBall(c, 0, -11, 8, 11.5, m);
  c.save(); c.strokeStyle = 'rgba(150,60,10,.55)'; c.lineWidth = 1.3; c.lineCap = 'round';
  for (const dx of [-3.5, 3.5]) { c.beginPath(); c.moveTo(dx * .6, -21); c.quadraticCurveTo(dx * 1.4, -11, dx * .6, -1); c.stroke(); }
  c.restore();
  hdSpec(c, -4, -17, 2.4, 4.5, .2, .8);
  if (o.face) {
    // friendly carved face with a warm light inside
    c.save();
    const h = c.createRadialGradient(0, -11, 1, 0, -11, 11.5); h.addColorStop(0, 'rgba(255,238,130,.6)'); h.addColorStop(1, 'rgba(255,238,130,0)'); c.fillStyle = h; c.beginPath(); c.arc(0, -11, 11.5, 0, TAU); c.fill();
    const g = c.createLinearGradient(0, -18, 0, -2); g.addColorStop(0, '#fffbb0'); g.addColorStop(1, '#ffb01a'); c.fillStyle = g; c.strokeStyle = '#743004'; c.lineWidth = 1.25; c.lineJoin = 'round';
    for (const sg of [-1, 1]) { c.beginPath(); c.moveTo(sg * 3, -12.4); c.lineTo(sg * 10, -12.8); c.lineTo(sg * 6.6, -18.4); c.closePath(); c.fill(); c.stroke(); }
    c.beginPath(); c.moveTo(-11, -9); c.quadraticCurveTo(0, -5.5, 11, -9); c.quadraticCurveTo(0, 3.5, -11, -9); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = m; c.beginPath(); c.rect(-3.4, -8, 3.2, 2.8); c.rect(2.2, -3.7, 3, 2.6); c.fill(); c.stroke();
    c.restore();
  }
  if (o.crown) for (const [an, l] of [[-2.8, 11], [-.34, 11], [-2.25, 10], [-.9, 10]]) hdLeaf(c, 0, -21, l, an, '#74d44c', { w: .5 });
  hdBlob(c, cc => { cc.moveTo(-2, -21); cc.quadraticCurveTo(-3, -28, 3, -30); cc.lineTo(4, -27); cc.quadraticCurveTo(1, -26, 2, -21); cc.closePath(); }, '#7a5a2a', 1, -25, 5);
  if (!o.crown && !o.bare) hdCurve(c, [3, -27, 12, -34, 9, -26], '#5aa53e', 1.4);
  c.restore();
}
// One flytrap head: hinge at (x, y), mouth towards ang.
function trapHead(c, x, y, ang, u, shut, lip) {
  const G1 = '#6cc44a';
  c.save(); c.translate(x, y); c.rotate(ang); c.scale(u, u);
  if (shut) {
    hdBlob(c, cc => { cc.moveTo(-1, 0); cc.bezierCurveTo(-3, -14, 21, -13.5, 23, 0); cc.bezierCurveTo(21, 13.5, -3, 14, -1, 0); }, G1, 10, 0, 14);
    hdBall(c, 8, 5.5, 4.4, 3.4, lighten(G1, .1), { noSpec: true, olk: .6 }); hdBall(c, 13, -6, 3.6, 2.8, lighten(G1, .1), { noSpec: true, olk: .6 });
    c.save(); c.beginPath(); c.moveTo(1, 0); for (let i = 0; i < 6; i++) c.lineTo(4 + i * 3.4, i % 2 ? 1.8 : -1.8); c.lineTo(22.4, 0);
    c.lineJoin = 'round'; c.lineCap = 'round'; c.lineWidth = 3.6; c.strokeStyle = lip; c.stroke(); c.lineWidth = 1.3; c.strokeStyle = '#fff6d8'; c.stroke(); c.restore();
    hdSpec(c, 6, -7.5, 4.5, 1.6, -.15, .9);
  } else {
    const open = .52;
    c.save(); c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 18, -open, open); c.closePath();
    const g = c.createRadialGradient(2, 0, 1, 2, 0, 20); g.addColorStop(0, '#8c1238'); g.addColorStop(.55, '#e23a66'); g.addColorStop(1, '#ff86a2'); c.fillStyle = g; c.fill(); c.restore();
    for (const sg of [-1, 1]) {
      c.save(); c.rotate(sg * open);
      hdBlob(c, cc => { cc.moveTo(-1.5, 0); cc.bezierCurveTo(-3, sg * 13.5, 20, sg * 13, 22.5, 0); cc.closePath(); }, G1, 10, sg * 5, 13);
      c.fillStyle = '#fff6d8'; c.strokeStyle = '#8a7a4a'; c.lineWidth = .7; c.lineJoin = 'round';
      for (let i = 0; i < 5; i++) { const tx = 4.5 + i * 3.9; c.beginPath(); c.moveTo(tx - 1.6, 0); c.lineTo(tx, -sg * 4.6); c.lineTo(tx + 1.6, 0); c.closePath(); c.fill(); c.stroke(); }
      hdLine(c, [.5, 0, 21.5, 0], lip, 2.8);
      for (const [px, py, r] of [[6, 6.2, 1.3], [12, 7.4, 1.5], [17, 4.6, 1.1]]) { c.beginPath(); c.arc(px, sg * py, r, 0, TAU); c.fillStyle = alpha(darken(G1, .35), .55); c.fill(); }
      if (sg < 0) hdSpec(c, 8, -8.6, 4.5, 1.4, -.1, .85);
      c.restore();
    }
  }
  c.restore();
}
// A thorny vine from (x0, y0) curling out to (x1, y1), with thorns along it (and berries on a top one).
function vine(c, x0, y0, x1, y1, bend, berries) {
  const mx = (x0 + x1) / 2 + bend, my = (y0 + y1) / 2 - Math.abs(bend) * .6;
  hdCurve(c, [x0, y0, mx, my, x1, y1], '#4a6a22', 3.4); hdCurve(c, [x0, y0, mx, my, x1, y1], '#7aa83a', 1.6);
  for (let t = .2; t < 1; t += .2) {
    const px = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * mx + t * t * x1, py = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * my + t * t * y1;
    c.beginPath(); c.moveTo(px - 1.6, py); c.lineTo(px, py - 4); c.lineTo(px + 1.6, py); c.closePath(); c.fillStyle = '#f2e6b0'; c.fill(); c.lineWidth = .6; c.strokeStyle = '#6a5020'; c.stroke();
    if (berries && t > .5) hdBall(c, px + 2, py + 2.5, 2.4, 2.4, '#4a1a5a', { olk: .6, noBounce: true });
  }
}
// Steel plates over a pumpkin (the shell branch); gold rims on the top one.
function shellPlates(c, u, gold) {
  c.save(); c.scale(u, u);
  for (const [dx, w, h] of [[-10, 7, 15], [0, 8, 17], [10, 7, 15]]) {
    hdBlob(c, (cc) => { cc.moveTo(dx - w, -8); cc.quadraticCurveTo(dx - w, -8 - h * 1.05, dx, -9 - h); cc.quadraticCurveTo(dx + w, -8 - h * 1.05, dx + w, -8); cc.closePath(); }, '#8fa8c8', dx, -14, 10);
    if (gold) hdLine(c, [dx - w + 1, -9, dx + w - 1, -9], GOLD, 2);
    for (const q of [-.5, .5]) { c.beginPath(); c.arc(dx + q * w * .9, -12, 1.1, 0, TAU); c.fillStyle = gold ? GOLD : '#dfe8f4'; c.fill(); }
  }
  c.restore();
}
// A glow of colour around a plant (fire, frost, nectar).
function glow(c, x, y, r, rgb, a) { c.save(); const g = c.createRadialGradient(x, y, 2, x, y, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.restore(); }
// A little target (the hunter rose's mark).
function markSign(c, x, y, r) {
  c.save(); c.strokeStyle = '#e8336a'; c.lineWidth = 1.6; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
  c.beginPath(); c.moveTo(x - r * 1.4, y); c.lineTo(x - r * .5, y); c.moveTo(x + r * .5, y); c.lineTo(x + r * 1.4, y); c.moveTo(x, y - r * 1.4); c.lineTo(x, y - r * .5); c.moveTo(x, y + r * .5); c.lineTo(x, y + r * 1.4); c.stroke();
  c.beginPath(); c.arc(x, y, r * .3, 0, TAU); c.fillStyle = '#e8336a'; c.fill(); c.restore();
}
// An icicle hanging from (x, y), len long.
function icicle(c, x, y, len, w, gold) {
  c.save(); c.beginPath(); c.moveTo(x - w, y); c.quadraticCurveTo(x - w * .6, y + len * .5, x, y + len); c.quadraticCurveTo(x + w * .6, y + len * .5, x + w, y); c.closePath();
  const g = c.createLinearGradient(x, y, x, y + len); g.addColorStop(0, '#ffffff'); g.addColorStop(.5, '#c8f0ff'); g.addColorStop(1, '#5fbcf0'); c.fillStyle = g; c.fill();
  c.lineWidth = 1.3; c.strokeStyle = gold ? '#c08a10' : '#2f86bd'; c.stroke();
  hdLine(c, [x - w * .35, y + 2, x - w * .1, y + len * .6], 'rgba(255,255,255,.9)', 1.2); c.restore();
}
// o: { lvl: 1..4 (0 or none = 1), br: 'a' | 'b' (levels 3 and 4), stage: 0 | 1 for a freshly planted or regrowing
// sprout, frame: 0 | 1, noShadow }.
function hdPlant(c, kind, x, y, s = 1, o = {}) {
  const L = Math.max(1, Math.min(4, o.lvl | 0)), young = o.stage === 0 || o.stage === 1, k = young ? 1 : LVL_K[L - 1];
  const br = L > 2 ? o.br || 'a' : null, top = L === 4;
  c.save(); c.translate(x, y); if (!o.noShadow) hdShadow(c, 0, 1, 15 * s * k, 5 * s * k); c.scale(s * k, s * k);
  if (o.stage === 0) { hdBall(c, 0, -3, 10, 5, '#8a5a34', { specA: .3 }); hdLeaf(c, 0, -6, 8, -2.3, '#7fd05a'); hdLeaf(c, 0, -6, 8, -.8, '#5fbf45'); c.restore(); return; }
  if (o.stage === 1) { hdLine(c, [0, 0, 0, -12], '#4a9a32', 2.6); hdLeaf(c, 0, -11, 12, -2.6, '#5fbf45'); hdLeaf(c, 0, -11, 12, -.5, '#7fd05a'); c.restore(); return; }
  switch (kind) {
    case 'pumpkin': {
      if (L === 1) pumpkinOne(c, 0, .78);
      else if (L === 2) { pumpkinOne(c, -5, .93); pumpkinOne(c, 13.5, .5, { bare: true }); }
      else if (br === 'a') { // the shell: plates of armor; its top keeps a ward (a golden halo and a face)
        if (top) glow(c, 0, -14, 26, '255,236,150', .55);
        pumpkinOne(c, 0, 1.04, { rich: true, face: top, crown: top }); shellPlates(c, 1.04, top);
        if (top) { sparkle(c, -17, -30, 3, GOLD); sparkle(c, 16, -33, 2.6, GOLD); }
      } else { // thorny vines out to both sides; the top bears blackberries
        vine(c, -6, -6, -24, -20, -6, top); vine(c, 6, -6, 24, -22, 6, top); vine(c, -2, -12, -14, -34, -8, top); vine(c, 2, -12, 15, -36, 8, top);
        pumpkinOne(c, 0, .96, { rich: top });
      }
      break;
    }
    case 'rose': {
      const rose = (l, red, gold) => { // the plant as it was drawn at three levels: a bush with blooms, thorns and leaves
        const bu = [.72, .92, 1.06][l - 1];
        bush(c, l === 3 ? '#37902f' : '#3f9a36', bu);
        for (const [dx, dy, a] of [[-14, -8, 3.3], [14, -10, -.1], [-12, -22, 3.6], [13, -24, -.4]]) hdLeaf(c, dx * .6 * bu, dy * bu, 9 * bu, a, '#56b346');
        if (l > 1) for (const [tx, ty, a] of [[-17, -8, 3.3], [17, -9, -.15], [-14, -21, 3.75], [15, -22, -.6]].concat(l === 3 ? [[-8, -31, 4.1], [9, -32, -1]] : [])) {
          c.save(); c.translate(tx * bu, ty * bu); c.rotate(a); hdBlob(c, cc => { cc.moveTo(0, -1.9); cc.lineTo(5, 0); cc.lineTo(0, 1.9); cc.closePath(); }, '#fff0b8', 2, 0, 4, { olk: .45 }); c.restore();
        }
        for (const [bx, by, r] of [[[0, -17, 8]], [[-8, -15, 7.6], [7, -24, 8]], [[-10, -17, 8.4], [10, -20, 8.4], [0, -32, 9]]][l - 1]) {
          rosette(c, bx, by, r, red);
          if (gold) hdBall(c, bx, by, r * .26, r * .26, GOLD, { olk: .6, noBounce: true });
        }
      };
      if (L <= 2) { rose(L, '#ee3d60', false); sparkle(c, -12 * [.72, .92][L - 1], -29 * [.72, .92][L - 1], 2.6, '#ffffff'); }
      else if (br === 'a') { // the hunter: deep crimson, with its mark over it (two at the top: the mark goes on)
        rose(3, '#c0103a', top); markSign(c, 16, -38, 4.2); if (top) { markSign(c, -17, -36, 3.4); sparkle(c, 1, -44, 2.8, GOLD); }
      } else { // the far shot: one tall stem with a pale rose high up, seeds of fluff around it
        hdCurve(c, [0, 0, 3, -24, 0, -46], '#2f6f22', 4.6); hdCurve(c, [0, 0, 3, -24, 0, -46], '#62b344', 2.4);
        hdLeaf(c, 1, -14, 14, -2.6, '#4fae3a', { w: .3 }); hdLeaf(c, 2, -24, 13, -.4, '#5fbf45', { w: .3 });
        for (let n = 0; n < (top ? 10 : 6); n++) { const a = n / (top ? 10 : 6) * TAU; c.save(); c.globalAlpha = .9; c.beginPath(); c.arc(Math.cos(a) * 15, -46 + Math.sin(a) * 12, 1.6, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); c.restore(); hdLine(c, [Math.cos(a) * 9, -46 + Math.sin(a) * 7, Math.cos(a) * 14, -46 + Math.sin(a) * 11], 'rgba(220,215,200,.9)', .8); }
        rosette(c, 0, -46, top ? 10 : 9, '#ff8aa8'); if (top) { hdBall(c, 0, -46, 2.6, 2.6, GOLD, { olk: .6, noBounce: true }); sparkle(c, 14, -58, 2.8, GOLD); }
      }
      break;
    }
    case 'pepper': {
      const bu = [.72, .92, 1.06, 1.1][L - 1];
      const pep = (dx, dy, r, u, flame, col = '#ee3a24', fl = '#ff8a14') => {
        c.save(); c.translate(dx, dy); c.rotate(r); c.scale(u, u);
        if (flame) {
          hdBlob(c, cc => { cc.moveTo(-2.6, 12.5); cc.bezierCurveTo(-4.4, 16, -.5, 17.5, 1.5, 22.5); cc.bezierCurveTo(3, 18.5, 5.6, 16, 3.6, 12.5); cc.closePath(); }, fl, 1, 16, 6, { olk: .7 });
          c.beginPath(); c.moveTo(-.4, 13.5); c.quadraticCurveTo(-.4, 16.5, 1.4, 19); c.quadraticCurveTo(2.6, 16, 2, 13.5); c.closePath(); c.fillStyle = '#fff07a'; c.fill();
        }
        hdBlob(c, cc => { cc.moveTo(-3.6, -2); cc.bezierCurveTo(-5, 6, -1, 12, 1.5, 14); cc.bezierCurveTo(4, 8, 4.5, 3, 3.6, -2); cc.closePath(); }, col, 0, 5, 7);
        hdSpec(c, -1.4, 3, 1.1, 4, 0); hdBall(c, 0, -2.5, 3.6, 2, '#3f8f2c', { noSpec: true, olk: .7 });
        c.restore();
      };
      if (br === 'a') glow(c, 0, -16, top ? 30 : 24, '255,150,40', top ? .55 : .4); // heat: a ring of fire around it
      bush(c, br === 'b' ? '#356a3a' : '#3f9a36', bu);
      if (L === 1) pep(-1, -17, .12, 1.2);
      else if (L === 2) { pep(-9, -12, .38, 1.05); pep(8, -14, -.32, 1.05); pep(-1, -24, .08, 1.05); }
      else if (br === 'a') { pep(-11, -13, Math.PI - .5, 1.15, true); pep(11, -13, Math.PI + .5, 1.15, true); pep(-4.5, -21, Math.PI - .2, 1.3, true); pep(5.5, -22, Math.PI + .22, 1.3, true); if (top) { pep(0, -30, Math.PI, 1.35, true); sparkle(c, -16, -34, 3, GOLD); } }
      else { // burn-through: dark violet peppers with blue-hot tips, hanging down; the top cracks armor (sparks)
        const col = '#7a2ad0', fl = '#5ab8ff';
        pep(-10, -12, .35, 1.15, true, col, fl); pep(9, -14, -.3, 1.15, true, col, fl); pep(-1, -25, .06, 1.2, true, col, fl);
        if (top) { pep(-15, -24, .6, 1, true, col, fl); pep(14, -26, -.55, 1, true, col, fl); sparkle(c, 0, -40, 3.2, '#cfe8ff'); sparkle(c, -18, -38, 2.4, GOLD); }
      }
      if (L < 3) sparkle(c, -12 * bu, -29 * bu, 2.6, '#ffffff');
      break;
    }
    case 'mint': {
      const leavesOf = (l) => [
        [[-2, -2, -2.55, 15], [2, -2, -.6, 15], [0, -5, -1.57, 15]],
        [[-2, -2, -2.7, 15], [2, -2, -.45, 15], [-2, -10, -2.2, 14], [2, -11, -.95, 14], [0, -14, -1.57, 13]],
        [[-3, -1, -2.95, 18], [3, -1, -.2, 18], [-2, -5, -2.5, 18], [2, -5, -.65, 18], [-2, -13, -2.1, 17], [2, -13, -1.05, 17], [0, -17, -1.57, 15]],
      ][l - 1];
      const leaves = (l, frosty) => { for (const [dx, dy, a, len] of leavesOf(l)) hdLeaf(c, dx, dy, len, a, a === -1.57 ? '#a6efd6' : frosty ? (dy > -10 ? '#7fd8c8' : '#b8f2e6') : l === 3 && dy > -10 ? '#55c9a2' : '#72d6b4', { w: .55 }); };
      if (L <= 2) {
        glow(c, 0, [-10, -13][L - 1], [20, 23][L - 1], '190,245,255', .6); leaves(L, false);
        if (L === 1) snowflake(c, 9, -24, 4); else { snowflake(c, -13, -26, 4); snowflake(c, 13, -25, 4); }
      } else if (br === 'a') { // cold: a frosty bush in a wide cold glow; the top (rime) crowned with crystals
        glow(c, 0, -18, top ? 34 : 29, '170,235,255', top ? .75 : .65); leaves(3, true);
        iceCrystal(c, 0, -38, 1.05); snowflake(c, -19, -27, 4.2); snowflake(c, 19, -26, 4.2);
        if (top) { iceCrystal(c, -12, -36, .8); iceCrystal(c, 12, -37, .8); sparkle(c, 0, -50, 3, '#ffffff'); }
        else snowflake(c, 11, -41, 3.4);
      } else { // icicle: a bush with a bent stalk holding a heavy icicle over the trail (two, gold, at the top)
        leaves(2, false);
        hdCurve(c, [0, -10, 12, -40, 20, -34], '#2f6f22', 4); hdCurve(c, [0, -10, 12, -40, 20, -34], '#62b344', 2);
        icicle(c, 20, -35, top ? 22 : 18, top ? 5.2 : 4.4, top);
        if (top) { hdCurve(c, [0, -10, -10, -38, -17, -32], '#2f6f22', 3.4); hdCurve(c, [0, -10, -10, -38, -17, -32], '#62b344', 1.7); icicle(c, -17, -33, 16, 3.8, true); }
      }
      break;
    }
    case 'flytrap': {
      // open jaws wait for a bug; frame 1 = shut and chewing
      const shut = o.frame === 1, lip = L >= 3 ? '#a8102e' : '#ff5c80';
      const heads = L === 1 ? [[-4, -21, -.62, .95]] : L === 2 ? [[9, -10, -.05, .66], [-6, -25, -.72, 1.12]]
        : br === 'a' ? (top ? [[-11, -24, -2.2, 1.25], [11, -26, -.9, 1.25]] : [[9, -10, -.05, .7], [-2, -28, -.9, 1.35]]) // the glutton: one big mouth, two at the top
        : [[-9, -14, -2.5, .85], [9, -12, -.2, .85]];
      if (br === 'b') { // the lure: a nectar flower high in the middle, glowing
        glow(c, 0, -38, top ? 26 : 19, '255,214,90', top ? .7 : .5);
        hdCurve(c, [0, 0, 1, -20, 0, -36], '#2f6f22', 4); hdCurve(c, [0, 0, 1, -20, 0, -36], '#62b344', 2);
        for (let n = 0; n < 6; n++) { const a = n / 6 * TAU; hdBall(c, Math.cos(a) * 5, -38 + Math.sin(a) * 5, 3.6, 3.2, '#ff7aa8', { rot: a, noSpec: true, olk: .6, noBounce: true }); }
        hdBall(c, 0, -38, 3.2, 3.2, '#ffd84a', { olk: .6, noBounce: true }); c.beginPath(); c.arc(4, -30, 1.8, 0, TAU); c.fillStyle = '#ffe680'; c.fill();
        if (top) { sparkle(c, -12, -48, 2.8, GOLD); sparkle(c, 13, -46, 2.4, GOLD); }
      }
      for (const [hx, hy] of heads) { hdCurve(c, [0, 0, hx * .1, hy * .7, hx, hy], '#2f6f22', 5); hdCurve(c, [0, 0, hx * .1, hy * .7, hx, hy], '#62b344', 2.8); }
      hdLeaf(c, 0, -1, 12 + L, -2.9, '#4fae3a', { w: .4 }); hdLeaf(c, 0, -1, 12 + L, -.25, '#5fbf45', { w: .4 });
      for (const [hx, hy, a, u] of heads) trapHead(c, hx, hy, a, u, shut, lip);
      if (br === 'a' && top) sparkle(c, 0, -44, 3, GOLD);
      break;
    }
  }
  c.restore();
}

// ---------- fruit with a face ----------
function hdApple(c, x, y, r, o = {}) {
  c.save(); c.translate(x, y);
  const body = cc => { cc.moveTo(0, -r * .7); cc.bezierCurveTo(r * .9, -r * 1.25, r * 1.38, r * .1, r * .62, r * .86); cc.bezierCurveTo(r * .3, r * 1.06, -r * .3, r * 1.06, -r * .62, r * .86); cc.bezierCurveTo(-r * 1.38, r * .1, -r * .9, -r * 1.25, 0, -r * .7); };
  hdBlob(c, body, '#e8352c', 0, 0, r * 1.05, { olk: 1.2 });
  if (o.bite) { c.save(); c.beginPath(); body(c); c.clip(); c.beginPath(); for (let i = 0; i <= 18; i++) { const a = i / 18 * TAU, rr2 = r * .32 * (i % 2 ? .88 : 1.05); c.lineTo(r * .95 + Math.cos(a) * rr2, -r * .1 + Math.sin(a) * rr2); } c.closePath(); c.fillStyle = '#fff4d6'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#ecd08e'; c.stroke(); c.restore(); }
  hdSpec(c, -r * .45, -r * .25, r * .16, r * .3, -.3);
  hdSpec(c, -r * .2, -r * .55, r * .08, r * .06, 0, .9);
  hdBlob(c, cc => { cc.moveTo(-1.5, -r * .66); cc.quadraticCurveTo(-1, -r * 1.05, 3, -r * 1.15); cc.lineTo(4, -r * 1.05); cc.quadraticCurveTo(2, -r, 2, -r * .66); cc.closePath(); }, '#6b4423', 1, -r * .9, 4);
  hdLeaf(c, 3, -r * 1.0, r * .62, -.45, '#5bbf45', { w: .45 });
  if (o.noFace) { c.restore(); return; } // the game draws a live face on top
  // face looking at the bugs
  const lk = o.look || [1, 0];
  hdEye(c, -r * .25, -r * .02, r * .2, lk); hdEye(c, r * .22, -r * .02, r * .2, lk);
  c.save(); c.lineCap = 'round'; c.strokeStyle = '#4a1010'; c.lineWidth = 2;
  if (o.worried) { c.beginPath(); c.moveTo(-r * .42, -r * .32); c.lineTo(-r * .14, -r * .26); c.moveTo(r * .4, -r * .32); c.lineTo(r * .12, -r * .26); c.stroke(); c.beginPath(); c.ellipse(0, r * .36, r * .1, r * .07, 0, 0, TAU); c.fillStyle = '#5a1010'; c.fill(); }
  else { c.beginPath(); c.arc(0, r * .25, r * .16, .2, Math.PI - .2); c.stroke(); }
  c.restore();
  c.save(); c.globalAlpha = .5; for (const sg of [-1, 1]) { c.beginPath(); c.ellipse(sg * r * .45, r * .25, r * .12, r * .07, 0, 0, TAU); c.fillStyle = '#ff9aa0'; c.fill(); } c.restore();
  if (o.sweat) { hdBlob(c, cc => { cc.moveTo(r * .62, -r * .55); cc.quadraticCurveTo(r * .78, -r * .3, r * .62, -r * .22); cc.quadraticCurveTo(r * .46, -r * .3, r * .62, -r * .55); }, '#9fe0ff', r * .62, -r * .35, 5); }
  c.restore();
}
function hdStump(c, x, y, r) {
  hdShadow(c, x, y + r * .55, r * 1.25, r * .4, 1.2);
  hdBlob(c, cc => { cc.moveTo(x - r, y - r * .2); cc.lineTo(x - r * 1.05, y + r * .45); cc.quadraticCurveTo(x, y + r * .85, x + r * 1.05, y + r * .45); cc.lineTo(x + r, y - r * .2); cc.closePath(); }, '#8a5632', x, y + r * .2, r);
  c.save(); c.globalAlpha = .35; c.strokeStyle = '#4a2a14'; c.lineWidth = 1.2; for (const dx of [-.6, -.2, .25, .65]) { c.beginPath(); c.moveTo(x + dx * r, y); c.lineTo(x + dx * r * 1.04, y + r * .6); c.stroke(); } c.restore();
  hdBall(c, x, y - r * .2, r, r * .42, '#e2b06e', { noSpec: true });
  c.save(); c.strokeStyle = 'rgba(160,100,50,.7)'; c.lineWidth = 1.2; for (const k of [.3, .55, .8]) { c.beginPath(); c.ellipse(x, y - r * .2, r * k, r * .42 * k, 0, 0, TAU); c.stroke(); } c.restore();
  for (const [dx, rr2] of [[-.85, .22], [-.65, .17], [.8, .2]]) hdBall(c, x + dx * r, y + r * .3, r * rr2, r * rr2 * .7, '#6cc04a', { specA: .4 });
}
function hdAnthill(c, x, y, s = 1) {
  c.save(); c.translate(x, y); c.scale(s, s);
  hdShadow(c, 0, 10, 30, 10, 1.2);
  hdBlob(c, cc => { cc.moveTo(-30, 10); cc.quadraticCurveTo(-18, -18, 0, -20); cc.quadraticCurveTo(18, -18, 30, 10); cc.quadraticCurveTo(0, 18, -30, 10); }, '#b57a46', 0, -2, 26);
  c.beginPath(); c.ellipse(0, -10, 9, 5, 0, 0, TAU); const g = c.createRadialGradient(0, -10, 1, 0, -10, 9); g.addColorStop(0, '#120804'); g.addColorStop(1, '#4a2a14'); c.fillStyle = g; c.fill();
  const R = rng(8); for (let i = 0; i < 18; i++) { c.beginPath(); c.arc((R() - .5) * 46, -4 + R() * 12, 1 + R() * 1.4, 0, TAU); c.fillStyle = R() > .5 ? '#d9a46a' : '#8a5632'; c.fill(); }
  c.restore();
}
function hdRock(c, x, y, s = 1) { c.save(); c.translate(x, y); c.scale(s, s); hdShadow(c, 0, 7, 17, 6, 1.1); hdBlob(c, cc => { cc.moveTo(-16, 6); cc.quadraticCurveTo(-17, -8, -4, -11); cc.quadraticCurveTo(12, -13, 16, 0); cc.quadraticCurveTo(17, 9, 0, 10); cc.quadraticCurveTo(-12, 11, -16, 6); }, '#a9a294', 0, -2, 16); hdBall(c, 7, 6, 5, 3, '#8fbf6a', { noSpec: true, olk: .6 }); c.restore(); }
function hdLog(c, x, y, w) {
  hdShadow(c, x, y + 10, w / 2 + 4, 7, 1.1);
  c.save(); const g = c.createLinearGradient(0, y - 10, 0, y + 10); g.addColorStop(0, '#b47a48'); g.addColorStop(.4, '#9a6236'); g.addColorStop(1, '#6a3e20'); c.beginPath(); rrect(c, x - w / 2, y - 10, w, 20, 9); c.fillStyle = g; c.fill(); if (S.ol) { c.lineWidth = S.olw; c.strokeStyle = olOf('#9a6236'); c.stroke(); } c.restore();
  hdBall(c, x + w / 2 - 4, y, 6, 9.5, '#e2b06e', { noSpec: true });
  hdBall(c, x - w / 4, y - 9, 6, 3, '#7ccf52', { specA: .4, olk: .6 });
}

// ---------- terrain ----------
function hdGrass(c, o = {}) {
  const base = o.base || T.grass;
  const g = c.createLinearGradient(0, 0, 0, LH); g.addColorStop(0, base[0]); g.addColorStop(1, base[1]); c.fillStyle = g; c.fillRect(0, 0, LW, LH);
  const R = rng(o.seed ?? 5);
  for (let i = 0; i < 26; i++) { const x = R() * LW, y = R() * LH, r = 30 + R() * 70, light = R() > .5; const gg = c.createRadialGradient(x, y, 1, x, y, r); gg.addColorStop(0, light ? `rgba(${T.patch[0]},${T.patchA[0]})` : `rgba(${T.patch[1]},${T.patchA[1]})`); gg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gg; c.fillRect(x - r, y - r, r * 2, r * 2); }
  c.save(); c.lineCap = 'round';
  for (let i = 0; i < 2600; i++) { const x = R() * LW, y = R() * LH, l = 3 + R() * 5, k = R(); c.strokeStyle = k < .45 ? T.blades[0] : k < .8 ? T.blades[1] : T.blades[2]; c.lineWidth = 1.1; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (R() - .5) * 3, y - l); c.stroke(); }
  c.restore();
  // little flowers and clover patches
  for (let i = 0; i < T.flowerN; i++) { const x = R() * LW, y = R() * LH, col = T.flowers[i % T.flowers.length]; for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + R(); c.beginPath(); c.ellipse(x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6, 2.3, 1.6, a, 0, TAU); c.fillStyle = col; c.fill(); } c.beginPath(); c.arc(x, y, 1.5, 0, TAU); c.fillStyle = '#ffcf3a'; c.fill(); }
}
function hdPath(c, pts, w = 30, seed = 1) {
  c.save(); c.filter = 'blur(4px)'; strokePts(c, pts, w + 12, 'rgba(40,80,20,.35)'); c.restore();
  strokePts(c, pts, w + 5, '#7e5130');
  strokePts(c, pts, w, '#c48d55');
  c.save(); c.filter = 'blur(5px)'; strokePts(c, pts, w * .5, 'rgba(236,196,140,.75)'); c.restore();
  const R = rng(seed);
  for (let i = 0; i < pts.length * 1.4; i++) { const p = along(pts, R()); const ox = (R() - .5) * w * .8, oy = (R() - .5) * w * .8; c.beginPath(); c.arc(p.x + ox, p.y + oy, .8 + R() * 1.3, 0, TAU); c.fillStyle = R() > .5 ? 'rgba(110,70,35,.5)' : 'rgba(250,220,170,.6)'; c.fill(); }
  for (let i = 0; i < pts.length * .25; i++) { const p = along(pts, R()); const ox = (R() - .5) * w * .7, oy = (R() - .5) * w * .7; hdBall(c, p.x + ox, p.y + oy, 2 + R() * 2, 1.5 + R() * 1.4, R() > .5 ? '#b8ad9c' : '#d6c4a4', { olk: .5, specA: .7 }); }
  // grass tufts hanging over the edges
  c.save(); c.lineCap = 'round';
  for (let i = 0; i < pts.length * .45; i++) {
    const t = R(), p = along(pts, t), nx = -Math.sin(p.a), ny = Math.cos(p.a), sg = R() > .5 ? 1 : -1;
    const bx = p.x + nx * sg * (w / 2 + 2), by = p.y + ny * sg * (w / 2 + 2);
    for (let k = 0; k < 3; k++) { const ex = bx - nx * sg * (2 + R() * 4) + (R() - .5) * 5, ey = by - ny * sg * (4 + R() * 5) - 3 - R() * 3; c.strokeStyle = k % 2 ? '#5aa83e' : '#7ccc55'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(bx + (R() - .5) * 4, by); c.lineTo(ex, ey); c.stroke(); }
  }
  c.restore();
}
function hdBorderBushes(c, seed = 2) {
  const R = rng(seed);
  c.save(); const g = c.createLinearGradient(0, 0, 0, 40); g.addColorStop(0, 'rgba(20,60,15,.45)'); g.addColorStop(1, 'rgba(20,60,15,0)'); c.fillStyle = g; c.fillRect(0, 0, LW, 40); c.restore();
  for (let x = 60; x < LW + 30; x += 34 + R() * 20) { const y = -6 + R() * 8, r = 16 + R() * 10; hdBall(c, x, y, r, r * .8, R() > .5 ? '#3d8f30' : '#4a9e38', { specA: .35 }); if (R() > .6) hdBall(c, x + 6, y + 6, 3.5, 3.5, R() > .5 ? '#ff6a8a' : '#fff4a0', { specA: .6, olk: .6 }); }
}
function hdForeground(c) {
  c.save(); c.filter = 'blur(2.5px)';
  for (const [x, y, l, a, col] of [[520, LH + 14, 70, -2.2, '#3a8a2c'], [560, LH + 18, 60, -1.3, '#2f7a24'], [70, LH + 20, 60, -1.0, '#4a9e38']]) hdLeaf(c, x, y, l, a, col, { w: .38, noOl: true });
  c.restore();
}
function hdVignette(c) { const g = c.createRadialGradient(LW / 2, LH / 2, LH * .45, LW / 2, LH / 2, LW * .62); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(20,40,10,.35)'); c.fillStyle = g; c.fillRect(0, 0, LW, LH); }
function hdSunlight(c) { c.save(); c.globalCompositeOperation = 'screen'; const g = c.createRadialGradient(80, -40, 10, 80, -40, 520); g.addColorStop(0, 'rgba(255,250,200,.45)'); g.addColorStop(1, 'rgba(255,250,200,0)'); c.fillStyle = g; c.fillRect(0, 0, LW, LH); c.restore(); }
function hdMotes(c, n = 30, seed = 4) { const R = rng(seed); for (let i = 0; i < n; i++) { const x = R() * LW, y = R() * LH, r = .8 + R() * 1.8; c.save(); c.shadowColor = '#fffbe0'; c.shadowBlur = 6; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = 'rgba(255,253,225,.75)'; c.fill(); c.restore(); } }

// ---------- effects ----------
function fxThorn(c, x, y, a, len = 26) {
  c.save(); c.translate(x, y); c.rotate(a);
  const g = c.createLinearGradient(-len, 0, 0, 0); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,250,220,.9)'); c.strokeStyle = g; c.lineWidth = 3.5; c.lineCap = 'round'; c.beginPath(); c.moveTo(-len, 0); c.lineTo(-4, 0); c.stroke();
  hdBlob(c, cc => { cc.moveTo(8, 0); cc.lineTo(-4, -3.4); cc.lineTo(-2, 0); cc.lineTo(-4, 3.4); cc.closePath(); }, '#f6e6b0', 1, 0, 6, { olk: .7 });
  c.restore();
}
function fxKernel(c, x0, y0, x1, y1, t) {
  const mx = (x0 + x1) / 2, my = Math.min(y0, y1) - 50;
  c.save(); c.setLineDash([2, 5]); c.strokeStyle = 'rgba(255,240,170,.75)'; c.lineWidth = 2; c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(mx, my, x1, y1); c.stroke(); c.restore();
  const bx = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * mx + t * t * x1, by = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * my + t * t * y1;
  hdBall(c, bx, by, 4.2, 4.2, '#ffd23f', { olk: .7 });
}
function fxStar(c, x, y, r, col = '#fff6b0') { c.save(); c.translate(x, y); c.shadowColor = col; c.shadowBlur = 10; c.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr2 = i % 2 ? r * .32 : r; c.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); } c.closePath(); c.fillStyle = col; c.fill(); c.restore(); }
function fxHit(c, x, y, r = 14) { fxStar(c, x, y, r, '#ffffff'); c.save(); c.strokeStyle = 'rgba(255,240,180,.9)'; c.lineWidth = 2; c.lineCap = 'round'; for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + .3; c.beginPath(); c.moveTo(x + Math.cos(a) * r * .8, y + Math.sin(a) * r * .8); c.lineTo(x + Math.cos(a) * r * 1.3, y + Math.sin(a) * r * 1.3); c.stroke(); } c.restore(); }
function fxDmg(c, s, x, y, col = '#ffe14a') { hdText(c, s, x, y, 15, col, { stroke: '#5a1a08', sw: 4.5 }); }
function fxFrost(c, x, y, r) {
  c.save(); const g = c.createRadialGradient(x, y, r * .2, x, y, r); g.addColorStop(0, 'rgba(200,245,255,.0)'); g.addColorStop(.75, 'rgba(170,235,255,.28)'); g.addColorStop(1, 'rgba(170,235,255,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  c.setLineDash([3, 6]); c.strokeStyle = 'rgba(230,252,255,.8)'; c.lineWidth = 1.6; c.beginPath(); c.arc(x, y, r * .85, 0, TAU); c.stroke(); c.restore();
}
function fxIced(c, x, y, r = 13) { c.save(); c.beginPath(); c.ellipse(x, y, r * 1.2, r, 0, 0, TAU); c.fillStyle = 'rgba(160,225,255,.22)'; c.fill(); c.strokeStyle = 'rgba(220,248,255,.75)'; c.lineWidth = 1.2; c.stroke(); for (const [dx, dy] of [[-12, -7], [11, -6]]) fxStar(c, x + dx, y + dy, 2.6, '#ffffff'); c.restore(); }
function fxFire(c, x, y, r) {
  c.save(); c.globalCompositeOperation = 'lighter'; const g = c.createRadialGradient(x, y, 1, x, y, r); g.addColorStop(0, 'rgba(255,250,200,.95)'); g.addColorStop(.35, 'rgba(255,190,60,.8)'); g.addColorStop(.7, 'rgba(240,80,30,.45)'); g.addColorStop(1, 'rgba(200,40,20,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.restore();
  const R = rng(x | 0); for (let i = 0; i < 7; i++) { const a = R() * TAU, d = r * (.5 + R() * .5); hdBall(c, x + Math.cos(a) * d, y + Math.sin(a) * d - 4, 3 + R() * 3, 3 + R() * 3, R() > .5 ? '#ffb02e' : '#ff6a1e', { noOl: true, specA: .3 }); }
  for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(x + (R() - .5) * r, y - r * .8 - R() * 10, 4 + R() * 4, 0, TAU); c.fillStyle = 'rgba(120,110,100,.35)'; c.fill(); }
}
function fxDropFly(c, x0, y0, x1, y1) {
  const mx = (x0 + x1) / 2, my = Math.min(y0, y1) - 40;
  c.save(); c.strokeStyle = 'rgba(190,240,255,.55)'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(mx, my, x1, y1); c.stroke(); c.restore();
  hdDrop(c, x1, y1, 7);
}
function hdDrop(c, x, y, r) {
  hdBlob(c, cc => { cc.moveTo(x, y - r * 1.3); cc.bezierCurveTo(x + r * .95, y - r * .2, x + r, y + r, x, y + r); cc.bezierCurveTo(x - r, y + r, x - r * .95, y - r * .2, x, y - r * 1.3); }, '#4ec3f6', x, y, r * 1.1, { olk: .8 });
  hdSpec(c, x - r * .35, y + r * .05, r * .2, r * .38, .3);
}
function hdHp(c, x, y, w, v, col = '#7be05a') {
  c.save(); c.beginPath(); rrect(c, x - w / 2 - 1.5, y - 1.5, w + 3, 8, 4); c.fillStyle = 'rgba(30,15,10,.75)'; c.fill();
  c.beginPath(); rrect(c, x - w / 2, y, Math.max(4, w * v), 5, 2.5); const g = c.createLinearGradient(0, y, 0, y + 5); g.addColorStop(0, lighten(col, .3)); g.addColorStop(1, col); c.fillStyle = g; c.fill(); c.restore();
}

// ---------- UI ----------
function uiPanel(c, x, y, w, h, r, col, o = {}) {
  c.save();
  c.beginPath(); rrect(c, x, y + 3, w, h, r); c.fillStyle = o.edge || darken(col, .38); c.fill();
  c.beginPath(); rrect(c, x, y, w, h, r); const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, lighten(col, .18)); g.addColorStop(1, col); c.fillStyle = g; c.fill();
  c.beginPath(); rrect(c, x + 3, y + 2, w - 6, h * .42, Math.max(2, r - 3)); c.fillStyle = 'rgba(255,255,255,.22)'; c.fill();
  if (o.ol !== false) { c.beginPath(); rrect(c, x, y, w, h, r); c.lineWidth = o.olw ?? 2; c.strokeStyle = o.ol || darken(col, .55); c.stroke(); }
  c.restore();
}
function uiRound(c, x, y, r, col, draw, badge) {
  c.save(); c.beginPath(); c.arc(x, y + 3, r, 0, TAU); c.fillStyle = darken(col, .4); c.fill();
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = hdGrad(c, x, y, r, col, .8); c.fill(); c.lineWidth = 2.2; c.strokeStyle = darken(col, .55); c.stroke();
  c.beginPath(); c.ellipse(x, y - r * .45, r * .62, r * .32, 0, 0, TAU); c.fillStyle = 'rgba(255,255,255,.28)'; c.fill(); c.restore();
  draw(x, y);
  if (badge) { c.save(); c.beginPath(); c.arc(x + r * .72, y - r * .68, 9, 0, TAU); c.fillStyle = '#ff4646'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#ffffff'; c.stroke(); c.restore(); hdText(c, badge, x + r * .72, y - r * .68 + .5, 11, '#fff', { stroke: null }); }
}
function iconFrost(x, y, c) { c.save(); c.strokeStyle = '#ffffff'; c.lineWidth = 2.6; c.lineCap = 'round'; for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; c.beginPath(); c.moveTo(x - Math.cos(a) * 9, y - Math.sin(a) * 9); c.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9); c.stroke(); } c.restore(); }
function iconRain(x, y, c) { for (const [dx, dy, r] of [[-5, -1, 5], [2, -4, 6.5], [7, 0, 4.5]]) { c.beginPath(); c.arc(x + dx, y + dy, r, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); } c.fillStyle = '#ffffff'; c.fillRect(x - 5, y - 1, 12, 5); for (const dx of [-4, 1, 6]) hdDrop(c, x + dx, y + 9, 2.4); }
function iconBirds(x, y, c) { c.save(); c.strokeStyle = '#ffffff'; c.lineWidth = 2.6; c.lineCap = 'round'; c.lineJoin = 'round'; for (const [dx, dy, s] of [[-3, -3, 1], [5, 4, .7]]) { c.beginPath(); c.moveTo(x + dx - 8 * s, y + dy - 2 * s); c.quadraticCurveTo(x + dx - 4 * s, y + dy - 7 * s, x + dx, y + dy); c.quadraticCurveTo(x + dx + 4 * s, y + dy - 7 * s, x + dx + 8 * s, y + dy - 2 * s); c.stroke(); } c.restore(); }


// Polish layer: overrides by assignment so the base shapes can be wrapped.

function noise1(seed) { const R = rng(seed), ph = [R() * 9, R() * 9, R() * 9]; return t => Math.sin(t * .045 + ph[0]) * .5 + Math.sin(t * .11 + ph[1]) * .32 + Math.sin(t * .27 + ph[2]) * .18; }

// Ball: add bounce light from the grass and a thin rim.
hdBall = function (c, x, y, rx, ry, col, o = {}) {
  c.save(); c.translate(x, y); if (o.rot) c.rotate(o.rot);
  const r = Math.max(rx, ry);
  c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, TAU); c.fillStyle = hdGrad(c, 0, 0, r, col, o.k ?? 1); c.fill();
  if (!o.noBounce && r > 3.5) { c.save(); c.clip(); const g = c.createRadialGradient(rx * .25, ry * .95, 1, rx * .25, ry * .95, r * .9); g.addColorStop(0, 'rgba(255,250,190,.33)'); g.addColorStop(1, 'rgba(255,250,190,0)'); c.fillStyle = g; c.fillRect(-rx, -ry, rx * 2, ry * 2); c.restore(); }
  if (S.ol && !o.noOl) { c.lineWidth = S.olw * (o.olk ?? 1); c.strokeStyle = olOf(col); c.stroke(); }
  if (!o.noSpec) { hdSpec(c, -rx * .38, -ry * .5, rx * .32, ry * .18, -.5, o.specA ?? 1); if (r > 5) hdSpec(c, -rx * .12, -ry * .72, rx * .08, ry * .06, 0, (o.specA ?? 1) * .9); }
  c.restore();
};

// Legs: outlined, thicker, with a knee.
let LEG = 0; // walk cycle: legs on alternate sides swing forward/back
export function setLeg(v) { LEG = v; }
hdLegs = function (c, xs, len, col, w = 1.7) {
  for (const pass of [0, 1]) xs.forEach((x, k) => { for (const s of [-1, 1]) {
    const sw = ((k + (s > 0 ? 1 : 0)) % 2 ? 1 : -1) * LEG * len * .32;
    c.save(); c.beginPath(); c.moveTo(x, s * 2); c.lineTo(x + len * .3 + sw * .5, s * len * .85); c.lineTo(x - len * .05 + sw, s * len * 1.4);
    c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = pass ? w * 1.15 : w * 1.15 + 2; c.strokeStyle = pass ? '#6a3a24' : '#22100a'; c.stroke(); c.restore();
  } });
};

// Organic path: stamped circles with a noisy radius, worn middle, ruts, sparse pebbles, twigs.
hdPath = function (c, pts, w = 30, seed = 1) {
  const N = noise1(seed), total = pts.reduce((s, p, i) => i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0, 0), step = 2.5;
  const stamp = (grow, col, blur) => { c.save(); if (blur) c.filter = `blur(${blur}px)`; c.fillStyle = col; c.beginPath(); for (let d = 0; d <= total; d += step) { const p = along(pts, d / total), r = w / 2 + N(d) * 3.2 + grow; c.moveTo(p.x + r, p.y); c.arc(p.x, p.y, r, 0, TAU); } c.fill(); c.restore(); };
  if (CAN_BLUR) stamp(9, `rgba(${T.path.glow},.30)`, 5); else for (const g of [13, 9, 5]) stamp(g, `rgba(${T.path.glow},.1)`);
  stamp(3, T.path.edge);
  stamp(0, T.path.fill);
  if (CAN_BLUR) { c.save(); c.filter = 'blur(6px)'; strokePts(c, pts, w * .55, `rgba(${T.path.mid},.8)`); c.restore(); }
  else for (const k of [.7, .55, .4, .25]) strokePts(c, pts, w * k, `rgba(${T.path.mid},.24)`);
  for (const off of [-.2, .2]) { const rut = []; for (let d = 0; d <= total; d += 6) { const p = along(pts, d / total); rut.push([p.x - Math.sin(p.a) * w * off, p.y + Math.cos(p.a) * w * off]); } c.save(); if (CAN_BLUR) c.filter = 'blur(1.5px)'; strokePts(c, rut, 2.4, 'rgba(110,65,30,.18)'); c.restore(); }
  const R = rng(seed + 7);
  for (let i = 0; i < total / 3; i++) { const p = along(pts, R()), ox = (R() - .5) * w * .85, oy = (R() - .5) * w * .85; c.beginPath(); c.arc(p.x + ox, p.y + oy, .6 + R() * 1.1, 0, TAU); c.fillStyle = R() > .5 ? 'rgba(100,60,28,.45)' : 'rgba(255,228,180,.55)'; c.fill(); }
  for (let i = 0; i < total / 55; i++) { const p = along(pts, R()), ox = (R() - .5) * w * .7, oy = (R() - .5) * w * .7, cols = ['#c9b79a', '#a89a86', '#d8b48a', '#9c8a76']; hdBall(c, p.x + ox, p.y + oy, 2.2 + R() * 2.4, 1.6 + R() * 1.6, cols[i % 4], { olk: .45, specA: .6, rot: R() * 3, noBounce: true }); }
  for (let i = 0; i < total / 260; i++) { const p = along(pts, R()), ox = (R() - .5) * w * .5; c.save(); c.translate(p.x + ox, p.y); c.rotate(R() * 3); hdLine(c, [-7, 0, 7, 1], '#6a4424', 2); hdLine(c, [2, .5, 6, -3], '#6a4424', 1.4); c.restore(); }
  for (let i = 0; i < total / 300; i++) { const p = along(pts, R()); hdLeaf(c, p.x + (R() - .5) * w * .6, p.y + (R() - .5) * w * .5, 7, R() * 6, R() > .5 ? '#e0a23a' : '#c8642a', { w: .5 }); }
  // grass blades leaning over the edge
  for (let i = 0; i < total / 9; i++) {
    const d = R() * total, p = along(pts, d / total), nx = -Math.sin(p.a), ny = Math.cos(p.a), sg = R() > .5 ? 1 : -1, r = w / 2 + N(d) * 3.2 + 2;
    const bx = p.x + nx * sg * r, by = p.y + ny * sg * r;
    for (let k = 0; k < 3; k++) { const l = 4 + R() * 5, tx = bx - nx * sg * l * .7 + (R() - .5) * 4, ty = by - ny * sg * l * .7 - l * .6; bladeTri(c, bx + (R() - .5) * 4, by, tx, ty, 1.6, k % 2 ? T.path.blades[0] : T.path.blades[1]); }
  }
};
function bladeTri(c, x0, y0, x1, y1, w, col) {
  const a = Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2, dx = Math.cos(a) * w, dy = Math.sin(a) * w;
  c.beginPath(); c.moveTo(x0 - dx, y0 - dy); c.lineTo(x1, y1); c.lineTo(x0 + dx, y0 + dy); c.closePath();
  const g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, darken(col, .25)); g.addColorStop(1, lighten(col, .3)); c.fillStyle = g; c.fill();
}

// Grass: base from hd.js, then clumps, clover patches, daisies, fallen leaves, little mushrooms.
const _grass0 = hdGrass;
hdGrass = function (c, o = {}) {
  _grass0(c, o);
  const R = rng((o.seed ?? 5) + 40);
  for (let i = 0; i < 26; i++) { const x = R() * LW, y = 40 + R() * (LH - 40); for (let k = 0; k < 3; k++) { const a = -1.57 + (k - 1) * .6 + (R() - .5) * .3; c.save(); c.translate(x + (k - 1) * 3, y); c.rotate(a); hdBlob(c, cc => { cc.moveTo(0, 6); cc.bezierCurveTo(-7, 0, -4, -6, 0, -2); cc.bezierCurveTo(4, -6, 7, 0, 0, 6); }, k === 1 ? T.clover[0] : T.clover[1], 0, 1, 6, { noOl: true }); c.restore(); } }
  for (let i = 0; i < 70; i++) { const x = R() * LW, y = 40 + R() * (LH - 40), n = 4 + (R() * 4 | 0); for (let k = 0; k < n; k++) bladeTri(c, x + (k - n / 2) * 2, y, x + (k - n / 2) * 3.4 + (R() - .5) * 3, y - 7 - R() * 7, 1.5, R() > .5 ? T.tuft[0] : T.tuft[1]); }
  for (let i = 0; i < T.daisyN; i++) { const x = R() * LW, y = 50 + R() * (LH - 60); for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; c.save(); c.translate(x, y); c.rotate(a); c.beginPath(); c.ellipse(5, 0, 4, 1.8, 0, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); c.lineWidth = .8; c.strokeStyle = 'rgba(120,120,140,.5)'; c.stroke(); c.restore(); } hdBall(c, x, y, 2.6, 2.6, '#ffc72a', { olk: .5, noBounce: true }); }
  for (let i = 0; i < T.leafN; i++) hdLeaf(c, R() * LW, 50 + R() * (LH - 60), 9, R() * 6, T.leaves[i % T.leaves.length], { w: .5 });
  for (let i = 0; i < T.shroomN; i++) { const x = R() * LW, y = 60 + R() * (LH - 80); hdBall(c, x, y + 2, 2, 4, '#f4ead6', { noSpec: true, olk: .6 }); hdBlob(c, cc => { cc.ellipse(x, y - 1, 6, 4.5, 0, Math.PI, TAU); cc.closePath(); }, '#c8743a', x, y - 2, 6, { olk: .7 }); }
  // theme extras: fallen petals, damp glossy spots
  const E = rng((o.seed ?? 5) + 90);
  for (let i = 0; i < T.petalN; i++) { const x = E() * LW, y = 40 + E() * (LH - 40); c.save(); c.translate(x, y); c.rotate(E() * 6); c.beginPath(); c.ellipse(0, 0, 3.2, 1.9, 0, 0, TAU); c.fillStyle = E() > .5 ? '#ffe4ec' : '#ffffff'; c.fill(); c.lineWidth = .7; c.strokeStyle = 'rgba(200,110,130,.55)'; c.stroke(); c.restore(); }
  for (let i = 0; i < T.dampN; i++) { const x = E() * LW, y = 50 + E() * (LH - 60), r = 9 + E() * 9; c.save(); c.beginPath(); wobbly(c, x, y, r, r * .6, i + 3, .16, 9); c.fillStyle = 'rgba(14,92,110,.3)'; c.fill(); c.lineWidth = 1; c.strokeStyle = 'rgba(200,255,240,.35)'; c.stroke(); c.beginPath(); c.ellipse(x - r * .3, y - r * .18, r * .3, r * .08, -.2, 0, TAU); c.fillStyle = 'rgba(255,255,255,.5)'; c.fill(); c.restore(); }
};

// Dappled light under unseen trees plus a warm/cool grade.
function hdDapple(c) {
  c.save(); c.globalCompositeOperation = 'multiply';
  for (const [x, y, rx, ry] of [[760, 330, 120, 70], [820, 120, 70, 90], [230, 360, 110, 40], [450, 0, 160, 40], [90, 120, 90, 60]]) softBlob(c, x / 844 * LW, y / 390 * LH, rx + 22, ry + 22, .3, T.dapple[0], T.dapple[1]);
  c.restore();
  c.save(); c.globalCompositeOperation = 'screen';
  for (const [x, y, r] of [[330, 140, 34], [520, 260, 40], [690, 190, 28], [180, 270, 30]]) softBlob(c, x / 844 * LW, y / 390 * LH, r + 12, r + 12, 0, T.dapple[2], T.dapple[3]);
  c.restore();
}
function hdGrade(c) {
  c.save(); c.globalCompositeOperation = 'soft-light'; const g = c.createLinearGradient(0, 0, LW, LH); g.addColorStop(0, T.grade[0]); g.addColorStop(1, T.grade[1]); c.fillStyle = g; c.fillRect(0, 0, LW, LH); c.restore();
}

// Top border: two layers of hedge with flowers and a soft cast shadow.
hdBorderBushes = function (c, seed = 2) {
  const R = rng(seed);
  c.save(); const sg = c.createLinearGradient(0, 0, 0, 40); sg.addColorStop(0, `rgba(${T.bush.shade},${T.bush.shadeA})`); sg.addColorStop(1, `rgba(${T.bush.shade},0)`); c.fillStyle = sg; c.fillRect(0, 0, LW, 40); c.restore();
  for (let x = 40; x < LW + 30; x += 30 + R() * 16) { const r = 18 + R() * 9; hdBall(c, x, -8 + R() * 6, r, r * .75, T.bush.back, { specA: .25, noBounce: true }); }
  for (let x = 70; x < LW + 30; x += 36 + R() * 22) { const y = 4 + R() * 6, r = 13 + R() * 7; hdBall(c, x, y, r, r * .78, R() > .5 ? T.bush.front[0] : T.bush.front[1], { specA: .35 });
    for (let k = 0; k < 3; k++) hdLeaf(c, x + (R() - .5) * r, y + r * .4, 7 + R() * 4, .8 + R() * 1.5, T.bush.leaf, { w: .45 });
    if (R() > .45) { const fx = x + (R() - .5) * r, fy = y + (R() - .5) * 6, col = T.bush.flowers[(R() * T.bush.flowers.length) | 0]; for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; hdBall(c, fx + Math.cos(a) * 3.2, fy + Math.sin(a) * 3.2, 2.6, 2.6, col, { noSpec: true, olk: .5, noBounce: true }); } hdBall(c, fx, fy, 1.8, 1.8, '#ffb52a', { noSpec: true, noOl: true }); } }
};

// Rock with moss and a crack.
hdRock = function (c, x, y, s = 1) {
  c.save(); c.translate(x, y); c.scale(s, s); hdShadow(c, 0, 7, 18, 6, 1.2);
  hdBlob(c, cc => { cc.moveTo(-16, 6); cc.quadraticCurveTo(-18, -8, -4, -11); cc.quadraticCurveTo(12, -14, 17, 0); cc.quadraticCurveTo(18, 9, 0, 10); cc.quadraticCurveTo(-12, 11, -16, 6); }, '#aaa395', 0, -3, 16);
  hdLine(c, [2, -10, 0, -4, 4, 1], 'rgba(70,64,56,.6)', 1.2);
  for (const [dx, dy, r] of [[8, 5, 5], [12, 2, 3.4], [-12, 4, 3]]) hdBall(c, dx, dy, r, r * .62, '#7fb85a', { noSpec: true, olk: .55, noBounce: true });
  hdSpec(c, -7, -6, 5, 2, -.3, .6);
  c.restore();
};

// Planted plants sit in a little bed of loose soil.
function hdSoil(c, x, y) {
  hdShadow(c, x, y + 1, 18, 6, .8);
  hdBlob(c, cc => cc.ellipse(x, y, 17, 6.5, 0, 0, TAU), '#7a4a28', x, y - 2, 16, { olk: .9 });
  c.save(); c.beginPath(); c.ellipse(x, y, 17, 6.5, 0, 0, TAU); c.clip(); const R = rng(x * 7 + y | 0); for (let i = 0; i < 9; i++) { c.beginPath(); c.arc(x + (R() - .5) * 28, y + (R() - .5) * 9, .8 + R() * 1.4, 0, TAU); c.fillStyle = R() > .5 ? 'rgba(170,110,60,.8)' : 'rgba(60,30,12,.6)'; c.fill(); } c.restore();
}



function hdSun2(c) { c.save(); c.globalCompositeOperation = 'screen'; const g = c.createRadialGradient(80, -40, 10, 80, -40, 480); g.addColorStop(0, `rgba(${T.sun2[0]},${T.sun2[1]})`); g.addColorStop(1, `rgba(${T.sun2[0]},0)`); c.fillStyle = g; c.fillRect(0, 0, LW, LH); c.restore(); }
function colorPop(c) {
  const cv = c.canvas, off = document.createElement('canvas'); off.width = cv.width; off.height = cv.height;
  const o = off.getContext('2d'); o.filter = 'saturate(1.14) contrast(1.06)'; o.drawImage(cv, 0, 0);
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(off, 0, 0); c.restore();
}


// ---------- ground tiles, pond, weeds, web (world units: one cell is 42 x 42, drawn centred) ----------
function hash2(x, y) { return (Math.imul(Math.round(x) + 977, 73856093) ^ Math.imul(Math.round(y) + 331, 19349663)) >>> 0; }
// Closed organic outline; sq > 0 pushes it towards a rounded square so a tile fills its cell.
function wobbly(c, x, y, rx, ry, seed, wob = .1, n = 12, sq = 0) {
  const R = rng(seed), P = []; R(); R();
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU, ca = Math.cos(a), sa = Math.sin(a), q = 1 + (1 / Math.pow(ca ** 4 + sa ** 4, .25) - 1) * sq, k = (1 + (R() - .5) * 2 * wob) * q;
    P.push([x + ca * rx * k, y + sa * ry * k]);
  }
  c.moveTo((P[n - 1][0] + P[0][0]) / 2, (P[n - 1][1] + P[0][1]) / 2);
  for (let i = 0; i < n; i++) { const p = P[i], q = P[(i + 1) % n]; c.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
  c.closePath();
}
// Flat serrated leaf seen from above.
function jagLeaf(c, x, y, len, ang, col, o = {}) {
  const w = o.w ?? .3, n = 5;
  c.save(); c.translate(x, y); c.rotate(ang); c.beginPath(); c.moveTo(0, 0);
  for (const sg of [-1, 1]) {
    for (let i = 1; i <= n * 2; i++) { const j = sg < 0 ? i : n * 2 - i, t = j / (n * 2), hw = Math.sin(Math.PI * Math.pow(t, .8)) * len * w * (j % 2 ? 1 : .62); if (j > 0 && j < n * 2) c.lineTo(len * t, sg * hw); }
    if (sg < 0) c.lineTo(len, 0);
  }
  c.closePath();
  const g = c.createLinearGradient(0, -len * w, 0, len * w); g.addColorStop(0, lighten(col, .22)); g.addColorStop(1, darken(col, .2)); c.fillStyle = g; c.fill();
  c.lineJoin = 'round'; c.lineWidth = o.ol ?? 1; c.strokeStyle = alpha(olOf(col), .85); c.stroke();
  c.beginPath(); c.moveTo(len * .1, 0); c.lineTo(len * .85, 0); c.strokeStyle = alpha(lighten(col, .4), .7); c.lineWidth = .8; c.stroke();
  c.restore();
}
// A stone path drawn as one band over all its cells (cells: [{ x, y, nb }], nb: the neighbours on the path, screen
// directions, bits N 1, E 2, S 4, W 8): a round cap on every cell and a straight piece to every neighbour, so the bends
// are soft and the stones of the path never stop at a cell's edge. Three passes over all the cells: the rim, the
// ground of the path, the cobbles.
const PATH_W = 17, STEP = [[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8]];
function bandPass(c, cells, w, col) {
  c.save(); c.fillStyle = col; c.strokeStyle = col; c.lineCap = 'butt'; c.lineWidth = w * 2;
  c.beginPath(); for (const { x, y } of cells) { c.moveTo(x + w, y); c.arc(x, y, w, 0, TAU); } c.fill();
  c.beginPath(); for (const { x, y, nb } of cells) for (const [dx, dy, b] of STEP) if (nb & b && (b === 2 || b === 4)) { c.moveTo(x, y); c.lineTo(x + dx * 42, y + dy * 42); } c.stroke();
  c.restore();
}
function hdStoneNet(c, cells) {
  c.save();
  bandPass(c, cells, PATH_W + 3.2, 'rgba(70,58,40,.28)');
  bandPass(c, cells, PATH_W + 1.6, '#8f826b');
  bandPass(c, cells, PATH_W, '#b3a78f');
  // the cobbles: on a jittered grid over the cell and halfway to every neighbour, kept inside the band
  for (const { x, y, nb } of cells) {
    const seed = hash2(x, y), R = rng(seed + 3); R(); R();
    const inside = (px, py) => { const ax = Math.abs(px - x), ay = Math.abs(py - y), r = PATH_W - 6;
      if (Math.hypot(px - x, py - y) <= r) return true;
      return STEP.some(([dx, dy, b]) => nb & b && (dx ? (Math.sign(px - x) === dx && ay <= r && ax <= 21) : (Math.sign(py - y) === dy && ax <= r && ay <= 21))); };
    for (let gy = -1; gy <= 1; gy++) for (let gx = -2; gx <= 2; gx++) {
      const px = x + gx * 11.5 + (gy & 1 ? 5.7 : 0) + (R() - .5) * 3.4, py = y + gy * 10.5 + (R() - .5) * 3; if (!inside(px, py)) continue;
      const rx = 5.4 + R() * 1.4, ry = 4.6 + R() * 1.2, tone = R();
      hdBlob(c, (cc) => wobbly(cc, px, py, rx, ry, seed + gx * 7 + gy * 13, .14, 7, .4), tone > .66 ? '#d6ccb6' : tone > .33 ? '#c8bca4' : '#bcae94', px, py - 1.5, 5, { olk: .5, k: .5 });
    }
  }
  c.restore();
}
// Garden beds drawn as plots: next to each other they make one box with one wooden rim, the furrows running on through
// (cells: [{ x, y, nb, dg }], nb as for the path, dg the diagonals: NE 1, SE 2, SW 4, NW 8 — a corner is filled only when
// both its sides and its diagonal are beds).
function plotPass(c, cells, inset, r, col, stroke) {
  c.beginPath();
  for (const { x, y, nb, dg } of cells) {
    const e = (b) => (nb & b ? 21.6 : 21 - inset);
    const top = y - e(1), right = x + e(2), bottom = y + e(4), left = x - e(8);
    // a corner is round when neither side has a bed, square otherwise (where both sides have one and the diagonal not,
    // the notch below cuts it back)
    const cr = (a, b) => (!(nb & a) && !(nb & b) ? r : 0);
    const k = [cr(1, 8), cr(1, 2), cr(4, 2), cr(4, 8)];
    c.moveTo(left + k[0], top); c.lineTo(right - k[1], top); if (k[1]) c.arcTo(right, top, right, top + k[1], k[1]);
    c.lineTo(right, bottom - k[2]); if (k[2]) c.arcTo(right, bottom, right - k[2], bottom, k[2]);
    c.lineTo(left + k[3], bottom); if (k[3]) c.arcTo(left, bottom, left, bottom - k[3], k[3]);
    c.lineTo(left, top + k[0]); if (k[0]) c.arcTo(left, top, left + k[0], top, k[0]); c.closePath();
    // the notch of an inner corner (both sides beds, the diagonal not): cut back to the inset
    for (const [a, b, d, sx, sy] of [[1, 2, 1, 1, -1], [4, 2, 2, 1, 1], [4, 8, 4, -1, 1], [1, 8, 8, -1, -1]]) if (nb & a && nb & b && !(dg & d)) {
      // counter-clockwise against the cell's clockwise outline, whichever the corner, so that the nonzero fill cuts it
      const ix = x + sx * (21 - inset), iy = y + sy * (21 - inset), ox = x + sx * 21.6, oy = y + sy * 21.6;
      if (sx * sy > 0) { c.moveTo(ix, iy); c.lineTo(ix, oy); c.lineTo(ox, oy); c.lineTo(ox, iy); } else { c.moveTo(ix, iy); c.lineTo(ox, iy); c.lineTo(ox, oy); c.lineTo(ix, oy); }
      c.closePath();
    }
  }
  c.fillStyle = col; c.fill('nonzero');
  if (stroke) { c.lineWidth = stroke[0]; c.strokeStyle = stroke[1]; c.stroke(); }
}
function hdBedNet(c, cells) {
  // raised like the boxes on a lawn: the top lifted by BED_LIFT, a front wall of planks under every edge that faces down
  const L = BED_LIFT, H = 6;
  c.save();
  c.save(); c.translate(2.5, H + 3); plotPass(c, cells, 0, 8, 'rgba(25,45,12,.34)'); c.restore();
  c.save(); c.translate(0, H - L); plotPass(c, cells, 1.5, 7, '#5c3c1b', [1.3, 'rgba(50,28,10,.85)']); c.restore();
  // the planks of the wall, where a plot ends below
  for (const { x, y, nb } of cells) if (!(nb & 4)) {
    const top = y + 21 - 1.5 - L, l = x - (nb & 8 ? 21.6 : 19.5), r = x + (nb & 2 ? 21.6 : 19.5);
    c.save(); c.beginPath(); c.rect(l, top - 1, r - l, H + 2); c.clip();
    const g = c.createLinearGradient(0, top, 0, top + H); g.addColorStop(0, '#8a5e30'); g.addColorStop(1, '#553617'); c.fillStyle = g; c.fillRect(l, top - 1, r - l, H + 2);
    c.beginPath(); c.moveTo(l, top + H * .5); c.lineTo(r, top + H * .5); c.lineWidth = 1; c.strokeStyle = 'rgba(40,22,8,.5)'; c.stroke();
    for (const dx of [-11, 3, 15]) { c.beginPath(); c.moveTo(x + dx, top); c.lineTo(x + dx, top + H); c.lineWidth = .9; c.strokeStyle = 'rgba(40,22,8,.4)'; c.stroke(); }
    c.restore();
  }
  c.save(); c.translate(0, -L);
  plotPass(c, cells, 1.5, 7, '#a8763f', [1.4, 'rgba(90,55,25,.85)']);
  // a light edge along the top of the rim, where a plot ends above
  c.lineWidth = 1.2; c.strokeStyle = 'rgba(255,225,170,.5)'; c.beginPath();
  for (const { x, y, nb } of cells) if (!(nb & 1)) { c.moveTo(x - (nb & 8 ? 21.6 : 14), y - 21 + 2.8); c.lineTo(x + (nb & 2 ? 21.6 : 14), y - 21 + 2.8); }
  c.stroke();
  // every cell its own square of soil, as in the boxes
  for (const { x, y } of cells) {
    const h = 16.5, R = rng(hash2(x, y) + 5);
    c.beginPath(); rrect(c, x - h, y - h, h * 2, h * 2, 4.5); c.fillStyle = '#6a4222'; c.fill();
    c.save(); c.beginPath(); rrect(c, x - h, y - h, h * 2, h * 2, 4.5); c.clip();
    c.beginPath(); rrect(c, x - h, y - h, h * 2, h * 2, 4.5); c.lineWidth = 3.4; c.strokeStyle = 'rgba(30,15,5,.35)'; c.stroke();
    for (let i = -1; i <= 1; i++) { const fy = y + i * 9 + 1;
      c.beginPath(); c.moveTo(x - h, fy); c.lineTo(x + h, fy); c.lineWidth = 2.8; c.strokeStyle = 'rgba(40,22,8,.35)'; c.stroke();
      c.beginPath(); c.moveTo(x - h, fy - 2.8); c.lineTo(x + h, fy - 2.8); c.lineWidth = 1.2; c.strokeStyle = 'rgba(160,110,60,.35)'; c.stroke(); }
    for (let i = 0; i < 8; i++) { c.beginPath(); c.arc(x + (R() - .5) * 26, y + (R() - .5) * 26, .7 + R(), 0, TAU); c.fillStyle = 'rgba(190,130,70,.7)'; c.fill(); }
    c.restore();
  }
  c.restore(); c.restore();
}
const BED_LIFT = 3;
// A bed standing alone in the middle of a lawn: a small wooden box of soil, a little smaller than the cell, with grass
// showing round it and a shadow under it, so a garden inside the trail reads as boxes set out on a lawn and not as one
// heavy field; it stands up out of the grass, plainly something the bugs go round.
function hdHole(c, x, y) {
  const R = rng(hash2(x, y) + 9); R(); R();
  const h = 16, cy = y - 4, H = 7; // H: the height of the box's front wall
  c.save();
  // the shadow it casts on the grass
  c.beginPath(); rrect(c, x - h + 3, cy - h + H + 4, h * 2 + 1, h * 2, 7); c.fillStyle = 'rgba(25,45,12,.38)'; c.fill();
  // the front wall: planks, dark at the foot
  c.beginPath(); rrect(c, x - h, cy - h + H, h * 2, h * 2, 6); c.fillStyle = '#6e4a24'; c.fill(); c.lineWidth = 1.3; c.strokeStyle = 'rgba(60,35,12,.85)'; c.stroke();
  c.save(); c.beginPath(); rrect(c, x - h, cy - h + H, h * 2, h * 2, 6); c.clip();
  const wall = c.createLinearGradient(0, cy + h - 1, 0, cy + h + H); wall.addColorStop(0, '#8a5e30'); wall.addColorStop(1, '#553617'); c.fillStyle = wall; c.fillRect(x - h, cy + h - 2, h * 2, H + 3);
  c.beginPath(); c.moveTo(x - h, cy + h + H * .5); c.lineTo(x + h, cy + h + H * .5); c.lineWidth = 1; c.strokeStyle = 'rgba(40,22,8,.55)'; c.stroke();
  for (const dx of [-h * .5, h * .25, h * .8]) { c.beginPath(); c.moveTo(x + dx, cy + h); c.lineTo(x + dx, cy + h + H); c.lineWidth = .9; c.strokeStyle = 'rgba(40,22,8,.4)'; c.stroke(); }
  c.restore();
  // the top: the rim and the soil inside
  c.beginPath(); rrect(c, x - h, cy - h, h * 2, h * 2, 6); c.fillStyle = '#a8763f'; c.fill(); c.lineWidth = 1.4; c.strokeStyle = 'rgba(90,55,25,.85)'; c.stroke();
  c.beginPath(); c.moveTo(x - h + 5, cy - h + 1.2); c.lineTo(x + h - 5, cy - h + 1.2); c.lineWidth = 1.2; c.strokeStyle = 'rgba(255,225,170,.55)'; c.stroke();
  c.beginPath(); rrect(c, x - h + 3.5, cy - h + 3.5, h * 2 - 7, h * 2 - 7, 4); c.fillStyle = '#6a4222'; c.fill();
  c.save(); c.beginPath(); rrect(c, x - h + 3.5, cy - h + 3.5, h * 2 - 7, h * 2 - 7, 4); c.clip();
  c.beginPath(); rrect(c, x - h + 3.5, cy - h + 3.5, h * 2 - 7, h * 2 - 7, 4); c.lineWidth = 3.4; c.strokeStyle = 'rgba(30,15,5,.35)'; c.stroke();
  for (let i = -1; i <= 1; i++) { const fy = cy + i * 8 + 1;
    c.beginPath(); c.moveTo(x - h, fy); c.lineTo(x + h, fy); c.lineWidth = 2.6; c.strokeStyle = 'rgba(40,22,8,.35)'; c.stroke();
    c.beginPath(); c.moveTo(x - h, fy - 2.6); c.lineTo(x + h, fy - 2.6); c.lineWidth = 1.2; c.strokeStyle = 'rgba(160,110,60,.35)'; c.stroke(); }
  for (let i = 0; i < 7; i++) { c.beginPath(); c.arc(x + (R() - .5) * 22, cy + (R() - .5) * 22, .7 + R(), 0, TAU); c.fillStyle = 'rgba(190,130,70,.7)'; c.fill(); }
  c.restore(); c.restore();
}
function hdTile(c, kind, x, y) {
  const seed = hash2(x, y), R = rng(seed + 3); R(); R();
  c.save();
  if (kind === 'stone') {
    // a path of cobbles, a little over the cell so that the stones of a path meet
    c.beginPath(); rrect(c, x - 21.5, y - 21.5, 43, 43, 6); c.fillStyle = '#a89c86'; c.fill();
    for (let n = 0; n < 7; n++) {
      const cx = x + (n % 3 - 1) * 13 + (R() - .5) * 4 + (Math.floor(n / 3) % 2 ? 6 : 0), cy = y + (Math.floor(n / 3) - 1) * 13 + (R() - .5) * 3;
      hdBlob(c, (cc) => wobbly(cc, cx, cy, 6.4 + R() * 1.4, 5.6 + R() * 1.2, seed + n, .12, 8, .4), R() > .5 ? '#cfc4ad' : '#bfb39a', cx, cy - 2, 7, { olk: .55, k: .5 });
    }
    c.restore(); return;
  }
  if (kind === 'bed') {
    // a garden bed: dark soil in furrows inside a low wooden rim: plants grow here, bugs never walk here
    c.beginPath(); rrect(c, x - 19, y - 19, 38, 38, 7); c.fillStyle = '#9a6a3c'; c.fill(); c.lineWidth = 2; c.strokeStyle = 'rgba(90,55,25,.8)'; c.stroke();
    c.beginPath(); rrect(c, x - 16, y - 16, 32, 32, 5); c.fillStyle = '#6a4222'; c.fill();
    c.save(); c.beginPath(); rrect(c, x - 16, y - 16, 32, 32, 5); c.clip();
    for (let i = -1; i <= 1; i++) { const fy = y + i * 9; c.beginPath(); c.moveTo(x - 17, fy); c.lineTo(x + 17, fy); c.lineWidth = 3; c.strokeStyle = 'rgba(40,22,8,.35)'; c.stroke(); c.beginPath(); c.moveTo(x - 17, fy - 3); c.lineTo(x + 17, fy - 3); c.lineWidth = 1.2; c.strokeStyle = 'rgba(180,120,70,.4)'; c.stroke(); }
    for (let i = 0; i < 9; i++) { c.beginPath(); c.arc(x + (R() - .5) * 28, y + (R() - .5) * 28, .7 + R(), 0, TAU); c.fillStyle = 'rgba(190,130,70,.7)'; c.fill(); }
    c.restore(); c.restore(); return;
  }
  if (kind === 'fertile') {
    // rich dark bed: furrows, crumbs, two sprouts and a glint: plants grow stronger here
        const bed = cc => wobbly(cc, x, y, 19, 18.5, seed, .05, 14, .75);
    c.beginPath(); bed(c); c.fillStyle = '#6e4526'; c.fill(); c.lineWidth = 1.6; c.strokeStyle = 'rgba(58,32,12,.55)'; c.stroke();
    c.save(); c.beginPath(); bed(c); c.clip();
    for (let i = -2; i <= 2; i++) { const fy = y + i * 7.4 + 1; c.beginPath(); c.moveTo(x - 20, fy); c.bezierCurveTo(x - 8, fy - 2.4, x + 8, fy + 2.4, x + 20, fy); c.lineWidth = 2.6; c.strokeStyle = 'rgba(38,20,8,.38)'; c.stroke(); c.beginPath(); c.moveTo(x - 20, fy - 2.6); c.bezierCurveTo(x - 8, fy - 5, x + 8, fy - .2, x + 20, fy - 2.6); c.lineWidth = 1.1; c.strokeStyle = 'rgba(190,130,70,.4)'; c.stroke(); }
    for (let i = 0; i < 16; i++) { c.beginPath(); c.arc(x + (R() - .5) * 34, y + (R() - .5) * 34, .7 + R() * 1.3, 0, TAU); c.fillStyle = R() > .5 ? 'rgba(196,136,74,.75)' : 'rgba(34,18,6,.55)'; c.fill(); }
    c.restore();
    for (const [dx, dy, l] of [[-11, 9, 6.5], [11, -8, 5.5]]) { hdLine(c, [x + dx, y + dy, x + dx, y + dy - 3], '#3f8f2c', 1.6); hdLeaf(c, x + dx, y + dy - 3, l, -2.5, '#8fe060', { w: .5 }); hdLeaf(c, x + dx, y + dy - 3, l, -.65, '#74d04c', { w: .5 }); }
    sparkle(c, x + 10, y + 10, 3, '#ffe98a'); sparkle(c, x - 11, y - 10, 2.4, '#ffe98a'); sparkle(c, x + 1, y - 1, 1.8, '#fff6c8');
  } else if (kind === 'mud') {
    // sticky glossy puddle: bugs get stuck here
    c.beginPath(); wobbly(c, x, y, 19, 17.5, seed, .1, 11, .45); c.fillStyle = '#93663c'; c.fill(); c.lineWidth = 1.6; c.strokeStyle = 'rgba(70,42,18,.5)'; c.stroke();
    c.beginPath(); wobbly(c, x + .5, y + 1, 14, 12, seed + 5, .14, 9, .3); c.fillStyle = 'rgba(74,44,20,.6)'; c.fill();
    c.beginPath(); wobbly(c, x + 1, y + 2, 9, 7, seed + 9, .16, 8, .2); c.fillStyle = 'rgba(52,30,14,.45)'; c.fill();
    c.save(); c.globalAlpha = .62; c.beginPath(); c.ellipse(x - 5.5, y - 6.5, 7.5, 2.1, -.3, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); c.beginPath(); c.ellipse(x + 4.5, y - 8.6, 1.9, 1.2, -.2, 0, TAU); c.fill(); c.restore();
    c.save(); c.beginPath(); c.arc(x + 1, y + 3, 9.5, .35, 1.5); c.lineWidth = 1.3; c.lineCap = 'round'; c.strokeStyle = 'rgba(214,170,120,.55)'; c.stroke(); c.restore();
    for (const [dx, dy, r] of [[7, 3, 2.6], [-6, 6, 1.9], [1, -1, 1.4]]) { hdBall(c, x + dx, y + dy, r, r, '#a87648', { olk: .6, noBounce: true }); }
    for (const [dx, dy, r] of [[-18, -13, 1.8], [18.5, 12, 2.1], [15, -15.5, 1.4]]) hdBall(c, x + dx, y + dy, r, r * .8, '#8a5c34', { olk: .6, noSpec: true, noBounce: true });
  } else if (kind === 'nettle') {
    // low stinging patch: flat jagged leaves and pale red-tipped thorns: it hurts the bugs that cross it
    c.beginPath(); wobbly(c, x, y + 1.5, 20.5, 20, seed, .08, 13, .6); c.fillStyle = 'rgba(20,50,20,.28)'; c.fill();
    hdBlob(c, cc => wobbly(cc, x, y, 19, 18.5, seed, .08, 13, .6), '#2f7a3a', x, y - 4, 26, { olk: .9, k: .6 });
    const spots = [[-10, -9], [9, -10], [-9, 9], [10, 9], [0, 0]];
    for (const [dx, dy] of spots) { const n = 5, a0 = R() * 6; for (let i = 0; i < n; i++) jagLeaf(c, x + dx, y + dy, 8.6 + R() * 1.6, a0 + i / n * TAU, i % 2 ? '#4aa645' : '#3c9440', { w: .34 }); }
    for (const [dx, dy] of spots.concat([[0, -13], [0, 13], [-14, 0], [14, 0]])) {
      const big = dx * dy !== 0 || (!dx && !dy), r = big ? 4.4 : 3.3, a0 = R() * 6;
      c.save(); c.translate(x + dx, y + dy); c.rotate(a0);
      c.beginPath(); for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, q = i % 2 ? r * .3 : r; c.lineTo(Math.cos(a) * q, Math.sin(a) * q); } c.closePath();
      c.fillStyle = '#fbf3c4'; c.fill(); c.lineJoin = 'round'; c.lineWidth = .9; c.strokeStyle = '#5a2a1a'; c.stroke();
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; c.beginPath(); c.arc(Math.cos(a) * r * .86, Math.sin(a) * r * .86, .85, 0, TAU); c.fillStyle = '#e8324a'; c.fill(); }
      c.restore();
    }
  }
  c.restore();
}
// Outline of one pond cell. Sides that touch another pond cell run to the cell edge, free sides get a wavy bank
// (the wave depends on world coordinates only, so the banks of neighbouring cells meet exactly).
function pondPts(x, y, mask, inset, diag) {
  const H = 21, RC = 13, OV = .5, P = [];
  const free = [!(mask & 1), !(mask & 2), !(mask & 4), !(mask & 8)]; // top, right, bottom, left
  const dir = [[1, 0], [0, 1], [-1, 0], [0, -1]], nrm = [[0, -1], [1, 0], [0, 1], [-1, 0]], st = [[-H, -H], [H, -H], [H, H], [-H, H]];
  const wob = (px, py) => inset + 2.2 + 1.5 * Math.sin(px * .21 + py * .33) * Math.sin(px * .12 - py * .16 + 1.3);
  for (let k = 0; k < 4; k++) {
    const pf = free[(k + 3) % 4], nf = free[(k + 1) % 4], d = dir[k], n = nrm[k];
    if (!free[k]) {
      if (nf) continue;
      const j = (k + 1) % 4, d2 = dir[j], n2 = nrm[j], cx = x + st[j][0], cy = y + st[j][1];
      if (diag === undefined || diag & [8, 1, 2, 4][j]) { P.push([cx + (n[0] + n2[0]) * OV, cy + (n[1] + n2[1]) * OV]); continue; }
      // land pokes in at this corner: carry the bank around it
      const w = wob(cx, cy), a0 = Math.atan2(-d[1], -d[0]);
      P.push([cx - d[0] * w + n[0] * OV, cy - d[1] * w + n[1] * OV]);
      for (let i = 0; i <= 5; i++) { const an = a0 - i / 5 * Math.PI / 2; P.push([cx + Math.cos(an) * w, cy + Math.sin(an) * w]); }
      P.push([cx + d2[0] * w + n2[0] * OV, cy + d2[1] * w + n2[1] * OV]);
      continue;
    }
    const a = pf ? RC : -OV, b = nf ? 2 * H - RC : 2 * H + OV, m = Math.ceil((b - a) / 3);
    for (let i = 0; i <= m; i++) { const t = a + (b - a) * i / m, px = x + st[k][0] + d[0] * t, py = y + st[k][1] + d[1] * t, w = wob(px, py); P.push([px - n[0] * w, py - n[1] * w]); }
    if (nf) {
      const n2 = nrm[(k + 1) % 4], cx = x + st[(k + 1) % 4][0] - (n[0] + n2[0]) * RC, cy = y + st[(k + 1) % 4][1] - (n[1] + n2[1]) * RC, a0 = Math.atan2(n[1], n[0]);
      for (let i = 1; i < 6; i++) { const an = a0 + i / 6 * Math.PI / 2, px = cx + Math.cos(an) * RC, py = cy + Math.sin(an) * RC, w = wob(px, py); P.push([px - Math.cos(an) * w, py - Math.sin(an) * w]); }
    }
  }
  return P;
}
// mask: 1 = pond above (y-), 2 = right, 4 = below, 8 = left.
// diag (optional): 1 = pond up-right, 2 = down-right, 4 = down-left, 8 = up-left; with it the bank also wraps the
// inner corners of an L-shaped pond, without it those corners keep a small notch.
function hdWater(c, x, y, mask = 0, diag) {
  const seed = hash2(x, y), R = rng(seed + 11); R(); R();
  const fill = (inset, col) => { const P = pondPts(x, y, mask, inset, diag); c.beginPath(); P.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.fillStyle = col; c.fill(); };
  c.save(); c.lineJoin = 'round';
  fill(-1.6, 'rgba(30,60,20,.3)'); fill(0, '#7a5a34'); fill(1.6, '#d8c890'); fill(3.4, '#bff0fb'); fill(5.2, '#4fb4e6');
  c.lineCap = 'round';
  for (let i = 0; i < 2; i++) {
    const rx = x + (R() - .5) * 20, ry = y + (R() - .5) * 20, rr = 3.5 + R() * 3;
    c.beginPath(); c.ellipse(rx, ry, rr, rr * .42, 0, Math.PI * 1.1, Math.PI * 1.9); c.lineWidth = 1.3; c.strokeStyle = 'rgba(255,255,255,.7)'; c.stroke();
    c.beginPath(); c.ellipse(rx, ry + 2.2, rr * .6, rr * .26, 0, Math.PI * .15, Math.PI * .85); c.lineWidth = 1; c.strokeStyle = 'rgba(20,90,160,.35)'; c.stroke();
  }
  if (seed % 3 === 0) {
    const px = x + (R() - .5) * 12, py = y + (R() - .5) * 12, a0 = R() * 6, r = 6.4;
    c.save(); c.translate(px, py); c.rotate(a0);
    c.beginPath(); c.ellipse(1.2, 1.6, r, r * .86, 0, 0, TAU); c.fillStyle = 'rgba(16,70,120,.3)'; c.fill();
    hdBlob(c, cc => { cc.moveTo(0, 0); cc.arc(0, 0, r, .32, TAU - .32); cc.closePath(); }, '#5cc44a', -1, -1, r, { olk: .8 });
    for (const a of [1.6, 2.6, 3.7, 4.7]) hdLine(c, [0, 0, Math.cos(a) * r * .8, Math.sin(a) * r * .8], 'rgba(210,255,170,.55)', .8);
    c.restore();
    if (seed % 2 === 0) { for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + a0; hdBall(c, px + Math.cos(a) * 2.6, py + Math.sin(a) * 2.6, 2.3, 2.3, '#ff9ac4', { olk: .5, noSpec: true, noBounce: true }); } hdBall(c, px, py, 1.7, 1.7, '#ffe14a', { olk: .5, noSpec: true, noBounce: true }); }
  } else { c.beginPath(); c.arc(x + (R() - .5) * 18, y + (R() - .5) * 18, 1.1, 0, TAU); c.fillStyle = 'rgba(255,255,255,.85)'; c.fill(); }
  c.restore();
}
// Bramble thicket: removable junk, side view like the rock.
function hdWeed(c, x, y) {
  c.save(); c.translate(x, y);
  hdShadow(c, 0, 9, 18, 6, 1.1);
  for (const [dx, dy, r, col] of [[-9, 3, 8, '#6d8838'], [9, 4, 8.4, '#5d7832'], [0, -3, 10, '#7a9440'], [-3, 6, 7, '#657e36'], [7, -6, 6.4, '#869e4a']]) hdBall(c, dx, dy, r, r * .85, col, { specA: .25 });
  const cane = (p) => {
    hdCurve(c, p, '#3a2414', 4.4); hdCurve(c, p, '#96623a', 2.4);
    for (let i = 1; i < 6; i++) {
      const t = i / 6, u = 1 - t, px = u * u * p[0] + 2 * u * t * p[2] + t * t * p[4], py = u * u * p[1] + 2 * u * t * p[3] + t * t * p[5];
      const tx = 2 * u * (p[2] - p[0]) + 2 * t * (p[4] - p[2]), ty = 2 * u * (p[3] - p[1]) + 2 * t * (p[5] - p[3]), a = Math.atan2(ty, tx) + (i % 2 ? 1 : -1) * 1.35;
      c.save(); c.translate(px, py); c.rotate(a); hdBlob(c, cc => { cc.moveTo(0, -1.5); cc.lineTo(5.4, 0); cc.lineTo(0, 1.5); cc.closePath(); }, '#f0dca0', 2, 0, 3, { olk: .6 }); c.restore();
    }
  };
  cane([-16, 9, -15, -22, 3, -9]); cane([16, 9, 13, -24, -7, -13]); cane([-5, 10, 2, -17, 17, -5]);
  jagLeaf(c, -9, -4, 10, -2.5, '#7c9a3c', { w: .36 }); jagLeaf(c, 6, -1, 10, -.45, '#6a8a36', { w: .36 }); jagLeaf(c, -2, 6, 9, 2.6, '#a59a3e', { w: .36 }); jagLeaf(c, 3, 7, 9, .5, '#8a8a34', { w: .36 });
  for (const [dx, dy, r] of [[-4, -12, 3.4], [11, -9, 2.8]]) {
    c.save(); c.translate(dx, dy); for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; hdLine(c, [0, 0, Math.cos(a) * (r + 2.2), Math.sin(a) * (r + 2.2)], '#5a2a6a', 1.1); }
    c.restore(); hdBall(c, dx, dy, r, r, '#a85ac0', { olk: .7, noBounce: true });
  }
  c.restore();
}
// Web over a tied-up plant.
function hdWeb(c, x, y, r = 18) {
  const n = 8, R = rng(71), A = [], L = [];
  for (let i = 0; i < n; i++) { A.push(i / n * TAU + .22 + (R() - .5) * .22); L.push(r * (.9 + R() * .14)); }
  const pt = (i, k) => [x + Math.cos(A[i % n]) * L[i % n] * k, y + Math.sin(A[i % n]) * L[i % n] * k];
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.arc(x, y, r * .92, 0, TAU); c.fillStyle = 'rgba(240,246,255,.16)'; c.fill();
  for (const [col, w] of [['rgba(50,60,90,.4)', 2.6], ['rgba(255,255,255,.95)', 1.15]]) {
    c.strokeStyle = col; c.lineWidth = w; c.beginPath();
    for (let i = 0; i < n; i++) { const p = pt(i, 1); c.moveTo(x, y); c.lineTo(p[0], p[1]); }
    for (const k of [.3, .56, .82]) for (let i = 0; i < n; i++) { const p = pt(i, k), q = pt(i + 1, k), mx = x + ((p[0] + q[0]) / 2 - x) * .84, my = y + ((p[1] + q[1]) / 2 - y) * .84; c.moveTo(p[0], p[1]); c.quadraticCurveTo(mx, my, q[0], q[1]); }
    c.stroke();
  }
  for (const [i, k] of [[1, .56], [4, .82], [6, .3]]) { const p = pt(i, k); c.beginPath(); c.arc(p[0], p[1], 1.5, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); c.lineWidth = .7; c.strokeStyle = 'rgba(70,120,180,.8)'; c.stroke(); }
  c.restore();
}

export { hdStoneNet, hdBedNet, hdHole, hdBush, hdBall, hdBlob, hdLeaf, hdShadow, hdLine, hdCurve, hdEye, hdText, hdBug, hdPlant, hdApple, hdStump, hdAnthill, hdRock, hdLog, hdGrass, hdPath, hdBorderBushes, hdForeground, hdVignette, hdMotes, fxThorn, fxKernel, fxStar, fxHit, fxDmg, fxFrost, fxIced, fxFire, hdDrop, hdHp, uiPanel, uiRound, iconFrost, iconRain, iconBirds, hdSoil, hdTile, hdWater, hdWeed, hdWeb, hdDapple, hdGrade, hdSun2, bladeTri, rrect, along, chaikin, rng, lighten, darken, alpha, mix, TAU, star5, strokePts };
