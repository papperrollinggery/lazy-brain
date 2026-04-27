export const UI_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LazyBrain</title>
  <style>
    /* ─── Design System ─────────────────────────────────────────── */
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
      background: var(--bg);
      color: var(--text);
      font: 15px/1.5 var(--font);
      -webkit-font-smoothing: antialiased;
    }

    /* ─── Header ───────────────────────────────────────────────── */
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
    .topbar-right { display: flex; align-items: center; gap: 10px; }
    .status-dot {
      width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0;
      background: var(--text-3);
    }
    .status-dot.ok { background: var(--ok); box-shadow: 0 0 6px var(--ok); }
    .status-dot.warn { background: var(--warn); box-shadow: 0 0 6px var(--warn); }
    .status-dot.err { background: var(--err); box-shadow: 0 0 6px var(--err); }

    /* ─── Buttons ──────────────────────────────────────────────── */
    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 16px; border-radius: var(--radius-sm);
      font: inherit; font-weight: 500; font-size: 14px;
      cursor: pointer; border: 1px solid var(--border);
      background: var(--surface); color: var(--text);
      transition: all 120ms;
    }
    .btn:hover { background: var(--surface-hover); border-color: var(--text-3); }
    .btn-primary { background: var(--text); color: var(--bg); border-color: var(--text); }
    .btn-primary:hover { opacity: 0.85; }
    .btn-lg { padding: 12px 24px; font-size: 15px; border-radius: var(--radius); }
    .btn:disabled { opacity: 0.45; cursor: not-allowed; }

    /* ─── Layout ───────────────────────────────────────────────── */
    .page { max-width: 960px; margin: 0 auto; padding: 32px 24px 64px; }

    /* ─── Hero / Status ────────────────────────────────────────── */
    .hero {
      text-align: center; padding: 48px 24px 40px;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); box-shadow: var(--shadow);
      margin-bottom: 28px;
    }
    .hero-icon {
      width: 64px; height: 64px; border-radius: 18px;
      background: var(--text); color: var(--bg);
      display: grid; place-items: center; font-size: 28px; font-weight: 800;
      margin: 0 auto 16px;
    }
    .hero h2 { font-size: 22px; font-weight: 700; margin-bottom: 8px; }
    .hero p { color: var(--text-2); max-width: 480px; margin: 0 auto; }
    .hero .state-badge {
      display: inline-flex; align-items: center; gap: 6px;
      margin-top: 14px; padding: 6px 14px; border-radius: 999px;
      font-size: 13px; font-weight: 600;
    }
    .state-badge.ready { background: var(--ok-bg); color: var(--ok); border: 1px solid var(--ok-border); }
    .state-badge.warning { background: var(--warn-bg); color: var(--warn); border: 1px solid var(--warn-border); }
    .state-badge.error { background: var(--err-bg); color: var(--err); border: 1px solid var(--err-border); }

    /* ─── Stats Row ────────────────────────────────────────────── */
    .stats-row {
      display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px;
      margin-bottom: 28px;
    }
    .stat-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 16px;
      text-align: center;
    }
    .stat-card .num { font-size: 28px; font-weight: 800; line-height: 1; margin-bottom: 4px; }
    .stat-card .label { font-size: 13px; color: var(--text-2); }

    /* ─── Section ──────────────────────────────────────────────── */
    .section {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); box-shadow: var(--shadow);
      margin-bottom: 20px; overflow: hidden;
    }
    .section-header {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 16px 20px; border-bottom: 1px solid var(--border-light);
      cursor: pointer; user-select: none;
    }
    .section-header:hover { background: var(--surface-hover); }
    .section-header h3 { font-size: 15px; font-weight: 600; }
    .section-body { padding: 20px; }
    .section.collapsed .section-body { display: none; }

    /* ─── Try Router ───────────────────────────────────────────── */
    .try-input {
      display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap;
    }
    .try-input input {
      flex: 1; min-width: 200px;
      padding: 12px 16px; border-radius: var(--radius);
      border: 1px solid var(--border); background: var(--bg);
      color: var(--text); font: inherit; font-size: 15px;
    }
    .try-input input:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-light); }
    .try-suggestions { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }
    .try-suggestions button {
      padding: 6px 14px; border-radius: 999px; border: 1px solid var(--border);
      background: var(--bg); color: var(--text-2); font: inherit; font-size: 13px;
      cursor: pointer; transition: all 120ms;
    }
    .try-suggestions button:hover { border-color: var(--brand); color: var(--brand); background: var(--brand-light); }
    .try-result {
      background: var(--bg); border: 1px solid var(--border);
      border-radius: var(--radius-sm); padding: 20px;
      min-height: 80px;
    }
    .try-result .empty { color: var(--text-3); text-align: center; padding: 32px 0; }
    .try-result .match-item {
      display: flex; align-items: center; justify-content: space-between; gap: 12px;
      padding: 10px 0; border-bottom: 1px solid var(--border-light);
    }
    .try-result .match-item:last-child { border-bottom: 0; }
    .match-name { font-weight: 600; }
    .match-detail { font-size: 13px; color: var(--text-2); }
    .match-score {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 44px; height: 28px; border-radius: 999px;
      font-size: 13px; font-weight: 700;
    }
    .match-score.high { background: var(--ok-bg); color: var(--ok); }
    .match-score.mid { background: var(--warn-bg); color: var(--warn); }
    .match-score.low { background: var(--bg); color: var(--text-2); }

    /* ─── Tool Cards ───────────────────────────────────────────── */
    .tool-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px;
    }
    .tool-card {
      border: 1px solid var(--border); border-radius: var(--radius-sm);
      padding: 12px; background: var(--bg);
      transition: border-color 120ms;
    }
    .tool-card:hover { border-color: var(--brand); }
    .tool-card .name { font-weight: 600; font-size: 14px; margin-bottom: 2px; }
    .tool-card .meta { font-size: 12px; color: var(--text-3); display: flex; gap: 8px; flex-wrap: wrap; }
    .tool-tag {
      display: inline-flex; align-items: center; padding: 1px 8px;
      border-radius: 999px; font-size: 11px; font-weight: 600;
      border: 1px solid var(--border);
    }
    .tool-tag.skill { background: #eff6ff; color: #2563eb; border-color: #bfdbfe; }
    .tool-tag.agent { background: #fdf4ff; color: #a21caf; border-color: #f0abfc; }
    .tool-tag.command { background: #ecfdf5; color: #059669; border-color: #a7f3d0; }
    @media (prefers-color-scheme: dark) {
      .tool-tag.skill { background: #1e293b; color: #60a5fa; border-color: #1e3a5f; }
      .tool-tag.agent { background: #2a1035; color: #d946ef; border-color: #4a1942; }
      .tool-tag.command { background: #022c22; color: #34d399; border-color: #064e3b; }
    }

    /* ─── Setup Steps ──────────────────────────────────────────── */
    .steps { display: grid; gap: 12px; }
    .step {
      display: flex; gap: 14px; padding: 14px;
      border: 1px solid var(--border); border-radius: var(--radius-sm);
      background: var(--bg);
    }
    .step-num {
      width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
      display: grid; place-items: center; font-weight: 700; font-size: 13px;
      background: var(--text); color: var(--bg);
    }
    .step-num.done { background: var(--ok); }
    .step-body { flex: 1; min-width: 0; }
    .step-body strong { display: block; margin-bottom: 4px; }
    .step-body code {
      display: block; margin-top: 6px; padding: 8px 12px;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius-sm); font: 13px/1.5 var(--font-mono);
      overflow-x: auto; white-space: pre-wrap; word-break: break-all;
      color: var(--text);
    }
    .step-check {
      width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0;
      display: grid; place-items: center; font-size: 12px;
      border: 2px solid var(--border); color: transparent; margin-top: 4px;
    }
    .step-check.done { border-color: var(--ok); background: var(--ok); color: white; }

    /* ─── Hook Cards ───────────────────────────────────────────── */
    .hook-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
    .hook-card {
      border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 16px;
    }
    .hook-card h4 { font-size: 14px; margin-bottom: 10px; }
    .hook-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
    .hook-row span:last-child { font-weight: 600; }

    /* ─── Misc ─────────────────────────────────────────────────── */
    .text-ok { color: var(--ok); }
    .text-warn { color: var(--warn); }
    .text-err { color: var(--err); }
    .text-2 { color: var(--text-2); }
    .text-3 { color: var(--text-3); }
    .mt-sm { margin-top: 10px; }
    .mt-md { margin-top: 16px; }
    .gap-sm { display: flex; gap: 8px; flex-wrap: wrap; }
    pre.code-block {
      background: var(--bg); border: 1px solid var(--border);
      border-radius: var(--radius-sm); padding: 14px;
      font: 13px/1.5 var(--font-mono); overflow-x: auto;
      white-space: pre-wrap; word-break: break-all;
    }

    /* ─── Responsive ───────────────────────────────────────────── */
    @media (max-width: 680px) {
      .stats-row { grid-template-columns: repeat(2, 1fr); }
      .tool-grid { grid-template-columns: 1fr; }
      .hero { padding: 32px 16px 28px; }
      .topbar { padding: 12px 16px; }
      .page { padding: 20px 12px 48px; }
    }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="logo">
      <div class="logo-icon">LB</div>
      <h1>LazyBrain <span id="version" class="text-3" style="font-weight:400;font-size:13px"></span></h1>
    </div>
    <div class="topbar-right">
      <span id="globalStatus" class="status-dot" title="Checking..."></span>
      <button class="btn" id="refreshBtn" style="font-size:13px">Refresh</button>
      <button class="btn" onclick="location.href='/lab'" style="font-size:13px">Lab</button>
    </div>
  </div>

  <div class="page">

    <!-- Hero -->
    <div class="hero" id="hero">
      <div class="hero-icon">🧠</div>
      <h2 id="heroTitle">Checking status...</h2>
      <p id="heroDesc">Loading your LazyBrain setup</p>
      <div id="heroBadge"></div>
    </div>

    <!-- Stats -->
    <div class="stats-row" id="statsRow"></div>

    <!-- Try Router (always visible) -->
    <div class="section" id="trySection">
      <div class="section-header" onclick="toggleSection(this)">
        <h3>Try it out</h3>
        <span class="text-3" style="font-size:13px">Type a task and see what LazyBrain recommends</span>
      </div>
      <div class="section-body">
        <div class="try-input">
          <input id="queryInput" type="text" placeholder="Describe what you want to do, e.g. review this PR for bugs"
                 autocomplete="off" />
          <button class="btn btn-primary" id="runRoute">Get Recommendation</button>
        </div>
        <div class="try-suggestions" id="suggestions">
          <button data-q="帮我审查这个 PR">审查 PR</button>
          <button data-q="调试一个生产环境 bug">调试 bug</button>
          <button data-q="写一个 REST API 接口">写 API</button>
          <button data-q="优化数据库查询性能">优化查询</button>
          <button data-q="部署到生产环境">部署上线</button>
        </div>
        <div class="try-result" id="tryResult">
          <div class="empty">Enter a task above and click "Get Recommendation"</div>
        </div>
      </div>
    </div>

    <!-- Your Tools -->
    <div class="section collapsed" id="toolsSection">
      <div class="section-header" onclick="toggleSection(this)">
        <h3>Your Tools</h3>
        <span class="text-3" style="font-size:13px" id="toolCount">0 capabilities found</span>
      </div>
      <div class="section-body">
        <div class="gap-sm" style="margin-bottom:14px">
          <input id="toolSearch" type="text" placeholder="Filter tools..." class="try-input" style="flex:1;min-width:auto;padding:8px 12px;font-size:14px" />
          <select id="toolKindFilter" style="border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px 12px;font:inherit;font-size:14px;background:var(--surface);color:var(--text)">
            <option value="">All types</option>
            <option value="skill">Skills</option>
            <option value="agent">Agents</option>
            <option value="command">Commands</option>
          </select>
        </div>
        <div class="tool-grid" id="toolGrid"></div>
      </div>
    </div>

    <!-- Setup Guide -->
    <div class="section" id="setupSection">
      <div class="section-header" onclick="toggleSection(this)">
        <h3>Setup Guide</h3>
        <span class="text-3" style="font-size:13px">Step-by-step to install LazyBrain into Claude Code</span>
      </div>
      <div class="section-body">
        <div class="steps" id="steps"></div>
      </div>
    </div>

    <!-- Hook Status -->
    <div class="section collapsed" id="hookSection">
      <div class="section-header" onclick="toggleSection(this)">
        <h3>Hook Status</h3>
        <span class="text-3" style="font-size:13px">Detailed hook installation info</span>
      </div>
      <div class="section-body">
        <div class="hook-grid" id="hookGrid"></div>
        <div id="hookRuntime" class="mt-md"></div>
      </div>
    </div>

    <!-- Advanced -->
    <div class="section collapsed" id="advancedSection">
      <div class="section-header" onclick="toggleSection(this)">
        <h3>Advanced</h3>
        <span class="text-3" style="font-size:13px">Config, health, troubleshooting</span>
      </div>
      <div class="section-body">
        <div id="trouble"></div>
        <div class="mt-md" id="configDump"></div>
      </div>
    </div>

  </div>

  <script>
    const state = { status: null, tools: [] };
    const $ = id => document.getElementById(id);
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

    async function api(url, opts) {
      const res = await fetch(url, opts);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }

    // ─── Section toggle ──────────────────────────────────────────
    function toggleSection(header) {
      header.parentElement.classList.toggle('collapsed');
    }

    // ─── Hero ────────────────────────────────────────────────────
    function renderHero() {
      const s = state.status;
      if (!s) return;
      $('version').textContent = 'v' + s.version;
      const rd = s.readiness;
      const isReady = rd.state === 'READY';
      const hasIssues = rd.blockers.length > 0;
      const dot = $('globalStatus');
      dot.className = 'status-dot ' + (isReady ? 'ok' : hasIssues ? 'err' : 'warn');

      let title, desc, badgeClass, badgeText;
      if (isReady) {
        title = 'All systems go';
        desc = 'LazyBrain is ready — your tools are indexed and routing is active';
        badgeClass = 'ready'; badgeText = 'Ready';
      } else if (hasIssues) {
        title = 'Setup needed';
        desc = rd.blockers.join('; ');
        badgeClass = 'error'; badgeText = rd.blockers.length + ' issue' + (rd.blockers.length > 1 ? 's' : '');
      } else {
        title = 'Almost there';
        desc = rd.warnings.length ? rd.warnings.join('; ') : 'A few things to check';
        badgeClass = 'warning'; badgeText = 'Needs attention';
      }
      $('heroTitle').textContent = title;
      $('heroDesc').textContent = desc;
      $('heroBadge').innerHTML = '<span class="state-badge ' + badgeClass + '">' + badgeText + '</span>';
    }

    // ─── Stats ───────────────────────────────────────────────────
    function renderStats() {
      const s = state.status;
      if (!s) return;
      const kinds = Object.entries(s.graph?.byKind || {});
      const engine = s.routing?.engine || 'tag';
      const mode = s.routing?.mode || 'off';
      const embOk = s.embedding?.state === 'ok';
      $('statsRow').innerHTML = [
        { num: s.graph?.nodes || 0, label: 'Tools indexed' },
        { num: kinds.length, label: 'Types (skill/agent/command)' },
        { num: engine + ' · ' + mode, label: 'Routing engine' },
        { num: embOk ? 'Active' : 'Off', label: 'Semantic search' },
      ].map(c => '<div class="stat-card"><div class="num">' + esc(String(c.num)) + '</div><div class="label">' + c.label + '</div></div>').join('');
    }

    // ─── Try Router ──────────────────────────────────────────────
    async function doRoute(query) {
      $('tryResult').innerHTML = '<div class="empty">Thinking...</div>';
      try {
        const route = await api('/api/route', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, target: 'claude' }),
        });
        renderRouteResult(route);
      } catch (e) {
        $('tryResult').innerHTML = '<div class="empty text-err">Error: ' + esc(e.message) + '</div>';
      }
    }

    function renderRouteResult(route) {
      if (!route || !route.skills?.length) {
        $('tryResult').innerHTML = '<div class="empty">No matching tools found. Try a different query or run <code>lazybrain scan</code> first.</div>';
        return;
      }
      const lines = [];
      if (route.intent) lines.push('<div style="font-weight:600;margin-bottom:10px">' + esc(route.intent) + '</div>');
      if (route.scenario) lines.push('<div class="text-2" style="font-size:13px;margin-bottom:12px">Scenario: ' + esc(route.scenario) + '</div>');
      for (const sk of route.skills) {
        const score = Math.round((sk.score || 0) * 100);
        const cls = score >= 80 ? 'high' : score >= 50 ? 'mid' : 'low';
        lines.push(
          '<div class="match-item">' +
          '<div><div class="match-name">/' + esc(sk.name) + '</div>' +
          '<div class="match-detail">' + esc(sk.reason || sk.category || '') + '</div></div>' +
          '<span class="match-score ' + cls + '">' + score + '%</span>' +
          '</div>'
        );
      }
      if (route.tokenStrategy?.summary) {
        lines.push('<div class="text-2 mt-sm" style="font-size:13px">' + esc(route.tokenStrategy.summary) + '</div>');
      }
      if (route.executionPlan?.length) {
        lines.push('<div class="mt-sm" style="font-weight:600;font-size:13px">Suggested workflow:</div>');
        lines.push('<ol style="margin:4px 0 0 18px;font-size:13px;color:var(--text-2)">' +
          route.executionPlan.map(s => '<li>' + esc(s.title) + '</li>').join('') + '</ol>');
      }
      $('tryResult').innerHTML = lines.join('');
    }

    // ─── Tools ───────────────────────────────────────────────────
    function renderTools(filter, kindFilter) {
      let tools = state.tools;
      if (filter) {
        const q = filter.toLowerCase();
        tools = tools.filter(t => (t.name || '').toLowerCase().includes(q) || (t.category || '').toLowerCase().includes(q));
      }
      if (kindFilter) tools = tools.filter(t => t.kind === kindFilter);
      $('toolCount').textContent = tools.length + ' capabilities shown';
      if (!tools.length) {
        $('toolGrid').innerHTML = '<div class="empty text-3" style="padding:32px">No tools match. Run <code>lazybrain scan</code> to discover tools.</div>';
        return;
      }
      $('toolGrid').innerHTML = tools.slice(0, 100).map(t =>
        '<div class="tool-card">' +
        '<div class="name">' + esc(t.name) + '</div>' +
        '<div class="meta">' +
        '<span class="tool-tag ' + esc(t.kind || '') + '">' + esc(t.kind || '') + '</span>' +
        '<span>' + esc(t.category || '') + '</span>' +
        '<span>' + esc(t.origin || '') + '</span>' +
        '</div></div>'
      ).join('');
    }

    // ─── Setup Guide ─────────────────────────────────────────────
    function renderSetup() {
      const s = state.status;
      const graphOk = (s?.graph?.nodes || 0) > 0;
      const hookInstalled = s?.hook?.scopes?.some(h => h.installed) || false;
      const embOk = s?.embedding?.state === 'ok';
      const steps = [
        { done: true, title: 'Install LazyBrain', desc: 'Clone, build, and link the CLI', cmd: 'git clone https://github.com/papperrollinggery/lazy-brain.git && cd lazy-brain && npm install && npm run build && npm link' },
        { done: graphOk, title: 'Scan your tools', desc: graphOk ? 'Found ' + s.graph.nodes + ' capabilities' : 'Discover skills, agents, and commands on your machine', cmd: 'lazybrain scan && lazybrain compile --offline' },
        { done: hookInstalled, title: 'Install the Claude Code hook', desc: hookInstalled ? 'Hook is active in Claude Code' : 'Add LazyBrain to Claude Code (project scope only)', cmd: 'lazybrain hook plan\nlazybrain hook install' },
        { done: embOk, title: 'Set up semantic search (optional)', desc: embOk ? 'Semantic embeddings active' : 'Add AI-powered matching for better results', cmd: 'lazybrain config set embeddingApiKey <your-key>\nlazybrain config set embeddingModel BAAI/bge-m3\nlazybrain embeddings rebuild --yes' },
      ];
      $('steps').innerHTML = steps.map((st, i) =>
        '<div class="step">' +
        '<div class="step-num' + (st.done ? ' done' : '') + '">' + (st.done ? '✓' : (i + 1)) + '</div>' +
        '<div class="step-body"><strong>' + esc(st.title) + '</strong>' +
        '<span class="text-2">' + esc(st.desc) + '</span>' +
        '<code>' + esc(st.cmd) + '</code></div>' +
        '<div class="step-check' + (st.done ? ' done' : '') + '">✓</div>' +
        '</div>'
      ).join('');
    }

    // ─── Hook Detail ─────────────────────────────────────────────
    function renderHook() {
      const s = state.status;
      if (!s?.hook?.scopes) return;
      $('hookGrid').innerHTML = s.hook.scopes.map(h =>
        '<div class="hook-card"><h4>' + esc(h.scope) + ' scope</h4>' +
        '<div class="hook-row"><span>UserPromptSubmit</span><span class="' + (h.installed ? 'text-ok' : 'text-warn') + '">' + (h.installed ? 'installed' : 'not installed') + '</span></div>' +
        '<div class="hook-row"><span>Stop hooks</span><span class="' + (h.stopClean ? 'text-ok' : 'text-err') + '">' + (h.stopClean ? 'clean' : 'contains LazyBrain') + '</span></div>' +
        '<div class="hook-row"><span>SessionStart</span><span>' + (h.sessionStart ? 'present' : 'none') + '</span></div>' +
        '</div>'
      ).join('');
      if (s.hook) {
        $('hookRuntime').innerHTML =
          '<div class="hook-grid">' +
          '<div class="hook-card"><h4>Runtime</h4>' +
          '<div class="hook-row"><span>Active runs</span><span>' + s.hook.activeRuns + '</span></div>' +
          '<div class="hook-row"><span>Hung runs</span><span>' + s.hook.hungRuns + '</span></div>' +
          '<div class="hook-row"><span>Breaker</span><span class="' + (s.hook.breakerOpen ? 'text-err' : 'text-ok') + '">' + (s.hook.breakerOpen ? 'open' : 'closed') + '</span></div>' +
          '<div class="hook-row"><span>P95 duration</span><span>' + s.hook.p95DurationMs + 'ms</span></div>' +
          '</div></div>';
      }
    }

    // ─── Advanced ────────────────────────────────────────────────
    function renderAdvanced() {
      const s = state.status;
      if (!s) return;
      const items = [];
      if (s.readiness?.blockers?.length) items.push({ title: 'Issues found', detail: s.readiness.blockers.join(', '), cmd: 'lazybrain ready', cls: 'err' });
      if (s.embedding?.state !== 'ok') items.push({ title: 'Semantic search degraded', detail: s.embedding?.message || 'Check embedding config', cmd: 'lazybrain embeddings status', cls: 'warn' });
      if (!s.server?.running) items.push({ title: 'Server record missing', detail: 'Server PID not detected', cmd: 'lazybrain ui', cls: 'warn' });
      if (!items.length) items.push({ title: 'Everything looks good', detail: 'All checks passed', cmd: 'lazybrain route "test query"', cls: 'ok' });
      $('trouble').innerHTML = items.map(it =>
        '<div style="border:1px solid var(--' + it.cls + '-border);border-radius:var(--radius-sm);padding:12px;margin-bottom:8px;background:var(--' + it.cls + '-bg)">' +
        '<strong>' + esc(it.title) + '</strong><div class="text-2" style="font-size:13px">' + esc(it.detail) + '</div>' +
        '<code style="display:block;margin-top:6px">' + esc(it.cmd) + '</code></div>'
      ).join('');
      $('configDump').innerHTML = '<details><summary style="cursor:pointer;font-weight:600;font-size:14px">Raw Config</summary>' +
        '<pre class="code-block mt-sm">' + esc(JSON.stringify(s.config || {}, null, 2)) + '</pre></details>';
    }

    // ─── Init ────────────────────────────────────────────────────
    $('runRoute').onclick = () => {
      const q = $('queryInput').value.trim();
      if (q) doRoute(q);
    };
    $('queryInput').onkeydown = e => { if (e.key === 'Enter') $('runRoute').click(); };
    for (const btn of document.querySelectorAll('.try-suggestions button')) {
      btn.onclick = () => { $('queryInput').value = btn.dataset.q; doRoute(btn.dataset.q); };
    }
    $('refreshBtn').onclick = load;
    $('toolSearch').oninput = () => renderTools($('toolSearch').value, $('toolKindFilter').value);
    $('toolKindFilter').onchange = () => renderTools($('toolSearch').value, $('toolKindFilter').value);

    async function load() {
      try {
        state.status = await api('/api/status');
        if (state.status?.graph?.nodes) {
          const searchResult = await api('/api/search?' + new URLSearchParams({ limit: '500' }));
          state.tools = Array.isArray(searchResult) ? searchResult : [];
        }
      } catch (e) {
        $('heroTitle').textContent = 'Cannot connect';
        $('heroDesc').textContent = e.message;
        return;
      }
      renderHero();
      renderStats();
      renderTools('', '');
      renderSetup();
      renderHook();
      renderAdvanced();
    }

    load();
  </script>
</body>
</html>`;
