// A look at the waves alone, no bot: sudden walls of bugs the player cannot see coming. Used by the tests too.
import { BUGS } from '../public/data.js';
import { createGame, bugHp } from '../public/game.js';

// For every level: per wave the health coming on foot and through the air (bosses apart).
export function waveProfile(LEVELS) {
  return LEVELS.map((L, n) => { const g = createGame(n);
    return L.waves.map((spec, w) => { let ground = 0, air = 0, boss = 0;
      for (const [k, c] of spec) { const hp = c * bugHp(g, k, w + 1); if (BUGS[k].boss) boss += hp; else if (BUGS[k].fly) air += hp; else ground += hp; }
      return { wave: w + 1, ground, air, boss }; }); });
}
// Issues: flyers several times the most seen so far on the level, flyers most of a wave (fail: flyers skip the maze,
// nothing on the field answers them); a wave far above the waves before it (warn: health alone says little of armor
// and speed, the matrix tells whether it really hurts).
export function waveLint(LEVELS, { airJump = 2.6, airShare = .45, jump = 2.2 } = {}) {
  const out = [];
  waveProfile(LEVELS).forEach((waves, n) => {
    let airMax = 0;
    waves.forEach((w, k) => {
      const all = w.ground + w.air, prev = waves.slice(Math.max(0, k - 3), k).map((q) => q.ground + q.air);
      if (w.air && airMax && w.air > airMax * airJump && w.air > 2500) out.push({ level: n + 1, wave: w.wave, severity: 'fail', issue: `flyers ${Math.round(w.air)} hp, ${(w.air / airMax).toFixed(1)}× the most before` });
      if (all && w.air / all > airShare) out.push({ level: n + 1, wave: w.wave, severity: 'fail', issue: `flyers ${Math.round(w.air / all * 100)}% of the wave` });
      if (k >= 6 && all > jump * Math.max(...prev)) out.push({ level: n + 1, wave: w.wave, severity: 'warn', issue: `${Math.round(all)} hp, ${(all / Math.max(...prev)).toFixed(1)}× the waves before` });
      airMax = Math.max(airMax, w.air);
    });
  });
  return out;
}
