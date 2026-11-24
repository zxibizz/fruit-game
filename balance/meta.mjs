// The meta of the levels in the terminal: what the studio (balance/studio.mjs) shows, without the page.
//   node balance/meta.mjs [--levels 6,8-9] [--secs 60] [--set K=V,...] [--meta exp2] [--tol 0] [--warm] [--verify]
//     [--json FILE] [--jobs N]
// For each level in turn the studio's engine searches every wave for --secs seconds (the level alone gets the work)
// and the table says, wave by wave: the dew, the margin of the best garden and of the best garden of one plant (which
// plant), the premium of the mix over it, the trail of the best garden and what it is made of. Below: which families
// of plants (a plant or a plant on a branch) the best gardens of the level are made of, and what stands out:
//   <1     not even the best garden found holds the wave clean with all the dew of the level so far
//   МОНО   a garden of one plant does as well as the best mix (≤ 5% below it): the meta of that wave is one plant
//   ∞      the best garden holds bugs of any health (it kills by shares of health: thorns, spikes, nettles, flytraps)
//   unused a plant, or a branch open on the level, that takes 15% of the dew of no best five gardens of any wave
// --warm starts from what the studio found before (balance/.studio/state.json); --verify plays the best garden of every
// wave on 8 seeds of the game (where the flyers come from) and prints the spread of its margin.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { Engine, sleep, pickOf, INF } from './studio-engine.mjs';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const num = (v) => (v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v);
const set = Object.fromEntries((opt('--set', '') || '').split(',').filter(Boolean).map((kv) => { const [k, v] = kv.split('='); return [k.trim(), num(v.trim())]; }));
const SECS = Number(opt('--secs', 60)), json = opt('--json'), warm = args.includes('--warm'), verify = args.includes('--verify');
const ranges = (s, n) => s ? s.split(',').flatMap((p) => { const [a, b] = p.split('-').map(Number); return Array.from({ length: (b || a) - a + 1 }, (_, k) => a + k - 1); }) : Array.from({ length: n }, (_, k) => k);

const RU = { pumpkin: 'Тыква', rose: 'Роза', pepper: 'Чили', mint: 'Мята', flytrap: 'Мухоловка' };
const BR = { pumpkin: ['Панцирь', 'Плети'], rose: ['Охотница', 'Дальнобойная'], pepper: ['Жар', 'Прожиг'], mint: ['Холод', 'Сосулька'], flytrap: ['Обжора', 'Ловчая'] };
export const famRu = (f) => { const [k, b] = f.split('.'); return b ? BR[k][b === 'a' ? 0 : 1] : RU[k]; };
const fm = (m) => (m >= INF ? '∞' : m >= 10 ? m.toFixed(1) : m.toFixed(2));
const pad = (s, n) => String(s).padEnd(n), lpad = (s, n) => String(s).padStart(n);

const eng = new Engine({ jobs: opt('--jobs') ? Number(opt('--jobs')) : undefined });
const d = await eng.load({ set, meta: opt('--meta', 'exp2'), tol: Number(opt('--tol', 0)) });
const levels = ranges(opt('--levels'), d.ui.levels.length);
if (warm && existsSync(new URL('./.studio/state.json', import.meta.url))) {
  const st = JSON.parse(readFileSync(new URL('./.studio/state.json', import.meta.url), 'utf8'));
  for (const r of Object.values(st.waves || {})) if (levels.includes(r.level)) eng.seed(r.level, r.wave, [...r.top.map((g) => ({ walls: g.walls, cells: g.cells, m: g.m })), ...Object.values(r.mono || {}).map((g) => ({ walls: g.walls, cells: g.cells, m: g.m, mono: true }))]);
}
const out = [];
for (const L of levels) {
  const lv = d.ui.levels[L]; eng.caps(1e9, 0); eng.focus(L, null);
  const t0 = Date.now(); await sleep(SECS * 1000);
  const rs = eng.level(L); if (!rs.length) { console.log(`L${L + 1}: nothing found`); continue; }
  console.log(`\nL${L + 1} ${lv.name} — ${lv.waves.length} волн, ${Math.round((Date.now() - t0) / 1000)} с, ${rs.reduce((t, r) => t + r.plays, 0)} прогонов волн`);
  console.log(`${pad('волна', 6)}${lpad('роса', 6)}${lpad('лучший', 8)}${lpad('моно', 7)} ${pad('(вид)', 10)}${lpad('премия', 7)}${lpad('тропа', 6)}  ${verify ? pad('сиды мин/мед', 14) : ''}состав лучшего`);
  const waves = [];
  for (const r of rs) {
    const best = r.top[0], mono = Object.entries(r.mono).sort((a, b) => b[1].m - a[1].m)[0];
    const prem = mono && mono[1].m > 0 ? Math.min(best.m, INF) / Math.min(mono[1].m, INF) : Infinity;
    const flags = [best.m < 1 ? '<1' : '', best.m >= INF ? '∞' : '', prem <= 1.05 ? 'МОНО' : ''].filter(Boolean);
    let seeds = '';
    if (verify) { const v = await eng.verify(L, r.wave, best); const xs = [...v.margins].sort((a, b) => a - b); seeds = `${fm(xs[0])}/${fm(xs[xs.length >> 1])}`; r.seeds = v.margins; }
    const mix = Object.entries(best.mix).sort((a, b) => b[1] - a[1]).filter(([, x]) => x >= 0.05).map(([f, x]) => `${famRu(f)} ${Math.round(x * 100)}%`).join(', ');
    console.log(`${pad(r.wave, 6)}${lpad(r.budget, 6)}${lpad(fm(best.m), 8)}${lpad(mono ? fm(mono[1].m) : '-', 7)} ${pad(mono ? RU[mono[0]] : '', 10)}${lpad(prem === Infinity ? '-' : prem.toFixed(2), 7)}${lpad(best.len, 6)}  ${verify ? pad(seeds, 14) : ''}${mix}${flags.length ? '   ' + flags.join(' ') : ''}`);
    waves.push({ wave: r.wave, budget: r.budget, best: best.m, mono: mono ? { kind: mono[0], m: mono[1].m } : null, premium: prem, len: best.len, mix: best.mix, pick: pickOf(r), flags, seeds: r.seeds, tried: r.tried, plays: r.plays, garden: best });
  }
  // the families over the level: the mean share in the best five, the waves it has 15% of the dew of the best five in
  const fams = {}; for (const w of waves) for (const [f, x] of Object.entries(w.pick)) { fams[f] ??= { mean: 0, waves: 0 }; fams[f].mean += x / waves.length; if (x >= 0.15) fams[f].waves++; }
  // a plant not in any best garden, or a branch (open on the level) of none: levels 1-2 are the way to a branch, not a
  // choice of their own
  const open = (k, b) => (d.ui.PLANTS[k][b]?.from ?? 99) <= L + 1;
  const all = lv.plants.flatMap((k) => [...['a', 'b'].filter((b) => open(k, b)).map((b) => `${k}.${b}`)]);
  console.log('семейства (доля росы в пятёрке лучших, в среднем по волнам; волн с долей ≥15%):');
  console.log('  ' + Object.entries(fams).sort((a, b) => b[1].mean - a[1].mean).map(([f, x]) => `${famRu(f)} ${Math.round(x.mean * 100)}% (${x.waves})`).join(', '));
  const used = (k) => Object.entries(fams).some(([f, x]) => f.split('.')[0] === k && x.waves > 0);
  const unused = [...lv.plants.filter((k) => !used(k)), ...all.filter((f) => !fams[f] || fams[f].waves === 0)];
  const monoW = waves.filter((w) => w.flags.includes('МОНО')).map((w) => w.wave), hard = waves.filter((w) => w.best < 1).map((w) => w.wave), inf = waves.filter((w) => w.best >= INF).map((w) => w.wave);
  if (unused.length) console.log(`  не нужны нигде: ${unused.map(famRu).join(', ')}`);
  if (monoW.length) console.log(`  МОНО (одно растение не хуже смеси): волны ${monoW.join(', ')}`);
  if (hard.length) console.log(`  <1 (лучший сад не держит волну чисто): волны ${hard.join(', ')}`);
  if (inf.length) console.log(`  ∞ (держит при любом здоровье): волны ${inf.join(', ')}`);
  out.push({ level: L, name: lv.name, secs: SECS, waves, families: fams, unused });
}
if (json) writeFileSync(json, JSON.stringify({ set, levels: out }));
eng.stop();
