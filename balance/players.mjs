// What real players did (the party analytics of public/telemetry.js, kept by the server):
//   node balance/players.mjs [--file F | --url U] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--level 3] [--party ID] [--dev ID]
// Fetches the records from the game server (--url, default https://fruit.games.bubas.cc/api/telemetry, with the token
// of $FRUIT_TELEMETRY_TOKEN or ~/.config/homelab/fruit-game/telemetry-token) and keeps a copy in
// ~/tmp/telemetry/<time>.jsonl, or reads a file of them (--file). Prints, level by level: the parties (won, lost, left),
// the waves where the fruit was bitten and by whom, where parties were lost, the trail players build (cells, against
// the trail as it is), the dew left unspent, the plants they plant, how long they think between waves and at what
// speed they watch them; with --party, the party wave by wave (the garden, what was done, what bit the fruit).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { LEVELS } from '../public/data.js';
import { createGame, trails } from '../public/game.js';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const sum = (a) => a.reduce((t, v) => t + v, 0), add = (m, k, v = 1) => { m[k] = (m[k] || 0) + v; };

async function load() {
  if (opt('--file')) return readFileSync(opt('--file'), 'utf8');
  const tokenFile = join(homedir(), '.config', 'homelab', 'fruit-game', 'telemetry-token');
  const token = process.env.FRUIT_TELEMETRY_TOKEN || (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : '');
  if (!token) throw new Error(`no token: set FRUIT_TELEMETRY_TOKEN or put it in ${tokenFile}`);
  const q = new URLSearchParams(); if (opt('--from')) q.set('from', opt('--from')); if (opt('--to')) q.set('to', opt('--to'));
  const r = await fetch(`${opt('--url', 'https://fruit.games.bubas.cc/api/telemetry')}?${q}`, { headers: { authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`the server said ${r.status}`);
  const text = await r.text(), dir = join(homedir(), 'tmp', 'telemetry'); mkdirSync(dir, { recursive: true });
  const f = join(dir, `${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.jsonl`); writeFileSync(f, text); console.error(`kept in ${f}`);
  return text;
}
const records = (await load()).split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean)
  .filter((r) => r.dev !== 'agent-check' && (!opt('--dev') || r.dev === opt('--dev'))); // agent-check: the agent's own check that the server keeps records
// parties: their records by id, in order
const parties = new Map();
for (const r of records.sort((a, b) => a.at - b.at)) { if (!parties.has(r.id)) parties.set(r.id, { id: r.id, dev: r.dev, ver: r.ver, level: r.level, waves: [], start: null, end: null, quit: null }); const p = parties.get(r.id);
  if (r.type === 'start') p.start = r; else if (r.type === 'wave') p.waves.push(r); else if (r.type === 'end') p.end = r; else if (r.type === 'quit') p.quit = r; }
const base = LEVELS.map((_, n) => Math.min(...trails(createGame(n)).map((t) => t.length)));
const name = (n) => `L${n + 1} ${LEVELS[n]?.name ?? ''}`;

if (opt('--party')) {
  const p = [...parties.values()].find((x) => x.id.startsWith(opt('--party'))); if (!p) throw new Error('no such party');
  console.log(`${name(p.level)}, party ${p.id} (device ${p.dev.slice(0, 8)}, version ${p.ver}), perks ${JSON.stringify(p.start?.meta || {})}${p.start?.resumed ? ', resumed' : ''}`);
  for (const w of p.waves) {
    const plants = {}; for (const [t, lvl] of w.garden.plants) add(plants, `${t}${lvl > 1 ? lvl : ''}`);
    console.log(`  wave ${w.n}: trail ${w.garden.trail} cells, dew ${w.dew} → ${w.dewEnd}, fruit ${w.hp} → ${w.hpEnd}; ${w.real}s (${w.paused}s paused, ×1/×2/×3 ${w.atSpeed.join('/')}s), thought ${w.buildReal}s before`);
    console.log(`    garden: ${Object.entries(plants).map(([k, v]) => `${k}×${v}`).join(' ')}${w.garden.stubs.length ? `, roots ${w.garden.stubs.length}` : ''}`);
    if (w.before.length) console.log(`    before: ${w.before.map((a) => a.slice(0, -1).join(' ')).join(', ')}`);
    if (w.during.length) console.log(`    during: ${w.during.map((a) => `${a.slice(0, -1).join(' ')} @${a.at(-1)}`).join(', ')}`);
    console.log(`    killed ${JSON.stringify(w.kills)}; bit the fruit ${JSON.stringify(w.bites)}${w.eaten.length ? `; eaten ${w.eaten.map((e) => e[0]).join(', ')}` : ''}`);
  }
  console.log(p.end ? `  ${p.end.won ? 'won' : 'lost'} at wave ${p.end.wave}/${p.end.waves}, fruit ${p.end.hp}/${p.end.maxHp}` : p.quit ? `  left at wave ${p.quit.wave}` : '  not finished (yet)');
  process.exit(0);
}
const levels = [...new Set([...parties.values()].map((p) => p.level))].sort((a, b) => a - b).filter((n) => !opt('--level') || n === Number(opt('--level')) - 1);
console.log(`${records.length} records, ${parties.size} parties, ${new Set(records.map((r) => r.dev)).size} devices, versions ${[...new Set(records.map((r) => r.ver))].join(', ')}`);
for (const n of levels) {
  const ps = [...parties.values()].filter((p) => p.level === n), won = ps.filter((p) => p.end?.won), lost = ps.filter((p) => p.end && !p.end.won), left = ps.filter((p) => !p.end);
  const stars = won.map((p) => (p.end.hp >= p.end.maxHp * .8 ? 3 : p.end.hp >= p.end.maxHp * .4 ? 2 : 1));
  console.log(`\n${name(n)}: ${ps.length} parties — won ${won.length} (stars ${stars.join(' ') || '-'}), lost ${lost.length} (at waves ${lost.map((p) => p.end.wave).join(' ') || '-'}), not finished ${left.length}`);
  const ws = ps.flatMap((p) => p.waves);
  if (!ws.length) continue;
  // by wave: how many parties got there, the bites and who bit, the trail, the dew left
  const byN = new Map(); for (const w of ws) { if (!byN.has(w.n)) byN.set(w.n, []); byN.get(w.n).push(w); }
  for (const [k, list] of [...byN].sort((a, b) => a[0] - b[0])) {
    const bites = {}; for (const w of list) for (const [kind, c] of Object.entries(w.bites)) add(bites, kind, c);
    const bitten = list.filter((w) => Object.keys(w.bites).length).length;
    if (!bitten && k % 5 && k !== 1) continue; // quiet waves: only every fifth shown
    console.log(`  wave ${String(k).padStart(2)}: ${list.length} parties, bitten in ${bitten}${bitten ? ` (${Object.entries(bites).sort((a, b) => b[1] - a[1]).map(([x, c]) => `${x}×${c}`).join(' ')})` : ''}; trail ${med(list.map((w) => w.garden.trail))} (as it is ${base[n]}), dew left ${med(list.map((w) => w.dewEnd))}, ${med(list.map((w) => w.real))}s`);
  }
  const plants = {}; for (const p of ps) { const last = p.waves.at(-1); if (last) for (const [t] of last.garden.plants) add(plants, t); }
  const speed = [0, 1, 2].map((s) => sum(ws.map((w) => w.atSpeed[s]))), all = sum(speed) || 1;
  console.log(`  plants at the last wave seen: ${Object.entries(plants).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`  between waves ${med(ws.map((w) => w.buildReal))}s to think (median), the waves watched at ×1/×2/×3 ${speed.map((v) => Math.round(v / all * 100)).join('/')}%, frost and rain ${sum(ws.map((w) => w.during.filter((a) => a[0] === 'power').length))} times`);
  console.log(`  parties: ${ps.map((p) => `${p.id.slice(0, 8)} ${p.end ? (p.end.won ? 'W' : `l${p.end.wave}`) : `…${p.waves.at(-1)?.n ?? 0}`}`).join(', ')}`);
}
