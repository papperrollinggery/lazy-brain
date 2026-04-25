export const LAB_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LazyBrain Lab</title>
  <style>
    :root {
      --bg: #f6f3ed;
      --ink: #171511;
      --muted: #676158;
      --line: #d7d0c4;
      --panel: #fffdf8;
      --accent: #1f7a5b;
      --accent-2: #ad5a27;
      --warn: #b7791f;
      --bad: #a33a32;
      --good: #26704d;
      --shadow: 0 14px 40px rgba(36, 31, 24, 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 24px;
      align-items: end;
      padding: 28px 32px 20px;
      border-bottom: 1px solid var(--line);
      background:
        linear-gradient(135deg, rgba(31, 122, 91, 0.08), transparent 34%),
        linear-gradient(315deg, rgba(173, 90, 39, 0.08), transparent 30%),
        var(--panel);
    }
    h1 {
      margin: 0;
      font-size: 28px;
      line-height: 1.05;
      letter-spacing: 0;
    }
    .sub {
      color: var(--muted);
      margin-top: 8px;
      max-width: 820px;
    }
    .actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    button {
      border: 1px solid var(--ink);
      background: var(--ink);
      color: white;
      min-height: 34px;
      padding: 0 14px;
      border-radius: 6px;
      cursor: pointer;
      font: inherit;
    }
    button.secondary {
      background: transparent;
      color: var(--ink);
      border-color: var(--line);
    }
    main {
      display: grid;
      grid-template-columns: 320px minmax(0, 1fr);
      gap: 18px;
      padding: 18px;
    }
    aside, section {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
    }
    aside {
      padding: 14px;
      align-self: start;
      position: sticky;
      top: 12px;
    }
    textarea {
      width: 100%;
      min-height: 108px;
      resize: vertical;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: white;
      color: var(--ink);
      padding: 10px;
      font: inherit;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin: 12px 0;
    }
    .stat {
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 8px;
      background: #fbf7ef;
    }
    .stat strong {
      display: block;
      font-size: 18px;
    }
    .fixtures {
      display: grid;
      gap: 8px;
      margin-top: 12px;
    }
    .fixture {
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 8px;
      background: white;
      cursor: pointer;
    }
    .fixture:hover { border-color: var(--accent); }
    .fixture b { display: block; }
    .fixture span { color: var(--muted); font-size: 12px; }
    section {
      min-height: 640px;
      padding: 0;
      overflow: hidden;
    }
    .bar {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      padding: 12px 14px;
      border-bottom: 1px solid var(--line);
      background: #fbf7ef;
    }
    .results {
      display: grid;
      gap: 12px;
      padding: 14px;
    }
    .result {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: white;
      overflow: hidden;
    }
    .result-head {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      padding: 12px;
      border-bottom: 1px solid var(--line);
    }
    .query {
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 0 8px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: #fbf7ef;
      font-size: 12px;
      white-space: nowrap;
    }
    .badge.team { color: var(--accent); border-color: rgba(31, 122, 91, 0.35); }
    .badge.subagent { color: var(--accent-2); border-color: rgba(173, 90, 39, 0.35); }
    .badge.needs_clarification { color: var(--warn); border-color: rgba(183, 121, 31, 0.4); }
    .grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      padding: 12px;
    }
    .col h3 {
      margin: 0 0 8px;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: .04em;
      color: var(--muted);
    }
    .item {
      border-top: 1px solid var(--line);
      padding: 8px 0;
    }
    .item:first-of-type { border-top: 0; padding-top: 0; }
    .item b { display: block; overflow-wrap: anywhere; }
    .item p { margin: 3px 0 0; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
    .status-exact { color: var(--good); }
    .status-role { color: var(--accent-2); }
    .status-missing { color: var(--bad); }
    .warns {
      border-top: 1px solid var(--line);
      padding: 10px 12px;
      color: var(--bad);
      background: #fff8f3;
      font-size: 12px;
    }
    .runtime {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      border-top: 1px solid var(--line);
      padding: 12px;
      background: #fbf7ef;
    }
    .runtime div {
      min-width: 0;
    }
    .runtime b {
      display: block;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: .04em;
      color: var(--muted);
    }
    .runtime span {
      display: block;
      margin-top: 3px;
      overflow-wrap: anywhere;
    }
    .empty {
      padding: 48px;
      color: var(--muted);
      text-align: center;
    }
    code {
      background: #f0ebe2;
      border: 1px solid var(--line);
      border-radius: 4px;
      padding: 1px 4px;
    }
    @media (max-width: 980px) {
      header, main, .result-head, .grid, .runtime {
        grid-template-columns: 1fr;
      }
      aside { position: static; }
      .actions { justify-content: flex-start; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>LazyBrain Lab</h1>
      <div class="sub">非安装式评估：推荐质量、Agent Agency 映射、team gate、token 策略和 hook 安全状态。</div>
    </div>
    <div class="actions">
      <button id="runFixtures">Run fixtures</button>
      <button class="secondary" id="refreshAgents">Refresh agents</button>
    </div>
  </header>
  <main>
    <aside>
      <textarea id="queryInput" placeholder="输入一条任务，例如：这个项目有点乱，你看怎么安排"></textarea>
      <div class="actions" style="justify-content:flex-start;margin-top:10px">
        <button id="runOne">Evaluate</button>
        <button class="secondary" id="clearResults">Clear</button>
      </div>
      <div class="stats">
        <div class="stat"><span>Fixtures</span><strong id="fixtureCount">0</strong></div>
        <div class="stat"><span>Agents</span><strong id="agentCount">0</strong></div>
        <div class="stat"><span>Available</span><strong id="availableCount">0</strong></div>
        <div class="stat"><span>Hook</span><strong id="hookState">-</strong></div>
      </div>
      <div class="fixtures" id="fixtures"></div>
    </aside>
    <section>
      <div class="bar">
        <strong>Evaluations</strong>
        <span id="status">idle</span>
      </div>
      <div class="results" id="results"><div class="empty">Run fixtures or evaluate a query.</div></div>
    </section>
  </main>
  <script>
    const state = { fixtures: [], agents: [] };
    const $ = (id) => document.getElementById(id);
    const el = (tag, attrs = {}, children = []) => {
      const node = document.createElement(tag);
      for (const [key, value] of Object.entries(attrs)) {
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else node.setAttribute(key, value);
      }
      for (const child of children) node.append(child);
      return node;
    };
    async function json(url, opts) {
      const res = await fetch(url, opts);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
    function renderFixtures() {
      $('fixtureCount').textContent = String(state.fixtures.length);
      const box = $('fixtures');
      box.replaceChildren(...state.fixtures.map(f => {
        const node = el('div', { class: 'fixture' }, [
          el('b', { text: f.title }),
          el('span', { text: f.query }),
        ]);
        node.onclick = () => { $('queryInput').value = f.query; evaluate({ cases: [f] }); };
        return node;
      }));
    }
    function renderAgents() {
      $('agentCount').textContent = String(state.agents.length);
      $('availableCount').textContent = String(state.agents.filter(a => a.available).length);
    }
    function mappingClass(status) {
      return status === 'exact' ? 'status-exact' : status === 'role' ? 'status-role' : 'status-missing';
    }
    function renderEvaluation(ev) {
      const adapters = (ev.team?.runtimeGuides ?? []).map(g => g.label).join(' / ') || 'Generic';
      const token = ev.tokenStrategy?.summary || '单模型顺序执行';
      const hook = ev.hookReadiness.projectLazyBrainInstalled || ev.hookReadiness.globalLazyBrainInstalled
        ? 'installed'
        : 'clear';
      const matches = ev.match.matches.map(m => el('div', { class: 'item' }, [
        el('b', { text: m.capability.name + ' · ' + Math.round(m.score * 100) + '%' }),
        el('p', { text: m.layer + ' / ' + m.confidence + ' / ' + m.capability.category }),
      ]));
      const members = (ev.team?.members ?? []).map(m => el('div', { class: 'item' }, [
        el('b', { text: m.name + ' · ' + (m.suggestedModel || 'sonnet') }),
        el('p', { text: (m.role || m.category) + ' / ' + m.reason }),
      ]));
      const maps = ev.agentMappings.map(m => el('div', { class: 'item' }, [
        el('b', { class: mappingClass(m.status), text: m.recommended + ' → ' + (m.mapped || 'generic') }),
        el('p', { text: m.status + ' / ' + m.reason }),
      ]));
      const warnings = ev.warnings.length ? el('div', { class: 'warns', text: ev.warnings.join(' · ') }) : '';
      const node = el('div', { class: 'result' }, [
        el('div', { class: 'result-head' }, [
          el('div', {}, [
            el('div', { class: 'query', text: ev.query }),
            el('div', { class: 'sub', text: ev.modeDecision.reason }),
          ]),
          el('span', { class: 'badge ' + ev.modeDecision.mode, text: ev.modeDecision.mode }),
        ]),
        el('div', { class: 'grid' }, [
          el('div', { class: 'col' }, [el('h3', { text: 'Match' }), ...matches]),
          el('div', { class: 'col' }, [el('h3', { text: 'Team' }), ...members]),
          el('div', { class: 'col' }, [el('h3', { text: 'Agent mapping' }), ...maps]),
        ]),
        el('div', { class: 'runtime' }, [
          el('div', {}, [el('b', { text: 'Token' }), el('span', { text: token })]),
          el('div', {}, [el('b', { text: 'Adapters' }), el('span', { text: adapters })]),
          el('div', {}, [el('b', { text: 'Main model' }), el('span', { text: ev.team?.mainModel?.model || 'current model' })]),
          el('div', {}, [el('b', { text: 'Hook' }), el('span', { text: hook + ' / ' + ev.hookReadiness.statuslineMode })]),
        ]),
        warnings,
      ].filter(Boolean));
      return node;
    }
    function renderResults(evaluations) {
      const results = $('results');
      results.replaceChildren(...evaluations.map(renderEvaluation));
      const first = evaluations[0];
      if (first) $('hookState').textContent = first.hookReadiness.projectLazyBrainInstalled || first.hookReadiness.globalLazyBrainInstalled ? 'installed' : 'clear';
    }
    async function evaluate(payload) {
      $('status').textContent = 'running';
      try {
        const result = await json('/lab/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        renderResults(result.evaluations);
        $('status').textContent = 'ok';
      } catch (err) {
        $('status').textContent = err.message || String(err);
      }
    }
    async function boot() {
      state.fixtures = await json('/lab/fixtures');
      state.agents = await json('/lab/agents');
      renderFixtures();
      renderAgents();
    }
    $('runFixtures').onclick = () => evaluate({ cases: state.fixtures });
    $('runOne').onclick = () => {
      const query = $('queryInput').value.trim();
      if (query) evaluate({ queries: [query] });
    };
    $('clearResults').onclick = () => $('results').replaceChildren(el('div', { class: 'empty', text: 'Run fixtures or evaluate a query.' }));
    $('refreshAgents').onclick = async () => { state.agents = await json('/lab/agents'); renderAgents(); };
    boot().catch(err => { $('status').textContent = err.message || String(err); });
  </script>
</body>
</html>`;
