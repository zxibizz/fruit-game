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
export function setView(w, h) { LW = w; LH = h; }
const FONT = 'Nunito, Rubik, system-ui, sans-serif';
const HS = {
  juicy: { ol: true, olw: 2.2, shade: .6, spec: .8, blurSh: false, name: 'juicy' },
  toy: { ol: false, olw: 0, shade: .95, spec: .55, blurSh: true, name: 'toy' },
};
let S = HS.juicy;
let SUN = { dx: 3, dy: 4, sx: 1, a: .28 }; // shadow offset and stretch

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

// ---------- bugs: top-down, facing +x ----------
function hdLegs(c, xs, len, col, w = 1.7) {
  for (const x of xs) for (const s of [-1, 1]) {
    c.save(); c.beginPath(); c.moveTo(x, s * 2); c.quadraticCurveTo(x + len * .35, s * len * .9, x - len * .1, s * len * 1.35);
    c.lineCap = 'round'; c.lineWidth = w; c.strokeStyle = col; c.stroke(); c.restore();
  }
}
function hdAntennae(c, x, len, col) { for (const s of [-1, 1]) { hdCurve(c, [x, s * 2, x + len * .6, s * len * .2, x + len, s * len * .55], col, 1.3); c.beginPath(); c.arc(x + len, s * len * .55, 1.6, 0, TAU); c.fillStyle = col; c.fill(); } }
function hdBug(c, kind, x, y, a = 0, s = 1, o = {}) {
  c.save(); c.translate(x, y);
  if (!o.noShadow) { const fly = o.fly ? 14 : 0; c.save(); c.translate(fly * .6, fly); hdShadow(c, 0, 4, 15 * s, 8 * s, o.fly ? .55 : .8); c.restore(); }
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
  }
  c.restore();
}

// ---------- plants: side view, base at x,y ----------
function rosette(c, x, y, r, col) {
  hdBall(c, x, y, r, r * .92, col);
  c.save(); c.strokeStyle = alpha(darken(col, .35), .85); c.lineWidth = 1.2; c.beginPath();
  for (let t = 0; t < 9; t += .25) { const rr2 = r * .75 * (1 - t / 10); c.lineTo(x + Math.cos(t * 1.4) * rr2 * .9, y + Math.sin(t * 1.4) * rr2 * .8); } c.stroke(); c.restore();
  hdSpec(c, x - r * .4, y - r * .45, r * .28, r * .14);
}
function bushBase(c, col, w = 1) {
  for (const [dx, dy, r] of [[-9, -9, 9], [9, -10, 9], [0, -6, 10], [-5, -18, 9.5], [6, -19, 9.5], [0, -26, 8]]) hdBall(c, dx * w, dy, r * w, r, dy < -15 ? lighten(col, .08) : col, { specA: .4 });
}
function hdPlant(c, kind, x, y, s = 1, o = {}) {
  c.save(); c.translate(x, y); if (!o.noShadow) hdShadow(c, 0, 1, 15 * s, 5 * s); c.scale(s, s);
  const G = '#4fae3a';
  if (o.stage === 0) { hdBall(c, 0, -3, 10, 5, '#8a5a34', { specA: .3 }); hdLeaf(c, 0, -6, 8, -2.3, '#7fd05a'); hdLeaf(c, 0, -6, 8, -.8, '#5fbf45'); c.restore(); return; }
  if (o.stage === 1) { hdLine(c, [0, 0, 0, -12], '#4a9a32', 2.6); hdLeaf(c, 0, -11, 12, -2.6, '#5fbf45'); hdLeaf(c, 0, -11, 12, -.5, '#7fd05a'); c.restore(); return; }
  switch (kind) {
    case 'rose': {
      bushBase(c, '#3f9a36');
      for (const [dx, dy, a] of [[-14, -8, 3.3], [14, -10, -.1], [-12, -22, 3.6], [13, -24, -.4]]) hdLeaf(c, dx * .6, dy, 9, a, '#56b346');
      rosette(c, -7, -17, 6, '#ec3a5c'); rosette(c, 7, -22, 6.5, '#f24d6e'); rosette(c, 1, -9, 5.5, '#e0304f');
      // thorn launcher bud
      hdBlob(c, cc => { cc.moveTo(9, -10); cc.lineTo(19, -12); cc.lineTo(10, -15); cc.closePath(); }, '#f6e6b0', 14, -12, 6);
      break;
    }
    case 'pumpkin': {
      hdLeaf(c, -4, -16, 14, -2.5, '#4fae3a'); hdLeaf(c, 4, -18, 12, -.6, '#5fbf45');
      hdBall(c, -11, -11, 9, 10, '#e2771a', { specA: .5 }); hdBall(c, 11, -11, 9, 10, '#e2771a', { specA: .5 });
      hdBall(c, -5, -11, 9, 11, '#f08a24', { specA: .6 }); hdBall(c, 5, -11, 9, 11, '#f08a24', { specA: .6 });
      hdBall(c, 0, -11, 8, 11.5, '#f7a23a');
      hdBlob(c, cc => { cc.moveTo(-2, -21); cc.quadraticCurveTo(-3, -28, 3, -30); cc.lineTo(4, -27); cc.quadraticCurveTo(1, -26, 2, -21); cc.closePath(); }, '#7a5a2a', 1, -25, 5);
      hdCurve(c, [3, -27, 12, -34, 9, -26], '#5aa53e', 1.4);
      break;
    }
    case 'corn': {
      hdLine(c, [0, 0, 0, -40], '#3f8f2c', 5); hdLine(c, [0, 0, 0, -40], '#6cc04a', 2.5);
      hdLeaf(c, 0, -6, 22, -2.75, '#4fae3a', { w: .25 }); hdLeaf(c, 0, -12, 22, -.35, '#5fbf45', { w: .25 }); hdLeaf(c, 0, -30, 16, -2.9, '#6cc04a', { w: .25 });
      c.save(); c.translate(5, -26); c.rotate(.22);
      hdBall(c, 0, 0, 5.6, 11.5, '#ffd23f', { specA: .3 });
      for (let i = -3; i <= 3; i++) for (const dx of [-2.4, 0, 2.4]) { c.beginPath(); c.arc(dx, i * 3, 1.15, 0, TAU); c.fillStyle = 'rgba(200,130,10,.55)'; c.fill(); }
      hdSpec(c, -2.4, -4, 1.4, 4, 0);
      hdLeaf(c, -1, 9, 13, -1.9, '#8ccf5a', { w: .3 }); hdLeaf(c, 1, 9, 13, -1.25, '#7cc44e', { w: .3 });
      c.restore();
      break;
    }
    case 'pepper': {
      bushBase(c, '#3f9a36', .95);
      for (const [dx, dy, r] of [[-8, -10, .35], [6, -12, -.3], [-1, -20, .1], [10, -22, -.5]]) {
        c.save(); c.translate(dx, dy); c.rotate(r);
        hdBlob(c, cc => { cc.moveTo(-3.6, -2); cc.bezierCurveTo(-5, 6, -1, 12, 1.5, 14); cc.bezierCurveTo(4, 8, 4.5, 3, 3.6, -2); cc.closePath(); }, '#ee3a24', 0, 5, 7);
        hdSpec(c, -1.4, 3, 1.1, 4, 0); hdBall(c, 0, -2.5, 3.6, 2, '#3f8f2c', { noSpec: true, olk: .7 });
        c.restore();
      }
      break;
    }
    case 'mint': {
      c.save(); const g = c.createRadialGradient(0, -10, 2, 0, -10, 30); g.addColorStop(0, 'rgba(190,245,255,.55)'); g.addColorStop(1, 'rgba(190,245,255,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, -10, 30, 0, TAU); c.fill(); c.restore();
      for (const [dx, dy, a, l] of [[-2, -2, -2.7, 15], [2, -2, -.45, 15], [-2, -10, -2.2, 14], [2, -11, -.95, 14], [0, -14, -1.57, 13]]) hdLeaf(c, dx, dy, l, a, a === -1.57 ? '#a6efd6' : '#72d6b4', { w: .55 });
      for (const [dx, dy, r] of [[-13, -24, 3.5], [13, -22, 3], [0, -31, 4]]) { c.save(); c.strokeStyle = '#ffffff'; c.lineWidth = 1.5; c.lineCap = 'round'; for (let i = 0; i < 3; i++) { const aa = i * Math.PI / 3; c.beginPath(); c.moveTo(dx - Math.cos(aa) * r, dy - Math.sin(aa) * r); c.lineTo(dx + Math.cos(aa) * r, dy + Math.sin(aa) * r); c.stroke(); } c.restore(); }
      break;
    }
    case 'clover': {
      hdLine(c, [5, -2, 6, -26], '#4a9a32', 2.2);
      for (const a of [-2.5, -1.57, -.65]) {
        const lx = Math.cos(a) * 9, ly = -9 + Math.sin(a) * 8;
        c.save(); c.translate(lx, ly); c.rotate(a + Math.PI / 2);
        hdBlob(c, cc => { cc.moveTo(0, 7); cc.bezierCurveTo(-11, -1, -6, -11, 0, -5); cc.bezierCurveTo(6, -11, 11, -1, 0, 7); }, a === -1.57 ? '#6cc84e' : '#56b840', 0, -1, 9);
        c.beginPath(); c.moveTo(-4, -1); c.lineTo(0, 2); c.lineTo(4, -1); c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 1.4; c.stroke();
        c.restore();
      }
      hdBall(c, 6, -30, 7.5, 7, '#fbe8ff', { specA: .5 });
      for (let i = 0; i < 7; i++) { c.beginPath(); c.arc(6 + Math.cos(i) * 4, -30 + Math.sin(i) * 4, 1.7, 0, TAU); c.fillStyle = '#e6a8f0'; c.fill(); }
      // dew drop
      hdBall(c, -9, -14, 2.8, 3.2, '#bfeaff', { specA: 1, olk: .6 });
      break;
    }
    case 'dandelion': {
      hdLine(c, [0, 0, 0, -30], '#4a9a32', 2.4); hdLeaf(c, 0, -2, 15, -2.8, '#4fae3a', { w: .25 }); hdLeaf(c, 0, -2, 15, -.35, '#5fbf45', { w: .25 });
      c.save(); const g = c.createRadialGradient(0, -36, 1, 0, -36, 15); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.6, 'rgba(255,255,255,.85)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, -36, 15, 0, TAU); c.fill();
      for (let i = 0; i < 26; i++) { const a = i / 26 * TAU; c.beginPath(); c.moveTo(0, -36); c.lineTo(Math.cos(a) * 11, -36 + Math.sin(a) * 11); c.strokeStyle = 'rgba(210,205,190,.9)'; c.lineWidth = .8; c.stroke(); c.beginPath(); c.arc(Math.cos(a) * 11.5, -36 + Math.sin(a) * 11.5, 1.2, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); }
      c.restore(); hdBall(c, 0, -36, 3, 3, '#cdbf90', { noSpec: true, olk: .6 });
      break;
    }
  }
  if (o.lvl) { for (let i = 0; i < o.lvl; i++) { const sx = -(o.lvl - 1) * 5 + i * 10; c.save(); c.beginPath(); star5(sx, 6, 4.6)(c); c.fillStyle = '#ffd23f'; c.fill(); c.lineWidth = 1.2; c.strokeStyle = '#8a5a10'; c.stroke(); c.restore(); } }
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
  const base = o.base || ['#97d968', '#72c24a'];
  const g = c.createLinearGradient(0, 0, 0, LH); g.addColorStop(0, base[0]); g.addColorStop(1, base[1]); c.fillStyle = g; c.fillRect(0, 0, LW, LH);
  const R = rng(o.seed ?? 5);
  for (let i = 0; i < 26; i++) { const x = R() * LW, y = R() * LH, r = 30 + R() * 70, light = R() > .5; const gg = c.createRadialGradient(x, y, 1, x, y, r); gg.addColorStop(0, light ? 'rgba(230,255,170,.22)' : 'rgba(40,110,30,.16)'); gg.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gg; c.fillRect(x - r, y - r, r * 2, r * 2); }
  c.save(); c.lineCap = 'round';
  for (let i = 0; i < 2600; i++) { const x = R() * LW, y = R() * LH, l = 3 + R() * 5, k = R(); c.strokeStyle = k < .45 ? 'rgba(50,120,30,.45)' : k < .8 ? 'rgba(170,230,110,.5)' : 'rgba(110,190,70,.6)'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (R() - .5) * 3, y - l); c.stroke(); }
  c.restore();
  // little flowers and clover patches
  for (let i = 0; i < 34; i++) { const x = R() * LW, y = R() * LH, col = ['#ffffff', '#ffe0f0', '#fff3a0', '#d8e8ff'][i % 4]; for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + R(); c.beginPath(); c.ellipse(x + Math.cos(a) * 2.6, y + Math.sin(a) * 2.6, 2.3, 1.6, a, 0, TAU); c.fillStyle = col; c.fill(); } c.beginPath(); c.arc(x, y, 1.5, 0, TAU); c.fillStyle = '#ffcf3a'; c.fill(); }
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
  stamp(9, 'rgba(30,70,15,.30)', 5);
  stamp(3, '#6e4426');
  stamp(0, '#c08852');
  c.save(); c.filter = 'blur(6px)'; strokePts(c, pts, w * .55, 'rgba(238,200,145,.8)'); c.restore();
  for (const off of [-.2, .2]) { const rut = []; for (let d = 0; d <= total; d += 6) { const p = along(pts, d / total); rut.push([p.x - Math.sin(p.a) * w * off, p.y + Math.cos(p.a) * w * off]); } c.save(); c.filter = 'blur(1.5px)'; strokePts(c, rut, 2.4, 'rgba(110,65,30,.22)'); c.restore(); }
  const R = rng(seed + 7);
  for (let i = 0; i < total / 3; i++) { const p = along(pts, R()), ox = (R() - .5) * w * .85, oy = (R() - .5) * w * .85; c.beginPath(); c.arc(p.x + ox, p.y + oy, .6 + R() * 1.1, 0, TAU); c.fillStyle = R() > .5 ? 'rgba(100,60,28,.45)' : 'rgba(255,228,180,.55)'; c.fill(); }
  for (let i = 0; i < total / 55; i++) { const p = along(pts, R()), ox = (R() - .5) * w * .7, oy = (R() - .5) * w * .7, cols = ['#c9b79a', '#a89a86', '#d8b48a', '#9c8a76']; hdBall(c, p.x + ox, p.y + oy, 2.2 + R() * 2.4, 1.6 + R() * 1.6, cols[i % 4], { olk: .45, specA: .6, rot: R() * 3, noBounce: true }); }
  for (let i = 0; i < total / 260; i++) { const p = along(pts, R()), ox = (R() - .5) * w * .5; c.save(); c.translate(p.x + ox, p.y); c.rotate(R() * 3); hdLine(c, [-7, 0, 7, 1], '#6a4424', 2); hdLine(c, [2, .5, 6, -3], '#6a4424', 1.4); c.restore(); }
  for (let i = 0; i < total / 300; i++) { const p = along(pts, R()); hdLeaf(c, p.x + (R() - .5) * w * .6, p.y + (R() - .5) * w * .5, 7, R() * 6, R() > .5 ? '#e0a23a' : '#c8642a', { w: .5 }); }
  // grass blades leaning over the edge
  for (let i = 0; i < total / 9; i++) {
    const d = R() * total, p = along(pts, d / total), nx = -Math.sin(p.a), ny = Math.cos(p.a), sg = R() > .5 ? 1 : -1, r = w / 2 + N(d) * 3.2 + 2;
    const bx = p.x + nx * sg * r, by = p.y + ny * sg * r;
    for (let k = 0; k < 3; k++) { const l = 4 + R() * 5, tx = bx - nx * sg * l * .7 + (R() - .5) * 4, ty = by - ny * sg * l * .7 - l * .6; bladeTri(c, bx + (R() - .5) * 4, by, tx, ty, 1.6, k % 2 ? '#4f9e36' : '#79c652'); }
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
  for (let i = 0; i < 26; i++) { const x = R() * LW, y = 40 + R() * (LH - 40); for (let k = 0; k < 3; k++) { const a = -1.57 + (k - 1) * .6 + (R() - .5) * .3; c.save(); c.translate(x + (k - 1) * 3, y); c.rotate(a); hdBlob(c, cc => { cc.moveTo(0, 6); cc.bezierCurveTo(-7, 0, -4, -6, 0, -2); cc.bezierCurveTo(4, -6, 7, 0, 0, 6); }, k === 1 ? '#6fc54c' : '#5bb341', 0, 1, 6, { noOl: true }); c.restore(); } }
  for (let i = 0; i < 70; i++) { const x = R() * LW, y = 40 + R() * (LH - 40), n = 4 + (R() * 4 | 0); for (let k = 0; k < n; k++) bladeTri(c, x + (k - n / 2) * 2, y, x + (k - n / 2) * 3.4 + (R() - .5) * 3, y - 7 - R() * 7, 1.5, R() > .5 ? '#5aa83e' : '#86d05c'); }
  for (let i = 0; i < 14; i++) { const x = R() * LW, y = 50 + R() * (LH - 60); for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; c.save(); c.translate(x, y); c.rotate(a); c.beginPath(); c.ellipse(5, 0, 4, 1.8, 0, 0, TAU); c.fillStyle = '#ffffff'; c.fill(); c.lineWidth = .8; c.strokeStyle = 'rgba(120,120,140,.5)'; c.stroke(); c.restore(); } hdBall(c, x, y, 2.6, 2.6, '#ffc72a', { olk: .5, noBounce: true }); }
  for (let i = 0; i < 9; i++) hdLeaf(c, R() * LW, 50 + R() * (LH - 60), 9, R() * 6, ['#e8b040', '#d47a2c', '#c8542a'][i % 3], { w: .5 });
  for (let i = 0; i < 4; i++) { const x = R() * LW, y = 60 + R() * (LH - 80); hdBall(c, x, y + 2, 2, 4, '#f4ead6', { noSpec: true, olk: .6 }); hdBlob(c, cc => { cc.ellipse(x, y - 1, 6, 4.5, 0, Math.PI, TAU); cc.closePath(); }, '#c8743a', x, y - 2, 6, { olk: .7 }); }
};

// Dappled light under unseen trees plus a warm/cool grade.
function hdDapple(c) {
  c.save(); c.globalCompositeOperation = 'multiply'; c.filter = 'blur(18px)';
  for (const [x, y, rx, ry] of [[760, 330, 120, 70], [820, 120, 70, 90], [230, 360, 110, 40], [450, 0, 160, 40]]) { c.beginPath(); c.ellipse(x, y, rx, ry, .3, 0, TAU); c.fillStyle = 'rgba(70,110,90,.38)'; c.fill(); }
  c.restore();
  c.save(); c.globalCompositeOperation = 'screen'; c.filter = 'blur(10px)';
  for (const [x, y, r] of [[330, 140, 34], [520, 260, 40], [690, 190, 28], [180, 270, 30]]) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = 'rgba(255,250,200,.09)'; c.fill(); }
  c.restore();
}
function hdGrade(c) {
  c.save(); c.globalCompositeOperation = 'soft-light'; const g = c.createLinearGradient(0, 0, LW, LH); g.addColorStop(0, 'rgba(255,225,160,.32)'); g.addColorStop(1, 'rgba(70,120,190,.28)'); c.fillStyle = g; c.fillRect(0, 0, LW, LH); c.restore();
}

// Top border: two layers of hedge with flowers and a soft cast shadow.
hdBorderBushes = function (c, seed = 2) {
  const R = rng(seed);
  c.save(); c.filter = 'blur(6px)'; c.fillStyle = 'rgba(20,60,15,.45)'; c.fillRect(0, 0, LW, 30); c.restore();
  for (let x = 40; x < LW + 30; x += 30 + R() * 16) { const r = 18 + R() * 9; hdBall(c, x, -8 + R() * 6, r, r * .75, '#2f7a26', { specA: .25, noBounce: true }); }
  for (let x = 70; x < LW + 30; x += 36 + R() * 22) { const y = 4 + R() * 6, r = 13 + R() * 7; hdBall(c, x, y, r, r * .78, R() > .5 ? '#45a036' : '#3d952f', { specA: .35 });
    for (let k = 0; k < 3; k++) hdLeaf(c, x + (R() - .5) * r, y + r * .4, 7 + R() * 4, .8 + R() * 1.5, '#5cb446', { w: .45 });
    if (R() > .45) { const fx = x + (R() - .5) * r, fy = y + (R() - .5) * 6, col = ['#ff6f91', '#fff07a', '#ffffff', '#b38cff'][(R() * 4) | 0]; for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; hdBall(c, fx + Math.cos(a) * 3.2, fy + Math.sin(a) * 3.2, 2.6, 2.6, col, { noSpec: true, olk: .5, noBounce: true }); } hdBall(c, fx, fy, 1.8, 1.8, '#ffb52a', { noSpec: true, noOl: true }); } }
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
// Plant details on top of the hd.js shapes.
const _plant0 = hdPlant;
hdPlant = function (c, kind, x, y, s = 1, o = {}) {
  if (o.stage === 0 || o.stage === 1) return _plant0(c, kind, x, y, s, o);
  if (kind === 'rose') { c.save(); c.translate(x, y); c.scale(s, s); for (const [x1, y1] of [[-13, -20], [12, -25], [2, -30]]) { hdCurve(c, [0, 0, x1 * .3, y1 * .6, x1, y1], '#3f6a2a', 2.4); for (let t = .3; t < 1; t += .25) { const px = x1 * t * .9, py = y1 * t; hdLine(c, [px, py, px + 3, py - 1.5], '#6a8a3a', 1.2); } } c.restore(); }
  _plant0(c, kind, x, y, s, o);
  c.save(); c.translate(x, y); c.scale(s, s);
  if (kind === 'pumpkin') {
    c.strokeStyle = 'rgba(150,60,10,.55)'; c.lineWidth = 1.3; c.lineCap = 'round';
    for (const dx of [-3.5, 3.5]) { c.beginPath(); c.moveTo(dx * .6, -21); c.quadraticCurveTo(dx * 1.4, -11, dx * .6, -1); c.stroke(); }
    hdSpec(c, -4, -17, 2.4, 4.5, .2, .8);
  }
  if (kind === 'rose' || kind === 'pepper' || kind === 'clover') { fxStar(c, -12, -27, 2.6, '#ffffff'); }
  if (kind === 'corn') { hdBall(c, -9, -18, 2.4, 2.8, '#bfeaff', { olk: .5 }); }
  c.restore();
};



function hdSun2(c) { c.save(); c.globalCompositeOperation = 'screen'; const g = c.createRadialGradient(80, -40, 10, 80, -40, 480); g.addColorStop(0, 'rgba(255,248,200,.26)'); g.addColorStop(1, 'rgba(255,248,200,0)'); c.fillStyle = g; c.fillRect(0, 0, LW, LH); c.restore(); }
function colorPop(c) {
  const cv = c.canvas, off = document.createElement('canvas'); off.width = cv.width; off.height = cv.height;
  const o = off.getContext('2d'); o.filter = 'saturate(1.14) contrast(1.06)'; o.drawImage(cv, 0, 0);
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(off, 0, 0); c.restore();
}

export { hdBall, hdBlob, hdLeaf, hdShadow, hdLine, hdCurve, hdEye, hdText, hdBug, hdPlant, hdApple, hdStump, hdAnthill, hdRock, hdLog, hdGrass, hdPath, hdBorderBushes, hdForeground, hdVignette, hdMotes, fxThorn, fxKernel, fxStar, fxHit, fxDmg, fxFrost, fxIced, fxFire, hdDrop, hdHp, uiPanel, uiRound, iconFrost, iconRain, iconBirds, hdSoil, hdDapple, hdGrade, hdSun2, bladeTri, rrect, along, chaikin, rng, lighten, darken, alpha, mix, TAU, star5, strokePts };
