// Party analytics: what happens in a party of the game, wave by wave, sent to the server (/api/telemetry) so that the
// balance can be read off real players and not only off the bots (balance/players.mjs reads it back).
// Nothing personal goes: a random id of the device (kept in localStorage), the version of the game, and the party
// itself. A party is a few records:
//   start — level, seed, perks, the fruit's health and the dew at the start, whether a saved party was resumed;
//   wave  — one per wave: the garden as it stood when the wave was called (every plant with its level and cell, the
//           roots of eaten ones), the trail through it, the dew and the fruit, the early call, what was done before
//           the wave (built, grown, sold, mended…) and during it, frost and rain, the bugs killed and the bugs that bit
//           the fruit by kind, the plants eaten, the time it took (game and real seconds, paused, at what speed);
//   end   — won or lost, the stars, the wave reached; quit — the page was left in the middle of a level.
// Records wait in localStorage until the server takes them (a party played offline is sent later), at most MAX of them.
import { VERSION, trails } from './game.js';

const KEY = 'fruit.tq', DEV = 'fruit.dev', MAX = 400, URL_ = 'api/telemetry';
const rid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
const r1 = (v) => Math.round(v * 10) / 10;

export function createTelemetry({ storage = globalThis.localStorage, post = null, enabled = true } = {}) {
  const read = () => { try { return JSON.parse(storage.getItem(KEY) || '[]'); } catch { return []; } };
  const write = (q) => { try { storage.setItem(KEY, JSON.stringify(q.slice(-MAX))); } catch { /* storage full: these are lost */ } };
  let device = storage.getItem(DEV); if (!device) { device = rid(); try { storage.setItem(DEV, device); } catch { /* as it is */ } }
  let party = null, chain = Promise.resolve();
  const send = post || (async (body) => (await fetch(URL_, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true })).ok);
  const push = (type, data) => { if (!enabled || !party) return; const q = read(); q.push({ v: 1, type, id: party.id, dev: device, ver: VERSION, level: party.level, at: Date.now(), ...data }); write(q); };

  // the garden as it stands: plants and roots, the trail (cells, the shortest when there are two anthills)
  const garden = (g) => ({ plants: g.plants.map((p) => [p.type, p.lvl, p.i, p.j, Math.round(p.hp)]), stubs: g.stubs.map((s) => [s.type, s.lvl, s.i, s.j]),
    trail: Math.min(...trails(g).map((t) => t.length)) });
  const openWave = (g) => ({ n: g.wave, t0: g.time, real: 0, paused: 0, atSpeed: [0, 0, 0], dew: Math.round(g.dew), hp: g.hp, early: party.early || 0,
    before: party.build, during: [], kills: {}, reward: 0, bites: {}, eaten: [], garden: garden(g) });

  return {
    // a level begins (resumed: from a saved party, at its wave)
    start(g, resumed = false) {
      this.quit(); // a party left for another
      party = { id: rid(), level: g.level, t0: performance.now(), build: [], wave: null, early: 0 };
      push('start', { seed: g.seed, meta: { ...g.meta }, resumed, wave: g.wave, dew: Math.round(g.dew), hp: g.hp, maxHp: g.maxHp });
      this.flush();
    },
    // the real time of a frame: how long players think between waves and watch them, paused or at what speed
    tick(dt, speed, paused) {
      if (!party) return; const w = party.wave;
      if (w) { w.real += dt; if (paused) w.paused += dt; else w.atSpeed[Math.min(2, speed - 1)] += dt; } else party.buildReal = (party.buildReal || 0) + dt;
    },
    // the events of the game before the view clears them (game.js: g.events)
    observe(g) {
      if (!party || g.level !== party.level) return;
      const act = (a) => { a.push(r1(g.time)); (party.wave ? party.wave.during : party.build).push(a); };
      for (const e of g.events) {
        switch (e.t) {
          case 'place': act(['place', e.p.type, e.p.i, e.p.j]); break;
          case 'upgrade': act(['up', e.p.type, e.p.lvl, e.p.i, e.p.j]); break;
          case 'sell': act(['sell', e.p.type, e.p.lvl, e.p.i, e.p.j]); break;
          case 'regrow': act(['regrow', e.p.type, e.p.i, e.p.j, e.free ? 1 : 0]); break;
          case 'heal': act(['heal', e.p.type, e.p.i, e.p.j]); break;
          case 'weed': act(['weed', e.i, e.j]); break;
          case 'power': act(['power', e.kind]); break;
          case 'early': party.early = e.bonus; break;
          case 'wave': party.wave = openWave(g); party.wave.buildReal = r1(party.buildReal || 0); party.build = []; party.early = 0; party.buildReal = 0; break;
          case 'kill': if (party.wave) { const k = e.b.kind + (e.b.brood ? '*' : ''); party.wave.kills[k] = (party.wave.kills[k] || 0) + 1; party.wave.reward += e.reward; } break;
          case 'bite': if (party.wave) { const k = e.b.kind + (e.b.brood ? '*' : ''); party.wave.bites[k] = (party.wave.bites[k] || 0) + 1; } break;
          case 'plantDead': if (party.wave) party.wave.eaten.push([e.p.type, e.p.lvl, e.p.i, e.p.j]); break;
          case 'waveDone': this.closeWave(g, e.bonus); break;
          case 'won': case 'lost': this.closeWave(g, 0); push('end', { won: e.t === 'won', hp: g.hp, maxHp: g.maxHp, wave: g.wave, waves: g.waves, time: r1(g.time), real: r1((performance.now() - party.t0) / 1000) }); party = null; this.flush(); return;
        }
      }
    },
    closeWave(g, bonus) {
      const w = party?.wave; if (!w) return; party.wave = null;
      push('wave', { ...w, t: r1(g.time - w.t0), t0: r1(w.t0), real: r1(w.real), paused: r1(w.paused), atSpeed: w.atSpeed.map(r1), bonus, dewEnd: Math.round(g.dew), hpEnd: g.hp });
      this.flush();
    },
    // the page is left, or another level is begun, in the middle of a level
    quit(g = null) { if (!party) return; if (g && party.wave) this.closeWave(g, 0); push('quit', { wave: g?.wave ?? null }); party = null; },
    // sends what waits; beacon: the page is going away (sendBeacon outlives it)
    // (one sending at a time: a flush asked for while another runs goes after it)
    flush(beacon = false) {
      if (!enabled) return Promise.resolve();
      if (beacon && globalThis.navigator?.sendBeacon) { const q = read(); if (q.length && navigator.sendBeacon(URL_, new Blob([JSON.stringify(q.slice(0, 100))], { type: 'application/json' }))) write(q.slice(100)); return Promise.resolve(); }
      const run = async () => {
        for (let k = 0; k < 10; k++) { // a hundred records a request, ten requests at most
          const q = read(); if (!q.length) return;
          try { if (!(await send(JSON.stringify(q.slice(0, 100))))) return; } catch { return; } // offline: next time
          write(read().slice(Math.min(100, q.length)));
        }
      };
      chain = chain.then(run, run); return chain;
    },
    get pending() { return read().length; },
  };
}
