export const UI_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LazyBrain</title>
  <style>
    :root {
      --bg: #f4f5f2;
      --panel: #fffefa;
      --ink: #171a17;
      --muted: #626960;
      --line: #d8ddd4;
      --good: #22734b;
      --warn: #9b6b12;
      --bad: #9b312d;
      --accent: #225f7a;
      --soft: #eef1eb;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font: 14px/1.45 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 16px 20px;
      background: var(--panel);
      border-bottom: 1px solid var(--line);
      position: sticky;
      top: 0;
      z-index: 4;
    }
    .brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
    .mark {
      width: 34px; height: 34px; border: 2px solid var(--ink); border-radius: 8px;
      display: grid; place-items: center; font-weight: 800; letter-spacing: 0;
    }
    h1 { margin: 0; font-size: 18px; letter-spacing: 0; }
    .sub { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
    main { display: grid; grid-template-columns: 220px minmax(0, 1fr); min-height: calc(100vh - 67px); }
    nav {
      border-right: 1px solid var(--line);
      padding: 12px;
      background: #fafbf7;
    }
    nav button {
      display: block;
      width: 100%;
      text-align: left;
      border: 1px solid transparent;
      background: transparent;
      color: var(--ink);
      min-height: 36px;
      border-radius: 6px;
      padding: 0 10px;
      margin-bottom: 4px;
      cursor: pointer;
      font: inherit;
    }
    nav button.active { border-color: var(--line); background: var(--panel); font-weight: 700; }
    .content { padding: 16px; min-width: 0; }
    .toolbar { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
    button, input, select, textarea {
      border: 1px solid var(--line);
      border-radius: 6px;
      background: white;
      color: var(--ink);
      font: inherit;
    }
    button { min-height: 34px; padding: 0 12px; cursor: pointer; }
    button.primary { background: var(--ink); color: white; border-color: var(--ink); }
    button:disabled { opacity: .55; cursor: not-allowed; }
    input, select { min-height: 34px; padding: 0 10px; }
    textarea { width: 100%; min-height: 120px; padding: 10px; resize: vertical; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .grid.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      min-width: 0;
    }
    .panel h2, .panel h3 { margin: 0 0 8px; font-size: 14px; letter-spacing: 0; }
    .big { font-size: 24px; font-weight: 800; line-height: 1.1; }
    .muted { color: var(--muted); }
    .status { display: inline-flex; align-items: center; gap: 6px; min-height: 24px; padding: 0 8px; border-radius: 999px; border: 1px solid var(--line); background: var(--soft); font-size: 12px; }
    .ok { color: var(--good); }
    .warn { color: var(--warn); }
    .bad { color: var(--bad); }
    .list { display: grid; gap: 8px; }
    .row { display: flex; justify-content: space-between; gap: 12px; border-top: 1px solid var(--line); padding-top: 8px; }
    .row:first-child { border-top: 0; padding-top: 0; }
    .table { width: 100%; border-collapse: collapse; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
    th, td { border-bottom: 1px solid var(--line); padding: 8px; text-align: left; vertical-align: top; }
    th { background: #fafbf7; font-size: 12px; color: var(--muted); }
    td { overflow-wrap: anywhere; }
    .hidden { display: none; }
    .result { white-space: pre-wrap; overflow-wrap: anywhere; background: #fbfcf8; border: 1px solid var(--line); border-radius: 6px; padding: 10px; max-height: 360px; overflow: auto; }
    @media (max-width: 820px) {
      main { grid-template-columns: 1fr; }
      nav { display: flex; overflow-x: auto; border-right: 0; border-bottom: 1px solid var(--line); }
      nav button { width: auto; white-space: nowrap; }
      .grid, .grid.two { grid-template-columns: 1fr; }
      header { align-items: flex-start; flex-direction: column; }
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <div class="mark">LB</div>
      <div>
        <h1>LazyBrain <span id="version" class="muted"></span></h1>
        <div class="sub">Semantic skill router control surface</div>
      </div>
    </div>
    <div class="toolbar">
      <button id="refresh">Refresh</button>
      <button id="openLab">Open Lab</button>
    </div>
  </header>
  <main>
    <nav id="nav"></nav>
    <div class="content">
      <section id="overview"></section>
      <section id="router" class="hidden"></section>
      <section id="skills" class="hidden"></section>
      <section id="hook" class="hidden"></section>
      <section id="lab" class="hidden"></section>
      <section id="health" class="hidden"></section>
      <section id="trouble" class="hidden"></section>
      <section id="settings" class="hidden"></section>
    </div>
  </main>
  <script>
    const tabs = [
      ['overview', 'Overview'], ['router', 'Try Router'], ['skills', 'Skill DB'], ['hook', 'Hook Safety'],
      ['lab', 'Lab'], ['health', 'Health'], ['trouble', 'Troubleshooting'], ['settings', 'Settings']
    ];
    const state = { status: null, skills: [], queryResult: null };
    const $ = id => document.getElementById(id);
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const cls = v => v === 'READY' || v === 'ok' || v === 'OK' ? 'ok' : v === 'NOT_READY' || v === 'blocked' || v === 'missing' || v === 'invalid' ? 'bad' : 'warn';
    async function json(url, opts) {
      const res = await fetch(url, opts);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }
    function show(id) {
      for (const [key] of tabs) $(key).classList.toggle('hidden', key !== id);
      for (const btn of document.querySelectorAll('nav button')) btn.classList.toggle('active', btn.dataset.tab === id);
    }
    function initNav() {
      $('nav').innerHTML = tabs.map(([id, label]) => '<button data-tab="' + id + '">' + label + '</button>').join('');
      for (const btn of document.querySelectorAll('nav button')) btn.onclick = () => show(btn.dataset.tab);
      show('overview');
    }
    function renderOverview() {
      const s = state.status;
      if (!s) return;
      $('version').textContent = 'v' + s.version;
      const next = [];
      if (s.readiness.state !== 'READY') next.push('Run lazybrain ready');
      if (s.embedding.state !== 'ok') next.push('Run lazybrain embeddings status');
      if (!s.routing.apiConfigured.compile || !s.routing.apiConfigured.embedding || !s.routing.apiConfigured.secretary) next.push('Run lazybrain api test');
      if (next.length === 0) next.push('Try Router');
      $('overview').innerHTML = \`
        <div class="grid">
          <div class="panel"><h2>Readiness</h2><div class="big \${cls(s.readiness.state)}">\${s.readiness.state}</div><div class="muted">\${s.readiness.blockers.length} blockers · \${s.readiness.warnings.length} warnings</div></div>
          <div class="panel"><h2>Capability DB</h2><div class="big">\${s.graph.nodes}</div><div class="muted">\${Object.entries(s.graph.byKind).map(([k,v]) => esc(k)+': '+v).join(' · ')}</div></div>
          <div class="panel"><h2>Routing</h2><div class="big">\${esc(s.routing.engine)}</div><div class="muted">\${esc(s.routing.mode)} · \${esc(s.routing.strategy)}</div></div>
          <div class="panel"><h2>API Health</h2><div class="big \${s.routing.apiConfigured.compile && s.routing.apiConfigured.embedding ? 'ok':'warn'}">\${s.routing.apiConfigured.compile && s.routing.apiConfigured.embedding ? 'OK':'CHECK'}</div><div class="muted">compile \${s.routing.apiConfigured.compile ? 'ready':'missing'} · secretary \${s.routing.apiConfigured.secretary ? 'ready':'missing'}</div></div>
          <div class="panel"><h2>Embedding</h2><div class="big \${cls(s.embedding.state)}">\${esc(s.embedding.state.toUpperCase())}</div><div class="muted">\${s.embedding.covered}/\${s.embedding.active} covered</div></div>
          <div class="panel"><h2>Server</h2><div class="big \${s.server.running ? 'ok':'warn'}">\${s.server.running ? 'ON':'IDLE'}</div><div class="muted">\${esc(s.server.url)}</div></div>
        </div>
        <div class="grid two" style="margin-top:12px">
          <div class="panel"><h2>Hook Safety</h2><div class="list">\${s.hook.scopes.map(h => '<div class="row"><span>'+h.scope+'</span><span>'+(h.installed ? 'installed' : 'not installed')+' · '+(h.stopClean ? 'Stop clean' : 'Stop dirty')+'</span></div>').join('')}</div></div>
          <div class="panel"><h2>Next</h2><div class="list">\${next.map((item,i) => '<div class="row"><span>'+(i+1)+'. '+esc(item)+'</span></div>').join('')}</div></div>
        </div>\`;
    }
    function renderRouter() {
      $('router').innerHTML = \`
        <div class="panel">
          <h2>Try Router</h2>
          <textarea id="query" placeholder="输入一个任务，例如：审查这次改动有没有回归风险"></textarea>
          <div class="toolbar"><button class="primary" id="runMatch">Evaluate</button><button id="clearMatch">Clear</button></div>
          <div id="matchOut" class="result">\${state.queryResult ? esc(JSON.stringify(state.queryResult, null, 2)) : 'No result yet.'}</div>
        </div>\`;
      $('runMatch').onclick = async () => {
        const query = $('query').value.trim();
        if (!query) return;
        state.queryResult = await json('/api/lab/evaluate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ query }) });
        renderRouter();
      };
      $('clearMatch').onclick = () => { state.queryResult = null; renderRouter(); };
    }
    function renderSkills() {
      const s = state.status;
      const kinds = Object.keys(s?.graph?.byKind || {});
      const categories = Object.keys(s?.graph?.byCategory || {});
      $('skills').innerHTML = \`
        <div class="toolbar">
          <input id="skillQ" placeholder="Search skills" />
          <select id="skillKind"><option value="">Kind</option>\${kinds.map(k => '<option>'+esc(k)+'</option>').join('')}</select>
          <select id="skillCategory"><option value="">Category</option>\${categories.map(k => '<option>'+esc(k)+'</option>').join('')}</select>
          <label class="status"><input id="semanticMissing" type="checkbox" /> Semantic missing</label>
          <label class="status"><input id="dupsOnly" type="checkbox" /> Duplicates</label>
          <button id="loadSkills">Search</button>
        </div>
        <table class="table"><thead><tr><th>Name</th><th>Kind</th><th>Category</th><th>Origin</th><th>Status</th><th>Embedding</th></tr></thead><tbody id="skillRows"></tbody></table>\`;
      const rows = data => $('skillRows').innerHTML = data.map(cap => '<tr><td>'+esc(cap.name)+'</td><td>'+esc(cap.kind)+'</td><td>'+esc(cap.category)+'</td><td>'+esc(cap.origin)+'</td><td>'+esc(cap.status)+'</td><td>'+(cap.embeddingCovered ? 'covered' : 'missing')+'</td></tr>').join('');
      rows(state.skills);
      $('loadSkills').onclick = async () => {
        const params = new URLSearchParams();
        const q = $('skillQ').value.trim();
        if (q) params.set('q', q);
        if ($('skillKind').value) params.set('kind', $('skillKind').value);
        if ($('skillCategory').value) params.set('category', $('skillCategory').value);
        if ($('semanticMissing').checked) params.set('semanticMissing', 'true');
        if ($('dupsOnly').checked) params.set('duplicatesOnly', 'true');
        state.skills = await json('/api/search?' + params.toString());
        rows(state.skills);
      };
      if (state.skills.length === 0 && s?.graph?.nodes) $('skillRows').innerHTML = '<tr><td colspan="6">Use search to inspect the capability database.</td></tr>';
    }
    function renderHook() {
      const s = state.status;
      $('hook').innerHTML = '<div class="grid two">' + s.hook.scopes.map(h => \`
        <div class="panel"><h2>\${h.scope}</h2>
          <div class="row"><span>UserPromptSubmit</span><span class="\${h.installed ? 'ok':'warn'}">\${h.installed ? 'installed':'not installed'}</span></div>
          <div class="row"><span>Stop</span><span class="\${h.stopClean ? 'ok':'bad'}">\${h.stopClean ? 'clean':'contains LazyBrain'}</span></div>
          <div class="row"><span>SessionStart</span><span>\${h.sessionStart ? 'present':'none'}</span></div>
          <div class="row"><span>Workspace</span><span>\${esc(h.installState?.workspaceRoot ?? '(none)')}</span></div>
        </div>\`).join('') + \`
        <div class="panel"><h2>Runtime</h2>
          <div class="row"><span>Active</span><span>\${s.hook.activeRuns}</span></div>
          <div class="row"><span>Hung</span><span>\${s.hook.hungRuns}</span></div>
          <div class="row"><span>Breaker</span><span class="\${s.hook.breakerOpen ? 'bad':'ok'}">\${s.hook.breakerOpen ? 'open':'closed'}</span></div>
          <div class="row"><span>P95</span><span>\${s.hook.p95DurationMs}ms</span></div>
        </div>
        <div class="panel"><h2>Safe CLI Actions</h2><div class="result">lazybrain hook plan\\nlazybrain hook status\\nlazybrain hook ps\\nlazybrain hook clean\\nlazybrain hook rollback</div></div>
      </div>\`;
    }
    function renderLab() { $('lab').innerHTML = '<div class="panel"><h2>Lab</h2><p class="muted">Existing non-install Lab remains available.</p><button class="primary" onclick="location.href=\\'/lab\\'">Open /lab</button></div>'; }
    function renderHealth() {
      const s = state.status;
      $('health').innerHTML = '<div class="panel"><h2>Health JSON</h2><pre class="result">' + esc(JSON.stringify(s, null, 2)) + '</pre></div>';
    }
    function renderTrouble() {
      const s = state.status;
      const items = [];
      if (s.readiness.blockers.length) items.push(['Not ready', s.readiness.blockers.join('\\n'), 'lazybrain ready']);
      if (s.embedding.state !== 'ok') items.push(['Semantic/hybrid degraded', s.embedding.message, 'lazybrain embeddings status']);
      if (!s.server.running) items.push(['Server record missing', 'Server is not marked as running.', 'lazybrain ui']);
      if (items.length === 0) items.push(['No obvious issue', 'All primary checks are usable.', 'lazybrain match "<query>"']);
      $('trouble').innerHTML = '<div class="list">' + items.map(([a,b,c]) => '<div class="panel"><h2>'+esc(a)+'</h2><p>'+esc(b)+'</p><pre class="result">'+esc(c)+'</pre></div>').join('') + '</div>';
    }
    function renderSettings() {
      $('settings').innerHTML = '<div class="panel"><h2>Redacted Config</h2><pre class="result">' + esc(JSON.stringify(state.status.config, null, 2)) + '</pre></div>';
    }
    function renderAll() {
      renderOverview(); renderRouter(); renderSkills(); renderHook(); renderLab(); renderHealth(); renderTrouble(); renderSettings();
    }
    async function load() {
      state.status = await json('/api/status');
      renderAll();
    }
    $('refresh').onclick = load;
    $('openLab').onclick = () => location.href = '/lab';
    initNav();
    load().catch(err => { $('overview').innerHTML = '<div class="panel"><h2>Load failed</h2><pre class="result">'+esc(err.message)+'</pre></div>'; });
  </script>
</body>
</html>`;
