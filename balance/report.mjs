// The HTML report: per variant of the data, a table level × scenario (green: won, the more fruit left the greener;
// red: lost, the earlier the redder), the findings, the mazes of the route group drawn, and the wave lint.
const ROUTES = ['straight', 'min', 'mid', 'above', 'max'];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const color = (r) => { if (r.won) { const k = r.hp / r.maxHp; return `hsl(120,${40 + k * 30}%,${88 - k * 30}%)`; } const k = 1 - (r.wave - 1) / r.waves; return `hsl(0,${45 + k * 30}%,${86 - k * 26}%)`; };
export function html({ title, variants, lint, routes = [] }) {
  const sev = { fail: '#c0392b', warn: '#c07a10', info: '#5a7a9a' };
  const parts = variants.map((v) => {
    const names = [...new Set(v.results.map((r) => r.name))], levels = [...new Set(v.results.map((r) => r.level))].sort((a, b) => a - b);
    const cell = (n, name) => { const r = v.results.find((q) => q.level === n && q.name === name); if (!r) return '<td></td>';
      const x = r.res, tip = `${r.name}\n${r.margin ? `margin: wins at ${r.margin.lo ?? '-'}, loses at ${r.margin.hi ?? '-'}${r.margin.steady ? '' : ' (unsteady)'}\n` : ''}first bite: ${x.firstBite ?? '-'}\nbites: ${x.bites} ${JSON.stringify(x.byKind)}\nworst wave ${x.worstWave ?? '-'} (${Math.round(x.worstShare * 100)}%)\nplants ${x.plants} grown ${x.grown} trail ${x.trail}\nspare dew ${x.spare ?? '∞'} powers ${x.powersUsed}\n${x.ms} ms`;
      return `<td style="background:${color(x)}" title="${esc(tip)}">${x.won ? `${x.hp}/${x.maxHp}` : `w${x.wave}`}</td>`; };
    const pc = (x) => (x == null ? '–' : Math.round(x * 100)), mcell = (x) => (x ? `<td style="background:${x.m >= 1 ? 'hsl(120,45%,85%)' : 'hsl(0,55%,88%)'}">${pc(x.m)}${x.n > 1 ? ` <small>${pc(x.lo)}–${pc(x.hi)}</small>` : ''}</td>` : '<td></td>');
    const margins = v.margins?.length ? `<h3>Margins</h3><p>How healthy the bugs may be, in percent of what they are now, before it stops winning: over 100 wins with that much to spare, under 100 loses by that much. The smart bot and the expert: the median over seeds and draws of the waves; lazy: the best lazy garden with the perks of its time; novice and ordinary: the players the levels are for (plans.mjs), the median over the mazes each plays on; the trail by its length: the median over its shapes, and the least and the most.</p>
<table><tr><th></th><th>lazy</th><th>novice</th><th>ordinary</th><th>smart</th><th>expert</th>${ROUTES.map((c) => `<th>${c}</th>`).join('')}</tr>${v.margins.map((m) => `<tr><th>L${m.level}</th>${[m.lazy, m.novice, m.ordinary, m.smart, m.expert].map((x) => mcell(x && { m: x, n: 1 })).join('')}${ROUTES.map((c) => mcell(m.route[c])).join('')}</tr>`).join('')}</table>` : '';
    const groups = names.map((nm) => v.results.find((r) => r.name === nm).group);
    return `<h2>${esc(v.label)}</h2>
<table><tr><th></th>${names.map((nm, k) => `<th class="g-${groups[k]}"><span>${esc(nm)}</span></th>`).join('')}</tr>
${levels.map((n) => `<tr><th>L${n + 1}</th>${names.map((nm) => cell(n, nm)).join('')}</tr>`).join('\n')}</table>
${margins}
<ul>${v.findings.map((f) => `<li><b style="color:${sev[f.severity]}">${f.severity}</b> L${f.level} · ${esc(f.rule)}: ${esc(f.text)}</li>`).join('') || '<li>no findings</li>'}</ul>`; }).join('\n');
  return `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font:13px system-ui,sans-serif;margin:16px;color:#222}table{border-collapse:collapse;margin:8px 0}td,th{border:1px solid #ccc;padding:3px 5px;text-align:center;font-variant-numeric:tabular-nums}
th span{writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap}th.g-smart{background:#e8f4e0}th.g-exploit{background:#fbe3e0}th.g-lazy{background:#fdf0dc}th.g-skill{background:#e6eefa}th.g-meta{background:#f0e6fa}th.g-route{background:#e0f4f4}th.g-player{background:#f6e2ee}th.g-expert{background:#c9ecc0}th.g-plant{background:#f4f4e0}li{margin:2px 0}</style>
<h1>${esc(title)}</h1>
<p>Column colours: green — smart bot, dark green — the expert (the strategy found by balance/strategy.mjs), red — exploits (endless dew, every perk, no maze), orange — lazy/half, blue — one skill off, violet — perks, pink — the novice and the ordinary player, teal — the trail by its length and shape (the mazes are drawn below), yellow — without one plant. Hover a cell for details.</p>
${parts}
${routes.length ? `<h2>Routes</h2><p># a wall of pumpkins, o the trail; under every name the length of the trail in cells and what came of it (W: the fruit left, l: the wave it was lost in).</p>${routes.map((L) => `<details><summary>L${L.level + 1}: straight ${L.base} cells, the longest ${L.max}</summary><pre>${esc(L.text)}</pre></details>`).join('\n')}` : ''}
<h2>Wave lint</h2><ul>${lint.map((x) => `<li><b>${x.severity}</b> L${x.level} wave ${x.wave}: ${esc(x.issue)}</li>`).join('') || '<li>clean</li>'}</ul>`;
}
