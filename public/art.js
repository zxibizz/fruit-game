// All pictures are drawn by code into small canvases once (per cell size) and then stamped every frame.
// Sprites are drawn in a unit box (0..1) facing +x; insects look to the right, the view rotates them.
import { COLS, ROWS } from './data.js';

const TAU = Math.PI * 2;

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function sprite(px, draw) {
  const c = canvas(px);
  const x = c.getContext('2d');
  x.scale(c.width, c.height);
  x.lineCap = 'round';
  x.lineJoin = 'round';
  draw(x, c.width);
  return c;
}

function rng(seed) {
  let s = (Math.imul(seed + 1, 2654435761) >>> 0) % 2147483646 + 1;
  const next = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 5; i++) next();
  return next;
}

function ell(x, cx, cy, rx, ry, rot = 0) {
  x.beginPath();
  x.ellipse(cx, cy, rx, ry, rot, 0, TAU);
}

function radial(x, cx, cy, r, stops, fx = -0.35, fy = -0.4) {
  const g = x.createRadialGradient(cx + r * fx, cy + r * fy, r * 0.05, cx, cy, r);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}

// ---------- insects ----------
const BUGS = {
  ant: { body: ['#6a5a52', '#2b2220', '#120d0c'], leg: '#1a1311', kind: 'ant' },
  redant: { body: ['#ff9a5a', '#d2471c', '#7a1d08'], leg: '#5a1a08', kind: 'ant' },
  blueant: { body: ['#9ec4ff', '#3a6ae0', '#1a2f80'], leg: '#14205a', kind: 'ant', big: true },
  beetle: { body: ['#f0b4ff', '#9a3ad8', '#3c0f63'], leg: '#2a0b40', kind: 'beetle' },
  mosquito: { body: ['#c9b8a8', '#6c5a4c', '#2c221b'], leg: '#3a2e25', kind: 'mosquito' },
  wasp: { body: ['#fff07a', '#f2b21a', '#8a5200'], leg: '#2a1a05', kind: 'wasp' },
  goldbug: { body: ['#d9ffb0', '#3fbf6a', '#0d5a3a'], leg: '#0c2d1d', kind: 'goldbug' },
};

function legs(x, frame, pts, len, w, color) {
  // pts: attachment points along the body (x positions); tripod gait, two frames.
  x.strokeStyle = color;
  x.lineWidth = w;
  pts.forEach((px, i) => {
    for (const side of [-1, 1]) {
      const swing = ((i + (side > 0 ? 1 : 0) + frame) % 2 ? 1 : -1) * 0.05;
      const ang = (i - 1) * 0.55;
      const kx = px + Math.sin(ang) * len * 0.5 + swing;
      const ky = 0.5 + side * (0.05 + len * 0.55);
      const fx = px + Math.sin(ang) * len * 1.05 + swing * 1.6;
      const fy = 0.5 + side * (0.06 + len * 0.95);
      x.beginPath();
      x.moveTo(px, 0.5 + side * 0.02);
      x.quadraticCurveTo(kx, ky, fx, fy);
      x.stroke();
    }
  });
}

function shine(x, cx, cy, rx, ry) {
  x.fillStyle = 'rgba(255,255,255,.35)';
  ell(x, cx - rx * 0.25, cy - ry * 0.45, rx * 0.45, ry * 0.22, -0.2);
  x.fill();
}

function drawAnt(x, p, frame) {
  legs(x, frame, [0.44, 0.52, 0.6], 0.2, 0.022, p.leg);
  // antennae
  x.strokeStyle = p.leg; x.lineWidth = 0.018;
  for (const s of [-1, 1]) {
    x.beginPath(); x.moveTo(0.74, 0.5 + s * 0.03);
    x.quadraticCurveTo(0.84, 0.5 + s * 0.12, 0.95, 0.5 + s * (0.1 + frame * 0.02)); x.stroke();
  }
  const seg = (cx, rx, ry) => {
    x.fillStyle = radial(x, cx, 0.5, Math.max(rx, ry), p.body);
    ell(x, cx, 0.5, rx, ry); x.fill();
    shine(x, cx, 0.5, rx, ry);
  };
  seg(0.27, 0.19, 0.135); // abdomen
  x.fillStyle = p.body[2]; ell(x, 0.45, 0.5, 0.04, 0.03); x.fill(); // waist
  seg(0.55, 0.1, 0.065); // thorax
  seg(0.71, 0.085, 0.08); // head
  x.strokeStyle = p.body[2]; x.lineWidth = 0.02; // mandibles
  for (const s of [-1, 1]) { x.beginPath(); x.moveTo(0.78, 0.5 + s * 0.04); x.quadraticCurveTo(0.85, 0.5 + s * 0.04, 0.84, 0.5 + s * 0.01); x.stroke(); }
}

function drawBeetle(x, p, frame) {
  legs(x, frame, [0.4, 0.5, 0.6], 0.2, 0.03, p.leg);
  x.strokeStyle = p.leg; x.lineWidth = 0.02;
  for (const s of [-1, 1]) { x.beginPath(); x.moveTo(0.82, 0.5 + s * 0.04); x.quadraticCurveTo(0.9, 0.5 + s * 0.12, 0.96, 0.5 + s * 0.14); x.stroke(); }
  x.fillStyle = radial(x, 0.79, 0.5, 0.07, [p.body[1], p.body[2]]); ell(x, 0.8, 0.5, 0.065, 0.07); x.fill();
  x.fillStyle = radial(x, 0.68, 0.5, 0.12, [p.body[0], p.body[1], p.body[2]]); ell(x, 0.68, 0.5, 0.08, 0.12); x.fill();
  // shell: two halves with a seam
  x.fillStyle = radial(x, 0.4, 0.5, 0.26, p.body); ell(x, 0.4, 0.5, 0.25, 0.19); x.fill();
  x.strokeStyle = 'rgba(0,0,0,.45)'; x.lineWidth = 0.014;
  x.beginPath(); x.moveTo(0.62, 0.5); x.lineTo(0.17, 0.5); x.stroke();
  x.fillStyle = 'rgba(255,255,255,.4)';
  ell(x, 0.42, 0.42, 0.13, 0.035, -0.08); x.fill();
  ell(x, 0.36, 0.58, 0.07, 0.02, 0.1); x.fill();
}

function wings(x, frame, cx, len, wid, tint) {
  const a = [0.55, 0.85, 1.15][frame % 3];
  for (const s of [-1, 1]) {
    x.save();
    x.translate(cx, 0.5);
    x.rotate(s * (Math.PI - a));
    x.fillStyle = tint;
    ell(x, len * 0.5, 0, len * 0.5, wid); x.fill();
    x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 0.008;
    ell(x, len * 0.5, 0, len * 0.5, wid); x.stroke();
    x.beginPath(); x.moveTo(0.02, 0); x.lineTo(len * 0.9, 0); x.stroke();
    x.restore();
  }
}

function drawMosquito(x, p, frame) {
  x.strokeStyle = p.leg; x.lineWidth = 0.012;
  for (const [ax, dx, dy] of [[0.5, 0.18, 0.4], [0.52, -0.05, 0.42], [0.48, -0.3, 0.38]]) {
    for (const s of [-1, 1]) { x.beginPath(); x.moveTo(ax, 0.5); x.quadraticCurveTo(ax + dx * 0.4, 0.5 + s * dy * 0.6, ax + dx, 0.5 + s * dy); x.stroke(); }
  }
  x.fillStyle = radial(x, 0.3, 0.5, 0.2, p.body); ell(x, 0.3, 0.5, 0.2, 0.05); x.fill();
  x.fillStyle = radial(x, 0.53, 0.5, 0.08, p.body); ell(x, 0.53, 0.5, 0.075, 0.06); x.fill();
  x.fillStyle = p.body[2]; ell(x, 0.63, 0.5, 0.04, 0.04); x.fill();
  x.strokeStyle = p.body[2]; x.lineWidth = 0.012; x.beginPath(); x.moveTo(0.66, 0.5); x.lineTo(0.86, 0.5); x.stroke();
  wings(x, frame, 0.52, 0.34, 0.06, 'rgba(220,235,255,.45)');
}

function drawWasp(x, p, frame) {
  legs(x, frame, [0.5, 0.56, 0.62], 0.14, 0.016, p.leg);
  // striped abdomen
  x.save();
  ell(x, 0.3, 0.5, 0.21, 0.12); x.clip();
  x.fillStyle = radial(x, 0.3, 0.5, 0.21, p.body); x.fillRect(0, 0, 1, 1);
  x.fillStyle = 'rgba(30,18,0,.85)';
  for (const sx of [0.14, 0.24, 0.34]) x.fillRect(sx, 0, 0.045, 1);
  x.restore();
  x.fillStyle = p.body[2]; x.beginPath(); x.moveTo(0.09, 0.48); x.lineTo(0.03, 0.5); x.lineTo(0.09, 0.52); x.fill();
  x.fillStyle = radial(x, 0.57, 0.5, 0.09, ['#7a5a20', '#3a2508', '#140b00']); ell(x, 0.57, 0.5, 0.09, 0.075); x.fill();
  x.fillStyle = radial(x, 0.71, 0.5, 0.075, ['#ffd0e0', '#e0457a', '#6a0f2a']); ell(x, 0.71, 0.5, 0.07, 0.08); x.fill();
  shine(x, 0.3, 0.5, 0.21, 0.12);
  wings(x, frame, 0.56, 0.32, 0.075, 'rgba(255,240,200,.42)');
}

function drawGoldbug(x, p, frame) {
  legs(x, frame, [0.42, 0.5, 0.58], 0.16, 0.024, p.leg);
  wings(x, frame, 0.5, 0.42, 0.1, 'rgba(210,255,230,.38)');
  x.fillStyle = radial(x, 0.8, 0.5, 0.07, [p.body[1], p.body[2]]); ell(x, 0.79, 0.5, 0.06, 0.065); x.fill();
  x.fillStyle = radial(x, 0.68, 0.5, 0.12, ['#fff3a0', '#d6a31a', '#6a4500']); ell(x, 0.68, 0.5, 0.08, 0.11); x.fill();
  // shell opened slightly
  for (const s of [-1, 1]) {
    x.save(); x.translate(0.62, 0.5); x.rotate(s * 0.22);
    x.fillStyle = radial(x, -0.2, 0, 0.24, ['#f4ffb0', '#48d07a', '#0b6b44', '#063020']);
    ell(x, -0.21, s * 0.07, 0.22, 0.09); x.fill();
    x.fillStyle = 'rgba(255,255,255,.45)'; ell(x, -0.17, s * 0.045, 0.1, 0.022); x.fill();
    x.restore();
  }
}

function insect(kind, frame) {
  const p = BUGS[kind];
  return (x) => {
    if (p.kind === 'ant') drawAnt(x, p, frame);
    else if (p.kind === 'beetle') drawBeetle(x, p, frame);
    else if (p.kind === 'mosquito') drawMosquito(x, p, frame);
    else if (p.kind === 'wasp') drawWasp(x, p, frame);
    else if (p.kind === 'goldbug') drawGoldbug(x, p, frame);
  };
}

// Segments for the trail-drawn insects (caterpillar, centipede).
function segment(colors, dots) {
  return (x) => {
    x.fillStyle = radial(x, 0.5, 0.5, 0.42, colors);
    ell(x, 0.5, 0.5, 0.42, 0.42); x.fill();
    if (dots) { x.fillStyle = dots; ell(x, 0.5, 0.3, 0.09, 0.09); x.fill(); ell(x, 0.5, 0.7, 0.09, 0.09); x.fill(); }
    x.fillStyle = 'rgba(255,255,255,.35)'; ell(x, 0.4, 0.36, 0.14, 0.08, -0.4); x.fill();
  };
}
function headSprite(colors, eyes) {
  return (x) => {
    x.fillStyle = radial(x, 0.5, 0.5, 0.42, colors);
    ell(x, 0.5, 0.5, 0.42, 0.4); x.fill();
    x.fillStyle = eyes;
    ell(x, 0.68, 0.36, 0.08, 0.08); x.fill(); ell(x, 0.68, 0.64, 0.08, 0.08); x.fill();
    x.fillStyle = '#fff'; ell(x, 0.7, 0.34, 0.03, 0.03); x.fill(); ell(x, 0.7, 0.62, 0.03, 0.03); x.fill();
  };
}

// ---------- traps ----------
// Colours per upgrade level: green -> blue -> icy white, like a plant that grows stronger.
const TIERS = [
  { a: '#c8f27a', b: '#5aa82a', c: '#245a10', glow: 'rgba(160,255,90,.0)' },
  { a: '#bff0ff', b: '#3a9ee0', c: '#14407a', glow: 'rgba(80,190,255,.35)' },
  { a: '#ffffff', b: '#a8e4ff', c: '#3a78b8', glow: 'rgba(190,240,255,.6)' },
];

function base(x, r = 0.36) {
  x.fillStyle = 'rgba(60,35,15,.28)';
  ell(x, 0.53, 0.55, r + 0.04, r * 0.9 + 0.03); x.fill();
  x.fillStyle = radial(x, 0.5, 0.5, r, ['#a77a4c', '#7a5230', '#4d3018']);
  ell(x, 0.5, 0.52, r, r * 0.88); x.fill();
}

function glow(x, t, r = 0.45) {
  if (!t.glow.endsWith('.0)')) {
    const g = x.createRadialGradient(0.5, 0.5, 0.05, 0.5, 0.5, r);
    g.addColorStop(0, t.glow); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 1, 1);
  }
}

function spikes(x, cx, cy, n, r1, r2, rot = 0) {
  x.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const r = i % 2 ? r2 : r1;
    x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  x.closePath();
}

const TRAP_ART = {
  // Spiky seed-shooter; drawn facing +x, the view turns it to its target.
  spiker(x, lvl) {
    const t = TIERS[lvl];
    glow(x, t);
    base(x, 0.3);
    x.fillStyle = radial(x, 0.5, 0.5, 0.36, [t.a, t.b, t.c]);
    spikes(x, 0.5, 0.5, 11, 0.37, 0.25); x.fill();
    x.strokeStyle = 'rgba(0,0,0,.25)'; x.lineWidth = 0.012; x.stroke();
    x.fillStyle = radial(x, 0.5, 0.5, 0.21, ['#ffffff', t.a, t.b]);
    ell(x, 0.5, 0.5, 0.2, 0.2); x.fill();
    // the mouth that spits seeds
    x.fillStyle = radial(x, 0.72, 0.5, 0.1, [t.b, t.c]);
    ell(x, 0.7, 0.5, 0.11, 0.08); x.fill();
    x.fillStyle = '#1b1208'; ell(x, 0.77, 0.5, 0.04, 0.04); x.fill();
    for (let i = 0; i <= lvl; i++) { x.fillStyle = '#fff'; ell(x, 0.4 - i * 0.07, 0.5, 0.025, 0.025); x.fill(); }
  },
  // Agave rosette with sticky slime in the middle: slows insects around.
  slow(x, lvl) {
    const t = TIERS[lvl];
    glow(x, t);
    const leaves = 9;
    for (let ring = 0; ring < 2; ring++) {
      for (let i = 0; i < leaves; i++) {
        const a = (i / leaves) * TAU + ring * 0.35;
        const len = ring ? 0.3 : 0.42;
        x.save(); x.translate(0.5, 0.5); x.rotate(a);
        const g = x.createLinearGradient(0, 0, len, 0);
        g.addColorStop(0, ring ? t.b : t.c); g.addColorStop(1, ring ? t.a : t.b);
        x.fillStyle = g;
        x.beginPath(); x.moveTo(0, -0.06); x.quadraticCurveTo(len * 0.6, -0.08, len, 0); x.quadraticCurveTo(len * 0.6, 0.08, 0, 0.06); x.fill();
        x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 0.008;
        x.beginPath(); x.moveTo(0.03, 0); x.lineTo(len * 0.85, 0); x.stroke();
        x.restore();
      }
    }
    x.fillStyle = radial(x, 0.5, 0.5, 0.13, ['#ffffff', '#9ee8ff', '#2a8ad0']);
    ell(x, 0.5, 0.5, 0.12, 0.12); x.fill();
  },
  // Dome with a glowing core that throws lightning.
  storm(x, lvl) {
    const t = TIERS[lvl];
    glow(x, t, 0.5);
    for (let i = 0; i < 4; i++) {
      x.save(); x.translate(0.5, 0.5); x.rotate(i * TAU / 4 + Math.PI / 4);
      x.fillStyle = radial(x, 0.3, 0, 0.14, [t.b, t.c]);
      x.beginPath(); x.moveTo(0.2, -0.1); x.lineTo(0.46, 0); x.lineTo(0.2, 0.1); x.fill();
      x.restore();
    }
    x.fillStyle = radial(x, 0.5, 0.5, 0.36, ['#e8eef4', '#8e9aa8', '#3e4652']);
    ell(x, 0.5, 0.5, 0.34, 0.34); x.fill();
    x.fillStyle = radial(x, 0.5, 0.5, 0.26, ['#ffffff', t.a, t.b, t.c]);
    ell(x, 0.5, 0.5, 0.25, 0.25); x.fill();
    x.fillStyle = 'rgba(255,255,255,.7)'; ell(x, 0.42, 0.4, 0.09, 0.05, -0.5); x.fill();
    x.strokeStyle = 'rgba(255,255,255,.6)'; x.lineWidth = 0.015;
    x.beginPath(); x.moveTo(0.44, 0.58); x.lineTo(0.52, 0.48); x.lineTo(0.48, 0.47); x.lineTo(0.56, 0.38); x.stroke();
  },
  // Yellow thistle cluster: shoots thorns at flying insects.
  thistle(x, lvl) {
    const tones = [
      ['#fffbb0', '#e2d23a', '#7a7a10'],
      ['#fff4c8', '#ffb43a', '#9a5a08'],
      ['#ffffff', '#ffe58a', '#c49a20'],
    ][lvl];
    glow(x, TIERS[lvl]);
    base(x, 0.3);
    for (const [cx, cy, r] of [[0.38, 0.4, 0.18], [0.62, 0.42, 0.17], [0.5, 0.63, 0.18]]) {
      x.fillStyle = radial(x, cx, cy, r, tones);
      spikes(x, cx, cy, 9, r, r * 0.7, cx * 7); x.fill();
      x.fillStyle = 'rgba(255,255,255,.55)'; ell(x, cx - r * 0.25, cy - r * 0.3, r * 0.3, r * 0.18, -0.4); x.fill();
      x.fillStyle = '#6a3a10'; ell(x, cx, cy, r * 0.18, r * 0.18); x.fill();
    }
  },
  // Red pepper dome that puffs fire around itself.
  pepper(x, lvl) {
    const tones = [
      ['#ffd0b8', '#e8341c', '#6a0a04'],
      ['#ffe2b0', '#ff7a1a', '#8a2a04'],
      ['#ffffff', '#ffd23a', '#e85a10'],
    ][lvl];
    glow(x, { glow: lvl ? 'rgba(255,170,60,.45)' : 'rgba(0,0,0,.0)' });
    for (let i = 0; i < 6; i++) {
      x.save(); x.translate(0.5, 0.5); x.rotate(i * TAU / 6);
      x.fillStyle = radial(x, 0.3, 0, 0.16, ['#7ac84a', '#2f7a1a']);
      ell(x, 0.32, 0, 0.12, 0.06); x.fill();
      x.restore();
    }
    x.fillStyle = radial(x, 0.5, 0.5, 0.32, tones);
    ell(x, 0.5, 0.5, 0.3, 0.3); x.fill();
    x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 0.045;
    ell(x, 0.5, 0.5, 0.19, 0.19); x.stroke();
    x.fillStyle = radial(x, 0.5, 0.5, 0.12, ['#3a0a00', '#1a0400']);
    ell(x, 0.5, 0.5, 0.11, 0.11); x.fill();
    x.fillStyle = 'rgba(255,255,255,.55)'; ell(x, 0.4, 0.37, 0.08, 0.04, -0.5); x.fill();
  },
};

// ---------- fruit ----------
function leaf(x, cx, cy, len, ang, c1 = '#8ed14a', c2 = '#2f7a1a') {
  x.save(); x.translate(cx, cy); x.rotate(ang);
  const g = x.createLinearGradient(0, 0, len, 0); g.addColorStop(0, c2); g.addColorStop(1, c1);
  x.fillStyle = g;
  x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(len * 0.5, -len * 0.35, len, 0); x.quadraticCurveTo(len * 0.5, len * 0.35, 0, 0); x.fill();
  x.strokeStyle = 'rgba(255,255,255,.3)'; x.lineWidth = 0.006; x.beginPath(); x.moveTo(0.01, 0); x.lineTo(len * 0.9, 0); x.stroke();
  x.restore();
}

function fruitShadow(x, cx, cy, rx, ry) {
  const g = x.createRadialGradient(cx, cy, 0, cx, cy, rx);
  g.addColorStop(0, 'rgba(40,20,5,.45)'); g.addColorStop(1, 'rgba(40,20,5,0)');
  x.fillStyle = g;
  x.save(); x.translate(cx, cy); x.scale(1, ry / rx); x.translate(-cx, -cy);
  ell(x, cx, cy, rx, rx); x.fill();
  x.restore();
}

function roundFruit(x, colors, opts = {}) {
  fruitShadow(x, 0.56, 0.6, 0.42, 0.36);
  const r = opts.r || 0.33;
  x.fillStyle = radial(x, 0.5, 0.5, r, colors);
  x.beginPath();
  if (opts.lemon) x.ellipse(0.5, 0.5, r * 1.15, r * 0.88, -0.3, 0, TAU);
  else x.ellipse(0.5, 0.5, r, r * (opts.squash || 0.96), 0, 0, TAU);
  x.fill();
  if (opts.dimples) {
    const rand = rng(7);
    x.fillStyle = 'rgba(255,255,255,.08)';
    for (let i = 0; i < 70; i++) { const a = rand() * TAU, d = Math.sqrt(rand()) * r * 0.95; ell(x, 0.5 + Math.cos(a) * d, 0.5 + Math.sin(a) * d, 0.006, 0.006); x.fill(); }
  }
  if (opts.crease) { x.strokeStyle = opts.crease; x.lineWidth = 0.012; x.beginPath(); x.moveTo(0.5, 0.2); x.quadraticCurveTo(0.6, 0.5, 0.5, 0.8); x.stroke(); }
  x.fillStyle = 'rgba(255,255,255,.55)';
  ell(x, 0.39, 0.36, r * 0.32, r * 0.18, -0.6); x.fill();
  x.fillStyle = 'rgba(255,255,255,.9)';
  ell(x, 0.36, 0.34, r * 0.1, r * 0.06, -0.6); x.fill();
}

const FRUIT_ART = {
  strawberry(x) {
    fruitShadow(x, 0.56, 0.62, 0.4, 0.34);
    x.fillStyle = radial(x, 0.5, 0.52, 0.36, ['#ff8a80', '#e8202a', '#8a0410']);
    x.beginPath();
    x.moveTo(0.5, 0.86);
    x.bezierCurveTo(0.2, 0.7, 0.12, 0.4, 0.28, 0.27);
    x.bezierCurveTo(0.4, 0.18, 0.6, 0.18, 0.72, 0.27);
    x.bezierCurveTo(0.88, 0.4, 0.8, 0.7, 0.5, 0.86);
    x.fill();
    const rand = rng(3);
    for (let i = 0; i < 34; i++) {
      const sx = 0.26 + rand() * 0.48, sy = 0.32 + rand() * 0.45;
      if (Math.abs(sx - 0.5) > 0.28 - (sy - 0.32) * 0.45) continue;
      x.fillStyle = '#ffe680'; ell(x, sx, sy, 0.011, 0.016, 0.3); x.fill();
      x.fillStyle = 'rgba(120,0,0,.35)'; ell(x, sx + 0.008, sy + 0.012, 0.008, 0.006); x.fill();
    }
    x.fillStyle = 'rgba(255,255,255,.45)'; ell(x, 0.37, 0.36, 0.08, 0.04, -0.6); x.fill();
    for (let i = 0; i < 6; i++) leaf(x, 0.5, 0.24, 0.17, -Math.PI / 2 + (i - 2.5) * 0.55, '#a6e05a', '#2f8a1a');
    x.fillStyle = '#3a7a1a'; ell(x, 0.5, 0.23, 0.04, 0.04); x.fill();
  },
  pear(x) {
    fruitShadow(x, 0.56, 0.64, 0.4, 0.32);
    x.fillStyle = radial(x, 0.5, 0.58, 0.38, ['#fff7a8', '#e2cc3a', '#8a7a10']);
    x.beginPath();
    x.moveTo(0.5, 0.18);
    x.bezierCurveTo(0.62, 0.18, 0.62, 0.36, 0.7, 0.46);
    x.bezierCurveTo(0.86, 0.62, 0.78, 0.86, 0.5, 0.86);
    x.bezierCurveTo(0.22, 0.86, 0.14, 0.62, 0.3, 0.46);
    x.bezierCurveTo(0.38, 0.36, 0.38, 0.18, 0.5, 0.18);
    x.fill();
    x.fillStyle = 'rgba(200,120,40,.25)'; ell(x, 0.62, 0.66, 0.12, 0.1); x.fill();
    x.fillStyle = 'rgba(255,255,255,.5)'; ell(x, 0.4, 0.55, 0.06, 0.12, 0.2); x.fill();
    x.strokeStyle = '#5a3a14'; x.lineWidth = 0.025; x.beginPath(); x.moveTo(0.5, 0.2); x.quadraticCurveTo(0.52, 0.1, 0.58, 0.07); x.stroke();
    leaf(x, 0.53, 0.12, 0.16, -0.4);
  },
  apple(x) {
    roundFruit(x, ['#ffb0a0', '#e83a2a', '#8a1208'], { crease: 'rgba(120,10,0,.25)' });
    x.strokeStyle = '#5a3a14'; x.lineWidth = 0.025; x.beginPath(); x.moveTo(0.5, 0.24); x.quadraticCurveTo(0.5, 0.14, 0.55, 0.1); x.stroke();
    leaf(x, 0.53, 0.16, 0.18, -0.3);
  },
  orange(x) {
    roundFruit(x, ['#ffe0a0', '#ff9a1a', '#b04a00'], { dimples: true });
    x.fillStyle = '#5a7a1a'; ell(x, 0.5, 0.2, 0.025, 0.02); x.fill();
    leaf(x, 0.52, 0.19, 0.16, -0.5);
  },
  plum(x) {
    roundFruit(x, ['#e0b0ff', '#7a2ab8', '#2a0a4a'], { crease: 'rgba(30,0,60,.35)', r: 0.31 });
    x.strokeStyle = '#4a3014'; x.lineWidth = 0.022; x.beginPath(); x.moveTo(0.5, 0.22); x.lineTo(0.53, 0.12); x.stroke();
  },
  peach(x) {
    roundFruit(x, ['#fff0c0', '#ffaa6a', '#e0503a'], { crease: 'rgba(160,40,20,.3)' });
    leaf(x, 0.5, 0.2, 0.18, -0.7); leaf(x, 0.5, 0.2, 0.14, -2.3);
  },
  lemon(x) {
    roundFruit(x, ['#fffcc0', '#ffe83a', '#b09a00'], { lemon: true, dimples: true, r: 0.3 });
    leaf(x, 0.66, 0.3, 0.15, -0.9);
  },
  cherry(x) {
    fruitShadow(x, 0.56, 0.66, 0.42, 0.28);
    x.strokeStyle = '#4a6a1a'; x.lineWidth = 0.022;
    x.beginPath(); x.moveTo(0.34, 0.6); x.quadraticCurveTo(0.42, 0.25, 0.58, 0.14); x.stroke();
    x.beginPath(); x.moveTo(0.67, 0.6); x.quadraticCurveTo(0.62, 0.3, 0.58, 0.14); x.stroke();
    for (const cx of [0.34, 0.67]) {
      x.fillStyle = radial(x, cx, 0.66, 0.2, ['#ff9aa8', '#d8102a', '#5a0010']);
      ell(x, cx, 0.66, 0.19, 0.18); x.fill();
      x.fillStyle = 'rgba(255,255,255,.6)'; ell(x, cx - 0.07, 0.6, 0.05, 0.03, -0.6); x.fill();
    }
    leaf(x, 0.58, 0.14, 0.18, -0.2);
  },
  watermelon(x) {
    fruitShadow(x, 0.56, 0.6, 0.44, 0.36);
    x.save();
    ell(x, 0.5, 0.5, 0.38, 0.34); x.clip();
    x.fillStyle = radial(x, 0.5, 0.5, 0.38, ['#bff08a', '#3a9a2a', '#145a10']); x.fillRect(0, 0, 1, 1);
    x.strokeStyle = 'rgba(10,50,5,.6)'; x.lineWidth = 0.04;
    for (let i = -3; i <= 3; i++) { x.beginPath(); x.moveTo(0.5 + i * 0.1, 0.1); x.quadraticCurveTo(0.5 + i * 0.13, 0.5, 0.5 + i * 0.1, 0.9); x.stroke(); }
    x.restore();
    x.fillStyle = 'rgba(255,255,255,.4)'; ell(x, 0.38, 0.33, 0.1, 0.05, -0.6); x.fill();
  },
};

// ---------- the board ----------
export const PALETTES = {
  garden: {
    base: '#e2ad62', light: '#f2c987', dark: '#c48a40', crack: 'rgba(120,64,20,.42)', crackHi: 'rgba(255,230,180,.35)',
    trench: '#d29a55', floor: '#e9be7c', rim: 'rgba(100,52,14,.55)', grass: ['#4e9a2c', '#69b83a', '#86cc4a', '#3c7c22'],
    stones: ['#9a9590', '#7d7a8a', '#a59a8a', '#6f7480', '#8a7f92'], tuft: '#c9a440',
  },
  orchard: {
    base: '#a9845a', light: '#c29a6c', dark: '#87653e', crack: 'rgba(60,35,12,.4)', crackHi: 'rgba(240,210,170,.22)',
    trench: '#8f6a40', floor: '#b48a5a', rim: 'rgba(50,28,8,.6)', grass: ['#3f8a2a', '#5aa83a', '#79c24a', '#2f6a1e'],
    stones: ['#8a8a8a', '#6a7078', '#9a8f80', '#5f6470', '#7a7090'], tuft: '#6a9a3a', moss: true,
  },
  dunes: {
    base: '#ecd7a6', light: '#f7e7c0', dark: '#d6bb82', crack: 'rgba(150,110,50,.0)', crackHi: 'rgba(255,255,255,0)',
    trench: '#e2c58c', floor: '#f2dcac', rim: 'rgba(140,100,40,.35)', grass: ['#6aa83a', '#86c24a', '#a0d460', '#4e8a2c'],
    stones: ['#a8a29a', '#8c8a96', '#b4a68e', '#7f8490', '#9a8fa2'], tuft: '#8aa848', turf: true,
  },
};

const isWalk = (ch) => ch === '-' || ch === ',' || ch === 'S' || ch === 'F';

export function paintBoard(level, palette, cs, seed) {
  const W = COLS * cs, H = ROWS * cs;
  const c = canvas(W, H);
  const x = c.getContext('2d');
  x.scale(cs, cs);
  x.lineCap = 'round'; x.lineJoin = 'round';
  const P = palette;
  const rand = rng(seed);
  const tile = (cx, cy) => (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS ? '.' : level.map[cy][cx]);

  // ground with soft blotches and grain
  x.fillStyle = P.base; x.fillRect(0, 0, COLS, ROWS);
  for (let i = 0; i < 60; i++) {
    const bx = rand() * COLS, by = rand() * ROWS, r = 0.8 + rand() * 2.5;
    const g = x.createRadialGradient(bx, by, 0, bx, by, r);
    g.addColorStop(0, rand() < 0.5 ? P.light : P.dark); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.globalAlpha = 0.35; x.fillStyle = g; x.fillRect(bx - r, by - r, r * 2, r * 2);
  }
  x.globalAlpha = 1;
  for (let i = 0; i < 2600; i++) {
    x.fillStyle = rand() < 0.5 ? 'rgba(255,255,255,.12)' : 'rgba(60,30,0,.12)';
    const s = 0.01 + rand() * 0.03;
    x.fillRect(rand() * COLS, rand() * ROWS, s, s);
  }
  // turf patches on firm ground in sand levels
  if (P.turf) {
    x.fillStyle = '#a7c46a';
    for (let cy = 0; cy < ROWS; cy++) for (let cx = 0; cx < COLS; cx++) {
      if (tile(cx, cy) !== '.') continue;
      ell(x, cx + 0.5, cy + 0.5, 0.62, 0.62); x.fill();
    }
    for (let i = 0; i < 900; i++) {
      const gx = rand() * COLS, gy = rand() * ROWS;
      if (tile(gx | 0, gy | 0) !== '.') continue;
      x.strokeStyle = P.grass[(rand() * 4) | 0]; x.lineWidth = 0.025;
      x.beginPath(); x.moveTo(gx, gy); x.lineTo(gx + (rand() - 0.5) * 0.12, gy - 0.1 - rand() * 0.1); x.stroke();
    }
  }
  // cracks
  if (!P.turf) {
    for (let i = 0; i < 46; i++) {
      let px = rand() * COLS, py = rand() * ROWS, a = rand() * TAU;
      const pts = [[px, py]];
      const n = 3 + ((rand() * 6) | 0);
      for (let k = 0; k < n; k++) { a += (rand() - 0.5) * 1.3; px += Math.cos(a) * 0.35; py += Math.sin(a) * 0.35; pts.push([px, py]); }
      for (const [col, w, o] of [[P.crackHi, 0.03, 0.03], [P.crack, 0.035, 0]]) {
        x.strokeStyle = col; x.lineWidth = w;
        x.beginPath(); pts.forEach(([qx, qy], k) => (k ? x.lineTo(qx + o, qy + o) : x.moveTo(qx + o, qy + o))); x.stroke();
      }
    }
  }
  // trenches: the same strokes three times — dark rim, the dug floor, a lighter floor towards the light
  const trench = (width, color, ox = 0, oy = 0) => {
    x.strokeStyle = color; x.fillStyle = color; x.lineWidth = width;
    for (let cy = 0; cy < ROWS; cy++) for (let cx = 0; cx < COLS; cx++) {
      const ch = tile(cx, cy);
      if (!isWalk(ch) || ch === ',') continue;
      ell(x, cx + 0.5 + ox, cy + 0.5 + oy, width / 2, width / 2); x.fill();
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
        const n = tile(cx + dx, cy + dy);
        if (!isWalk(n) || n === ',') continue;
        if (dx && dy && (!isWalk(tile(cx + dx, cy)) || !isWalk(tile(cx, cy + dy)))) continue;
        x.beginPath(); x.moveTo(cx + 0.5 + ox, cy + 0.5 + oy); x.lineTo(cx + dx + 0.5 + ox, cy + dy + 0.5 + oy); x.stroke();
      }
      // burrows run off the edge of the board
      if (ch === 'S') {
        const ex = cx === 0 ? -1 : cx === COLS - 1 ? 1 : 0, ey = !ex ? (cy === 0 ? -1 : 1) : 0;
        x.beginPath(); x.moveTo(cx + 0.5 + ox, cy + 0.5 + oy); x.lineTo(cx + 0.5 + ex + ox, cy + 0.5 + ey + oy); x.stroke();
      }
    }
  };
  x.save();
  x.shadowColor = 'rgba(70,35,5,.45)'; x.shadowBlur = cs * 0.12;
  trench(0.9, P.rim);
  x.restore();
  trench(0.76, P.trench);
  trench(0.6, P.floor, 0.05, 0.06);
  // little pebbles and grain in the trenches
  for (let i = 0; i < 500; i++) {
    const tx = rand() * COLS, ty = rand() * ROWS;
    const ch = tile(tx | 0, ty | 0);
    if (!isWalk(ch) || ch === ',') continue;
    x.fillStyle = rand() < 0.5 ? 'rgba(255,240,210,.35)' : 'rgba(90,50,10,.25)';
    ell(x, tx, ty, 0.015 + rand() * 0.02, 0.012 + rand() * 0.015); x.fill();
  }
  // dry grass tufts on firm ground
  for (let i = 0; i < 26; i++) {
    const tx = 0.5 + rand() * (COLS - 1), ty = 0.5 + rand() * (ROWS - 1);
    if (tile(tx | 0, ty | 0) !== '.') continue;
    for (let k = 0; k < 9; k++) {
      const a = -Math.PI / 2 + (rand() - 0.5) * 2.2;
      x.strokeStyle = P.tuft; x.lineWidth = 0.02; x.globalAlpha = 0.7;
      x.beginPath(); x.moveTo(tx, ty); x.quadraticCurveTo(tx + Math.cos(a) * 0.12, ty + Math.sin(a) * 0.12, tx + Math.cos(a) * 0.24, ty + Math.sin(a) * 0.2); x.stroke();
    }
    x.globalAlpha = 1;
  }
  if (P.moss) {
    for (let i = 0; i < 40; i++) {
      const tx = rand() * COLS, ty = rand() * ROWS;
      if (tile(tx | 0, ty | 0) !== '.') continue;
      const g = x.createRadialGradient(tx, ty, 0, tx, ty, 0.4);
      g.addColorStop(0, 'rgba(90,150,50,.45)'); g.addColorStop(1, 'rgba(90,150,50,0)');
      x.fillStyle = g; x.fillRect(tx - 0.4, ty - 0.4, 0.8, 0.8);
    }
  }
  // stones
  for (let cy = 0; cy < ROWS; cy++) for (let cx = 0; cx < COLS; cx++) {
    if (tile(cx, cy) !== '#') continue;
    const n = 2;
    for (let k = 0; k < n; k++) {
      const sx = cx + 0.3 + rand() * 0.4, sy = cy + 0.3 + rand() * 0.4;
      const rx = 0.2 + rand() * 0.1, ry = rx * (0.75 + rand() * 0.2), rot = rand() * 3;
      x.save();
      x.shadowColor = 'rgba(40,20,0,.45)'; x.shadowBlur = cs * 0.08; x.shadowOffsetX = cs * 0.05; x.shadowOffsetY = cs * 0.07;
      const col = P.stones[(rand() * P.stones.length) | 0];
      x.fillStyle = radial(x, sx, sy, rx, ['#ffffff', col, shade(col, -0.45)], -0.4, -0.5);
      ell(x, sx, sy, rx, ry, rot); x.fill();
      x.restore();
      x.fillStyle = 'rgba(255,255,255,.3)'; ell(x, sx - rx * 0.3, sy - ry * 0.35, rx * 0.35, ry * 0.18, rot); x.fill();
    }
  }
  // burrow holes at the border
  for (let cy = 0; cy < ROWS; cy++) for (let cx = 0; cx < COLS; cx++) {
    if (tile(cx, cy) !== 'S') continue;
    const ex = cx === 0 ? -1 : cx === COLS - 1 ? 1 : 0, ey = !ex ? (cy === 0 ? -1 : 1) : 0;
    const hx = cx + 0.5 + ex * 0.45, hy = cy + 0.5 + ey * 0.45;
    x.fillStyle = radial(x, hx, hy, 0.42, ['#1a0d04', '#3a2210', 'rgba(80,45,15,0)'], 0, 0);
    ell(x, hx, hy, ex ? 0.3 : 0.42, ex ? 0.42 : 0.3); x.fill();
  }
  // grass along the border
  const blades = (px, py, nx, ny) => {
    const len = 0.25 + rand() * 0.5;
    const bend = (rand() - 0.5) * 0.3;
    x.strokeStyle = P.grass[(rand() * P.grass.length) | 0];
    x.lineWidth = 0.035 + rand() * 0.03;
    x.beginPath(); x.moveTo(px, py);
    x.quadraticCurveTo(px + nx * len * 0.6 + ny * bend, py + ny * len * 0.6 + nx * bend, px + nx * len + ny * bend * 2, py + ny * len + nx * bend * 2);
    x.stroke();
  };
  for (let i = 0; i < COLS * 22; i++) { const px = rand() * COLS; blades(px, -0.1, 0, 1); blades(px, ROWS + 0.1, 0, -1); }
  for (let i = 0; i < ROWS * 14; i++) { const py = rand() * ROWS; blades(-0.1, py, 1, 0); blades(COLS + 0.1, py, -1, 0); }
  // vignette
  const v = x.createRadialGradient(COLS / 2, ROWS / 2, ROWS * 0.45, COLS / 2, ROWS / 2, COLS * 0.62);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(40,20,0,.28)');
  x.fillStyle = v; x.fillRect(0, 0, COLS, ROWS);
  return c;
}

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// ---------- the sprite cache ----------
export function makeArt(cs) {
  const cache = new Map();
  const get = (key, px, draw) => {
    let s = cache.get(key);
    if (!s) { s = sprite(px, draw); cache.set(key, s); }
    return s;
  };
  return {
    cs,
    bug: (kind, frame, size) => get(`b:${kind}:${frame}`, size * cs * 1.15, insect(kind, frame)),
    seg: (kind) => get(`s:${kind}`, cs * 0.5, kind === 'caterpillar' ? segment(['#e8ffa0', '#6ac83a', '#2a6a10'], '#ffd23a') : segment(['#ffb0e8', '#a02aa8', '#3a0a40'])),
    head: (kind) => get(`h:${kind}`, cs * 0.5, kind === 'caterpillar' ? headSprite(['#b0e870', '#3a8a1a', '#1a4a08'], '#1a1a1a') : headSprite(['#ff8ae0', '#7a1a80', '#2a0530'], '#ffea6a')),
    trap: (kind, lvl) => get(`t:${kind}:${lvl}`, cs * 1.1, (x) => TRAP_ART[kind](x, lvl)),
    fruit: (name) => get(`f:${name}`, cs * 2.4, FRUIT_ART[name]),
  };
}

// Small pictures for the buttons (data URLs), drawn at a fixed size.
export function iconURL(kind, lvl = 0, px = 96) {
  return sprite(px, (x) => TRAP_ART[kind](x, lvl)).toDataURL();
}
export function fruitURL(name, px = 128) {
  return sprite(px, FRUIT_ART[name]).toDataURL();
}
export function bugURL(kind, px = 96) {
  if (kind === 'caterpillar' || kind === 'centipede') {
    return sprite(px, (x) => {
      const seg = kind === 'caterpillar' ? segment(['#e8ffa0', '#6ac83a', '#2a6a10'], '#ffd23a') : segment(['#ffb0e8', '#a02aa8', '#3a0a40']);
      const head = kind === 'caterpillar' ? headSprite(['#b0e870', '#3a8a1a', '#1a4a08'], '#1a1a1a') : headSprite(['#ff8ae0', '#7a1a80', '#2a0530'], '#ffea6a');
      for (let i = 4; i >= 0; i--) {
        x.save(); x.translate(0.12 + i * 0.16, 0.5 + Math.sin(i * 1.3) * 0.06); x.scale(0.22, 0.22); x.translate(-0.5, -0.5);
        (i === 4 ? head : seg)(x); x.restore();
      }
    }).toDataURL();
  }
  return sprite(px, insect(kind, 0)).toDataURL();
}

// ---------- icons for super-bonuses and the shop ----------
const ICONS = {
  spray(x) { // spray can with a green cloud
    x.fillStyle = 'rgba(150,230,90,.55)';
    for (const [cx, cy, r] of [[0.72, 0.26, 0.13], [0.84, 0.4, 0.1], [0.62, 0.14, 0.09]]) { ell(x, cx, cy, r, r); x.fill(); }
    x.save(); x.translate(0.45, 0.58); x.rotate(0.5);
    const g = x.createLinearGradient(-0.15, 0, 0.15, 0); g.addColorStop(0, '#d82a1a'); g.addColorStop(0.5, '#ff7a5a'); g.addColorStop(1, '#a0140a');
    x.fillStyle = g; x.beginPath(); x.roundRect(-0.14, -0.22, 0.28, 0.48, 0.06); x.fill();
    x.fillStyle = '#ffe14a'; x.fillRect(-0.14, -0.04, 0.28, 0.1);
    x.fillStyle = '#ccc'; x.beginPath(); x.roundRect(-0.07, -0.33, 0.14, 0.12, 0.03); x.fill();
    x.fillStyle = '#333'; x.fillRect(-0.02, -0.38, 0.1, 0.06);
    x.restore();
  },
  cracker(x) { // firecracker with a spark
    x.save(); x.translate(0.46, 0.56); x.rotate(-0.6);
    const g = x.createLinearGradient(0, -0.12, 0, 0.12); g.addColorStop(0, '#ff6a6a'); g.addColorStop(0.5, '#e01a1a'); g.addColorStop(1, '#8a0a0a');
    x.fillStyle = g; x.beginPath(); x.roundRect(-0.28, -0.12, 0.56, 0.24, 0.05); x.fill();
    x.fillStyle = '#ffd23a'; x.fillRect(-0.16, -0.12, 0.06, 0.24); x.fillRect(0.1, -0.12, 0.06, 0.24);
    x.strokeStyle = '#6a4a2a'; x.lineWidth = 0.03; x.beginPath(); x.moveTo(0.28, 0); x.quadraticCurveTo(0.36, -0.06, 0.38, -0.14); x.stroke();
    x.restore();
    x.fillStyle = '#fff6a0'; spikes(x, 0.76, 0.2, 7, 0.14, 0.05); x.fill();
    x.fillStyle = '#ff9a1a'; spikes(x, 0.76, 0.2, 7, 0.08, 0.03); x.fill();
  },
  honey(x) { // honey pot
    x.fillStyle = radial(x, 0.5, 0.6, 0.32, ['#ffe7a0', '#f2a01a', '#9a5a00']);
    x.beginPath(); x.moveTo(0.26, 0.34); x.bezierCurveTo(0.1, 0.6, 0.2, 0.88, 0.5, 0.88); x.bezierCurveTo(0.8, 0.88, 0.9, 0.6, 0.74, 0.34); x.closePath(); x.fill();
    x.fillStyle = '#c9772a'; x.beginPath(); x.roundRect(0.22, 0.24, 0.56, 0.12, 0.05); x.fill();
    x.fillStyle = '#ffcc3a'; x.beginPath(); x.moveTo(0.3, 0.36); x.quadraticCurveTo(0.34, 0.52, 0.38, 0.4); x.quadraticCurveTo(0.44, 0.58, 0.5, 0.38); x.lineTo(0.5, 0.36); x.fill();
    x.fillStyle = 'rgba(255,255,255,.5)'; ell(x, 0.36, 0.62, 0.05, 0.1, 0.3); x.fill();
  },
  horn(x) { // whistle
    x.fillStyle = radial(x, 0.42, 0.58, 0.26, ['#fff8c0', '#f2c21a', '#9a6a00']);
    ell(x, 0.42, 0.6, 0.24, 0.22); x.fill();
    x.fillStyle = '#d9a010'; x.beginPath(); x.roundRect(0.5, 0.38, 0.38, 0.16, 0.04); x.fill();
    x.fillStyle = '#5a3a00'; ell(x, 0.42, 0.6, 0.08, 0.07); x.fill();
    x.strokeStyle = '#fff'; x.lineWidth = 0.035;
    for (const r of [0.12, 0.2]) { x.beginPath(); x.arc(0.86, 0.3, r, -1.6, -0.4); x.stroke(); }
  },
  bolt(x) {
    x.fillStyle = radial(x, 0.5, 0.5, 0.42, ['#ffffff', '#ffe14a', '#f29a1a']);
    x.beginPath(); x.moveTo(0.58, 0.06); x.lineTo(0.24, 0.54); x.lineTo(0.46, 0.54); x.lineTo(0.38, 0.94); x.lineTo(0.78, 0.4); x.lineTo(0.55, 0.4); x.closePath(); x.fill();
    x.strokeStyle = 'rgba(150,80,0,.6)'; x.lineWidth = 0.025; x.stroke();
  },
  freeze(x) {
    x.strokeStyle = '#bfefff'; x.lineWidth = 0.07;
    for (let i = 0; i < 3; i++) {
      x.save(); x.translate(0.5, 0.5); x.rotate((i * Math.PI) / 3);
      x.beginPath(); x.moveTo(0, -0.38); x.lineTo(0, 0.38); x.stroke();
      for (const s of [-1, 1]) { x.beginPath(); x.moveTo(0, s * 0.24); x.lineTo(0.1, s * 0.34); x.moveTo(0, s * 0.24); x.lineTo(-0.1, s * 0.34); x.stroke(); }
      x.restore();
    }
    x.strokeStyle = '#3a9ee0'; x.lineWidth = 0.025;
    for (let i = 0; i < 3; i++) { x.save(); x.translate(0.5, 0.5); x.rotate((i * Math.PI) / 3); x.beginPath(); x.moveTo(0, -0.36); x.lineTo(0, 0.36); x.stroke(); x.restore(); }
  },
  shield(x) {
    x.fillStyle = radial(x, 0.5, 0.45, 0.4, ['#e0f6ff', '#5ab8f0', '#1a5aa0']);
    x.beginPath(); x.moveTo(0.5, 0.08); x.lineTo(0.84, 0.2); x.quadraticCurveTo(0.84, 0.72, 0.5, 0.92); x.quadraticCurveTo(0.16, 0.72, 0.16, 0.2); x.closePath(); x.fill();
    x.strokeStyle = '#fff'; x.lineWidth = 0.035; x.stroke();
    FRUIT_SMALL(x);
  },
  armageddon(x) {
    x.fillStyle = radial(x, 0.5, 0.42, 0.3, ['#ffffff', '#ffd23a', '#ff6a1a', '#a01a0a']);
    ell(x, 0.5, 0.4, 0.3, 0.24); x.fill();
    x.fillStyle = '#8a3a1a'; x.fillRect(0.44, 0.55, 0.12, 0.3);
    x.fillStyle = radial(x, 0.5, 0.86, 0.3, ['#ffcf7a', '#c9602a']); ell(x, 0.5, 0.88, 0.32, 0.08); x.fill();
  },
  exchange(x) {
    x.fillStyle = 'linear-gradient';
    const g = x.createLinearGradient(0.1, 0.1, 0.45, 0.5); g.addColorStop(0, '#d6f6ff'); g.addColorStop(0.5, '#3ac0f0'); g.addColorStop(1, '#1a6ab8');
    x.fillStyle = g; x.beginPath(); x.moveTo(0.28, 0.1); x.lineTo(0.46, 0.27); x.lineTo(0.28, 0.5); x.lineTo(0.1, 0.27); x.closePath(); x.fill();
    x.fillStyle = radial(x, 0.66, 0.66, 0.24, ['#fff6b0', '#f2c21a', '#b07a00']); ell(x, 0.66, 0.66, 0.24, 0.24); x.fill();
    x.strokeStyle = '#fff'; x.lineWidth = 0.05; x.beginPath(); x.moveTo(0.42, 0.62); x.lineTo(0.34, 0.54); x.moveTo(0.42, 0.62); x.lineTo(0.5, 0.52); x.stroke();
  },
  lock(x) {
    x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 0.08;
    x.beginPath(); x.arc(0.5, 0.42, 0.17, Math.PI, 0); x.lineTo(0.67, 0.5); x.moveTo(0.33, 0.42); x.lineTo(0.33, 0.5); x.stroke();
    x.fillStyle = 'rgba(255,255,255,.7)'; x.beginPath(); x.roundRect(0.24, 0.48, 0.52, 0.38, 0.06); x.fill();
  },
};
function FRUIT_SMALL(x) {
  x.save(); x.translate(0.29, 0.26); x.scale(0.42, 0.42); FRUIT_ART.strawberry(x); x.restore();
}
export function iconImg(name, px = 96) {
  return sprite(px, ICONS[name]).toDataURL();
}
