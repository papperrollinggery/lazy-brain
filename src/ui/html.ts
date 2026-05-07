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
      .top, .grid, .cards { display: block; }
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
        <div class="muted">只显示已闭环能力：route、MCP、compile、embedding、ready、diagnostics。</div>
      </div>
      <div class="actions">
        <button class="btn" id="refresh">刷新 / Refresh</button>
        <button class="btn" onclick="location.href='/lab'">Lab</button>
      </div>
    </div>

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

    <section class="grid">
      <div class="panel">
        <h2>Route</h2>
        <textarea id="query" class="textarea" maxlength="2000" placeholder="描述任务，例如：审查这个 PR 有没有回归风险"></textarea>
        <div class="actions mt">
          <select id="target" class="select">
            <option value="claude">Claude</option>
            <option value="codex">Codex</option>
            <option value="cursor">Cursor</option>
            <option value="generic">Generic</option>
          </select>
          <button class="btn primary" id="runRoute">获取路由 / Route</button>
          <button class="btn" id="clearRoute">清空</button>
        </div>
        <div class="panel mt mono" id="routeOutput">等待输入。</div>
      </div>

      <div class="panel">
        <h2>Runtime</h2>
        <div class="row"><div>Compile</div><div id="compileText">Loading</div><span class="badge" id="compileBadge">...</span></div>
        <div class="row"><div>Embedding</div><div id="embeddingText">Loading</div><span class="badge" id="embeddingBadge">...</span></div>
        <div class="row"><div>Diagnostics</div><div id="diagnosticsText">Loading</div><span class="badge" id="diagnosticsBadge">...</span></div>
        <div class="actions mt">
          <button class="btn" id="compile">Compile</button>
          <button class="btn" id="rebuild">Rebuild embeddings</button>
          <button class="btn" id="testApis">Test APIs</button>
        </div>
      </div>
    </section>

    <section class="grid">
      <div class="panel">
        <h2>Recent Route Events</h2>
        <div id="events" class="mono">Loading</div>
      </div>
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
      var breaker = hook.breakerOpen === true;
      setState('hookState', breaker ? 'UNSAFE' : 'SAFE', breaker ? 'warn' : 'ok');
      byId('hookDetail').textContent = [
        'Active: ' + text(hook.activeRuns, '0'),
        'Hung: ' + text(hook.hungRuns, '0'),
        'p95: ' + text(hook.p95DurationMs, '-') + 'ms'
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
      byId('compileText').textContent = compile.error || text(compile.phase, 'idle');
      byId('compileBadge').textContent = compile.running ? 'running' : text(compile.state, 'idle');

      var embedding = await api('/api/embeddings/status').catch(function(err) { return { error: err.message }; });
      byId('embeddingText').textContent = embedding.error || (text(embedding.covered, '0') + '/' + text(embedding.active, '0') + ' covered');
      byId('embeddingBadge').textContent = embedding.error ? 'error' : text(embedding.state, 'unknown');

      var diagnostics = await api('/api/diagnostics').catch(function(err) { return { error: err.message }; });
      byId('diagnosticsText').textContent = diagnostics.error || ('hook active ' + text(diagnostics.hook && diagnostics.hook.activeRuns, '0'));
      byId('diagnosticsBadge').textContent = diagnostics.error ? 'error' : 'ok';
      byId('diagnostics').textContent = JSON.stringify(diagnostics, null, 2);

      var events = await api('/api/route-events?limit=8').catch(function(err) { return { error: err.message, events: [] }; });
      byId('events').textContent = events.error || (events.events && events.events.length ? events.events.map(function(ev) {
        return [
          text(ev.createdAt || ev.ts, '-'),
          text(ev.source, 'route'),
          text(ev.combo || ev.mode, '-'),
          text(ev.intent, '-')
        ].join(' | ');
      }).join('\\n') : 'No route events yet.');
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
        byId('routeOutput').textContent = JSON.stringify({
          mode: route.mode,
          intent: route.intent,
          combo: route.combo || null,
          recommended: route.choices && route.choices.recommended,
          routeEventId: route.routeEventId || null,
          warnings: route.warnings || [],
          unlockWarnings: route.unlockWarnings || []
        }, null, 2);
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
    byId('runRoute').onclick = runRoute;
    byId('clearRoute').onclick = function() {
      byId('query').value = '';
      byId('routeOutput').textContent = '等待输入。';
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
