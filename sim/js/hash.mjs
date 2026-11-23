// The state of a game as one number and as text: the JS simulation (public/game.js) and its native copy (sim/src)
// must give the same after every step. Numbers go in by their bits, so the last bit counts (-0 is taken as 0).
const F = new Float64Array(1), U = new Uint32Array(F.buffer);
const PHASE = { build: 0, wave: 1, won: 2, lost: 3 }, BR = { a: 1, b: 2 };
// the numbers of the state, in a fixed order; sim/src/game.rs `fields` lists the same
export function fields(g, out = []) {
  out.length = 0;
  out.push(g.dew, g.hp, g.wave, PHASE[g.phase], g.time, g.waveTime, g.nextIn ?? -1, g.powers.frost, g.powers.rain, g.nextId, g.queue.length, g.stats.kills, g.stats.bites, g.stats.eaten, g.stats.earned);
  out.push(g.bugs.length); for (const b of g.bugs) out.push(b.id, b.hp, b.x, b.y, b.slow, b.frozen, b.burn, b.chew, b.thaw, b.chewCd, b.skill, b.rush, b.mark, b.coming, b.ti ?? -1, b.tj ?? -1, b.slowT, b.melt, b.armor, b.fly ? 1 : 0, b.sniff, b.fall, b.lured ? 1 : 0);
  out.push(g.plants.length); for (const p of g.plants) out.push(p.id, p.lvl, p.i, p.j, p.hp, p.cd, p.web, BR[p.br] || 0, p.guard, p.spikes, p.warded ? 1 : 0, p.stk);
  out.push(g.stubs.length); for (const s of g.stubs) out.push(s.id, s.i, s.j);
  out.push(g.shots.length); for (const s of g.shots) out.push(s.id, s.x, s.y);
  return out;
}
const buf = [];
export function hash(g) {
  let h = 2166136261 | 0;
  for (const v of fields(g, buf)) { F[0] = v + 0; h = Math.imul(h ^ U[0], 16777619); h = Math.imul(h ^ U[1], 16777619); }
  return h >>> 0;
}
// one line per number: its bits and, for the eye, its value and what it is
export function dump(g) {
  const names = labels(g);
  return fields(g).map((v, k) => { F[0] = v + 0; return `${k} ${U[1].toString(16).padStart(8, '0')}${U[0].toString(16).padStart(8, '0')} ${v + 0} ${names[k]}`; }).join('\n');
}
// what every number of fields() is, in the same order
export function labels(g) {
  const out = ['dew', 'fruit hp', 'wave', 'phase', 'time', 'wave time', 'next wave in', 'frost', 'rain', 'next id', 'queue', 'kills', 'bites', 'eaten', 'earned', 'bugs'];
  for (const b of g.bugs) for (const k of ['id', 'hp', 'x', 'y', 'slow', 'frozen', 'burn', 'chew', 'thaw', 'chewCd', 'skill', 'rush', 'mark', 'coming', 'ti', 'tj', 'slowT', 'melt', 'armor', 'fly', 'sniff', 'fall', 'lured']) out.push(`bug ${b.id} ${b.kind} ${k}`);
  out.push('plants'); for (const p of g.plants) for (const k of ['id', 'lvl', 'i', 'j', 'hp', 'cd', 'web', 'br', 'guard', 'spikes', 'warded', 'stk']) out.push(`plant ${p.id} ${p.type} (${p.i},${p.j}) ${k}`);
  out.push('roots'); for (const s of g.stubs) for (const k of ['id', 'i', 'j']) out.push(`root ${s.id} ${s.type} (${s.i},${s.j}) ${k}`);
  out.push('shots'); for (const s of g.shots) for (const k of ['id', 'x', 'y']) out.push(`shot ${s.id} ${k}`);
  return out;
}
