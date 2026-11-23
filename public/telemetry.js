// Party analytics: what happens in a party of the game, wave by wave, sent to the server (/api/telemetry) so that the
// balance can be read off real players and not only off the bots (balance/players.mjs reads it back).
// Nothing personal goes: a random id of the device (kept in localStorage), the version of the game, and the party
// itself. A party is a few records:
//   start — level, seed, perks, the fruit's health and the dew at the start, whether a saved party was resumed;
//   wave  — one per wave: the garden as it stood when the wave was called (every plant with its level and cell, the
//           roots of eaten ones), the trail through it, the dew and the fruit, the early call, what was done before
//           the wave (built, grown, sold, grown back…) and during it, frost and rain, the bugs killed and the bugs that bit
//           the fruit by kind, the plants eaten, the time it took (game and real seconds, paused, at what speed);
//   end   — won or lost, the stars, the wave reached; quit — the level was left in the middle (the page closed, the
//           home screen). A saved level taken up again goes on under the same party id (kept beside the save in
//           PARTY), with a start record marked resumed; a wave cut off by leaving and played again from the save
//           comes twice, the cut one marked cut.
// Records wait in localStorage until the server takes them (a party played offline is sent later), at most MAX of them;
// each has an id of its own (k), and only the ones a request carried are dropped when it gets through. A request
// is cut to BYTES (the server takes 256 KB), a beacon to BEACON (browsers refuse more than 64 KB); a batch the server
// refuses as junk (400, 413) is dropped, so that it does not stop the rest for good.
import { VERSION, trails } from './game.js';

const KEY = 'fruit.tq', DEV = 'fruit.dev', PARTY = 'fruit.tp', MAX = 400, URL_ = 'api/telemetry', BYTES = 200 * 1024, BEACON = 60 * 1024;
const rid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
const r1 = (v) => Math.round(v * 10) / 10;

export function createTelemetry({ storage = globalThis.localStorage, post = null, enabled = true } = {}) {
  const read = () => { try { return JSON.parse(storage.getItem(KEY) || '[]'); } catch { return []; } };
  const write = (q) => { try { storage.setItem(KEY, JSON.stringify(q.slice(-MAX))); } catch { /* storage full: these are lost */ } };
  let device = storage.getItem(DEV); if (!device) { device = rid(); try { storage.setItem(DEV, device); } catch { /* as it is */ } }
  let party = null, chain = Promise.resolve();
  // send(body) → the status of the answer (post, for the tests: true for 200, false for no answer)
  const send = post ? async (body) => { const r = await post(body); return r === true ? 200 : r === false ? 503 : r; }
    : async (body) => (await fetch(URL_, { method: 'POST', headers: { 'content-type': 'application/json' }, body })).status;
  let seq = 0;
  const push = (type, data) => { if (!enabled || !party) return; const q = read(); q.push({ v: 1, type, k: `${Date.now().toString(36)}.${seq++}`, id: party.id, dev: device, ver: VERSION, level: party.level, at: Date.now(), ...data }); write(q); };
  // the first records of the queue that fit in so many bytes (one at least), and their ids
  const batch = (q, bytes) => { const out = []; let n = 2; for (const r of q.slice(0, 100)) { const s = JSON.stringify(r).length + 1; if (out.length && n + s > bytes) break; out.push(r); n += s; } return out; };
  const drop = (sent) => { const ks = new Set(sent.map((r) => r.k)); write(read().filter((r) => !ks.has(r.k))); };

  // the garden as it stands: plants and roots, the trail (cells, the shortest when there are two anthills)
  const garden = (g) => ({ plants: g.plants.map((p) => [p.type, p.lvl, p.i, p.j, Math.round(p.hp)]), stubs: g.stubs.map((s) => [s.type, s.lvl, s.i, s.j]),
    trail: Math.min(...trails(g).map((t) => t.length)) });
  const openWave = (g) => ({ n: g.wave, t0: g.time, real: 0, paused: 0, atSpeed: [0, 0, 0], dew: Math.round(g.dew), hp: g.hp, early: party.early || 0,
    before: party.build, during: [], kills: {}, reward: 0, bites: {}, eaten: [], garden: garden(g) });

  return {
    // a level begins (resumed: from a saved party, at its wave)
    start(g, resumed = false) {
      this.quit(); // a party left for another
      let kept = null; try { kept = JSON.parse(storage.getItem(PARTY) || 'null'); } catch { /* none */ }
      const id = resumed && kept?.level === g.level ? kept.id : rid(); try { storage.setItem(PARTY, JSON.stringify({ id, level: g.level })); } catch { /* as it is */ }
      party = { id, g, level: g.level, t0: performance.now(), build: [], wave: null, early: 0 };
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
          case 'regrow': if (e.by === 'rain') act(['regrow', e.p.type, e.p.i, e.p.j, 1]); break; // by the rain; after the wave the whole garden grows back by itself
          case 'weed': act(['weed', e.i, e.j]); break;
          case 'power': act(['power', e.kind]); break;
          case 'early': party.early = e.bonus; break;
          case 'wave': party.wave = openWave(g); party.wave.buildReal = r1(party.buildReal || 0); party.build = []; party.early = 0; party.buildReal = 0; break;
          case 'kill': if (party.wave) { const k = e.b.kind + (e.b.brood ? '*' : ''); party.wave.kills[k] = (party.wave.kills[k] || 0) + 1; party.wave.reward += e.reward; } break;
          case 'bite': if (party.wave) { const k = e.b.kind + (e.b.brood ? '*' : ''); party.wave.bites[k] = (party.wave.bites[k] || 0) + 1; } break;
          case 'plantDead': if (party.wave) party.wave.eaten.push([e.p.type, e.p.lvl, e.p.i, e.p.j]); break;
          case 'waveDone': this.closeWave(g, e.bonus); break;
          case 'won': case 'lost': this.closeWave(g, 0); try { storage.removeItem(PARTY); } catch { /* as it is */ } push('end', { won: e.t === 'won', hp: g.hp, maxHp: g.maxHp, wave: g.wave, waves: g.waves, time: r1(g.time), real: r1((performance.now() - party.t0) / 1000) }); party = null; this.flush(); return;
        }
      }
    },
    closeWave(g, bonus, cut = false) {
      const w = party?.wave; if (!w) return; party.wave = null;
      push('wave', { ...w, ...(cut ? { cut: true } : {}), t: r1(g.time - w.t0), t0: r1(w.t0), real: r1(w.real), paused: r1(w.paused), atSpeed: w.atSpeed.map(r1), bonus, dewEnd: Math.round(g.dew), hpEnd: g.hp });
      this.flush();
    },
    // the page is left, or another level is begun, in the middle of a level
    quit(g = party?.g) { if (!party) return; if (g && party.wave) this.closeWave(g, 0, true); push('quit', { wave: g?.wave ?? null }); party = null; },
    // sends what waits; beacon: the page is going away (sendBeacon outlives it)
    // (one sending at a time: a flush asked for while another runs goes after it)
    flush(beacon = false) {
      if (!enabled) return Promise.resolve();
      if (beacon && globalThis.navigator?.sendBeacon) { const b = batch(read(), BEACON); if (b.length && navigator.sendBeacon(URL_, new Blob([JSON.stringify(b)], { type: 'application/json' }))) drop(b); return Promise.resolve(); }
      const run = async () => {
        for (let k = 0; k < 10; k++) { // ten requests at most a flush
          const b = batch(read(), BYTES); if (!b.length) return;
          let status; try { status = await send(JSON.stringify(b)); } catch { return; } // offline: next time
          if (status >= 200 && status < 300 || status === 400 || status === 413) drop(b); else return; // taken, or junk that would block the rest
        }
      };
      chain = chain.then(run, run); return chain;
    },
    get pending() { return read().length; },
  };
}
