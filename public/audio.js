// Small synthesized sounds (Web Audio), no files. Starts on the first tap (browsers require a gesture).
let ctx = null;
let master = null;
let on = true;
let noiseBuf = null;
const last = {};

export function setSound(v) { on = v; if (master) master.gain.value = v ? 0.5 : 0; }

export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = on ? 0.5 : 0;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

function tone(freq, dur, { type = 'sine', vol = 0.2, slide = 0, delay = 0 } = {}) {
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, { freq = 1200, q = 1, vol = 0.2, type = 'bandpass', delay = 0 } = {}) {
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master);
  s.start(t); s.stop(t + dur + 0.02);
}

// One sound of each kind at most every `gap` seconds — dozens of traps firing would be a mess otherwise.
export function play(kind) {
  if (!ctx || !on || ctx.state !== 'running') return;
  const now = ctx.currentTime;
  const gap = { shoot: 0.07, hit: 0.06, kill: 0.05, coin: 0.06, pulse: 0.25, flame: 0.2, zap: 0.12 }[kind] ?? 0;
  if (last[kind] && now - last[kind] < gap) return;
  last[kind] = now;
  switch (kind) {
    case 'shoot': tone(520 + Math.random() * 120, 0.06, { type: 'triangle', vol: 0.05, slide: 0.6 }); break;
    case 'hit': noise(0.04, { freq: 2500, vol: 0.04 }); break;
    case 'kill': tone(300, 0.08, { type: 'square', vol: 0.03, slide: 0.5 }); noise(0.06, { freq: 900, vol: 0.06 }); break;
    case 'coin': tone(1320, 0.05, { type: 'sine', vol: 0.05 }); tone(1760, 0.07, { vol: 0.05, delay: 0.04 }); break;
    case 'pulse': tone(180, 0.25, { vol: 0.07, slide: 0.6 }); break;
    case 'flame': noise(0.22, { freq: 500, q: 0.6, vol: 0.12, type: 'lowpass' }); break;
    case 'zap': noise(0.12, { freq: 4000, q: 3, vol: 0.12 }); tone(900, 0.1, { type: 'sawtooth', vol: 0.03, slide: 0.3 }); break;
    case 'build': tone(220, 0.1, { type: 'triangle', vol: 0.15, slide: 0.7 }); noise(0.08, { freq: 400, vol: 0.08 }); break;
    case 'upgrade': [523, 659, 784].forEach((f, i) => tone(f, 0.12, { type: 'triangle', vol: 0.08, delay: i * 0.06 })); break;
    case 'sell': tone(660, 0.08, { vol: 0.08 }); tone(440, 0.1, { vol: 0.08, delay: 0.06 }); break;
    case 'bite': noise(0.12, { freq: 700, q: 2, vol: 0.25 }); tone(140, 0.15, { type: 'square', vol: 0.06, slide: 0.6 }); break;
    case 'wave': tone(392, 0.18, { type: 'triangle', vol: 0.1 }); tone(523, 0.25, { type: 'triangle', vol: 0.1, delay: 0.14 }); break;
    case 'boom': noise(0.5, { freq: 300, q: 0.5, vol: 0.5, type: 'lowpass' }); tone(90, 0.4, { vol: 0.3, slide: 0.4 }); break;
    case 'spray': noise(0.6, { freq: 3000, q: 0.4, vol: 0.12, type: 'highpass' }); break;
    case 'honey': tone(200, 0.3, { vol: 0.12, slide: 0.5 }); break;
    case 'horn': tone(880, 0.5, { type: 'square', vol: 0.06 }); tone(1175, 0.5, { type: 'square', vol: 0.04 }); break;
    case 'bolt': noise(0.35, { freq: 2500, q: 0.8, vol: 0.35 }); tone(60, 0.4, { vol: 0.3, slide: 0.5 }); break;
    case 'safe': [784, 988, 1175].forEach((f, i) => tone(f, 0.1, { vol: 0.06, delay: i * 0.05 })); break;
    case 'won': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.12, delay: i * 0.12 })); break;
    case 'lost': [392, 330, 262].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.12, delay: i * 0.18 })); break;
    case 'click': tone(700, 0.04, { vol: 0.05 }); break;
    case 'deny': tone(160, 0.12, { type: 'square', vol: 0.06 }); break;
    case 'shop': [660, 880].forEach((f, i) => tone(f, 0.12, { vol: 0.08, delay: i * 0.07 })); break;
    default: break;
  }
}
