/* Complexity Lens – webview UI. No external dependencies; charts are plain SVG. */
(function () {
  'use strict';
  const vscode = acquireVsCodeApi();
  const app = document.getElementById('app');

  const COLORS = { excellent: '#2fb27a', good: '#86b94a', fair: '#d9b13a', slow: '#e8863c', bad: '#e0524d' };
  const CASE_COL = { best: '#2fb27a', average: '#d9b13a', worst: '#e0524d' };
  const CASE_NAME = { best: 'Best case', average: 'Average case', worst: 'Worst case' };
  const REF = [
    { label: 'O(1)', c: { kind: 'poly', n: 0, log: 0 }, color: '#2fb27a' },
    { label: 'O(log n)', c: { kind: 'poly', n: 0, log: 1 }, color: '#5cbf8a' },
    { label: 'O(n)', c: { kind: 'poly', n: 1, log: 0 }, color: '#86b94a' },
    { label: 'O(n log n)', c: { kind: 'poly', n: 1, log: 1 }, color: '#d9b13a' },
    { label: 'O(n²)', c: { kind: 'poly', n: 2, log: 0 }, color: '#e8863c' },
    { label: 'O(n³)', c: { kind: 'poly', n: 3, log: 0 }, color: '#e8683f' },
    { label: 'O(2ⁿ)', c: { kind: 'exp', base: 2, n: 0, log: 0 }, color: '#e0524d' },
    { label: 'O(n!)', c: { kind: 'fact', n: 0, log: 0 }, color: '#c0407f' },
  ];

  const state = { data: null, idx: 0, N: 30, log: true, showSpace: true, showCases: true };

  /* ───────── math helpers ───────── */
  function evalC(c, x) {
    const lg = Math.max(Math.log2(Math.max(x, 1)), 0);
    const v = Math.pow(x, c.n || 0);
    if (c.kind === 'poly') return c.log ? v * Math.pow(lg, c.log) : v;
    if (c.kind === 'exp') return v * Math.pow(c.base, x);
    let f = 1;
    const r = Math.round(x);
    for (let i = 2; i <= r; i++) { f *= i; if (!isFinite(f)) return Infinity; }
    return v * f;
  }
  function rate(c) {
    if (c.kind !== 'poly') return { word: 'Very slow', key: 'bad' };
    if (c.n >= 3) return { word: 'Very slow', key: 'bad' };
    if (c.n >= 2) return { word: 'Slow', key: 'slow' };
    if (c.n > 1 || (c.n === 1 && c.log > 0)) return { word: 'Fair', key: 'fair' };
    if (c.n === 1) return { word: 'Good', key: 'good' };
    return { word: 'Excellent', key: 'excellent' };
  }
  const human = (v) => {
    if (!isFinite(v) || v > 1e300) return '∞';
    if (v < 1000) return v < 10 ? (Math.round(v * 100) / 100).toString() : Math.round(v).toString();
    for (const [d, s] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']]) if (v >= d) return (v / d).toFixed(v / d < 10 ? 1 : 0) + s;
    return String(v);
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const md = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
  const sameClass = (a, b) => a.kind === b.kind && (a.n || 0) === (b.n || 0) && (a.log || 0) === (b.log || 0) && (a.base || 0) === (b.base || 0);
  const caseKeys = ['best', 'average', 'worst'];
  const casesDiffer = (f) => !(sameClass(f.cases.best, f.cases.worst) && sameClass(f.cases.average, f.cases.worst));

  /* ───────── rendering ───────── */
  function render() {
    const d = state.data;
    if (!d || !d.functions.length) {
      app.innerHTML = '<p class="empty">No functions found in this file. Try <b>Analyze Selection</b> on a loop or a snippet.</p>';
      return;
    }
    const f = d.functions[state.idx] || d.functions[0];
    const tr = rate(f.time);
    const sr = rate(f.space);
    const differ = casesDiffer(f);
    app.innerHTML = `
      <div class="top"><h1>${esc(d.title)}</h1>
        <span class="lang">${esc(d.language)} <button class="btn" id="copybtn" title="Copy a Markdown table of all results">Copy as Markdown</button></span></div>
      <div class="chips" role="tablist" aria-label="Functions">${d.functions.map((x, i) =>
        `<button class="chip" role="tab" data-i="${i}" aria-pressed="${i === state.idx}">${esc(x.name)}</button>`).join('')}</div>

      <div class="figures">
        <div class="fig"><div class="k">Time</div><div class="v" style="color:${COLORS[tr.key]}">${esc(f.timeStr)}</div>
          <div class="r"><span class="dot" style="background:${COLORS[tr.key]}"></span>${tr.word}</div>
          ${f.recurrence ? `<div class="rec mono">${esc(f.recurrence)}</div>` : ''}</div>
        <div class="fig"><div class="k">Space (extra memory)</div><div class="v" style="color:${COLORS[sr.key]}">${esc(f.spaceStr)}</div>
          <div class="r"><span class="dot" style="background:${COLORS[sr.key]}"></span>${sr.word}</div></div>
      </div>

      <section>
        <h2>Best, average and worst case</h2>
        <p class="sub">${differ ? 'The running time depends on the input, so here are all three scenarios.' : 'This code does the same amount of work on every input, so all three cases match.'}</p>
        <div class="cases">${caseKeys.map((k) => {
          const c = f.cases[k]; const r = rate(c);
          return `<div class="cs"><div class="k"><span class="dot" style="background:${CASE_COL[k]}"></span>${CASE_NAME[k]}</div>
            <div class="v" style="color:${COLORS[r.key]}">${esc(c.big)}</div><div class="why">${md(c.why)}</div></div>`;
        }).join('')}</div>
      </section>

      <section>
        <h2>How it grows</h2>
        <p class="sub">The bold curve is this function. Fainter curves are the common classes, for scale.</p>
        <div class="controls">
          <label>Input size n <input id="nrange" type="range" min="5" max="100" step="1" value="${state.N}"><span class="nval mono" id="nval">${state.N}</span></label>
          <span class="seg" role="group" aria-label="Y axis scale">
            <button data-scale="log" aria-pressed="${state.log}">Log</button><button data-scale="lin" aria-pressed="${!state.log}">Linear</button></span>
          <label class="check"><input id="spacechk" type="checkbox" ${state.showSpace ? 'checked' : ''}> Space curve</label>
          ${differ ? `<label class="check"><input id="caseschk" type="checkbox" ${state.showCases ? 'checked' : ''}> Best / average / worst curves</label>` : ''}
        </div>
        <div class="chartwrap" id="chartwrap"></div>
        <div class="legend" id="legend"></div>
      </section>

      <section>
        <h2>Operations at n = <span id="nn">${state.N}</span></h2>
        <p class="sub">Rough step counts, one bar per class (log-scaled bars).</p>
        <div class="bars" id="bars"></div>
      </section>

      <section>
        <h2>Why this estimate</h2>
        <ul class="why">${f.reasons.map((r) => `<li><span class="tag ${r.kind}">${({ time: 'Time', space: 'Space', tip: 'Tip', info: 'Note' })[r.kind] || 'Note'}</span>
          <span>${md(r.text)}<button class="lnk" data-line="${r.line}">line ${r.line}</button></span></li>`).join('') || '<li><span></span><span>Nothing notable.</span></li>'}</ul>
      </section>

      ${d.functions.length > 1 ? `<section><h2>All functions</h2>${renderTable(d)}</section>` : ''}

      <p class="foot">Static estimate from the code's shape (n = input size). Library and data-structure costs are assumed from their usual implementations.
        A study aid, not a proof.</p>`;
    drawChart();
    drawBars();
  }

  function renderTable(d) {
    const cell = (c) => `<td class="mono"><span class="dot" style="background:${COLORS[rate(c).key]}"></span> ${esc(c.big)}</td>`;
    return `<table class="cmp"><thead><tr><th>Function</th><th>Best</th><th>Average</th><th>Worst</th><th>Space</th></tr></thead><tbody>${d.functions.map((x, i) =>
      `<tr class="${i === state.idx ? 'pick' : ''}"><td><button data-i="${i}" class="mono">${esc(x.name)}</button></td>${cell(x.cases.best)}${cell(x.cases.average)}${cell(x.cases.worst)}${cell(x.space)}</tr>`).join('')}</tbody></table>`;
  }

  function markdown() {
    const d = state.data;
    const rows = d.functions.map((x) => `| \`${x.name}\` | ${x.cases.best.big} | ${x.cases.average.big} | ${x.cases.worst.big} | ${x.space.big} |`);
    return `### Complexity – ${d.title}\n\n| Function | Best | Average | Worst | Space |\n|---|---|---|---|---|\n${rows.join('\n')}\n\n_Estimated with Complexity Lens._\n`;
  }

  /* ───────── growth chart ───────── */
  const W = 760, H = 360, M = { l: 54, r: 70, t: 14, b: 34 };
  let chartGeom = null;

  const activeCases = (f) => (state.showCases && casesDiffer(f)
    ? caseKeys.filter((k) => !sameClass(f.cases[k], f.time)).filter((k, i, a) => a.findIndex((j) => sameClass(f.cases[j], f.cases[k])) === i)
    : []);

  function drawChart() {
    const f = state.data.functions[state.idx];
    const N = state.N;
    const pw = W - M.l - M.r, ph = H - M.t - M.b;
    const selT = f.time, selS = f.space;
    const extra = activeCases(f);
    const tcol = COLORS[rate(selT).key];
    const xs = [];
    for (let i = 0; i <= 140; i++) xs.push(1 + ((N - 1) * i) / 140);
    const peak = (fn) => Math.max(fn(selT), fn(selS), ...extra.map((k) => fn(f.cases[k])));

    let yMax;
    let yFn;
    if (state.log) {
      const top = Math.max(Math.log10(Math.max(peak((c) => evalC(c, N)), 1)), Math.log10(N * N), 1);
      yMax = Math.max(Math.min(Math.ceil(Math.min(top, 300)) + (top > 3 ? 0 : 1), 40), 2);
      yFn = (v) => Math.log10(Math.max(v, 1)) / yMax;
    } else {
      yMax = niceCeil(Math.min(Math.max(peak((c) => evalC(c, N)), N * 3) * 1.1, 1e15));
      yFn = (v) => v / yMax;
    }
    const X = (x) => M.l + ((x - 1) / (N - 1)) * pw;
    const Y = (v) => M.t + ph - Math.max(0, Math.min(1.05, yFn(v))) * ph;
    const path = (c) => xs.map((x, i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(evalC(c, x)).toFixed(1)}`).join('');

    let ticks = '';
    if (state.log) {
      const step = yMax > 12 ? Math.ceil(yMax / 8) : 1;
      for (let e = 0; e <= yMax; e += step) {
        const y = Y(Math.pow(10, e));
        ticks += `<line class="grid" x1="${M.l}" x2="${M.l + pw}" y1="${y}" y2="${y}"/><text x="${M.l - 8}" y="${y + 4}" text-anchor="end">${e === 0 ? '1' : e <= 3 ? human(Math.pow(10, e)) : '10^' + e}</text>`;
      }
    } else {
      for (let i = 0; i <= 5; i++) {
        const v = (yMax * i) / 5; const y = Y(v);
        ticks += `<line class="grid" x1="${M.l}" x2="${M.l + pw}" y1="${y}" y2="${y}"/><text x="${M.l - 8}" y="${y + 4}" text-anchor="end">${human(v)}</text>`;
      }
    }
    let xt = '';
    for (let i = 0; i <= 5; i++) { const x = 1 + ((N - 1) * i) / 5; xt += `<text x="${X(x)}" y="${H - 12}" text-anchor="middle">${Math.round(x)}</text>`; }

    let refs = '';
    for (const r of REF) {
      const hide = sameClass(r.c, selT) || extra.some((k) => sameClass(r.c, f.cases[k]));
      if (hide) continue;
      refs += `<path class="ref" d="${path(r.c)}" stroke="${r.color}" clip-path="url(#clip)"/>`;
      let lx = xs[xs.length - 1], ly = Y(evalC(r.c, lx));
      for (const x of xs) { if (yFn(evalC(r.c, x)) > 1) { lx = x; ly = M.t; break; } }
      refs += `<text class="reftxt" x="${Math.min(X(lx) + 5, W - 2)}" y="${Math.max(ly + 4, M.t + 8)}" style="fill:${r.color}">${r.label.replace('O(', '').replace(')', '')}</text>`;
    }
    const casePaths = extra.map((k) => `<path class="cline" d="${path(f.cases[k])}" stroke="${CASE_COL[k]}" clip-path="url(#clip)"/>`).join('');

    document.getElementById('chartwrap').innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Growth of ${esc(f.timeStr)} compared with common complexity classes">
      <defs><clipPath id="clip"><rect x="${M.l}" y="${M.t - 2}" width="${pw}" height="${ph + 2}"/></clipPath></defs>
      ${ticks}<line class="axis" x1="${M.l}" x2="${M.l + pw}" y1="${M.t + ph}" y2="${M.t + ph}"/><line class="axis" x1="${M.l}" x2="${M.l}" y1="${M.t}" y2="${M.t + ph}"/>
      ${xt}<text x="${M.l + pw / 2}" y="${H}" text-anchor="middle" style="font-size:11px">input size n</text>
      <text transform="translate(12 ${M.t + ph / 2}) rotate(-90)" text-anchor="middle">${state.log ? 'steps (log scale)' : 'steps'}</text>
      ${refs}${casePaths}
      ${state.showSpace ? `<path class="spc" d="${path(selS)}" clip-path="url(#clip)"/>` : ''}
      <path class="main" d="${path(selT)}" stroke="${tcol}" clip-path="url(#clip)"/>
      <line class="cross" id="cross" x1="0" x2="0" y1="${M.t}" y2="${M.t + ph}" style="display:none"/>
      <circle id="dotT" r="4.5" fill="${tcol}" style="display:none"/>${state.showSpace ? '<circle id="dotS" r="4" fill="var(--space)" style="display:none"/>' : ''}
      <rect id="hit" x="${M.l}" y="${M.t}" width="${pw}" height="${ph}" fill="transparent"/>
    </svg><div class="tip" id="tip" style="display:none"></div>`;
    document.getElementById('legend').innerHTML =
      `<span><i style="border-color:${tcol}"></i>Time ${esc(f.timeStr)}</span>` +
      extra.map((k) => `<span><i class="dot3" style="border-color:${CASE_COL[k]}"></i>${CASE_NAME[k]} ${esc(f.cases[k].big)}</span>`).join('') +
      (state.showSpace ? `<span><i class="dash" style="border-color:var(--space)"></i>Space ${esc(f.spaceStr)}</span>` : '');
    chartGeom = { X, Y, N, f, extra };
    wireHover();
  }

  function niceCeil(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }

  function wireHover() {
    const hit = document.getElementById('hit');
    const svg = hit.ownerSVGElement;
    const tip = document.getElementById('tip');
    const cross = document.getElementById('cross');
    const dotT = document.getElementById('dotT');
    const dotS = document.getElementById('dotS');
    const { X, Y, N, f, extra } = chartGeom;
    const hide = () => { tip.style.display = 'none'; cross.style.display = 'none'; dotT.style.display = 'none'; if (dotS) dotS.style.display = 'none'; };
    hit.addEventListener('mouseleave', hide);
    hit.addEventListener('mousemove', (e) => {
      const r = svg.getBoundingClientRect();
      const sx = ((e.clientX - r.left) / r.width) * W;
      const nn = Math.round(Math.max(1, Math.min(N, 1 + ((sx - M.l) / (W - M.l - M.r)) * (N - 1))));
      const vT = evalC(f.time, nn), vS = evalC(f.space, nn);
      cross.setAttribute('x1', X(nn)); cross.setAttribute('x2', X(nn)); cross.style.display = '';
      dotT.setAttribute('cx', X(nn)); dotT.setAttribute('cy', Y(vT)); dotT.style.display = '';
      if (dotS) { dotS.setAttribute('cx', X(nn)); dotS.setAttribute('cy', Y(vS)); dotS.style.display = ''; }
      tip.innerHTML = `<b>n = ${nn}</b><div class="row"><span>Time ${esc(f.timeStr)}</span><span>${human(vT)}</span></div>` +
        extra.map((k) => `<div class="row"><span>${CASE_NAME[k]} ${esc(f.cases[k].big)}</span><span>${human(evalC(f.cases[k], nn))}</span></div>`).join('') +
        (state.showSpace ? `<div class="row"><span>Space ${esc(f.spaceStr)}</span><span>${human(vS)}</span></div>` : '') +
        `<div class="row" style="opacity:.7"><span>O(n²) for scale</span><span>${human(nn * nn)}</span></div>`;
      tip.style.display = '';
      const wrap = document.getElementById('chartwrap').getBoundingClientRect();
      let left = e.clientX - wrap.left + 14;
      if (left + 220 > wrap.width) left = e.clientX - wrap.left - 220;
      tip.style.left = left + 'px';
      tip.style.top = Math.max(0, e.clientY - wrap.top - 20) + 'px';
    });
  }

  /* ───────── operations bars ───────── */
  function drawBars() {
    const f = state.data.functions[state.idx];
    const N = state.N;
    document.getElementById('nn').textContent = N;
    const rows = REF.map((r) => ({ label: r.label, v: evalC(r.c, N), color: r.color, me: sameClass(r.c, f.time) }));
    if (!rows.some((r) => r.me)) rows.push({ label: f.timeStr, v: evalC(f.time, N), color: COLORS[rate(f.time).key], me: true });
    rows.sort((a, b) => a.v - b.v);
    const top = Math.max(...rows.map((r) => (isFinite(r.v) ? r.v : 1e300)), 10);
    const scale = (v) => (isFinite(v) ? Math.max(0.01, Math.log10(Math.max(v, 1) + 1) / Math.log10(top + 1)) : 1);
    document.getElementById('bars').innerHTML = rows.map((r) =>
      `<span class="lab ${r.me ? 'me' : ''}">${esc(r.label)}</span><div class="track"><div class="fill" style="width:${(scale(r.v) * 100).toFixed(1)}%;background:${r.color};opacity:${r.me ? 1 : 0.5}"></div></div>
       <span class="num ${r.me ? 'me' : ''}">${human(r.v)}${r.me ? '  ◀ this' : ''}</span>`).join('');
  }

  /* ───────── events ───────── */
  app.addEventListener('click', (e) => {
    const t = e.target.closest('[data-i],[data-line],[data-scale],#copybtn');
    if (!t) return;
    if (t.id === 'copybtn') { vscode.postMessage({ type: 'copy', text: markdown() }); return; }
    if (t.dataset.i !== undefined) { state.idx = +t.dataset.i; render(); }
    else if (t.dataset.line) vscode.postMessage({ type: 'reveal', line: +t.dataset.line });
    else if (t.dataset.scale) {
      state.log = t.dataset.scale === 'log';
      app.querySelectorAll('[data-scale]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.scale === 'log') === state.log)));
      drawChart();
    }
  });
  app.addEventListener('input', (e) => {
    if (e.target.id === 'nrange') { state.N = +e.target.value; document.getElementById('nval').textContent = state.N; drawChart(); drawBars(); }
  });
  app.addEventListener('change', (e) => {
    if (e.target.id === 'spacechk') { state.showSpace = e.target.checked; drawChart(); }
    if (e.target.id === 'caseschk') { state.showCases = e.target.checked; drawChart(); }
  });

  window.addEventListener('message', (ev) => {
    const m = ev.data;
    if (m.type !== 'update') return;
    const prevName = state.data && state.data.functions[state.idx] ? state.data.functions[state.idx].name : null;
    state.data = m.payload;
    const want = m.payload.focus || prevName;
    const i = want ? m.payload.functions.findIndex((x) => x.name === want) : -1;
    state.idx = i >= 0 ? i : 0;
    render();
  });

  vscode.postMessage({ type: 'ready' });
})();
