// The mazes of the balance matrix, drawn: node balance/routes.mjs [--levels 1,5-7]
// For every level, the lengths of the trail the matrix checks (straight, min, mid, above, max — sim/src/routes.rs) and
// the shapes each is built in. # a wall of pumpkins, o the trail, the rest as in the map of the level.
import { fileURLToPath } from 'node:url';
import { LEVELS } from '../public/data.js';
import { routes } from '../sim/js/play.mjs';

// the map of a level with a maze on it, as lines of text
export function draw(level, r) {
  const rows = LEVELS[level].map.map((line) => [...line]);
  for (const [i, j] of r.trail) if (rows[j][i] === '.') rows[j][i] = 'o';
  for (const w of r.walls) for (const [i, j] of w) if (rows[j][i] === '.' || rows[j][i] === 'f' || rows[j][i] === 'm') rows[j][i] = '#';
  return rows.map((x) => x.join(''));
}
// several maps side by side under their titles
export function strip(level, list, title = (r) => `${r.name} ${r.len}`) {
  const maps = list.map((r) => draw(level, r)), names = list.map(title), w = Math.max(LEVELS[level].map[0].length, ...names.map((x) => x.length)) + 3, out = [names.map((x) => x.padEnd(w)).join('')];
  for (let j = 0; j < maps[0].length; j++) out.push(maps.map((m) => m[j].padEnd(w)).join(''));
  return out.join('\n');
}
export const CLASSES = ['min', 'mid', 'above', 'max'];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), at = args.indexOf('--levels');
  const range = (s) => s.split(',').flatMap((p) => { const [a, b] = p.split('-').map(Number); return b ? Array.from({ length: b - a + 1 }, (_, k) => a + k) : [a]; });
  const levels = (at >= 0 ? range(args[at + 1]) : LEVELS.map((_, n) => n + 1)).map((n) => n - 1);
  for (const L of routes(levels)) {
    console.log(`\n== L${L.level + 1} ${LEVELS[L.level].name}: straight ${L.base}, longest ${L.max}`);
    for (const c of CLASSES) { const list = L.routes.filter((r) => r.class === c); console.log(list.length ? '\n' + strip(L.level, list) : `\n${c}: no maze of this length`); }
  }
}
