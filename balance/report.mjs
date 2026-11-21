// The HTML report: per variant of the data, a table level × scenario (green: won, the more fruit left the greener;
// red: lost, the earlier the redder), the findings and the wave lint.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const color = (r) => { if (r.won) { const k = r.hp / r.maxHp; return `hsl(120,${40 + k * 30}%,${88 - k * 30}%)`; } const k = 1 - (r.wave - 1) / r.waves; return `hsl(0,${45 + k * 30}%,${86 - k * 26}%)`; };
export function html({ title, variants, lint }) {
  const sev = { fail: '#c0392b', warn: '#c07a10', info: '#5a7a9a' };
  const parts = variants.map((v) => {
    const names = [...new Set(v.results.map((r) => r.name))], levels = [...new Set(v.results.map((r) => r.level))].sort((a, b) => a - b);
    const cell = (n, name) => { const r = v.results.find((q) => q.level === n && q.name === name); if (!r) return '<td></td>';
      const x = r.res, tip = `${r.name}\nfirst bite: ${x.firstBite ?? '-'}\nbites: ${x.bites} ${JSON.stringify(x.byKind)}\nworst wave ${x.worstWave ?? '-'} (${Math.round(x.worstShare * 100)}%)\nplants ${x.plants} grown ${x.grown} trail ${x.trail}\nspare dew ${x.spare ?? '∞'} powers ${x.powersUsed}\n${x.ms} ms`;
      return `<td style="background:${color(x)}" title="${esc(tip)}">${x.won ? `${x.hp}/${x.maxHp}` : `w${x.wave}`}</td>`; };
    const groups = names.map((nm) => v.results.find((r) => r.name === nm).group);
    return `<h2>${esc(v.label)}</h2>
<table><tr><th></th>${names.map((nm, k) => `<th class="g-${groups[k]}"><span>${esc(nm)}</span></th>`).join('')}</tr>
${levels.map((n) => `<tr><th>L${n + 1}</th>${names.map((nm) => cell(n, nm)).join('')}</tr>`).join('\n')}</table>
<ul>${v.findings.map((f) => `<li><b style="color:${sev[f.severity]}">${f.severity}</b> L${f.level} · ${esc(f.rule)}: ${esc(f.text)}</li>`).join('') || '<li>no findings</li>'}</ul>`; }).join('\n');
  return `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>
<style>body{font:13px system-ui,sans-serif;margin:16px;color:#222}table{border-collapse:collapse;margin:8px 0}td,th{border:1px solid #ccc;padding:3px 5px;text-align:center;font-variant-numeric:tabular-nums}
th span{writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap}th.g-smart{background:#e8f4e0}th.g-exploit{background:#fbe3e0}th.g-lazy{background:#fdf0dc}th.g-skill{background:#e6eefa}th.g-meta{background:#f0e6fa}th.g-route{background:#e0f4f4}th.g-plant{background:#f4f4e0}li{margin:2px 0}</style>
<h1>${esc(title)}</h1>
<p>Column colours: green — smart bot, red — exploits (endless dew, every perk, no maze), orange — lazy/half, blue — one skill off, violet — perks, teal — part of the maze, yellow — without one plant. Hover a cell for details.</p>
${parts}
<h2>Wave lint</h2><ul>${lint.map((x) => `<li><b>${x.severity}</b> L${x.level} wave ${x.wave}: ${esc(x.issue)}</li>`).join('') || '<li>clean</li>'}</ul>`;
}
