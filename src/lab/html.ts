export const LAB_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LazyBrain Lab</title>
  <style>
    /* ─── Design System (shared with main UI) ──────────────────── */
    :root {
      --bg: #fafaf8;
      --surface: #ffffff;
      --surface-hover: #f7f7f4;
      --text: #1c1c1a;
      --text-2: #6b6b64;
      --text-3: #9b9b94;
      --border: #e8e8e2;
      --border-light: #f0f0ea;
      --brand: #2563eb;
      --brand-light: #eff6ff;
      --brand-soft: #dbeafe;
      --ok: #16a34a;
      --ok-bg: #f0fdf4;
      --ok-border: #bbf7d0;
      --warn: #d97706;
      --warn-bg: #fffbeb;
      --warn-border: #fde68a;
      --err: #dc2626;
      --err-bg: #fef2f2;
      --err-border: #fecaca;
      --shadow: 0 1px 3px rgba(0,0,0,0.06);
      --shadow-lg: 0 8px 32px rgba(0,0,0,0.08);
      --radius: 10px;
      --radius-sm: 6px;
      --font: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --font-mono: ui-monospace, "SF Mono", "Cascadia Code", monospace;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #1a1a18;
        --surface: #242422;
        --surface-hover: #2e2e2c;
        --text: #efefeb;
        --text-2: #a0a09a;
        --text-3: #6b6b64;
        --border: #333330;
        --border-light: #2a2a28;
        --brand: #3b82f6;
        --brand-light: #1e293b;
        --brand-soft: #1e3a5f;
        --ok: #22c55e;
        --ok-bg: #052e16;
        --ok-border: #166534;
        --warn: #f59e0b;
        --warn-bg: #451a03;
        --warn-border: #78350f;
        --err: #ef4444;
        --err-bg: #450a0a;
        --err-border: #7f1d1d;
        --shadow: 0 1px 3px rgba(0,0,0,0.3);
        --shadow-lg: 0 8px 32px rgba(0,0,0,0.5);
      }
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; }
    body {
      background: var(--bg); color: var(--text);
      font: 15px/1.5 var(--font); -webkit-font-smoothing: antialiased;
    }

    /* ─── Layout ───────────────────────────────────────────────── */
    .topbar {
      display: flex; align-items: center; justify-content: space-between; gap: 16px;
      padding: 14px 24px; background: var(--surface); border-bottom: 1px solid var(--border);
      position: sticky; top: 0; z-index: 10;
    }
    .logo { display: flex; align-items: center; gap: 10px; }
    .logo-icon {
      width: 32px; height: 32px; border-radius: 8px;
      background: var(--text); color: var(--bg);
      display: grid; place-items: center; font-weight: 800; font-size: 13px;
    }
    .logo h1 { font-size: 17px; font-weight: 700; }

    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 16px; border-radius: var(--radius-sm);
      font: inherit; font-weight: 500; font-size: 14px;
      cursor: pointer; border: 1px solid var(--border);
      background: var(--surface); color: var(--text);
      transition: all 120ms;
    }
    .btn:hover { background: var(--surface-hover); }
    .btn-primary { background: var(--text); color: var(--bg); border-color: var(--text); }
    .btn-primary:hover { opacity: 0.85; }
    .btn:disabled { opacity: 0.45; cursor: not-allowed; }

    main {
      max-width: 960px; margin: 0 auto; padding: 28px 24px 64px;
      display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 18px;
      align-items: start;
    }

    /* ─── Sidebar ──────────────────────────────────────────────── */
    .sidebar {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); box-shadow: var(--shadow);
      padding: 16px; position: sticky; top: 81px;
    }
    .sidebar textarea {
      width: 100%; min-height: 90px; resize: vertical;
      border: 1px solid var(--border); border-radius: var(--radius-sm);
      padding: 10px; font: inherit; font-size: 14px;
      background: var(--bg); color: var(--text);
    }
    .sidebar textarea:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-light); }
    .sidebar .actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
    .mini-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 14px; }
    .mini-stat {
      border: 1px solid var(--border); border-radius: var(--radius-sm);
      padding: 10px; text-align: center; background: var(--bg);
    }
    .mini-stat .num { font-size: 20px; font-weight: 800; }
    .mini-stat .lbl { font-size: 11px; color: var(--text-3); margin-top: 2px; }
    .fixture-list { display: grid; gap: 6px; margin-top: 14px; }
    .fixture-item {
      border: 1px solid var(--border); border-radius: var(--radius-sm);
      padding: 10px; cursor: pointer; transition: all 120ms; background: var(--bg);
    }
    .fixture-item:hover { border-color: var(--brand); background: var(--brand-light); }
    .fixture-item strong { display: block; font-size: 13px; }
    .fixture-item span { font-size: 12px; color: var(--text-3); }

    /* ─── Results Area ─────────────────────────────────────────── */
    .results-area {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); box-shadow: var(--shadow);
      min-height: 400px;
    }
    .results-bar {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 14px 18px; border-bottom: 1px solid var(--border-light);
    }
    .results-bar strong { font-size: 15px; }
    .results-body { padding: 16px; }
    .results-body .empty { text-align: center; color: var(--text-3); padding: 64px 0; }
    .result-card {
      border: 1px solid var(--border); border-radius: var(--radius-sm);
      margin-bottom: 12px; overflow: hidden;
    }
    .result-card:last-child { margin-bottom: 0; }
    .result-card .rhead {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
      padding: 14px; border-bottom: 1px solid var(--border-light);
      background: var(--bg);
    }
    .rhead .query-text { font-weight: 600; }
    .badge {
      display: inline-flex; align-items: center; padding: 2px 10px;
      border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap;
      border: 1px solid var(--border);
    }
    .badge.team { color: var(--brand); border-color: var(--brand-soft); background: var(--brand-light); }
    .badge.subagent { color: var(--warn); border-color: var(--warn-border); background: var(--warn-bg); }
    .badge.needs_clarification { color: var(--text-2); }
    .rgrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; padding: 14px; }
    .rcol h4 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-3); margin-bottom: 8px; }
    .ritem { border-top: 1px solid var(--border-light); padding: 8px 0; }
    .ritem:first-child { border-top: 0; padding-top: 0; }
    .ritem strong { display: block; font-size: 13px; }
    .ritem .sub { font-size: 12px; color: var(--text-2); margin-top: 2px; }
    .rfoot {
      display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px;
      padding: 12px 14px; border-top: 1px solid var(--border-light);
      background: var(--bg); font-size: 12px;
    }
    .rfoot b { display: block; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.04em; font-size: 11px; }
    .rfoot span { display: block; margin-top: 3px; }
    .text-ok { color: var(--ok); }
    .text-warn { color: var(--warn); }
    .text-err { color: var(--err); }
    .text-2 { color: var(--text-2); }

    @media (max-width: 780px) {
      main { grid-template-columns: 1fr; padding: 16px 12px 48px; }
      .sidebar { position: static; }
      .rgrid, .rfoot { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="logo">
      <div class="logo-icon">LB</div>
      <h1>LazyBrain <span style="font-weight:400;color:var(--text-3);font-size:13px">Lab</span></h1>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn" onclick="location.href='/'">Back to Home</button>
      <button class="btn" id="refreshAgents">Refresh agents</button>
      <button class="btn btn-primary" id="runFixtures">Run all fixtures</button>
    </div>
  </div>

  <main>
    <aside class="sidebar">
      <textarea id="queryInput" placeholder="Describe a task, e.g. this codebase is messy, how should I organize it?"></textarea>
      <div class="actions">
        <button class="btn btn-primary" id="runOne">Evaluate</button>
        <button class="btn" id="clearResults">Clear</button>
      </div>
      <div class="mini-stats">
        <div class="mini-stat"><div class="num" id="fixtureCount">0</div><div class="lbl">Fixtures</div></div>
        <div class="mini-stat"><div class="num" id="agentCount">0</div><div class="lbl">Agents</div></div>
        <div class="mini-stat"><div class="num" id="availableCount">0</div><div class="lbl">Available</div></div>
        <div class="mini-stat"><div class="num" id="hookState">-</div><div class="lbl">Hook</div></div>
      </div>
      <div class="fixture-list" id="fixtures"></div>
    </aside>

    <section class="results-area">
      <div class="results-bar">
        <strong>Evaluations</strong>
        <span id="status" style="font-size:13px;color:var(--text-3)">idle</span>
      </div>
      <div class="results-body" id="results">
        <div class="empty">Pick a fixture from the left, or type your own query and click Evaluate.</div>
      </div>
    </section>
  </main>

  <script>
    const state = { fixtures: [], agents: [] };
    const $ = id => document.getElementById(id);
    const el = (tag, attrs = {}, children = []) => {
      const node = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else node.setAttribute(k, v);
      }
      for (const c of children) node.append(c);
      return node;
    };
    async function api(url, opts) {
      const res = await fetch(url, opts);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }

    function renderFixtures() {
      $('fixtureCount').textContent = String(state.fixtures.length);
      const box = $('fixtures');
      box.replaceChildren(...state.fixtures.map(f => {
        const item = el('div', { class: 'fixture-item' }, [
          el('strong', { text: f.title }),
          el('span', { text: f.query }),
        ]);
        item.onclick = () => { $('queryInput').value = f.query; evaluate({ cases: [f] }); };
        return item;
      }));
    }
    function renderAgents() {
      $('agentCount').textContent = String(state.agents.length);
      $('availableCount').textContent = String(state.agents.filter(a => a.available).length);
    }
    function statusClass(s) {
      return s === 'exact' ? 'text-ok' : s === 'role' ? 'text-warn' : 'text-err';
    }

    function renderCard(ev) {
      const adapters = (ev.team?.runtimeGuides ?? []).map(g => g.label).join(' / ') || 'Generic';
      const token = ev.tokenStrategy?.summary || 'Sequential single-model';
      const hook = ev.hookReadiness?.projectLazyBrainInstalled || ev.hookReadiness?.globalLazyBrainInstalled ? 'installed' : 'clear';
      const matches = (ev.match?.matches || []).map(m =>
        el('div', { class: 'ritem' }, [
          el('strong', { text: m.capability.name + ' · ' + Math.round(m.score * 100) + '%' }),
          el('div', { class: 'sub', text: (m.layer || '') + ' / ' + (m.confidence || '') + ' / ' + (m.capability.category || '') }),
        ])
      );
      const members = (ev.team?.members || []).map(m =>
        el('div', { class: 'ritem' }, [
          el('strong', { text: m.name + ' · ' + (m.suggestedModel || 'sonnet') }),
          el('div', { class: 'sub', text: (m.role || m.category || '') + ' / ' + (m.reason || '') }),
        ])
      );
      const maps = (ev.agentMappings || []).map(m =>
        el('div', { class: 'ritem' }, [
          el('strong', { class: statusClass(m.status), text: (m.recommended || '') + ' → ' + (m.mapped || 'generic') }),
          el('div', { class: 'sub', text: m.status + ' / ' + (m.reason || '') }),
        ])
      );
      const warnings = (ev.warnings || []).length
        ? el('div', { style: 'border-top:1px solid var(--err-border);padding:10px 14px;background:var(--err-bg);color:var(--err);font-size:12px', text: ev.warnings.join(' · ') })
        : null;
      return el('div', { class: 'result-card' }, [
        el('div', { class: 'rhead' }, [
          el('div', {}, [
            el('div', { class: 'query-text', text: ev.query }),
            el('div', { class: 'text-2', text: ev.modeDecision?.reason || '', style: 'font-size:12px;margin-top:4px' }),
          ]),
          el('span', { class: 'badge ' + (ev.modeDecision?.mode || ''), text: ev.modeDecision?.mode || 'regular' }),
        ]),
        el('div', { class: 'rgrid' }, [
          el('div', { class: 'rcol' }, [el('h4', { text: 'Match' }), ...matches]),
          el('div', { class: 'rcol' }, [el('h4', { text: 'Team' }), ...members]),
          el('div', { class: 'rcol' }, [el('h4', { text: 'Agent mapping' }), ...maps]),
        ]),
        el('div', { class: 'rfoot' }, [
          el('div', {}, [el('b', { text: 'Token' }), el('span', { text: token })]),
          el('div', {}, [el('b', { text: 'Adapters' }), el('span', { text: adapters })]),
          el('div', {}, [el('b', { text: 'Main model' }), el('span', { text: ev.team?.mainModel?.model || 'current model' })]),
          el('div', {}, [el('b', { text: 'Hook' }), el('span', { text: hook + ' / ' + (ev.hookReadiness?.statuslineMode || 'none') })]),
        ]),
        warnings,
      ].filter(Boolean));
    }

    function renderResults(evaluations) {
      const box = $('results');
      box.replaceChildren(...evaluations.map(renderCard));
      const first = evaluations[0];
      if (first) $('hookState').textContent = first.hookReadiness?.projectLazyBrainInstalled || first.hookReadiness?.globalLazyBrainInstalled ? 'installed' : 'clear';
    }

    async function evaluate(payload) {
      $('status').textContent = 'running...';
      try {
        const result = await api('/lab/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        renderResults(result.evaluations);
        $('status').textContent = 'done';
      } catch (err) {
        $('status').textContent = 'Error: ' + (err.message || String(err));
      }
    }

    async function boot() {
      state.fixtures = await api('/lab/fixtures');
      state.agents = await api('/lab/agents');
      renderFixtures();
      renderAgents();
    }

    $('runFixtures').onclick = () => evaluate({ cases: state.fixtures });
    $('runOne').onclick = () => {
      const q = $('queryInput').value.trim();
      if (q) evaluate({ queries: [q] });
    };
    $('queryInput').onkeydown = e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) $('runOne').click(); };
    $('clearResults').onclick = () => $('results').innerHTML = '<div class="empty">Pick a fixture or type a query.</div>';
    $('refreshAgents').onclick = async () => { state.agents = await api('/lab/agents'); renderAgents(); };
    boot().catch(err => { $('status').textContent = err.message || String(err); });
  </script>
</body>
</html>`;
