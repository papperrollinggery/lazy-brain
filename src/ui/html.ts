export const UI_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LazyBrain Workbench</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f6f7f8;
      --surface: #ffffff;
      --surface-soft: #f1f3f5;
      --text: #171717;
      --muted: #60646c;
      --border: #d7d9de;
      --ok: #116329;
      --warn: #8a5a00;
      --err: #b42318;
      --mono: ui-monospace, "SF Mono", Menlo, monospace;
      --font: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: var(--font);
      font-size: 14px;
    }
    button, input, textarea { font: inherit; }
    button { cursor: pointer; }
    .shell { max-width: 1160px; margin: 0 auto; padding: 20px; }
    .top {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-end;
      padding-bottom: 14px;
      border-bottom: 1px solid var(--border);
    }
    h1 { margin: 0 0 4px; font-size: 22px; letter-spacing: 0; }
    h2 { margin: 0 0 12px; font-size: 15px; letter-spacing: 0; }
    h3 { margin: 0 0 8px; font-size: 13px; letter-spacing: 0; }
    .muted { color: var(--muted); font-size: 13px; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .btn {
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface);
      color: var(--text);
      padding: 8px 10px;
      min-height: 34px;
    }
    .btn.primary { background: var(--text); color: #fff; border-color: var(--text); }
    .btn:disabled { opacity: .5; cursor: not-allowed; }
    .grid { display: grid; grid-template-columns: 1.25fr .85fr; gap: 14px; margin-top: 14px; }
    .cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin-top: 14px; }
    .tabs {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 14px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
    }
    .tab {
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface);
      color: var(--text);
      padding: 8px 10px;
      min-height: 34px;
    }
    .tab.active { background: var(--text); border-color: var(--text); color: #fff; }
    .page { display: none; }
    .page.active { display: block; }
    .card, .panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px;
    }
    .label { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0; }
    .state { margin-top: 6px; font-size: 21px; font-weight: 700; }
    .detail { margin-top: 8px; color: var(--muted); font-size: 12px; line-height: 1.4; white-space: pre-wrap; }
    .ok { color: var(--ok); }
    .warn { color: var(--warn); }
    .err { color: var(--err); }
    .mono {
      font-family: var(--mono);
      font-size: 12px;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .route-result { display: grid; gap: 10px; }
    .route-card {
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
      background: var(--surface-soft);
    }
    .route-card h3 { margin-bottom: 6px; }
    .route-card p { margin: 0 0 8px; line-height: 1.45; }
    .route-list { margin: 0; padding-left: 18px; color: var(--muted); line-height: 1.45; }
    .copybox {
      font-family: var(--mono);
      font-size: 12px;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px;
      background: #fff;
      max-height: 220px;
      overflow: auto;
    }
    .choice-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      align-items: start;
      border-top: 1px solid var(--border);
      padding-top: 8px;
      margin-top: 8px;
    }
    .feedback { min-height: 18px; color: var(--muted); font-size: 12px; }
    .notice {
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px;
      background: var(--surface-soft);
      color: var(--muted);
      line-height: 1.45;
    }
    .list { display: grid; gap: 8px; }
    .item {
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px;
      background: var(--surface-soft);
    }
    .item strong { display: block; margin-bottom: 4px; }
    .split { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-top: 14px; }
    .textarea {
      width: 100%;
      min-height: 108px;
      resize: vertical;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px;
      background: #fff;
    }
    .select {
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px;
      background: #fff;
    }
    .row {
      display: grid;
      grid-template-columns: 150px 1fr auto;
      gap: 10px;
      align-items: center;
      padding: 9px 0;
      border-top: 1px solid #eceef1;
    }
    .row:first-of-type { border-top: 0; }
    .badge {
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 3px 8px;
      font-size: 11px;
      white-space: nowrap;
      background: var(--surface-soft);
    }
    .mt { margin-top: 14px; }
    @media (max-width: 820px) {
      .top, .grid, .cards, .split { display: block; }
      .card, .panel { margin-top: 10px; }
      .row { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <div class="top">
      <div>
        <h1>LazyBrain Workbench</h1>
        <div class="muted">Agent workbench：把任务变成角色、范围、验证、receipt 和下一步。</div>
      </div>
      <div class="actions">
        <button class="btn" id="refresh">刷新 / Refresh</button>
        <button class="btn" onclick="location.href='/lab'">Lab</button>
      </div>
    </div>

    <nav class="tabs" aria-label="LazyBrain sections">
      <button class="tab" data-page-button="setup">Setup</button>
      <button class="tab active" data-page-button="route">Agent Workbench</button>
      <button class="tab" data-page-button="adoption">Adoption Review</button>
      <button class="tab" data-page-button="capability">Capability Map</button>
      <button class="tab" data-page-button="diagnostics">Diagnostics</button>
    </nav>

    <section class="page" data-page="setup">
      <section class="cards">
        <div class="card">
          <div class="label">Product ready</div>
          <div class="state" id="productState">Loading</div>
          <div class="detail" id="productDetail">读取 /api/status</div>
        </div>
        <div class="card">
          <div class="label">Hook safe</div>
          <div class="state" id="hookState">Loading</div>
          <div class="detail" id="hookDetail">读取 hook runtime</div>
        </div>
        <div class="card">
          <div class="label">GitNexus</div>
          <div class="state" id="gitnexusState">Loading</div>
          <div class="detail" id="gitnexusDetail">读取 GitNexus freshness</div>
        </div>
      </section>
    </section>

    <section class="page active" data-page="route">
      <section class="grid">
        <div class="panel">
          <h2>Agent Workbench</h2>
          <div id="hookAutoCard" class="notice">读取 Hook 自动建议状态。</div>
          <div class="actions mt">
            <button class="btn" data-example="review this change for regressions">Review change</button>
            <button class="btn" data-example="fix failing tests and prepare evidence">Fix tests</button>
            <button class="btn" data-example="检查公开安装 hook 的隐私和回滚风险">Hook risk</button>
          </div>
          <textarea id="query" class="textarea" maxlength="2000" placeholder="描述任务，例如：审查这个 PR 有没有回归风险"></textarea>
          <div class="actions mt">
            <select id="target" class="select">
              <option value="claude">Claude</option>
              <option value="codex">Codex</option>
              <option value="cursor">Cursor</option>
              <option value="generic">Generic</option>
            </select>
            <button class="btn primary" id="runRoute">分析任务 / Analyze</button>
            <button class="btn" id="clearRoute">清空</button>
          </div>
          <div class="panel mt route-result" id="routeOutput">等待输入。</div>
        </div>

        <div class="panel">
          <h2>Runtime</h2>
          <div class="row"><div>Recommendation quality</div><div id="compileText">Loading</div><span class="badge" id="compileBadge">...</span></div>
          <div class="row"><div>Semantic index</div><div id="embeddingText">Loading</div><span class="badge" id="embeddingBadge">...</span></div>
          <div class="row"><div>Diagnostics</div><div id="diagnosticsText">Loading</div><span class="badge" id="diagnosticsBadge">...</span></div>
          <div class="actions mt">
            <button class="btn" id="compile">Refresh recommendations</button>
            <button class="btn" id="rebuild">Rebuild semantic index</button>
            <button class="btn" id="testApis">Test APIs</button>
          </div>
        </div>
      </section>
    </section>

    <section class="page" data-page="adoption">
      <div class="split">
        <div class="panel">
          <h2>Adoption Review</h2>
          <div id="adoptionSummary" class="list">Loading</div>
        </div>
        <div class="panel">
          <h2>Recent Routes</h2>
          <div id="recentRoutes" class="list">Loading</div>
        </div>
      </div>
    </section>

    <section class="page" data-page="capability">
      <div class="split">
        <div class="panel">
          <h2>Capability Map</h2>
          <div id="capabilitySummary" class="list">Loading</div>
        </div>
        <div class="panel">
          <h2>Top Capabilities</h2>
          <div id="capabilityNodes" class="list">Loading</div>
        </div>
      </div>
    </section>

    <section class="page" data-page="diagnostics">
      <div class="panel">
        <h2>Diagnostics</h2>
        <div id="diagnostics" class="mono">Loading</div>
      </div>
    </section>
  </main>

  <script>
    function byId(id) { return document.getElementById(id); }
    function cls(ok, warn) { return ok ? 'ok' : warn ? 'warn' : 'err'; }
    function text(value, fallback) {
      if (value === undefined || value === null || value === '') return fallback || '-';
      return String(value);
    }
    function escapeHtml(value) {
      return text(value, '').replace(/[&<>"']/g, function(ch) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
      });
    }
    function pct(value) {
      return Math.round(Number(value || 0) * 100) + '%';
    }
    function detailList(items) {
      if (!items || !items.length) return '';
      return '<ul class="route-list">' + items.map(function(item) {
        return '<li>' + escapeHtml(item) + '</li>';
      }).join('') + '</ul>';
    }
    function choiceList(choices) {
      if (!choices || !choices.length) return '<div class="muted">没有备选路线。</div>';
      return choices.slice(0, 5).map(function(choice) {
        return '<div class="choice-row"><div><strong>' + escapeHtml(choice.label) + '</strong><div class="muted">' +
          escapeHtml(choice.kind) + ' · ' + escapeHtml(choice.reason) + '</div></div><span class="badge">' +
          pct(choice.confidence) + '</span></div>';
      }).join('');
    }
    function titledList(title, items, fallback) {
      var safeItems = (items || []).filter(Boolean).slice(0, 6);
      return '<div class="choice-row"><div><strong>' + escapeHtml(title) + '</strong>' +
        (safeItems.length ? detailList(safeItems) : '<div class="muted">' + escapeHtml(fallback || '-') + '</div>') +
        '</div></div>';
    }
    function kvItem(label, value, detail) {
      return '<div class="item"><strong>' + escapeHtml(label) + '</strong><div>' + escapeHtml(value) + '</div>' +
        (detail ? '<div class="muted">' + escapeHtml(detail) + '</div>' : '') + '</div>';
    }
    function countItems(counts) {
      var entries = Object.entries(counts || {}).sort(function(a, b) { return Number(b[1]) - Number(a[1]); });
      if (!entries.length) return '<div class="muted">No data.</div>';
      return entries.slice(0, 8).map(function(entry) {
        return kvItem(entry[0], String(entry[1]), '');
      }).join('');
    }
    function renderRecentEvents(events) {
      if (!events || !events.length) return '<div class="muted">No recent route events yet.</div>';
      return events.slice(0, 8).map(function(event) {
        var title = [event.mode, event.combo || event.intent || 'route'].filter(Boolean).join(' · ');
        var detail = [
          'source ' + text(event.source, '-'),
          'target ' + text(event.target, '-'),
          'choice ' + text(event.recommendedChoice && event.recommendedChoice.label, '-'),
          event.adoptionAction ? 'action ' + event.adoptionAction : '',
          event.receiptOutcome ? 'receipt ' + event.receiptOutcome : ''
        ].filter(Boolean).join(' · ');
        return kvItem(title, event.timestamp || '-', detail);
      }).join('');
    }
    function renderAdoption(status, diagnostics) {
      var adoption = (((status.recommendationQuality || {}).adoption) || {});
      var execution = (((status.recommendationQuality || {}).execution) || {});
      var total = Number(adoption.total || 0);
      var adopted = Number(adoption.adoptedCount || 0);
      var rate = total > 0 ? Math.round((adopted / total) * 100) : 0;
      byId('adoptionSummary').innerHTML = [
        kvItem('Adoption rate', rate + '%', adopted + ' adopted / ' + total + ' route events'),
        kvItem('Execution rate', text(execution.executionRate, '0') + '%', text(execution.executedCount, '0') + ' executed / ' + text(execution.verifiedCount, '0') + ' verified'),
        kvItem('Last receipt', text(execution.lastReceiptOutcome, '-'), text(execution.lastWorkRole, '-')),
        kvItem('Last event', text(adoption.lastEventAt, '-'), ''),
        '<div class="item"><strong>Actions</strong>' + countItems(adoption.actions || {}) + '</div>',
        '<div class="item"><strong>Receipt outcomes</strong>' + countItems(execution.outcomes || {}) + '</div>',
        '<div class="item"><strong>Feedback reasons</strong>' + countItems(adoption.feedbackReasons || {}) + '</div>'
      ].join('');
      byId('recentRoutes').innerHTML = renderRecentEvents(diagnostics.recentEvents || []);
    }
    function renderCapability(status, graphView) {
      var graph = status.graph || {};
      var embedding = status.embedding || {};
      var nodes = graphView.nodes || [];
      byId('capabilitySummary').innerHTML = [
        kvItem('Capabilities', text(graph.nodes, '0'), 'Known capability graph nodes'),
        kvItem('Semantic index', text(embedding.covered, '0') + '/' + text(embedding.active, '0'), text(embedding.state, 'unknown')),
        '<div class="item"><strong>By kind</strong>' + countItems(graph.byKind || {}) + '</div>',
        '<div class="item"><strong>By category</strong>' + countItems(graph.byCategory || {}) + '</div>'
      ].join('');
      byId('capabilityNodes').innerHTML = nodes.length
        ? nodes.slice(0, 12).map(function(node) {
          return kvItem(node.name, node.kind + ' · ' + node.category, node.origin);
        }).join('')
        : '<div class="muted">No graph nodes loaded.</div>';
    }
    async function api(path, options) {
      const res = await fetch(path, options);
      const json = await res.json().catch(function() { return {}; });
      if (!res.ok) throw new Error(json.error || json.message || res.statusText);
      return json;
    }
    function setState(id, value, tone) {
      var node = byId(id);
      node.textContent = value;
      node.className = 'state ' + (tone || '');
    }
    function summarizeReady(status) {
      var product = status.product || {};
      var ready = status.readiness || {};
      var productOk = product.state === 'READY' || (status.ok === true && ready.state === 'READY');
      setState('productState', productOk ? 'READY' : 'NOT READY', productOk ? 'ok' : 'warn');
      byId('productDetail').textContent = [
        'Graph nodes: ' + text(status.graph && status.graph.nodes, '0'),
        'Embedding: ' + text(status.embedding && status.embedding.state, 'unknown'),
        product.blockers && product.blockers.length ? 'Blockers: ' + product.blockers.slice(0, 2).join('; ') : 'Route/MCP usable.'
      ].join('\\n');

      var hook = status.hook || {};
      var quality = status.recommendationQuality || {};
      var delivery = quality.delivery || {};
      var breaker = hook.breakerOpen === true;
      setState('hookState', breaker ? 'UNSAFE' : 'SAFE', breaker ? 'warn' : 'ok');
      byId('hookDetail').textContent = [
        'Active: ' + text(hook.activeRuns, '0'),
        'Hung: ' + text(hook.hungRuns, '0'),
        'p95: ' + text(hook.p95DurationMs, '-') + 'ms',
        delivery.recoveryAction ? 'Recovery: ' + delivery.recoveryAction : 'Delivery: ' + text(delivery.state, 'ready')
      ].join('\\n');

      var gnx = status.gitNexus || {};
      var current = gnx.state === 'current' || gnx.status === 'current' || gnx.current === true;
      var stale = gnx.state === 'stale' || gnx.status === 'stale' || gnx.current === false;
      setState('gitnexusState', current ? 'CURRENT' : stale ? 'STALE' : 'UNKNOWN', current ? 'ok' : stale ? 'warn' : '');
      byId('gitnexusDetail').textContent = [
        'Repo: ' + text(gnx.repo, 'lazy-brain'),
        'Commit: ' + text(gnx.commit || gnx.indexedCommit, '-'),
        'Source: diagnostics only.'
      ].join('\\n');
    }
    async function loadStatus() {
      var status = await api('/api/status');
      summarizeReady(status);
      var compile = await api('/api/compile/status').catch(function(err) { return { error: err.message }; });
      var statusQuality = status.recommendationQuality || {};
      var freshness = statusQuality.freshness || {};
      byId('compileText').textContent = compile.error || ('freshness ' + text(freshness.state, 'unknown') + ' · compile ' + text(compile.phase, 'idle'));
      byId('compileBadge').textContent = compile.running ? 'running' : text(freshness.state || compile.state, 'idle');

      var embedding = await api('/api/embeddings/status').catch(function(err) { return { error: err.message }; });
      byId('embeddingText').textContent = embedding.error || (text(embedding.covered, '0') + '/' + text(embedding.active, '0') + ' covered');
      byId('embeddingBadge').textContent = embedding.error ? 'error' : text(embedding.state, 'unknown');

      var diagnostics = await api('/api/diagnostics').catch(function(err) { return { error: err.message }; });
      var graphView = await api('/api/graph?limit=24').catch(function(err) { return { error: err.message, nodes: [] }; });
      byId('diagnosticsText').textContent = diagnostics.error || ('hook active ' + text(diagnostics.hook && diagnostics.hook.activeRuns, '0'));
      byId('diagnosticsBadge').textContent = diagnostics.error ? 'error' : 'ok';
      byId('diagnostics').textContent = JSON.stringify(diagnostics, null, 2);
      renderHookAutoCard(status, diagnostics);
      renderAdoption(status, diagnostics);
      renderCapability(status, graphView);
    }
    function renderHookAutoCard(status, diagnostics) {
      var hook = status.hook || {};
      var delivery = ((status.recommendationQuality || {}).delivery) || {};
      var readiness = status.readiness || {};
      var project = (hook.scopes || []).find(function(scope) { return scope.scope === 'project'; }) || {};
      var hookInstalled = Boolean(project.installed);
      var state = delivery.state || (hook.breakerOpen ? 'degraded' : 'ready');
      var warnings = (readiness.warnings || []).filter(function(item) { return /hook|Hook|slow-duration|statusline|host load/.test(item); });
      var recentHook = ((diagnostics.recentEvents || []).find(function(event) { return event.source === 'hook-gate'; }) || {});
      var line = hookInstalled
        ? ('Hook automatic: ' + state + ' · avg ' + text(delivery.avgDurationMs, '0') + 'ms · p95 ' + text(delivery.p95DurationMs, '0') + 'ms')
        : 'Hook automatic: not installed';
      var details = [
        line,
        recentHook.eventId ? ('Last hook recommendation: ' + text(recentHook.combo || recentHook.mode, '-') + ' · ' + text(recentHook.receiptOutcome, 'shown')) : 'Last hook recommendation: none',
        delivery.recoveryAction ? ('Recovery: ' + delivery.recoveryAction) : '',
        warnings[0] ? ('Warning: ' + warnings[0]) : ''
      ].filter(Boolean);
      byId('hookAutoCard').textContent = details.join('\\n');
    }
    function renderRoute(route) {
      var rec = route.recommendation || {};
      var analysis = rec.analysis || {};
      var work = rec.workEnvelope || route.workEnvelope || rec.workPlan || {};
      var receipt = work.receiptPolicy || rec.receiptPolicy || {};
      var user = rec.userLane || {};
      var agent = rec.agentLane || {};
      var recommended = route.choices && route.choices.recommended || {};
      var eventId = rec.eventId || '';
      byId('routeOutput').innerHTML = [
        '<div class="route-card">',
          '<div class="label">Agent Workbench</div>',
          '<h3>' + escapeHtml((work.role || 'agent').toUpperCase()) + ' · ' + escapeHtml(work.objective || analysis.objective || route.intent || byId('query').value) +
            ' <span class="badge">' + escapeHtml(analysis.contextReadiness || 'unknown') + '</span></h3>',
          '<p>' + escapeHtml(work.roleReason || 'LazyBrain selected the next agent lane for this task.') + '</p>',
          titledList('Active step', [work.activeStep || analysis.userNextStep], 'No active step.'),
          titledList('Allowed scope', work.allowedScope || [], 'No scope restriction listed.'),
          titledList('Verify', work.verify || analysis.verification, 'No verification listed.'),
          titledList('Stop if', work.stopIf || [], 'No stop condition listed.'),
          titledList('Receipt required', receipt.requiredFields || [], 'No receipt policy listed.'),
        '</div>',
        '<div class="route-card">',
          '<div class="label">Agent Analysis</div>',
          '<h3>' + escapeHtml(analysis.objective || route.intent || byId('query').value) +
            ' <span class="badge">' + escapeHtml(analysis.contextReadiness || 'unknown') + '</span></h3>',
          '<p>' + escapeHtml((analysis.taskType || route.scenario || 'task') + ' · ' + (analysis.executionMode || route.mode || 'route_plan')) + '</p>',
          titledList('Reasoning', analysis.reasoning || [route.whyRoute], 'No reasoning available.'),
          titledList('Context gaps', analysis.contextGaps || route.contextNeeded, 'No missing context detected.'),
          titledList('Risks and guardrails', analysis.risks || [], 'No route risk detected.'),
          titledList('Done when', analysis.doneWhen || route.doneWhen, 'No done condition listed.'),
        '</div>',
        '<div class="route-card">',
          '<div class="label">User recommendation</div>',
          '<h3>' + escapeHtml(user.title || recommended.label || route.intent) + ' <span class="badge">' + pct(rec.confidence || recommended.confidence) + '</span></h3>',
          '<p>' + escapeHtml(user.summary || route.whyRoute || '-') + '</p>',
          '<p><strong>Action:</strong> ' + escapeHtml(user.primaryAction || route.entryCommand || '-') + '</p>',
          detailList(user.details || []),
        '</div>',
        '<div class="route-card">',
          '<div class="label">Model recommendation</div>',
          '<h3>' + escapeHtml(agent.title || 'Agent lane') + '</h3>',
          '<p>' + escapeHtml(agent.summary || '-') + '</p>',
          detailList(agent.details || []),
          '<div class="copybox" id="copyablePrompt">' + escapeHtml(rec.copyablePrompt || agent.primaryAction || '') + '</div>',
        '</div>',
        '<div class="route-card">',
          '<div class="label">Alternatives</div>',
          choiceList(rec.alternatives || (route.choices && route.choices.alternatives) || []),
        '</div>',
        '<div class="route-card">',
          '<div class="label">Freshness and feedback</div>',
          '<p>' + escapeHtml((rec.freshness && rec.freshness.message) || 'Current route result.') + '</p>',
          titledList('Receipt proof signals', receipt.proofSignals || [], 'No proof signals yet.'),
          rec.degradeLevel && rec.degradeLevel !== 'none' ? '<p><strong>Degraded:</strong> ' + escapeHtml(rec.degradeReason || rec.degradeLevel) + '</p>' : '',
          rec.recoveryAction ? '<p><strong>Recovery:</strong> ' + escapeHtml(rec.recoveryAction) + '</p>' : '',
          '<div class="actions">',
            '<button class="btn" data-route-action="accepted" ' + (eventId ? '' : 'disabled') + '>Accept</button>',
            '<button class="btn" data-route-action="copied" ' + (eventId ? '' : 'disabled') + '>Copy prompt</button>',
            '<button class="btn" data-route-action="ignored" ' + (eventId ? '' : 'disabled') + '>Ignore</button>',
            '<button class="btn" data-route-action="wrong" ' + (eventId ? '' : 'disabled') + '>Wrong</button>',
            '<button class="btn" data-receipt-outcome="executed" ' + (eventId ? '' : 'disabled') + '>Executed</button>',
            '<button class="btn" data-receipt-outcome="verified" ' + (eventId ? '' : 'disabled') + '>Verified</button>',
            '<button class="btn" data-receipt-outcome="blocked" ' + (eventId ? '' : 'disabled') + '>Blocked</button>',
          '</div>',
          '<div class="feedback" id="routeFeedback">' + (eventId ? 'Event ' + escapeHtml(eventId) : 'No adoption event for this route.') + '</div>',
        '</div>'
      ].join('');
      byId('routeOutput').dataset.eventId = eventId;
      byId('routeOutput').dataset.choiceId = (recommended && recommended.id) || '';
      byId('routeOutput').dataset.target = route.target || byId('target').value;
      byId('routeOutput').dataset.role = work.role || '';
      byId('routeOutput').dataset.phase = work.phase || '';
      byId('routeOutput').dataset.verify = JSON.stringify(work.verify || []);
      byId('routeOutput').dataset.proofSignals = JSON.stringify(receipt.proofSignals || []);
    }
    async function runRoute() {
      var query = byId('query').value.trim();
      if (!query) {
        byId('routeOutput').textContent = '请输入任务。';
        return;
      }
      byId('runRoute').disabled = true;
      byId('routeOutput').textContent = 'Routing...';
      try {
        var route = await api('/api/route', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: query, target: byId('target').value })
        });
        renderRoute(route);
        await loadStatus();
      } catch (error) {
        byId('routeOutput').textContent = 'Error: ' + error.message;
      } finally {
        byId('runRoute').disabled = false;
      }
    }
    async function post(path, body) {
      return api(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
      });
    }
    byId('refresh').onclick = loadStatus;
    function setPage(page) {
      document.querySelectorAll('[data-page]').forEach(function(node) {
        node.classList.toggle('active', node.getAttribute('data-page') === page);
      });
      document.querySelectorAll('[data-page-button]').forEach(function(node) {
        node.classList.toggle('active', node.getAttribute('data-page-button') === page);
      });
    }
    document.querySelectorAll('[data-page-button]').forEach(function(button) {
      button.addEventListener('click', function() {
        setPage(button.getAttribute('data-page-button') || 'route');
      });
    });
    document.querySelectorAll('[data-example]').forEach(function(button) {
      button.addEventListener('click', function() {
        byId('query').value = button.getAttribute('data-example') || '';
      });
    });
    byId('runRoute').onclick = runRoute;
    byId('clearRoute').onclick = function() {
      byId('query').value = '';
      byId('routeOutput').textContent = '等待输入。';
    };
    byId('routeOutput').onclick = async function(event) {
      var button = event.target && event.target.closest ? event.target.closest('[data-route-action]') : null;
      var receiptButton = event.target && event.target.closest ? event.target.closest('[data-receipt-outcome]') : null;
      if (!button && !receiptButton) return;
      var eventId = byId('routeOutput').dataset.eventId;
      if (!eventId) return;
      var action = button ? button.getAttribute('data-route-action') : '';
      if (action === 'copied') {
        var prompt = byId('copyablePrompt') ? byId('copyablePrompt').textContent : '';
        try { await navigator.clipboard.writeText(prompt || ''); } catch {}
      }
      if (button) {
        await post('/api/route/adoption', {
          eventId: eventId,
          action: action,
          target: byId('routeOutput').dataset.target,
          choiceId: byId('routeOutput').dataset.choiceId,
          reason: action === 'wrong' ? 'wrong_skill' : undefined
        });
      }
      var outcome = receiptButton ? receiptButton.getAttribute('data-receipt-outcome') : ({ accepted: 'accepted', copied: 'copied', ignored: 'ignored', wrong: 'wrong' })[action || ''];
      await post('/api/route/receipt', {
        eventId: eventId,
        outcome: outcome,
        role: byId('routeOutput').dataset.role,
        phase: byId('routeOutput').dataset.phase,
        target: byId('routeOutput').dataset.target,
        choiceId: byId('routeOutput').dataset.choiceId,
        proofSignals: JSON.parse(byId('routeOutput').dataset.proofSignals || '[]'),
        verification: JSON.parse(byId('routeOutput').dataset.verify || '[]')
      });
      byId('routeFeedback').textContent = 'Recorded: ' + (outcome || action);
      await loadStatus();
    };
    byId('compile').onclick = async function() {
      byId('compileText').textContent = 'starting';
      await post('/api/compile');
      await loadStatus();
    };
    byId('rebuild').onclick = async function() {
      byId('embeddingText').textContent = 'queued';
      await post('/api/embeddings/rebuild', { confirm: 'rebuild' });
      await loadStatus();
    };
    byId('testApis').onclick = async function() {
      byId('diagnostics').textContent = JSON.stringify(await post('/api/test', {}), null, 2);
    };
    loadStatus().catch(function(error) {
      byId('diagnostics').textContent = 'Failed to load: ' + error.message;
    });
  </script>
</body>
</html>`;
