// Sound: effects synthesized with Web Audio and background music.
// The page calls sfx.*; nothing here knows about the game. `cfg` is the page's settings object ({ vol, music }, 0..1),
// read on every sound, so a slider works at once. Every sfx function is safe to call at any time: with the sound off,
// before the first gesture or with no audio context it simply does nothing.
//
// A tower defense fires its sounds in swarms (dozens of plants shooting at triple speed), so the frequent effects go
// through a rate limiter built in here: the caller reports every shot, hit and kill and never has to hold back.
//
// iPhone: sound turns on only from a "real" gesture (touch released, click, key), not from pointerdown; after
// minimizing or a phone call the context may report 'running' and stay silent, so it is replaced on the next gesture.
// Web Audio obeys the silent switch on the side. Chrome and other WKWebView browsers on iPhone stay silent until
// the page has played a regular <audio>, so a silent clip is looped there (and sound then ignores the silent switch).
let cfg = { vol: 0.5, music: 0.4 };
let actx = null, bus = null, master = null, busComp = null, fxOut = null, stale = false, stuckAt = 0, resumeBusy = false, resumeTry = 0;
const UA = navigator.userAgent || '';
const IOS = /iPhone|iPad|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const IOS_WEBVIEW = /iPhone|iPad|iPod/.test(UA) && (/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|GSA\//.test(UA) || !/Safari\//.test(UA));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const soundOn = () => cfg.vol > 0;
const canSound = () => soundOn() && actx && !document.hidden && (actx.state === 'running' || resumeBusy);
const gainOf = () => cfg.vol * cfg.vol;   // squared: the slider feels more even
const FX_TRIM = 0.7;   // the effects' level after their compressor (see newAudio)
// Every effect starts this far ahead of now. Asked for "now" with a 1–4 ms attack, a sound that reached the audio
// thread late (the phone busy with a heavy frame) had its attack in the past and started at full level: a click.
const LEAD = 0.02;
// The effects lose what is below this (a high-pass in front of their compressor): a phone speaker does not play it,
// it only rattles.
const FX_LOWCUT = 130;

function newAudio() {
  try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { actx = null; return; }
  const ctx = actx; let ran = ctx.state === 'running';
  ctx.onstatechange = () => {
    if (ctx.state === 'running') ran = true;
    else if (ran && ctx === actx && ctx.state !== 'closed') stale = true;
  };
  try {   // a last guard for everything, the music too: whatever piles up never goes past full scale (that crackles)
    master = actx.createDynamicsCompressor();
    master.threshold.value = -3; master.knee.value = 0; master.ratio.value = 20; master.attack.value = 0.001; master.release.value = 0.1;
    master.connect(actx.destination);
  } catch { master = null; }
  try {   // a compressor: louder on a quiet phone speaker, and overlapping sounds don't distort
    const comp = actx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.15;
    // and after it a step down: the effects alone stay clear of the last guard (its hard 1 ms grip is heard as a
    // crackle when it has to work)
    const trim = actx.createGain(); trim.gain.value = FX_TRIM;
    const low = actx.createBiquadFilter(); low.type = 'highpass'; low.frequency.value = FX_LOWCUT; low.Q.value = 0.6;
    bus = actx.createGain(); bus.connect(low); low.connect(comp); comp.connect(trim); trim.connect(master || actx.destination); busComp = comp; fxOut = trim;
  } catch { bus = null; }
  try {   // an empty clip inside the gesture, or old iOS doesn't open the output
    const src = actx.createBufferSource();
    src.buffer = actx.createBuffer(1, 1, 22050); src.connect(actx.destination); src.start(0);
  } catch { /* */ }
  noiseBuf = null; muffle = null;
}

let htmlAudio = null;
function silentWav() {   // 0.25 s of silence, 8 kHz, 8 bit
  const n = 2000, b = new Uint8Array(44 + n), v = new DataView(b.buffer);
  const str = (o, t) => { for (let i = 0; i < t.length; i++) b[o + i] = t.charCodeAt(i); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  str(36, 'data'); v.setUint32(40, n, true); b.fill(128, 44);
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
}
function unlockHtmlAudio() {
  if (!IOS_WEBVIEW || document.hidden) return;
  if (!soundOn()) { if (htmlAudio) htmlAudio.pause(); return; }   // sound is off: don't mute other apps' music
  if (!htmlAudio) {
    try {
      htmlAudio = document.createElement('audio');
      htmlAudio.setAttribute('x-webkit-airplay', 'deny'); htmlAudio.setAttribute('playsinline', '');
      htmlAudio.loop = true; htmlAudio.preload = 'auto'; htmlAudio.src = silentWav();
    } catch { htmlAudio = null; return; }
  }
  if (htmlAudio.paused) { const p = htmlAudio.play(); if (p && p.catch) p.catch(() => {}); }
}
function wake() {
  if (!actx || actx.state === 'running' || resumeBusy) return;
  // an interrupted iOS context may never answer resume(): wait a second at most, or gestures stop helping
  const n = ++resumeTry, done = () => { if (n === resumeTry) resumeBusy = false; };
  resumeBusy = true; setTimeout(done, 1000);
  try { Promise.resolve(actx.resume()).catch(() => {}).finally(done); } catch { done(); }
}
function replaceAudio() {   // only from a gesture: iOS keeps no more than about four contexts, so the old one is closed
  const old = actx; actx = null;
  if (old) { try { Promise.resolve(old.close()).catch(() => {}); } catch { /* */ } }
  newAudio(); stuckAt = 0; stale = false; resumeTry++; resumeBusy = false;
}
function ensure() {   // only from gestures
  unlockHtmlAudio();
  if (!soundOn()) return;
  if (!actx || (stale && !document.hidden)) replaceAudio();
  if (!actx || actx.state === 'running') { stuckAt = 0; return; }
  const now = performance.now();
  if (!stuckAt) stuckAt = now;
  else if (!resumeBusy && now - stuckAt > 1500) replaceAudio();   // resume() answered, yet gestures don't wake it
  wake();
}

// for the test scripts: the nodes the sound goes through, the counters of the rate limiter and the music's state
// stats: voices — every oscillator/noise source ever started; freqVoices — those of the frequent group;
// dropped — frequent calls the limiter refused; peakWindow — the most frequent voices seen in any 100 ms
const stats = { voices: 0, freqVoices: 0, dropped: 0, peakWindow: 0 };
export const audioTap = () => ({ actx, master, busComp, fxOut, sfx, music, stats, FREQ_CAP, FREQ_WINDOW });

export function initAudio(settings) {
  cfg = settings;
  for (const ev of ['pointerup', 'touchend', 'click', 'keydown'])
    window.addEventListener(ev, () => { ensure(); musicGesture(); }, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (htmlAudio) htmlAudio.pause();
      musicPause();
      if (actx && IOS) stale = true;
    } else { wake(); musicPlay(); }
  });
  window.addEventListener('online', () => { music.miss.clear(); music.retryAt = 0; });
}
// a setting changed: the volume of what is already sounding follows
export function applyVolume() {
  if (music.gain) {   // glides to the new level (a jump of the gain clicks, and would cut a fade-in short)
    try { const p = music.gain.gain, t = music.ctx.currentTime; p.cancelScheduledValues(t); p.setTargetAtTime(musicVol(), t, 0.03); } catch { /* */ }
  }
  if (!musicOn()) musicPause(); else if (actx && !document.hidden) musicGesture();
  if (!soundOn() && htmlAudio) htmlAudio.pause();
}

// ---- the rate limiter of the frequent effects ----
// Two rules. Each effect has its own minimum interval (two thorns 10 ms apart are one thorn, only louder), and all of
// them together may start no more than FREQ_CAP voices (oscillators and noise sources) in any FREQ_WINDOW ms. The last
// FREQ_RESERVE of those belong to kill(): the pop of a bug is the sound the player is waiting for, and a wall of
// shooting must not swallow it.
const FREQ_WINDOW = 100, FREQ_CAP = 10, FREQ_RESERVE = 4;
const freqLast = {}, freqWin = [];
let inFreq = false;
function freqRoom(reserve) {
  const now = performance.now();
  while (freqWin.length && now - freqWin[0] >= FREQ_WINDOW) freqWin.shift();
  return FREQ_CAP - reserve - freqWin.length;
}
// runs fn (which starts at most `need` voices) if the effect `name` is allowed to sound now
function frequent(name, gap, need, fn, reserve = FREQ_RESERVE) {
  if (!canSound()) return false;
  const now = performance.now();
  if (now - (freqLast[name] || -1e9) < gap || freqRoom(reserve) < need) { stats.dropped++; return false; }
  freqLast[name] = now;
  inFreq = true;
  try { fn(); } finally { inFreq = false; }
  return true;
}
// the occasional effects: the same one twice within `gap` ms is played once (five plants eaten in one frame)
const onceLast = {};
function once(name, gap = 60) {
  if (!canSound()) return false;
  const now = performance.now();
  if (now - (onceLast[name] || -1e9) < gap) return false;
  onceLast[name] = now;
  return true;
}
function voice() {
  stats.voices++;
  if (!inFreq) return;
  stats.freqVoices++; freqWin.push(performance.now());
  if (freqWin.length > stats.peakWindow) stats.peakWindow = freqWin.length;
}

// ---- building blocks ----
const out = () => bus || actx.destination;
// pan: -1 left … 1 right, where the thing happens
function panned(node, pan) {
  if (!pan || !actx.createStereoPanner) { node.connect(out()); return null; }
  const p = actx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); node.connect(p); p.connect(out());
  return p;
}
// A sound that has played out is taken out of the graph at once. Left connected, every one of them stayed there until
// the garbage collector got to it, and a level makes thousands (Safari is known to keep such nodes around).
function unplug(src, ...nodes) {
  src.onended = () => { for (const n of [src, ...nodes]) if (n) try { n.disconnect(); } catch { /* */ } };
}
// the envelope of every sound: attack a, then (after `hold` at full level) a decay until dur
function envelope(g, t, vol, a, dur, hold) {
  const v = Math.max(0.0002, vol * gainOf()), up = Math.min(a, dur * 0.9);
  g.gain.value = 0;   // silent until its envelope starts (a new gain is at 1: its first sample slipped through at full level)
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + up);
  if (hold > 0 && up + hold < dur) g.gain.setValueAtTime(v, t + up + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
// a note; `to` — where the pitch glides; lp — a low-pass filter for softer saws and squares
function note(f, { type = 'sine', vol = 0.2, a = 0.004, dur = 0.2, delay = 0, to = 0, lp = 0, detune = 0, pan = 0, hold = 0 } = {}) {
  if (!canSound()) return;
  try {
    const t = actx.currentTime + LEAD + delay, o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.detune.value = detune; o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    envelope(g, t, vol, a, dur, hold);
    let src = o, fl = null;
    if (lp) { fl = actx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); src = fl; }
    src.connect(g); unplug(o, fl, g, panned(g, pan));
    o.start(t); o.stop(t + dur + 0.05);
    voice();
  } catch { /* */ }
}
let noiseBuf = null;
function noise() {   // two seconds of brownish noise, shared by every burst
  if (noiseBuf && noiseBuf.ctx === actx) return noiseBuf.buf;
  const n = actx.sampleRate * 2, m = Math.floor(actx.sampleRate * 0.05), buf = actx.createBuffer(1, n, actx.sampleRate), d = buf.getChannelData(0);
  const raw = new Float32Array(n + m);
  let last = 0;
  for (let i = 0; i < n + m; i++) { last = (last + 0.04 * (Math.random() * 2 - 1)) / 1.04; raw[i] = last * 6; }
  // it loops: its first 50 ms fade over from what comes after its end, so the end runs on into the start with no step
  for (let i = 0; i < n; i++) d[i] = i < m ? raw[i] * (i / m) + raw[n + i] * (1 - i / m) : raw[i];
  noiseBuf = { ctx: actx, buf };
  return buf;
}
// a burst of filtered noise: f0 → f1 is the filter sweep
function burst({ type = 'lowpass', f0 = 800, f1 = 0, q = 0.7, vol = 0.3, a = 0.005, dur = 0.2, delay = 0, pan = 0, hold = 0 } = {}) {
  if (!canSound()) return;
  try {
    const t = actx.currentTime + LEAD + delay, s = actx.createBufferSource(), fl = actx.createBiquadFilter(), g = actx.createGain();
    s.buffer = noise(); s.loop = true;
    fl.type = type; fl.Q.value = q; fl.frequency.setValueAtTime(f0, t);
    if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    envelope(g, t, vol, a, dur, hold);
    s.connect(fl); fl.connect(g); unplug(s, fl, g, panned(g, pan));
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
    voice();
  } catch { /* */ }
}
const semi = (f, n) => f * Math.pow(2, n / 12);
// the same sound a little different every time: a repeated identical sample reads as a machine
const vary = (k = 0.05) => 1 + (Math.random() * 2 - 1) * k;
// A knock that a phone speaker can actually play. Most of them give almost nothing below 200–300 Hz, so a low
// thud alone is felt on headphones only: on the speaker the weight comes from a short click (the moment of contact)
// and a body of 180–400 Hz falling in pitch.
function knock(k, { f = 260, pan = 0, delay = 0 } = {}) {
  const m = vary(0.06);
  burst({ type: 'highpass', f0: 2500, q: 0.5, vol: 0.3 * k, a: 0.003, dur: 0.03, delay, pan });   // (a 1 ms attack crackled)
  note(f * m, { type: 'triangle', vol: 0.3 * k, a: 0.002, dur: 0.09, to: f * 0.45 * m, lp: 1400, delay, pan });
}
// a juicy little pop: a round tone leaping up, like a bubble or a berry bursting
function pop(k, { f = 240, pan = 0, delay = 0 } = {}) {
  const m = vary(0.08);
  note(f * m, { vol: 0.3 * k, a: 0.003, dur: 0.07, to: f * 2.3 * m, delay, pan });
}
// a soft bell: a triangle with a quiet octave on top
function plink(f, { vol = 0.18, dur = 0.24, delay = 0, pan = 0, lp = 2400 } = {}) {
  note(f, { type: 'triangle', vol, dur, lp, delay, pan });
  note(f * 2, { vol: vol * 0.35, dur: dur * 1.3, delay: delay + 0.015, pan });
}
// a rising run of soft notes from the root f over the given semitone steps; the last one rings
function arp(f, steps, { gap = 0.08, vol = 0.18, dur = 0.18, last = 0.5, delay = 0, lp = 2600 } = {}) {
  steps.forEach((n, i) => note(semi(f, n), { type: 'triangle', vol, dur: i === steps.length - 1 ? last : dur, delay: delay + i * gap, lp }));
}

// ---- effects ----
// Most of it sits low (150–1300 Hz): high beeps tire on a phone speaker. Everything is short and round.
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];   // a pentatonic ladder for kills in a row
const ROOT = 330;
let run = 0, comboAt = 0;
export const sfx = {
  // ---- the frequent group (rate-limited here; call them for every event) ----
  // a plant shoots: 'thorn' (and an icicle) — a tiny soft "pft", 'pepper' and a big icicle — a hollow "thup" of a lob, 'fluff' — an airy puff
  shoot(kind = 'thorn', pan = 0) {
    const m = vary(0.12), p = pan * 0.6;
    if (kind === 'pepper' || kind === 'icicleBig') { // a lob: a soft woody throw
      frequent(kind, 80, 2, () => {
        note(430 * m, { type: 'triangle', vol: 0.13, a: 0.003, dur: 0.07, to: 210 * m, lp: 1100, pan: p });
        burst({ type: 'bandpass', f0: 900 * m, q: 1.2, vol: 0.1, a: 0.003, dur: 0.03, pan: p });
      });
    } else if (kind === 'fluff') {
      frequent('fluff', 90, 1, () => burst({ type: 'bandpass', f0: 650 * m, f1: 1500 * m, q: 0.6, vol: 0.2, a: 0.02, dur: 0.12, pan: p }));
    } else {
      frequent('thorn', 60, 1, () => burst({ type: 'bandpass', f0: 2300 * m, f1: 1100 * m, q: 0.9, vol: 0.22, a: 0.004, dur: 0.05, pan: p }));
    }
  },
  // a shot lands: a very light tick
  hit(pan = 0) {
    const m = vary(0.2);
    frequent('hit', 55, 1, () => burst({ type: 'bandpass', f0: 1500 * m, q: 2.2, vol: 0.13, a: 0.003, dur: 0.03, pan: pan * 0.6 }));
  },
  // A bug is done for: a juicy pop and a soft "plink" (dew gained). Kills in quick succession climb a pentatonic
  // ladder; every fifth in a row adds a glint on top. Returns how many in a row this one makes (0 when not played).
  kill(pan = 0) {
    const now = performance.now(), p = pan * 0.5;
    let n = 0;
    frequent('kill', 45, 4, () => {
      run = now - comboAt < 1000 ? run + 1 : 1;
      comboAt = now; n = run;
      const f = semi(ROOT, SCALE[Math.min(SCALE.length - 1, run - 1)]);
      pop(0.5, { f: 230, pan: p });
      plink(f, { vol: 0.17, dur: 0.22, delay: 0.03, pan: p });
      if (run % 5 === 0) note(f * 3, { vol: 0.045, dur: 0.3, delay: 0.09, pan: p });
    }, 0);
    return n;
  },
  // the pepper breathes fire: a warm puff
  fire() {
    const m = vary(0.1);
    frequent('fire', 130, 2, () => {
      burst({ type: 'bandpass', f0: 420 * m, f1: 1300 * m, q: 0.7, vol: 0.26, a: 0.03, dur: 0.24 });
      burst({ type: 'lowpass', f0: 900 * m, f1: 300, vol: 0.12, a: 0.02, dur: 0.2 });
    });
  },
  // the flytrap swallows a bug: a cartoon gulp
  chomp() {
    const m = vary(0.08);
    frequent('chomp', 160, 3, () => {
      knock(0.45, { f: 300 });
      note(210 * m, { vol: 0.22, a: 0.01, dur: 0.1, to: 420 * m, delay: 0.07 });
    });
  },
  // a bug gnaws a plant: a dry, quiet crunch
  chew() {
    frequent('chew', 150, 2, () => {
      for (let k = 0; k < 2; k++)
        burst({ type: 'bandpass', f0: (900 + Math.random() * 700), q: 3, vol: 0.2, a: 0.003, dur: 0.035, delay: k * (0.05 + Math.random() * 0.02) });
    });
  },

  // ---- the occasional ones ----
  tap() { if (once('tap', 40)) note(420, { type: 'triangle', vol: 0.12, dur: 0.07, to: 300, lp: 1500 }); },
  select() {   // a plant card picked: two soft steps up
    if (!once('select', 40)) return;
    note(392, { type: 'triangle', vol: 0.13, dur: 0.07, lp: 1800 });
    note(523, { type: 'triangle', vol: 0.13, dur: 0.12, delay: 0.055, lp: 2000 });
  },
  cant() {   // can't plant here / not enough dew: a dull, gentle "no"
    if (!once('cant', 120)) return;
    note(250, { type: 'triangle', vol: 0.2, dur: 0.11, to: 215, lp: 800 });
    note(205, { type: 'triangle', vol: 0.2, dur: 0.16, to: 170, lp: 800, delay: 0.1 });
  },
  plant() {   // pressed into the soil, the leaves settle
    if (!once('plant', 80)) return;
    const m = vary();
    knock(0.75, { f: 240 });
    burst({ f0: 520 * m, f1: 150, vol: 0.3, dur: 0.12 });
    burst({ type: 'bandpass', f0: 2600 * m, f1: 1300, q: 0.8, vol: 0.3, a: 0.03, dur: 0.16, delay: 0.07 });
    burst({ type: 'bandpass', f0: 1800 * m, f1: 2600, q: 0.8, vol: 0.2, a: 0.03, dur: 0.14, delay: 0.17 });
    note(330 * m, { vol: 0.1, a: 0.01, dur: 0.14, to: 495 * m, delay: 0.1 });
  },
  sell() {   // plucked out, and the dew drips back
    if (!once('sell', 80)) return;
    note(300, { type: 'triangle', vol: 0.2, a: 0.002, dur: 0.1, to: 420, lp: 1600 });
    burst({ type: 'bandpass', f0: 1200, f1: 2400, q: 1, vol: 0.2, a: 0.01, dur: 0.08 });
    plink(880, { vol: 0.12, dur: 0.14, delay: 0.1 });
    plink(1175, { vol: 0.12, dur: 0.26, delay: 0.19 });
  },
  upgrade() {   // a proud rising sparkle
    if (!once('upgrade', 100)) return;
    arp(392, [0, 4, 7, 12, 16], { gap: 0.06, vol: 0.17, dur: 0.14, last: 0.5 });
    burst({ type: 'bandpass', f0: 700, f1: 3200, q: 1, vol: 0.28, a: 0.05, dur: 0.4 });
    note(semi(392, 28), { vol: 0.05, dur: 0.5, delay: 0.3 });
    knock(0.4, { f: 300 });
  },
  regrow() {   // a little sprout pushes up: "bloop"
    if (!once('regrow', 80)) return;
    const m = vary();
    note(260 * m, { vol: 0.22, a: 0.008, dur: 0.13, to: 520 * m });
    note(520 * m, { vol: 0.1, a: 0.008, dur: 0.12, to: 700 * m, delay: 0.11 });
  },
  eaten() {   // a plant is gone: a crunch and a small sigh down
    if (!once('eaten', 120)) return;
    knock(0.7, { f: 230 });
    for (let k = 0; k < 3; k++) burst({ type: 'bandpass', f0: 600 + Math.random() * 700, q: 2.5, vol: 0.3, dur: 0.05, delay: k * 0.055 + Math.random() * 0.02 });
    note(349, { type: 'triangle', vol: 0.17, a: 0.01, dur: 0.34, to: 208, lp: 1400, delay: 0.13 });
  },
  bite() {   // the apple is bitten: a crunch and a cartoon "ow!" sliding down
    if (!once('bite', 150)) return;
    const m = vary(0.04);
    knock(0.7, { f: 280 });
    burst({ type: 'bandpass', f0: 1400, f1: 500, q: 1.5, vol: 0.3, dur: 0.09 });
    note(480 * m, { type: 'triangle', vol: 0.2, a: 0.008, dur: 0.07, to: 680 * m, lp: 2000, delay: 0.05 });
    note(680 * m, { type: 'triangle', vol: 0.2, a: 0.004, dur: 0.26, to: 250 * m, lp: 2000, delay: 0.115 });
  },
  waveStart() {   // a short call: two taps on a soft drum and a little horn, a fourth up
    if (!once('waveStart', 300)) return;
    knock(0.45, { f: 250 }); knock(0.45, { f: 250, delay: 0.1 }); knock(0.7, { f: 300, delay: 0.2 });
    for (const d of [-6, 6]) {   // two voices a hair apart: warmer than one
      note(294, { type: 'sawtooth', vol: 0.1, a: 0.02, dur: 0.16, lp: 900, detune: d, delay: 0.2 });
      note(392, { type: 'sawtooth', vol: 0.11, a: 0.03, dur: 0.5, lp: 1100, detune: d, delay: 0.34, hold: 0.12 });
    }
    note(784, { vol: 0.04, dur: 0.4, delay: 0.36 });
  },
  waveDone() {   // a small cheerful arpeggio
    if (!once('waveDone', 300)) return;
    arp(392, [0, 4, 7, 12], { gap: 0.075, vol: 0.17, dur: 0.16, last: 0.45 });
    note(semi(392, 24), { vol: 0.05, dur: 0.45, delay: 0.24 });
  },
  // the wave was called early: the bonus dew sparkles in, more of it for a bigger bonus n
  early(n = 1) {
    if (!once('early', 150)) return;
    const k = clamp(2 + Math.floor(Math.log2(1 + Math.max(0, n))), 2, 6);
    for (let i = 0; i < k; i++) plink(semi(523, SCALE[i]), { vol: 0.12, dur: 0.16, delay: i * 0.055 });
    burst({ type: 'bandpass', f0: 1500, f1: 3500, q: 1, vol: 0.2, a: 0.04, dur: 0.1 + k * 0.05 });
  },
  // The boss arrives: three heavy steps down and a grumpy slide. A phone speaker plays nothing below ~150 Hz, so the
  // weight is in the knocks and in the overtones of a filtered saw.
  bossCome() {
    if (!once('bossCome', 500)) return;
    [[196, 0, 0.2], [185, 0.26, 0.2], [175, 0.52, 0.2]].forEach(([f, d, len]) => {
      knock(0.8, { f: 230, delay: d });
      note(f, { type: 'sawtooth', vol: 0.2, a: 0.015, dur: len, lp: 700, delay: d });
      note(f * 2, { type: 'triangle', vol: 0.08, a: 0.015, dur: len, lp: 1200, delay: d });
    });
    knock(1, { f: 210, delay: 0.82 });
    note(165, { type: 'sawtooth', vol: 0.24, a: 0.02, dur: 0.7, to: 147, lp: 650, delay: 0.82, hold: 0.25 });
    note(330, { type: 'triangle', vol: 0.1, a: 0.02, dur: 0.7, to: 294, lp: 1200, delay: 0.82, hold: 0.25 });
    burst({ f0: 700, f1: 200, vol: 0.3, dur: 0.3, delay: 0.82 });
  },
  bossDie() {   // a big juicy burst, then a fanfare
    if (!once('bossDie', 500)) return;
    knock(1, { f: 260 }); knock(0.6, { f: 190, delay: 0.07 });
    burst({ f0: 2400, f1: 250, vol: 0.7, dur: 0.35 });
    for (let k = 0; k < 4; k++) pop(0.5, { f: 200 + Math.random() * 160, delay: 0.05 + k * 0.06 + Math.random() * 0.03, pan: Math.random() - 0.5 });
    arp(330, [0, 4, 7, 12], { gap: 0.09, vol: 0.2, dur: 0.2, last: 0.7, delay: 0.32 });
    note(semi(330, 16), { type: 'triangle', vol: 0.12, dur: 0.7, delay: 0.59, lp: 2600 });
    note(semi(330, 24), { vol: 0.05, dur: 0.7, delay: 0.62 });
  },
  frost() {   // everything freezes over: a glassy shimmer
    if (!once('frost', 200)) return;
    [1568, 2093, 2349, 3136, 2637].forEach((f, i) => note(f * vary(0.01), { vol: 0.055, a: 0.006, dur: 0.3 + i * 0.05, delay: i * 0.045 }));
    burst({ type: 'highpass', f0: 4500, q: 0.7, vol: 0.5, a: 0.06, dur: 0.45 });
    burst({ type: 'bandpass', f0: 2500, f1: 900, q: 1.5, vol: 0.25, a: 0.02, dur: 0.3 });
  },
  rain() {   // a gentle shower, a second and a half, with a few drops close by
    if (!once('rain', 800)) return;
    burst({ type: 'highpass', f0: 1800, q: 0.5, vol: 0.55, a: 0.3, dur: 1.6, hold: 0.7 });
    burst({ type: 'bandpass', f0: 900, q: 0.5, vol: 0.14, a: 0.3, dur: 1.6, hold: 0.7 });
    for (let k = 0; k < 6; k++) {
      const f = 700 + Math.random() * 700;
      note(f, { vol: 0.07, a: 0.003, dur: 0.06, to: f * 1.6, delay: 0.15 + k * 0.2 + Math.random() * 0.12, pan: Math.random() * 1.2 - 0.6 });
    }
  },
  web() {   // the spider throws a web: "thwip"
    if (!once('web', 100)) return;
    burst({ type: 'bandpass', f0: 600, f1: 3200, q: 2, vol: 0.5, a: 0.01, dur: 0.1 });
    note(1100, { vol: 0.09, a: 0.004, dur: 0.07, to: 480, delay: 0.08 });
  },
  win() {   // a happy fanfare, about a second and a half
    if (!once('win', 500)) return;
    knock(0.5, { f: 300 });
    arp(392, [0, 5, 9, 12], { gap: 0.11, vol: 0.2, dur: 0.2, last: 0.25 });   // G C E G
    for (const [n, v] of [[5, 0.16], [9, 0.14], [12, 0.16], [17, 0.1]])
      note(semi(392, n), { type: 'triangle', vol: v, a: 0.01, dur: 1, delay: 0.52, lp: 2600, hold: 0.3 });
    knock(0.6, { f: 280, delay: 0.52 });
    burst({ type: 'bandpass', f0: 900, f1: 3500, q: 1, vol: 0.3, a: 0.1, dur: 0.6, delay: 0.5 });
    [24, 21, 24, 29].forEach((n, i) => note(semi(392, n), { vol: 0.045, dur: 0.3, delay: 0.7 + i * 0.1 }));
  },
  lose() {   // a short sad phrase stepping down
    if (!once('lose', 500)) return;
    [[392, 0.22], [349, 0.22], [311, 0.22], [262, 0.7]].forEach(([f, len], i) =>
      note(f, { type: 'triangle', vol: 0.18, a: 0.012, dur: len, to: i === 3 ? 247 : 0, lp: 1400, delay: i * 0.2 }));
    note(196, { type: 'triangle', vol: 0.1, a: 0.02, dur: 0.7, lp: 900, delay: 0.6 });
  },
  // the n-th star (1..3) pops in on the win screen, each one higher; the third rings
  star(n = 1) {
    if (!once('star', 80)) return;
    const k = clamp(Math.round(n) || 1, 1, 3), f = semi(523, [0, 4, 7][k - 1]);
    pop(0.5, { f: 250 + k * 30 });
    plink(f, { vol: 0.2, dur: k === 3 ? 0.5 : 0.25, delay: 0.03 });
    burst({ type: 'bandpass', f0: 1500, f1: 3500, q: 1, vol: 0.2, a: 0.02, dur: 0.15, delay: 0.03 });
    if (k === 3) note(f * 3, { vol: 0.04, dur: 0.5, delay: 0.1 });
  },
  buy() {   // a permanent upgrade bought: a warm chord
    if (!once('buy', 150)) return;
    knock(0.4, { f: 280 });
    [[262, 0], [330, 0.02], [392, 0.04]].forEach(([f, d]) => note(f, { type: 'triangle', vol: 0.15, a: 0.012, dur: 0.55, lp: 1800, delay: d }));
    note(523, { vol: 0.08, a: 0.01, dur: 0.6, delay: 0.12 });
  },
  unlock() {   // a new plant or level opens
    if (!once('unlock', 300)) return;
    arp(294, [0, 7, 12], { gap: 0.12, vol: 0.18, dur: 0.35, last: 0.6, lp: 2400 });
    burst({ type: 'bandpass', f0: 800, f1: 3200, q: 1, vol: 0.25, a: 0.08, dur: 0.45, delay: 0.1 });
    note(semi(294, 24), { vol: 0.05, dur: 0.6, delay: 0.3 });
  },
  preview() { if (once('preview', 60)) plink(ROOT, { vol: 0.18, dur: 0.22 }); },   // the volume slider: the first kill's note
};

// ---- background music ----
// MP3 recordings (CC0, sources in CREDITS). A track is fetched whole, decoded into an AudioBuffer and played by an
// AudioBufferSourceNode: with no <audio> element, phones show no "now playing" card on the lock screen and the silent
// switch is obeyed. Only one track is kept decoded; when it ends, another one starts. All files are 32 kHz stereo,
// 64 kbps, normalized to the same loudness (-18 LUFS).
export const MUSIC = ['cider', 'picnic', 'meadow', 'sunny'];
const MUSIC_K = 3, MUSIC_SR = 32000, MUSIC_FADE = 0.1;
const music = { buf: null, id: null, src: null, gain: null, ctx: null, t0: 0, off: 0, loading: 0, bad: new Set(), miss: new Set(), retryAt: 0 };
const musicVol = () => Math.min(1, gainOf() * cfg.music * cfg.music * MUSIC_K);   // never past full scale: it bypasses the compressor
const musicOn = () => musicVol() > 0;
// The music goes through a low-pass filter: in the pause menu and after a defeat it sounds as if from behind a wall.
let muffle = null, muffled = false;
function musicOut() {
  if (muffle && muffle.ctx === actx) return muffle.fl;
  try {
    const fl = actx.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = 0.7; fl.frequency.value = muffled ? 450 : 20000;
    fl.connect(master || actx.destination); muffle = { ctx: actx, fl };
    return fl;
  } catch { return actx.destination; }
}
export function muffleMusic(on) {
  muffled = !!on;
  if (!actx || !muffle || muffle.ctx !== actx) return;
  try {
    const t = actx.currentTime, p = muffle.fl.frequency;
    p.cancelScheduledValues(t); p.setValueAtTime(p.value, t);
    p.exponentialRampToValueAtTime(muffled ? 450 : 20000, t + (muffled ? 0.35 : 0.6));
  } catch { /* */ }
}
function musicGesture() {
  if (!musicOn() || document.hidden || !actx) { musicPause(); return; }
  if (!music.id && !music.loading) musicNext(); else musicPlay();
}
function musicPlay() {
  if (!music.buf || !actx || !musicOn() || document.hidden || (music.src && music.ctx === actx)) return;
  musicPause();
  try {
    const g = actx.createGain(), s = actx.createBufferSource(), off = music.off % music.buf.duration, t = actx.currentTime;
    // it comes in over a tenth of a second: started at full level in the middle of the waveform it clicked
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(musicVol(), t + MUSIC_FADE); g.connect(musicOut());
    s.buffer = music.buf; s.connect(g);
    s.onended = () => { if (s === music.src) musicEnded(); };
    s.start(0, off);
    Object.assign(music, { src: s, gain: g, ctx: actx, t0: actx.currentTime - off });
  } catch { music.src = null; }
}
function musicPause() {
  const s = music.src;
  if (!s) return;
  music.src = null;
  let at = 0;
  try { at = music.ctx.currentTime - music.t0; } catch { /* */ }
  // fades out instead of stopping dead in the middle of the waveform (that clicked), then leaves the graph
  const g = music.gain;
  try {
    const t = music.ctx.currentTime;
    g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + MUSIC_FADE);
    s.onended = () => { try { g.disconnect(); } catch { /* */ } };
    s.stop(t + MUSIC_FADE + 0.02);
  } catch { try { s.onended = null; s.stop(); g.disconnect(); } catch { /* */ } }
  music.gain = null;
  if (at >= music.buf.duration - 0.05) musicEnded(); else music.off = at;
}
function musicEnded() {
  music.src = null; music.buf = null; music.off = 0;
  musicNext();
}
function musicNext() {
  if (!musicOn() || performance.now() < music.retryAt) return;
  const ok = MUSIC.filter((id) => !music.bad.has(id) && !music.miss.has(id) && id !== music.id);
  if (!ok.length) {   // nothing could be fetched: start over in half a minute, on a gesture
    music.id = null; music.miss.clear(); music.retryAt = performance.now() + 30000;
    return;
  }
  musicLoad(ok[Math.floor(Math.random() * ok.length)]);
}
const decodeWith = (c, ab) => new Promise((ok, no) => { const p = c.decodeAudioData(ab, ok, no); if (p && p.catch) p.catch(no); });
let musicDec = null;
function decodeMusic(ab) {   // at the file's 32 kHz when the browser can: two thirds of the memory
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  try { if (!musicDec && OAC) musicDec = new OAC(2, 1, MUSIC_SR); } catch { musicDec = null; }
  const viaCtx = () => (actx ? decodeWith(actx, ab) : Promise.reject(new Error('no context')));
  if (!musicDec) return viaCtx();
  let first;
  try { first = decodeWith(musicDec, ab.slice(0)); } catch (e) { first = Promise.reject(e); }
  return first.catch(viaCtx);
}
function musicLoad(id) {
  const n = ++music.loading;
  const fail = (set) => {
    if (n !== music.loading) return;
    music.loading = 0; set.add(id);
    if (set === music.bad) musicNext(); else music.id = null;   // no network: try again on a later gesture
  };
  fetch(`music/${id}.mp3`).then((r) => (r.ok ? r.arrayBuffer().catch(() => Promise.reject('net')) : Promise.reject(r.status)), () => Promise.reject('net'))
    .then((ab) => {
      if (n !== music.loading) return null;
      musicPause(); music.buf = null;
      return decodeMusic(ab).catch(() => Promise.reject('decode'));
    })
    .then((b) => {
      if (!b || n !== music.loading) return;
      music.loading = 0;
      Object.assign(music, { buf: b, id, off: 0 });
      musicPlay();
    }, (why) => fail(why === 'decode' ? music.bad : music.miss));   // a server error may pass; a broken file won't
}
