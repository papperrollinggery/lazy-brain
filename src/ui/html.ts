export const UI_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LazyBrain 管理面板</title>
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
    .btn-sm { padding: 6px 12px; font-size: 13px; }

    /* ─── Layout ───────────────────────────────────────────────── */
    .page { max-width: 960px; margin: 0 auto; padding: 32px 24px 64px; }

    /* ─── Hero / Status ────────────────────────────────────────── */
    .hero {
      text-align: center; padding: 48px 24px 40px;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); box-shadow: var(--shadow);
      margin-bottom: 20px;
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
    .section-header .collapse-arrow {
      font-size: 12px; color: var(--text-3); transition: transform 200ms;
    }
    .section.collapsed .collapse-arrow { transform: rotate(-90deg); }
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

    /* ─── Config Section ───────────────────────────────────────── */
    .config-group { margin-bottom: 20px; }
    .config-group:last-child { margin-bottom: 0; }
    .config-group-title {
      font-weight: 600; font-size: 14px; margin-bottom: 10px;
      padding-bottom: 6px; border-bottom: 1px solid var(--border-light);
    }
    .config-row {
      display: flex; align-items: center; gap: 12px;
      padding: 7px 0; min-height: 36px;
    }
    .config-label {
      font-size: 13px; color: var(--text-2); min-width: 80px; flex-shrink: 0;
    }
    .config-value {
      flex: 1; font-size: 14px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .config-edit-btn {
      flex-shrink: 0; padding: 2px 10px; border-radius: var(--radius-sm);
      font: inherit; font-size: 12px; cursor: pointer;
      border: 1px solid var(--border); background: transparent; color: var(--brand);
      transition: all 120ms;
    }
    .config-edit-btn:hover { background: var(--brand-light); border-color: var(--brand); }
    .config-input {
      flex: 1; min-width: 120px;
      padding: 6px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm);
      font: inherit; font-size: 14px; background: var(--bg); color: var(--text);
    }
    .config-input:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 2px var(--brand-light); }
    .config-textarea {
      flex: 1; min-width: 200px; max-width: 100%;
      padding: 8px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm);
      font: 13px/1.4 var(--font-mono); background: var(--bg); color: var(--text);
      resize: vertical;
    }
    .config-textarea:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 2px var(--brand-light); }
    .config-select {
      flex: 1; min-width: 120px;
      padding: 6px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm);
      font: inherit; font-size: 14px; background: var(--bg); color: var(--text);
      cursor: pointer;
    }
    .config-select:focus { outline: none; border-color: var(--brand); }
    .config-actions {
      display: flex; gap: 6px; flex-shrink: 0;
    }
    .config-save-btn {
      padding: 4px 12px; border-radius: var(--radius-sm);
      font: inherit; font-size: 13px; font-weight: 600; cursor: pointer;
      border: 1px solid var(--text); background: var(--text); color: var(--bg);
    }
    .config-save-btn:hover { opacity: 0.85; }
    .config-cancel-btn {
      padding: 4px 12px; border-radius: var(--radius-sm);
      font: inherit; font-size: 13px; cursor: pointer;
      border: 1px solid var(--border); background: var(--surface); color: var(--text-2);
    }
    .config-cancel-btn:hover { background: var(--surface-hover); }
    .config-unset { color: var(--text-3); font-style: italic; }

    /* ─── Diagnostics ──────────────────────────────────────────── */
    .diag-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px;
    }
    .diag-card {
      border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 14px;
    }
    .diag-card h4 { font-size: 14px; font-weight: 600; margin-bottom: 10px; }
    .diag-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
    .diag-row .diag-val { font-weight: 600; }
    .match-list { margin-top: 16px; }
    .match-entry {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 8px 0; border-bottom: 1px solid var(--border-light); font-size: 13px;
    }
    .match-entry:last-child { border-bottom: 0; }
    .match-entry .mq { color: var(--text); font-weight: 500; }
    .match-entry .mm { color: var(--text-3); font-size: 12px; }

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

    /* ─── Toast ────────────────────────────────────────────────── */
    .toast-container {
      position: fixed; top: 16px; right: 16px; z-index: 999;
      display: flex; flex-direction: column; gap: 8px; pointer-events: none;
    }
    .toast {
      padding: 10px 16px; border-radius: var(--radius-sm); font-size: 14px; font-weight: 500;
      box-shadow: var(--shadow-lg); pointer-events: auto;
      transition: opacity 200ms, transform 200ms;
      max-width: 380px;
    }
    .toast.success { background: var(--ok-bg); color: var(--ok); border: 1px solid var(--ok-border); }
    .toast.error { background: var(--err-bg); color: var(--err); border: 1px solid var(--err-border); }

    /* ─── Misc ─────────────────────────────────────────────────── */
    .text-ok { color: var(--ok); }
    .text-warn { color: var(--warn); }
    .text-err { color: var(--err); }
    .text-2 { color: var(--text-2); }
    .text-3 { color: var(--text-3); }
    .mt-sm { margin-top: 10px; }
    .mt-md { margin-top: 16px; }
    .gap-sm { display: flex; gap: 8px; flex-wrap: wrap; }
    .filter-row { display: flex; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; }
    .filter-row input {
      flex: 1; min-width: 160px; padding: 8px 12px; border: 1px solid var(--border);
      border-radius: var(--radius-sm); font: inherit; font-size: 14px;
      background: var(--bg); color: var(--text);
    }
    .filter-row input:focus { outline: none; border-color: var(--brand); box-shadow: 0 0 0 2px var(--brand-light); }
    .filter-row select {
      border: 1px solid var(--border); border-radius: var(--radius-sm);
      padding: 8px 12px; font: inherit; font-size: 14px;
      background: var(--surface); color: var(--text); cursor: pointer;
    }
    .filter-row select:focus { outline: none; border-color: var(--brand); }
    pre.code-block {
      background: var(--bg); border: 1px solid var(--border);
      border-radius: var(--radius-sm); padding: 14px;
      font: 13px/1.5 var(--font-mono); overflow-x: auto;
      white-space: pre-wrap; word-break: break-all;
    }
    details summary { cursor: pointer; font-weight: 600; font-size: 14px; padding: 4px 0; }
    details summary:hover { color: var(--brand); }

    /* ─── Responsive ───────────────────────────────────────────── */
    @media (max-width: 680px) {
      .stats-row { grid-template-columns: repeat(2, 1fr); }
      .tool-grid { grid-template-columns: 1fr; }
      .diag-grid { grid-template-columns: 1fr; }
      .hero { padding: 32px 16px 28px; }
      .topbar { padding: 12px 16px; }
      .page { padding: 20px 12px 48px; }
      .config-row { flex-wrap: wrap; }
      .config-label { min-width: 70px; }
      .config-input { min-width: 100px; }
    }
    /* ─── Graph Visualization ──────────────────────────────── */
    #graphContainer { width: 100%; height: 520px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg); position: relative; overflow: hidden; }
    #graphContainer canvas { border-radius: var(--radius-sm); }
    .graph-legend { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 10px; font-size: 12px; color: var(--text-2); }
    .graph-legend span { display: inline-flex; align-items: center; gap: 5px; }
    .graph-legend .dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  </style>
  <script src="/cytoscape.min.js"></script>
</head>
<body>
  <div class="topbar">
    <div class="logo">
      <div class="logo-icon">LB</div>
      <h1>LazyBrain <span id="version" class="text-3" style="font-weight:400;font-size:13px"></span></h1>
    </div>
    <div class="topbar-right">
      <span id="globalStatus" class="status-dot" title="检测中..."></span>
      <button class="btn btn-sm" id="refreshBtn">刷新</button>
      <button class="btn btn-sm" onclick="location.href='/lab'">实验室</button>
    </div>
  </div>

  <div class="page">

    <!-- Section A: 状态概览 -->
    <div class="hero" id="hero">
      <div class="hero-icon">LB</div>
      <h2 id="heroTitle">检测状态中...</h2>
      <p id="heroDesc">正在加载 LazyBrain 配置</p>
      <div id="heroBadge"></div>
    </div>

    <div class="stats-row" id="statsRow"></div>

    <!-- Section B: 试试看 (always visible) -->
    <div class="section" id="trySection">
      <div class="section-header" style="cursor:default">
        <h3>试试看</h3>
        <span class="text-3" style="font-size:13px">输入任务描述，查看 LazyBrain 推荐结果</span>
      </div>
      <div class="section-body">
        <div class="try-input">
          <input id="queryInput" type="text" placeholder="描述你想做的事情，例如：审查这个 PR 有没有 bug"
                 autocomplete="off" />
          <button class="btn btn-primary" id="runRoute">获取推荐</button>
        </div>
        <div class="try-suggestions" id="suggestions">
          <button data-q="帮我审查这个 PR 代码质量">审查 PR</button>
          <button data-q="生产环境出现了一个 bug 需要调试">调试 bug</button>
          <button data-q="写一个 REST API 接口">写 API</button>
          <button data-q="优化数据库查询性能">优化查询</button>
          <button data-q="部署到生产环境">部署上线</button>
        </div>
        <div class="try-result" id="tryResult">
          <div class="empty">输入任务描述后点击"获取推荐"</div>
        </div>
      </div>
    </div>

    <!-- Section C: 我的工具 (collapsible, default collapsed) -->
    <div class="section collapsed" id="toolsSection">
      <div class="section-header" onclick="toggleSection(this)">
        <h3>我的工具</h3>
        <span class="text-3" style="font-size:13px" id="toolCount">共 0 个能力</span>
        <span class="collapse-arrow">&#9660;</span>
      </div>
      <div class="section-body">
        <div class="filter-row">
          <input id="toolSearch" type="text" placeholder="搜索工具..." />
          <select id="toolKindFilter">
            <option value="">全部类型</option>
            <option value="skill">Skills</option>
            <option value="agent">Agents</option>
            <option value="command">Commands</option>
          </select>
        </div>
        <div class="tool-grid" id="toolGrid"></div>
      </div>
    </div>

    <!-- Section D: 图谱可视化 -->
    <div class="section collapsed" id="graphSection">
      <div class="section-header" onclick="toggleSection(this)">
        <h3>图谱可视化</h3>
        <span class="text-3" style="font-size:13px">交互式能力关系图，可拖拽缩放</span>
        <span class="collapse-arrow">&#9660;</span>
      </div>
      <div class="section-body">
        <span class="text-3" id="graphInfo" style="display:block;margin-bottom:8px;font-size:12px"></span>
        <div id="graphContainer"></div>
        <div class="graph-legend">
          <span><span class="dot" style="background:#3b82f6"></span> Skill</span>
          <span><span class="dot" style="background:#8b5cf6"></span> Agent</span>
          <span><span class="dot" style="background:#10b981"></span> Command</span>
          <span style="margin-left:8px">连线: ― similar_to  ═ composes_with  -·-· supersedes  → depends_on</span>
        </div>
      </div>
    </div>

    <!-- Section E: API 配置 (collapsible, default NOT collapsed) -->
    <div class="section" id="configSection">
      <div class="section-header" onclick="toggleSection(this)">
        <h3>API 配置</h3>
        <span class="text-3" style="font-size:13px">管理 LLM、Embedding 和路由设置</span>
        <div style="display:flex;gap:8px;margin-left:auto" onclick="event.stopPropagation()">
          <span id="compileStatus" class="text-3" style="font-size:12px;align-self:center"></span>
          <button class="btn btn-sm" id="compileBtn" style="font-size:12px">编译图谱</button>
          <button class="btn btn-sm" id="scanBtn" style="font-size:12px">扫描并编译</button>
        </div>
        <span class="collapse-arrow">&#9660;</span>
      </div>
      <div class="section-body" id="configContent">
        <div class="text-3" style="padding:16px;text-align:center">加载配置中...</div>
      </div>
    </div>

    <!-- Section E: 系统诊断 (collapsible, default collapsed) -->
    <div class="section collapsed" id="diagnosticsSection">
      <div class="section-header" onclick="toggleSection(this)">
        <h3>系统诊断</h3>
        <span class="text-3" style="font-size:13px">Hook 运行时、图谱状态、嵌入缓存</span>
        <span class="collapse-arrow">&#9660;</span>
      </div>
      <div class="section-body">
        <div class="diag-grid" id="diagGrid"></div>
        <div id="diagExtra" class="mt-sm"></div>
      </div>
    </div>

    <!-- Section F: 安装指南 (collapsible, default collapsed) -->
    <div class="section collapsed" id="setupSection">
      <div class="section-header" onclick="toggleSection(this)">
        <h3>安装指南</h3>
        <span class="text-3" style="font-size:13px">将 LazyBrain 接入 Claude Code 的完整步骤</span>
        <span class="collapse-arrow">&#9660;</span>
      </div>
      <div class="section-body">
        <div class="steps" id="steps"></div>
      </div>
    </div>

    <!-- Section G: 高级 (collapsible, default collapsed) -->
    <div class="section collapsed" id="advancedSection">
      <div class="section-header" onclick="toggleSection(this)">
        <h3>高级</h3>
        <span class="text-3" style="font-size:13px">Hook 详情、故障排查、原始配置</span>
        <span class="collapse-arrow">&#9660;</span>
      </div>
      <div class="section-body">
        <div id="hookDetail" class="mt-sm"></div>
        <div id="trouble" class="mt-md"></div>
        <div id="configDump" class="mt-md"></div>
      </div>
    </div>

  </div>

  <div class="toast-container" id="toastContainer"></div>

  <script>
    var state = { status: null, tools: [], diagnostics: null, configEditing: {} };
    var $ = function(id) { return document.getElementById(id); };
    var esc = function(v) {
      return String(v ?? '').replace(/[&<>"']/g, function(c) {
        return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
      });
    };
    var maskKey = function(key) {
      if (!key) return '';
      if (key.length <= 8) return key.slice(0, 4) + '&#9679;&#9679;&#9679;&#9679;';
      return key.slice(0, 4) + '&#9679;&#9679;&#9679;&#9679;' + key.slice(-4);
    };

    function api(url, opts) {
      return fetch(url, opts).then(function(res) {
        if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
        return res.json();
      });
    }

    // ─── Section toggle ──────────────────────────────────────────
    function toggleSection(header) {
      header.parentElement.classList.toggle('collapsed');
      if (header.parentElement.id === 'graphSection' && !header.parentElement.classList.contains('collapsed')) {
        setTimeout(renderGraph, 100);
      }
    }

    // ─── Toast ───────────────────────────────────────────────────
    function showToast(msg, type) {
      var container = $('toastContainer');
      var toast = document.createElement('div');
      toast.className = 'toast ' + (type || 'success');
      toast.textContent = msg;
      container.appendChild(toast);
      setTimeout(function() {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        setTimeout(function() { toast.remove(); }, 250);
      }, 3000);
    }

    // ─── Hero ────────────────────────────────────────────────────
    function renderHero() {
      var s = state.status;
      if (!s) return;
      $('version').textContent = 'v' + s.version;
      var rd = s.readiness;
      var isReady = rd.state === 'READY';
      var hasIssues = rd.blockers && rd.blockers.length > 0;
      var dot = $('globalStatus');
      dot.className = 'status-dot ' + (isReady ? 'ok' : hasIssues ? 'err' : 'warn');

      var title, desc, badgeClass, badgeText;
      if (isReady) {
        title = '一切就绪';
        desc = 'LazyBrain 已准备就绪 —— 工具已索引，路由引擎运行中';
        badgeClass = 'ready';
        badgeText = '就绪';
      } else if (hasIssues) {
        title = '需要配置';
        desc = rd.blockers.join('; ');
        badgeClass = 'error';
        badgeText = rd.blockers.length + ' 个问题';
      } else {
        title = '基本就绪';
        desc = (rd.warnings && rd.warnings.length) ? rd.warnings.join('; ') : '还有几项需要检查';
        badgeClass = 'warning';
        badgeText = '有待完善';
      }
      $('heroTitle').textContent = title;
      $('heroDesc').textContent = desc;
      $('heroBadge').innerHTML = '<span class="state-badge ' + badgeClass + '">' + badgeText + '</span>';
    }

    // ─── Stats ───────────────────────────────────────────────────
    function renderStats() {
      var s = state.status;
      if (!s) return;
      var kinds = Object.entries(s.graph && s.graph.byKind ? s.graph.byKind : {});
      var engine = (s.routing && s.routing.engine) || 'tag';
      var mode = (s.routing && s.routing.mode) || 'off';
      var embOk = s.embedding && s.embedding.state === 'ok';
      var cards = [
        { num: (s.graph && s.graph.nodes) || 0, label: '已索引工具数' },
        { num: kinds.length, label: '能力类型数' },
        { num: engine + ' · ' + mode, label: '路由引擎' },
        { num: embOk ? '正常运行' : '未启用', label: '语义搜索' },
      ];
      var html = '';
      for (var i = 0; i < cards.length; i++) {
        html += '<div class="stat-card"><div class="num">' + esc(String(cards[i].num)) + '</div><div class="label">' + esc(cards[i].label) + '</div></div>';
      }
      $('statsRow').innerHTML = html;
    }

    // ─── Try Router ──────────────────────────────────────────────
    function doRoute(query) {
      $('tryResult').innerHTML = '<div class="empty">思考中...</div>';
      api('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query, target: 'claude' }),
      }).then(function(route) {
        renderRouteResult(route);
      }).catch(function(e) {
        $('tryResult').innerHTML = '<div class="empty text-err">错误: ' + esc(e.message) + '</div>';
      });
    }

    function renderRouteResult(route) {
      if (!route || !route.skills || !route.skills.length) {
        $('tryResult').innerHTML = '<div class="empty">未找到匹配工具。换个查询试试，或先运行 <code>lazybrain scan</code>。</div>';
        return;
      }
      var lines = [];
      if (route.intent) lines.push('<div style="font-weight:600;margin-bottom:10px">' + esc(route.intent) + '</div>');
      if (route.scenario) lines.push('<div class="text-2" style="font-size:13px;margin-bottom:12px">场景: ' + esc(route.scenario) + '</div>');
      for (var i = 0; i < route.skills.length; i++) {
        var sk = route.skills[i];
        var score = Math.round((sk.score || 0) * 100);
        var cls = score >= 80 ? 'high' : score >= 50 ? 'mid' : 'low';
        lines.push(
          '<div class="match-item">' +
          '<div><div class="match-name">/' + esc(sk.name) + '</div>' +
          '<div class="match-detail">' + esc(sk.reason || sk.category || '') + '</div></div>' +
          '<span class="match-score ' + cls + '">' + score + '%</span>' +
          '</div>'
        );
      }
      if (route.tokenStrategy && route.tokenStrategy.summary) {
        lines.push('<div class="text-2 mt-sm" style="font-size:13px">' + esc(route.tokenStrategy.summary) + '</div>');
      }
      if (route.executionPlan && route.executionPlan.length) {
        lines.push('<div class="mt-sm" style="font-weight:600;font-size:13px">建议工作流:</div>');
        lines.push('<ol style="margin:4px 0 0 18px;font-size:13px;color:var(--text-2)">');
        for (var j = 0; j < route.executionPlan.length; j++) {
          lines.push('<li>' + esc(route.executionPlan[j].title) + '</li>');
        }
        lines.push('</ol>');
      }
      $('tryResult').innerHTML = lines.join('');
    }

    // ─── Tools ───────────────────────────────────────────────────
    function renderTools(filter, kindFilter) {
      var tools = state.tools;
      if (filter) {
        var q = filter.toLowerCase();
        tools = tools.filter(function(t) {
          return (t.name || '').toLowerCase().indexOf(q) !== -1 ||
                 (t.category || '').toLowerCase().indexOf(q) !== -1;
        });
      }
      if (kindFilter) tools = tools.filter(function(t) { return t.kind === kindFilter; });
      $('toolCount').textContent = '共 ' + tools.length + ' 个能力';
      if (!tools.length) {
        $('toolGrid').innerHTML = '<div class="text-3" style="padding:32px;text-align:center">未找到匹配工具，先运行 <code>lazybrain scan</code> 扫描工具</div>';
        return;
      }
      var html = '';
      var limit = Math.min(tools.length, 100);
      for (var i = 0; i < limit; i++) {
        var t = tools[i];
        html += '<div class="tool-card">' +
          '<div class="name">' + esc(t.name) + '</div>' +
          '<div class="meta">' +
          '<span class="tool-tag ' + esc(t.kind || '') + '">' + esc(t.kind || '') + '</span>' +
          '<span>' + esc(t.category || '') + '</span>' +
          '<span>' + esc(t.origin || '') + '</span>' +
          '</div></div>';
      }
      $('toolGrid').innerHTML = html;
    }

    // ─── Config ──────────────────────────────────────────────────
    function getCfgVal(path) {
      if (!state.status) return '';
      var parts = path.split('.');
      var obj = state.status.config;
      if (!obj) return '';
      for (var i = 0; i < parts.length; i++) {
        if (obj == null || typeof obj !== 'object') return '';
        obj = obj[parts[i]];
      }
      return (obj != null) ? String(obj) : '';
    }

    function editConfig(key) {
      state.configEditing[key] = true;
      renderConfig();
    }

    function cancelConfig(key) {
      state.configEditing[key] = false;
      renderConfig();
    }

    function isSecretConfigKey(key) {
      return key === 'compileApiKey' || key === 'embeddingApiKey' || key === 'secretaryApiKey';
    }

    function saveConfig(key) {
      var inputId = 'cfg-' + key.replace(/\./g, '-');
      var input = $(inputId);
      if (!input) return;
      var value = input.value.trim();
      if (isSecretConfigKey(key) && value === '') {
        state.configEditing[key] = false;
        renderConfig();
        showToast('API Key 未修改', 'success');
        return;
      }
      var payload = {};
      payload[key] = value;
      api('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).then(function() {
        showToast('配置已保存', 'success');
        state.configEditing[key] = false;
        return api('/api/status');
      }).then(function(status) {
        state.status = status;
        renderConfig();
        renderHero();
        renderStats();
        renderConfig();
        renderDiagnostics();
        renderGraph();
        renderSetup();
        renderAdvanced();
      }).catch(function(e) {
        showToast('保存失败: ' + esc(e.message), 'error');
      });
    }

    function renderConfig() {
      var c = state.status && state.status.config;
      var content = $('configContent');
      if (!c) {
        content.innerHTML = '<div class="text-3" style="padding:16px;text-align:center">暂无配置数据</div>';
        return;
      }

      var groups = [
        {
          title: '编译模型 (Compile LLM)',
          fields: [
            { name: 'compileApiBase', label: 'API 地址', type: 'text', pw: false },
            { name: 'compileApiKey', label: 'API Key', type: 'text', pw: true },
            { name: 'compileModel', label: '模型名', type: 'text', pw: false },
          ],
        },
        {
          title: '嵌入模型 (Embedding)',
          fields: [
            { name: 'embeddingSource', label: '嵌入来源', type: 'select', pw: false, options: ['api', 'custom', 'local'] },
            { name: 'embeddingApiBase', label: 'API 地址', type: 'text', pw: false },
            { name: 'embeddingApiKey', label: 'API Key', type: 'text', pw: true },
            { name: 'embeddingModel', label: '模型名', type: 'text', pw: false },
          ],
        },
        {
          title: '秘书模型 (Secretary)',
          fields: [
            { name: 'secretaryApiBase', label: 'API 地址', type: 'text', pw: false },
            { name: 'secretaryApiKey', label: 'API Key', type: 'text', pw: true },
            { name: 'secretaryModel', label: '模型名', type: 'text', pw: false },
          ],
        },
        {
          title: '路由设置 (Routing)',
          fields: [
            { name: 'engine', label: '路由引擎', type: 'select', pw: false, options: ['tag', 'semantic', 'hybrid', 'llm'] },
            { name: 'strategy', label: '路由策略', type: 'select', pw: false, options: ['always-main', 'optimal', 'ask'] },
          ],
        },
        {
          title: '编译提示词 (Compile Prompts)',
          fields: [
            { name: 'compileSystemPrompt', label: 'System Prompt', type: 'textarea', pw: false, placeholder: 'LLM 系统提示词，控制输出格式' },
            { name: 'compileTagPrompt', label: '标签提示词', type: 'textarea', pw: false, placeholder: '标签生成模板，可用变量: \${name}, \${kind}, \${description}' },
            { name: 'compileRelationPrompt', label: '关系提示词', type: 'textarea', pw: false, placeholder: '关系推理模板，可用变量: \${cap.name}, \${cap.description}, \${neighbors}' },
          ],
        },
      ];

      var html = '';
      for (var g = 0; g < groups.length; g++) {
        var group = groups[g];
        html += '<div class="config-group">';
        html += '<div class="config-group-title">' + esc(group.title) + '</div>';
        for (var f = 0; f < group.fields.length; f++) {
          var field = group.fields[f];
          var val = getCfgVal(field.name);
          var editing = state.configEditing[field.name] || false;
          var inputId = 'cfg-' + field.name.replace(/\./g, '-');

          html += '<div class="config-row">';
          html += '<span class="config-label">' + esc(field.label) + '</span>';

          if (editing) {
            if (field.type === 'select') {
              html += '<select id="' + inputId + '" class="config-select">';
              for (var o = 0; o < field.options.length; o++) {
                var opt = field.options[o];
                html += '<option value="' + esc(opt) + '"' + (val === opt ? ' selected' : '') + '>' + esc(opt) + '</option>';
              }
              html += '</select>';
            } else if (field.type === 'textarea') {
              html += '<textarea id="' + inputId + '" class="config-textarea" placeholder="' + esc(field.placeholder || '') + '" rows="4">' + esc(val) + '</textarea>';
            } else if (field.pw) {
              html += '<input id="' + inputId + '" type="text" class="config-input" placeholder="输入新的 API Key（留空不修改）" />';
            } else {
              html += '<input id="' + inputId + '" type="text" class="config-input" value="' + esc(val) + '" />';
            }
            html += '<div class="config-actions">';
            html += '<button class="config-save-btn" data-key="' + esc(field.name) + '">保存</button>';
            html += '<button class="config-cancel-btn" data-key="' + esc(field.name) + '">取消</button>';
            html += '</div>';
          } else {
            if (field.pw && val) {
              html += '<span class="config-value">' + maskKey(val) + '</span>';
            } else if (field.type === 'textarea' && val) {
              var firstLine = val.split('\n')[0].slice(0, 80);
              html += '<span class="config-value config-prompt-value" title="' + esc(val.slice(0, 500)) + '">' + esc(firstLine) + (val.length > 80 ? '...' : '') + '</span>';
            } else if (val) {
              html += '<span class="config-value" title="' + esc(val) + '">' + esc(val) + '</span>';
            } else {
              html += '<span class="config-value config-unset">未配置</span>';
            }
            html += '<button class="config-edit-btn" data-key="' + esc(field.name) + '">编辑</button>';
          }

          html += '</div>';
        }
        html += '</div>';
      }

      content.innerHTML = html;
    }

    // ─── Graph Visualization ────────────────────────────────────
    var _cy = null;
    function renderGraph() {
      var container = $('graphContainer');
      if (!container || container.offsetParent === null) return;
      if (_cy) { _cy.destroy(); _cy = null; }
      if (typeof cytoscape === 'undefined') return;

      container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-3)">加载图谱数据...</div>';

      var isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      var KIND_COLORS = { skill: '#3b82f6', agent: '#8b5cf6', command: '#10b981', mode: '#f59e0b', hook: '#ef4444' };
      var EDGE_COLOR = isDark ? '#64748b' : '#94a3b8';

      api('/api/graph?limit=500').then(function(data) {
        if (!data || !data.nodes) { container.innerHTML = ''; return; }
        var connectedIds = new Set();
        (data.edges || []).forEach(function(e) { connectedIds.add(e.source); connectedIds.add(e.target); });

        var nodes = data.nodes.map(function(n) {
          var hasLinks = connectedIds.has(n.id);
          return { data: { id: n.id, label: n.name, kind: n.kind, category: n.category, hasLinks: hasLinks }, classes: hasLinks ? 'linked' : 'isolated' };
        });
        var edges = (data.edges || []).map(function(e) {
          return { data: { id: e.source + '_' + e.target + '_' + e.type, source: e.source, target: e.target, type: e.type, confidence: e.confidence } };
        });

        container.innerHTML = '';
        _cy = cytoscape({
          container: container,
          elements: { nodes: nodes, edges: edges },
          style: [
            { selector: 'node', style: { 'label': 'data(label)', 'font-size': '10px', 'text-valign': 'center', 'text-halign': 'center', 'color': isDark ? '#e2e8f0' : '#334155', 'background-color': function(e) { return KIND_COLORS[e.data('kind')] || '#94a3b8'; }, 'width': 16, 'height': 16, 'border-width': 1, 'border-color': isDark ? '#475569' : '#cbd5e1', 'border-opacity': 0.5 } },
            { selector: 'node.linked', style: { 'width': 22, 'height': 22, 'font-size': '11px', 'font-weight': 'bold' } },
            { selector: 'node.isolated', style: { 'width': 8, 'height': 8, 'font-size': '0px', 'opacity': 0.35 } },
            { selector: 'edge', style: { 'width': 1.5, 'line-color': EDGE_COLOR, 'target-arrow-shape': 'triangle', 'target-arrow-color': EDGE_COLOR, 'arrow-scale': 0.7, 'opacity': 0.7, 'curve-style': 'bezier' } },
            { selector: 'edge[type="composes_with"]', style: { 'width': 2.5, 'line-color': isDark ? '#818cf8' : '#6366f1', 'target-arrow-color': isDark ? '#818cf8' : '#6366f1', 'opacity': 0.85 } },
            { selector: 'edge[type="depends_on"]', style: { 'width': 2, 'line-color': isDark ? '#fbbf24' : '#f59e0b', 'target-arrow-color': isDark ? '#fbbf24' : '#f59e0b', 'opacity': 0.8 } },
            { selector: ':selected', style: { 'border-color': '#ef4444', 'border-width': 3, 'border-opacity': 1 } },
            { selector: '.highlighted', style: { 'border-color': '#ef4444', 'border-width': 2, 'border-opacity': 0.9, 'z-index': 10 } },
            { selector: 'edge.highlighted', style: { 'width': 3, 'line-color': isDark ? '#f87171' : '#ef4444', 'target-arrow-color': isDark ? '#f87171' : '#ef4444', 'opacity': 1, 'z-index': 9 } },
          ],
          layout: { name: 'cose', animate: false, nodeRepulsion: function(n) { return n.data('hasLinks') ? 6000 : 300; }, idealEdgeLength: function() { return 70; }, gravity: 0.25, numIter: 3000, initialTemp: 150, coolingFactor: 0.97 },
          minZoom: 0.1, maxZoom: 4,
          wheelSensitivity: 0.3,
        });

        $('graphInfo').textContent = data.nodes.length + ' 个节点 · ' + (data.edges || []).length + ' 条连线 · ' + connectedIds.size + ' 个节点有关联';

        _cy.on('tap', 'node', function(evt) {
          var node = evt.target;
          _cy.elements().removeClass('highlighted');
          node.addClass('highlighted');
          node.connectedEdges().addClass('highlighted');
          node.connectedEdges().connectedNodes().addClass('highlighted');
        });
        _cy.on('tap', function(evt) {
          if (evt.target === _cy) { _cy.elements().removeClass('highlighted'); }
        });
      }).catch(function() { container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--err)">图谱加载失败</div>'; });
    }

    // ─── Diagnostics ─────────────────────────────────────────────
    function renderDiagnostics() {
      var diag = state.diagnostics;
      var s = state.status;
      var grid = $('diagGrid');
      var extra = $('diagExtra');

      // Hook runtime
      var hookActive = null;
      var hookHung = null;
      var hookBreaker = null;
      var hookP95 = null;
      var graphNodes = null;
      var graphCompiled = null;
      var embState = null;
      var embCache = null;

      if (diag) {
        if (diag.hook) {
          hookActive = diag.hook.activeRuns;
          hookHung = diag.hook.hungRuns;
          hookBreaker = diag.hook.breakerOpen;
          hookP95 = diag.hook.p95DurationMs;
        }
        if (diag.graphStatus) {
          graphNodes = diag.graphStatus.nodes;
          graphCompiled = diag.graphStatus.lastCompiled;
        }
        if (diag.embeddingStatus) {
          embState = diag.embeddingStatus;
        }
      }

      // Fallback to status
      if (hookActive == null && s && s.hook) {
        hookActive = s.hook.activeRuns;
        hookHung = s.hook.hungRuns;
        hookBreaker = s.hook.breakerOpen;
        hookP95 = s.hook.p95DurationMs;
      }
      if (graphNodes == null && s && s.graph) {
        graphNodes = s.graph.nodes;
      }
      if (embState == null && s && s.embedding) {
        embState = s.embedding.state;
      }

      var cards = [
        { title: 'Hook 运行时', rows: [
          { label: '活跃运行', val: hookActive != null ? String(hookActive) : '未知' },
          { label: '挂起运行', val: hookHung != null ? String(hookHung) : '未知' },
          { label: '断路器', val: hookBreaker === true ? '已断开 (open)' : hookBreaker === false ? '正常 (closed)' : '未知', cls: hookBreaker ? 'err' : '' },
          { label: 'P95 耗时', val: hookP95 != null ? hookP95 + 'ms' : '未知' },
        ]},
        { title: '图谱状态', rows: [
          { label: '节点数', val: graphNodes != null ? String(graphNodes) : '未知' },
          { label: '最后编译', val: graphCompiled || (s && s.graph && s.graph.lastCompiled) || '未知' },
        ]},
        { title: '嵌入缓存', rows: [
          { label: '状态', val: embState || '未知', cls: embState === 'ok' ? 'ok' : '' },
          { label: '缓存大小', val: embCache != null ? String(embCache) + ' 条' : '未知' },
        ]},
      ];

      var html = '';
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        html += '<div class="diag-card"><h4>' + esc(card.title) + '</h4>';
        for (var j = 0; j < card.rows.length; j++) {
          var row = card.rows[j];
          var valCls = row.cls ? ' class="diag-val text-' + row.cls + '"' : ' class="diag-val"';
          html += '<div class="diag-row"><span>' + esc(row.label) + '</span><span' + valCls + '>' + esc(String(row.val)) + '</span></div>';
        }
        html += '</div>';
      }
      grid.innerHTML = html;

      // Recent matches
      if (diag && diag.recentMatches && diag.recentMatches.length) {
        var mhtml = '<div class="match-list"><div style="font-weight:600;font-size:14px;margin-bottom:8px">最近匹配记录</div>';
        for (var m = 0; m < Math.min(diag.recentMatches.length, 10); m++) {
          var match = diag.recentMatches[m];
          var matchedNames = '';
          if (match.matched && match.matched.length) {
            matchedNames = match.matched.join(', ');
          }
          mhtml += '<div class="match-entry">' +
            '<span class="mq">' + esc(match.query || '') + '</span>' +
            '<span class="mm">' + esc(matchedNames || match.route || '') + '</span>' +
            '</div>';
        }
        mhtml += '</div>';
        extra.innerHTML = mhtml;
      } else if (diag && !diag.recentMatches) {
        extra.innerHTML = '<div class="text-3" style="font-size:13px;padding:8px 0">暂无匹配记录</div>';
      } else {
        extra.innerHTML = '';
      }
    }

    // ─── Setup Guide ─────────────────────────────────────────────
    function renderSetup() {
      var s = state.status;
      var graphOk = (s && s.graph && s.graph.nodes > 0) || false;
      var hookInstalled = false;
      if (s && s.hook && s.hook.scopes) {
        for (var i = 0; i < s.hook.scopes.length; i++) {
          if (s.hook.scopes[i].installed) { hookInstalled = true; break; }
        }
      }
      var embOk = (s && s.embedding && s.embedding.state === 'ok') || false;
      var steps = [
        { done: true, title: '安装 LazyBrain', desc: '克隆仓库、安装依赖、构建并注册 CLI 命令', cmd: 'git clone https://github.com/papperrollinggery/lazy-brain.git\\ncd lazy-brain\\nnpm install\\nnpm run build\\nnpm link' },
        { done: graphOk, title: '扫描工具', desc: graphOk ? '已发现 ' + (s.graph.nodes) + ' 个能力' : '扫描系统中的 skills、agents 和 commands', cmd: 'lazybrain scan\\nlazybrain compile --offline' },
        { done: hookInstalled, title: '安装 Claude Code Hook', desc: hookInstalled ? 'Hook 已激活' : '将 LazyBrain 接入 Claude Code（项目级别）', cmd: 'lazybrain hook plan\\nlazybrain hook install' },
        { done: embOk, title: '配置语义搜索（可选）', desc: embOk ? '语义嵌入已启用' : '启用 AI 匹配以获得更精准的推荐结果', cmd: 'lazybrain config set embeddingApiKey <your-key>\\nlazybrain config set embeddingModel BAAI/bge-m3\\nlazybrain embeddings rebuild --yes' },
      ];
      var html = '';
      for (var j = 0; j < steps.length; j++) {
        var st = steps[j];
        html += '<div class="step">' +
          '<div class="step-num' + (st.done ? ' done' : '') + '">' + (st.done ? '✓' : String(j + 1)) + '</div>' +
          '<div class="step-body"><strong>' + esc(st.title) + '</strong>' +
          '<span class="text-2">' + esc(st.desc) + '</span>' +
          '<code>' + esc(st.cmd) + '</code></div>' +
          '<div class="step-check' + (st.done ? ' done' : '') + '">✓</div>' +
          '</div>';
      }
      $('steps').innerHTML = html;
    }

    // ─── Hook Detail ─────────────────────────────────────────────
    function renderHook() {
      var s = state.status;
      var el = $('hookDetail');
      if (!s || !s.hook || !s.hook.scopes) {
        el.innerHTML = '<div class="text-3" style="text-align:center;padding:20px">无 Hook 状态数据</div>';
        return;
      }
      var html = '<div class="hook-grid">';
      for (var i = 0; i < s.hook.scopes.length; i++) {
        var h = s.hook.scopes[i];
        html += '<div class="hook-card"><h4>' + esc(h.scope) + ' 作用域</h4>' +
          '<div class="hook-row"><span>UserPromptSubmit</span><span class="' + (h.installed ? 'text-ok' : 'text-warn') + '">' + (h.installed ? '已安装' : '未安装') + '</span></div>' +
          '<div class="hook-row"><span>Stop 钩子</span><span class="' + (h.stopClean ? 'text-ok' : 'text-err') + '">' + (h.stopClean ? '正常' : '包含 LazyBrain') + '</span></div>' +
          '<div class="hook-row"><span>SessionStart</span><span>' + (h.sessionStart ? '已配置' : '无') + '</span></div>' +
          '</div>';
      }
      html += '</div>';

      if (s.hook.activeRuns != null) {
        html += '<div class="hook-grid mt-sm">' +
          '<div class="hook-card"><h4>运行时统计</h4>' +
          '<div class="hook-row"><span>活跃运行数</span><span>' + s.hook.activeRuns + '</span></div>' +
          '<div class="hook-row"><span>挂起运行数</span><span>' + (s.hook.hungRuns || 0) + '</span></div>' +
          '<div class="hook-row"><span>断路器</span><span class="' + (s.hook.breakerOpen ? 'text-err' : 'text-ok') + '">' + (s.hook.breakerOpen ? '已断开' : '正常') + '</span></div>' +
          '<div class="hook-row"><span>P95 耗时</span><span>' + (s.hook.p95DurationMs || 0) + 'ms</span></div>' +
          '</div></div>';
      }

      el.innerHTML = html;
    }

    // ─── Advanced ────────────────────────────────────────────────
    function renderAdvanced() {
      var s = state.status;
      if (!s) return;
      // Troubleshooting
      var items = [];
      if (s.readiness && s.readiness.blockers && s.readiness.blockers.length) {
        items.push({ title: '发现问题', detail: s.readiness.blockers.join(', '), cmd: 'lazybrain ready', cls: 'err' });
      }
      if (s.embedding && s.embedding.state !== 'ok') {
        items.push({ title: '语义搜索异常', detail: s.embedding.message || '请检查 Embedding 配置', cmd: 'lazybrain embeddings status', cls: 'warn' });
      }
      if (!s.server || !s.server.running) {
        items.push({ title: '服务器状态异常', detail: '未检测到服务器进程', cmd: 'lazybrain ui', cls: 'warn' });
      }
      if (!items.length) {
        items.push({ title: '一切正常', detail: '所有检查项通过', cmd: 'lazybrain route "test query"', cls: 'ok' });
      }
      var html = '';
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        html += '<div style="border:1px solid var(--' + it.cls + '-border);border-radius:var(--radius-sm);padding:12px;margin-bottom:8px;background:var(--' + it.cls + '-bg)">' +
          '<strong>' + esc(it.title) + '</strong><div class="text-2" style="font-size:13px">' + esc(it.detail) + '</div>' +
          '<code style="display:block;margin-top:6px;font-size:12px">' + esc(it.cmd) + '</code></div>';
      }
      $('trouble').innerHTML = html;

      // Render hook detail
      renderHook();

      // Raw config
      $('configDump').innerHTML = '<details><summary>原始配置 (Raw Config)</summary>' +
        '<pre class="code-block mt-sm">' + esc(JSON.stringify(s.config || {}, null, 2)) + '</pre></details>';
    }

    // ─── Init ────────────────────────────────────────────────────
    $('runRoute').onclick = function() {
      var q = $('queryInput').value.trim();
      if (q) doRoute(q);
    };
    $('queryInput').onkeydown = function(e) {
      if (e.key === 'Enter') $('runRoute').click();
    };
    var suggestionBtns = document.querySelectorAll('.try-suggestions button');
    for (var bi = 0; bi < suggestionBtns.length; bi++) {
      (function(btn) {
        btn.onclick = function() {
          $('queryInput').value = btn.dataset.q;
          doRoute(btn.dataset.q);
        };
      })(suggestionBtns[bi]);
    }
    $('refreshBtn').onclick = load;
    $('toolSearch').oninput = function() {
      renderTools($('toolSearch').value, $('toolKindFilter').value);
    };
    $('toolKindFilter').onchange = function() {
      renderTools($('toolSearch').value, $('toolKindFilter').value);
    };

    // Config edit/save/cancel via event delegation
    $('configSection').addEventListener('click', function(e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      var key = btn.dataset.key;
      if (!key) return;
      if (btn.classList.contains('config-edit-btn')) editConfig(key);
      else if (btn.classList.contains('config-save-btn')) saveConfig(key);
      else if (btn.classList.contains('config-cancel-btn')) cancelConfig(key);
    });

    // ─── Compile / Scan buttons ─────────────────────────────────
    var _compilePollTimer = null;
    function setCompileButtonsDisabled(disabled) {
      $('compileBtn').disabled = disabled;
      $('scanBtn').disabled = disabled;
    }
    function startCompile() {
      setCompileButtonsDisabled(true);
      $('compileStatus').textContent = '启动中...';
      api('/api/compile', { method: 'POST' }).then(function(res) {
        if (res.ok) pollCompile();
        else { showToast('编译失败: ' + esc(res.error), 'error'); setCompileButtonsDisabled(false); }
      }).catch(function(e) {
        showToast('编译失败: ' + esc(e.message), 'error');
        setCompileButtonsDisabled(false);
      });
    }
    function pollCompile() {
      api('/api/compile/status', { method: 'GET' }).then(function(s) {
        $('compileStatus').textContent = s.phase || (s.running ? '运行中...' : '');
        if (s.running) {
          _compilePollTimer = setTimeout(pollCompile, 2000);
        } else {
          setCompileButtonsDisabled(false);
          $('compileStatus').textContent = s.exitCode === 0 ? '✓ 编译完成' : s.exitCode == null ? '' : '✗ 编译失败';
          setTimeout(function() { $('compileStatus').textContent = ''; }, 8000);
          load(); // Refresh all data
        }
      }).catch(function(e) {
        showToast('状态刷新失败: ' + esc(e.message), 'error');
        setCompileButtonsDisabled(false);
      });
    }
    function startScan() {
      setCompileButtonsDisabled(true);
      $('compileStatus').textContent = '扫描中...';
      api('/api/compile?scan=1', { method: 'POST' }).then(function(res) {
        if (res.ok) { pollCompile(); }
        else { showToast('启动失败: ' + esc(res.error), 'error'); setCompileButtonsDisabled(false); }
      }).catch(function(e) { showToast('失败: ' + esc(e.message), 'error'); setCompileButtonsDisabled(false); });
    }
    $('compileBtn').onclick = startCompile;
    $('scanBtn').onclick = startScan;

    async function load() {
      state.configEditing = {};
      try {
        state.status = await api('/api/status');
        if (state.status && state.status.graph && state.status.graph.nodes) {
          try {
            var searchResult = await api('/api/search?' + new URLSearchParams({ limit: '500' }));
            state.tools = Array.isArray(searchResult) ? searchResult : [];
          } catch (e) {
            state.tools = [];
          }
        }
        try {
          state.diagnostics = await api('/api/diagnostics');
        } catch (e) {
          state.diagnostics = null;
        }
      } catch (e) {
        $('heroTitle').textContent = '无法连接';
        $('heroDesc').textContent = e.message;
        return;
      }
      renderHero();
      renderStats();
      renderTools('', '');
      renderConfig();
      renderDiagnostics();
      renderSetup();
      renderAdvanced();
    }

    load();
  </script>
</body>
</html>`;
