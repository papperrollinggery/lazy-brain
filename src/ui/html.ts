export const UI_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>LazyBrain Workbench</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f8fafc;
      --sidebar: #f7faff;
      --surface: #ffffff;
      --surface-2: #f9fbff;
      --surface-3: #eef4ff;
      --text: #111827;
      --text-2: #4b5563;
      --text-3: #8a94a6;
      --border: #e3e8f1;
      --border-2: #cfd8e6;
      --brand: #2563eb;
      --brand-bg: #eef5ff;
      --ok: #16a34a;
      --ok-bg: #edf9f1;
      --warn: #d97706;
      --warn-bg: #fff8e7;
      --err: #dc2626;
      --err-bg: #fff1f2;
      --purple: #6d4aff;
      --purple-bg: #f1edff;
      --shadow: 0 1px 2px rgba(15, 23, 42, 0.04), 0 10px 28px rgba(15, 23, 42, 0.04);
      --radius: 8px;
      --font: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --mono: ui-monospace, "SF Mono", "Cascadia Code", Menlo, monospace;
    }

    * { box-sizing: border-box; }
    html, body { min-height: 100%; margin: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font: 14px/1.45 var(--font);
      -webkit-font-smoothing: antialiased;
    }
    button, input, select, textarea { font: inherit; }
    button { cursor: pointer; }
    code, pre, .mono { font-family: var(--mono); }

    .app {
      min-height: 100vh;
      display: grid;
      grid-template-columns: 268px minmax(0, 1fr);
    }
    .sidebar {
      position: sticky;
      top: 0;
      height: 100vh;
      padding: 20px 16px;
      background: var(--sidebar);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 6px 10px;
    }
    .brand-mark {
      width: 36px;
      height: 36px;
      border-radius: 8px;
      display: grid;
      place-items: center;
      background: var(--text);
      color: #fff;
      font-weight: 760;
      letter-spacing: 0;
    }
    .brand-title { font-weight: 760; font-size: 17px; }
    .brand-subtitle { color: var(--text-3); font-size: 12px; margin-top: 1px; }
    .version-pill {
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 3px 8px;
      background: #eef2f7;
      color: var(--text-2);
      font-size: 12px;
      font-weight: 650;
    }
    .nav { display: grid; gap: 4px; }
    .nav-group {
      margin: 14px 8px 6px;
      color: var(--text-3);
      font-size: 12px;
      font-weight: 680;
    }
    .nav-item {
      width: 100%;
      border: 1px solid transparent;
      background: transparent;
      color: var(--text-2);
      border-radius: 7px;
      padding: 10px 12px;
      display: flex;
      align-items: center;
      gap: 9px;
      text-align: left;
    }
    .nav-item:hover { background: #eef5ff; color: var(--text); }
    .nav-item.active {
      background: #eaf2ff;
      color: var(--brand);
      border-color: #d6e6ff;
      box-shadow: inset 3px 0 0 var(--brand);
    }
    .nav-icon {
      width: 20px;
      height: 20px;
      border-radius: 6px;
      display: grid;
      place-items: center;
      color: var(--text-3);
      flex: 0 0 auto;
    }
    .nav-item.active .nav-icon { color: var(--brand); background: #dceafe; }
    .nav-label,
    .dual {
      display: grid;
      gap: 1px;
      min-width: 0;
    }
    .nav-label small,
    .dual small,
    .en-line {
      color: var(--text-3);
      font-size: 12px;
      font-weight: 520;
      line-height: 1.25;
    }
    h1 .en-line,
    h2 .en-line,
    h3 .en-line {
      display: block;
      margin-top: 3px;
    }
    .sidebar-footer {
      margin-top: auto;
      padding: 10px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
      color: var(--text-2);
      font-size: 12px;
    }
    .shell { min-width: 0; display: flex; flex-direction: column; }
    .topbar {
      height: 72px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 0 28px;
      border-bottom: 1px solid var(--border);
      background: rgba(255,255,255,0.92);
      backdrop-filter: blur(10px);
      position: sticky;
      top: 0;
      z-index: 20;
    }
    .topbar-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .crumb { color: var(--text-3); }
    .page-name { font-weight: 680; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .topbar-right { display: flex; align-items: center; gap: 8px; }
    .status-chip {
      height: 30px;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      padding: 0 10px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text-2);
      font-size: 12px;
      white-space: nowrap;
    }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text-3); }
    .status-chip.ok .status-dot { background: var(--ok); }
    .status-chip.warn .status-dot { background: var(--warn); }
    .status-chip.err .status-dot { background: var(--err); }
    .btn {
      min-height: 34px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
      border-radius: 7px;
      padding: 7px 11px;
      font-weight: 560;
      text-decoration: none;
      transition: background 120ms, border-color 120ms, transform 120ms;
    }
    .btn:hover { background: var(--surface-2); border-color: var(--border-2); }
    .btn:active { transform: translateY(1px); }
    .btn-primary { background: var(--brand); color: #fff; border-color: var(--brand); }
    .btn-primary:hover { background: #1d4ed8; border-color: #1d4ed8; }
    .btn-ghost { background: transparent; }
    .btn-danger { color: var(--err); border-color: #f0caca; background: var(--err-bg); }
    .btn-sm { min-height: 28px; padding: 5px 9px; font-size: 12px; }
    .icon-btn { width: 32px; padding: 0; }
    .page {
      display: none;
      padding: 24px 28px 32px;
      min-width: 0;
    }
    .page.active { display: block; }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      margin-bottom: 20px;
    }
    .eyebrow {
      color: var(--text-3);
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.08em;
      font-weight: 700;
      margin-bottom: 5px;
    }
    h1, h2, h3, h4 { margin: 0; line-height: 1.2; letter-spacing: 0; }
    h1 { font-size: 29px; }
    h2 { font-size: 16px; }
    h3 { font-size: 14px; }
    h4 { font-size: 13px; }
    p { margin: 0; }
    .subtle { color: var(--text-2); }
    .muted { color: var(--text-3); }
    .grid { display: grid; gap: 16px; }
    .grid-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .grid-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .layout-setup { grid-template-columns: minmax(0, 1fr) 380px; }
    .layout-route { grid-template-columns: 420px minmax(0, 1fr) 420px; align-items: start; }
    .layout-adoption { grid-template-columns: minmax(0, 1fr) 340px; align-items: start; }
    .layout-map { grid-template-columns: minmax(0, 1fr) 360px; align-items: start; }
    .layout-diagnostics { grid-template-columns: minmax(0, 1fr) 380px; align-items: start; }
    .panel {
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface);
      box-shadow: var(--shadow);
      min-width: 0;
    }
    .panel-flat {
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface);
      min-width: 0;
    }
    .panel-header {
      min-height: 48px;
      padding: 14px 16px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .panel-body { padding: 16px; }
    .section-title { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .section-title span { color: var(--text-3); font-size: 12px; }
    .kpi-row { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
    .kpi {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface-2);
      padding: 18px;
      min-width: 0;
    }
    .kpi-value {
      font-size: 28px;
      line-height: 1.1;
      font-weight: 760;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .kpi-label { margin-top: 5px; color: var(--text-3); font-size: 12px; }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 3px 8px;
      font-size: 12px;
      font-weight: 620;
      color: var(--text-2);
      background: var(--surface-2);
      white-space: nowrap;
    }
    .badge.ok { color: var(--ok); border-color: #bfe4c7; background: var(--ok-bg); }
    .badge.warn { color: var(--warn); border-color: #edd28a; background: var(--warn-bg); }
    .badge.err { color: var(--err); border-color: #efc2c2; background: var(--err-bg); }
    .badge.brand { color: var(--brand); border-color: #c9dcff; background: var(--brand-bg); }
    .badge.purple { color: var(--purple); border-color: #dcd1ff; background: var(--purple-bg); }
    .steps { display: grid; gap: 10px; }
    .setup-flow {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 28px;
      margin-bottom: 22px;
      position: relative;
    }
    .setup-flow:before {
      content: "";
      position: absolute;
      left: 9%;
      right: 9%;
      top: 18px;
      height: 1px;
      background: var(--border);
    }
    .flow-step {
      position: relative;
      display: grid;
      justify-items: center;
      text-align: center;
      gap: 8px;
      color: var(--text-3);
    }
    .flow-num {
      width: 36px;
      height: 36px;
      border-radius: 999px;
      display: grid;
      place-items: center;
      background: var(--surface);
      border: 1px solid var(--border-2);
      color: var(--text-3);
      font-weight: 760;
      z-index: 1;
    }
    .flow-step.done .flow-num {
      color: var(--ok);
      background: var(--ok-bg);
      border-color: #b7e2c1;
    }
    .flow-step.current .flow-num {
      color: var(--brand);
      border-color: var(--brand);
      box-shadow: 0 0 0 4px var(--brand-bg);
    }
    .flow-step strong { color: var(--text); font-size: 13px; }
    .flow-step span { font-size: 12px; }
    .setup-card-title {
      font-size: 17px;
      font-weight: 760;
      margin-bottom: 4px;
    }
    .source-list {
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
      margin-top: 18px;
    }
    .source-row {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr) minmax(0, 1.1fr) auto auto;
      gap: 10px;
      align-items: center;
      padding: 10px 14px;
      background: var(--surface);
      border-bottom: 1px solid var(--border);
    }
    .source-row:last-child { border-bottom: 0; }
    .tile-icon {
      width: 34px;
      height: 34px;
      border-radius: 8px;
      display: grid;
      place-items: center;
      background: var(--brand-bg);
      color: var(--brand);
      font-weight: 760;
    }
    .tile-icon.ok { background: var(--ok-bg); color: var(--ok); }
    .tile-icon.warn { background: var(--warn-bg); color: var(--warn); }
    .tile-icon.err { background: var(--err-bg); color: var(--err); }
    .tile-icon.brand { background: var(--brand-bg); color: var(--brand); }
    .tile-icon.purple { background: var(--purple-bg); color: var(--purple); }
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
    }
    .metric-card {
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface);
      padding: 14px 16px;
      min-height: 112px;
    }
    .metric-title {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--text-2);
      margin-bottom: 10px;
    }
    .metric-main {
      font-size: 28px;
      font-weight: 760;
      line-height: 1;
    }
    .metric-sub { margin-top: 10px; color: var(--text-3); font-size: 12px; }
    .right-stack { display: grid; gap: 22px; }
    .right-card {
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface);
      padding: 22px;
    }
    .number-list {
      display: grid;
      gap: 14px;
      margin: 14px 0 0;
      padding-left: 20px;
      color: var(--text-2);
    }
    .check-list { display: grid; gap: 13px; margin-top: 16px; }
    .check-item { display: flex; gap: 10px; color: var(--text-2); }
    .check-mark { color: var(--ok); font-weight: 760; }
    .step {
      display: grid;
      grid-template-columns: 30px minmax(0, 1fr) auto;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface-2);
    }
    .step-num {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      display: grid;
      place-items: center;
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text-3);
      font-weight: 720;
    }
    .step.done .step-num { color: var(--ok); background: var(--ok-bg); border-color: #bfe4c7; }
    .step.current .step-num { color: var(--brand); background: var(--brand-bg); border-color: #c9dcff; }
    .step strong { display: block; margin-bottom: 2px; }
    .step small { color: var(--text-3); }
    .input, .select, .textarea {
      width: 100%;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
      color: var(--text);
      outline: none;
    }
    .input, .select { height: 36px; padding: 0 11px; }
    .textarea { min-height: 190px; padding: 12px; resize: vertical; }
    .input:focus, .select:focus, .textarea:focus {
      border-color: #a9c5ff;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.11);
    }
    .chips { display: flex; flex-wrap: wrap; gap: 7px; }
    .chip {
      border: 1px solid var(--border);
      background: var(--surface-2);
      color: var(--text-2);
      border-radius: 999px;
      padding: 5px 9px;
      font-size: 12px;
    }
    .chip:hover { color: var(--brand); border-color: #c9dcff; background: var(--brand-bg); }
    .segmented {
      display: inline-flex;
      gap: 2px;
      padding: 3px;
      border-radius: var(--radius);
      background: var(--surface-3);
      border: 1px solid var(--border);
    }
    .segmented button {
      border: 0;
      background: transparent;
      color: var(--text-2);
      border-radius: 6px;
      padding: 5px 9px;
      font-size: 12px;
      font-weight: 620;
    }
    .segmented button.active { background: var(--surface); color: var(--text); box-shadow: 0 1px 0 rgba(31, 33, 30, 0.04); }
    .route-card {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 14px;
      background: var(--surface-2);
    }
    .route-hero {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 12px;
    }
    .route-name { font-size: 20px; font-weight: 760; margin-bottom: 4px; }
    .route-meta { display: flex; flex-wrap: wrap; gap: 6px; }
    .score-ring {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      border: 5px solid #c9dcff;
      background: var(--surface);
      color: var(--brand);
      font-weight: 760;
      flex: 0 0 auto;
    }
    .score-inline {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--ok);
      font-weight: 720;
    }
    .score-inline:after {
      content: "";
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: 4px solid #bfe4c7;
      border-top-color: var(--ok);
      display: inline-block;
    }
    .route-step-row {
      display: grid;
      grid-template-columns: 24px minmax(0, 1fr);
      gap: 10px;
      align-items: start;
      padding: 6px 0;
      color: var(--text);
    }
    .route-step-num {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: var(--brand);
      color: #fff;
      font-size: 12px;
      font-weight: 760;
    }
    .route-token-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px;
      padding: 7px 0;
      border-bottom: 1px solid var(--border);
    }
    .route-token-row:last-child { border-bottom: 0; }
    .route-context-card {
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface);
      padding: 16px;
    }
    .route-alternatives {
      grid-column: 1 / -1;
    }
    #routeContext > .panel {
      height: 660px;
      overflow: hidden;
    }
    .layout-adoption > .panel,
    .layout-adoption > aside.panel {
      max-height: 430px;
      overflow: hidden;
    }
    .alternative-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
    }
    .alternative-card {
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface);
      padding: 16px;
      min-height: 136px;
    }
    .alternative-rank {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      display: grid;
      place-items: center;
      background: var(--surface-3);
      color: var(--text-2);
      font-weight: 760;
    }
    .list { display: grid; gap: 8px; }
    .list-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
      padding: 10px 0;
      border-bottom: 1px solid var(--border);
    }
    .list-row:last-child { border-bottom: 0; }
    .row-title { font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .row-sub { color: var(--text-3); font-size: 12px; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .table { width: 100%; border-collapse: collapse; }
    .table th, .table td {
      text-align: left;
      border-bottom: 1px solid var(--border);
      padding: 10px 8px;
      vertical-align: middle;
    }
    .table th {
      color: var(--text-3);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-weight: 760;
    }
    .table td { font-size: 13px; }
    .table tr:hover td { background: var(--surface-2); }
    .table .selected td { background: var(--brand-bg); }
    .timeline {
      border-left: 1px solid var(--border);
      display: grid;
      gap: 12px;
      padding-left: 16px;
    }
    .timeline-item {
      position: relative;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface-2);
      padding: 11px;
    }
    .timeline-item:before {
      content: "";
      position: absolute;
      left: -21px;
      top: 16px;
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: var(--surface);
      border: 2px solid var(--brand);
    }
    .empty {
      display: grid;
      place-items: center;
      min-height: 140px;
      color: var(--text-3);
      text-align: center;
      border: 1px dashed var(--border-2);
      border-radius: var(--radius);
      background: var(--surface-2);
      padding: 20px;
    }
    .code {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: #fbfbfa;
      color: #33352f;
      padding: 11px;
      font: 12px/1.45 var(--mono);
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 220px;
      overflow: auto;
    }
    .graph-wrap {
      height: 520px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: linear-gradient(#fbfaf7, #f3f1ea);
      overflow: hidden;
      position: relative;
    }
    #graphContainer { width: 100%; height: 100%; }
    .graph-legend {
      position: absolute;
      left: 12px;
      bottom: 12px;
      z-index: 4;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      padding: 7px;
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: rgba(255,255,255,0.86);
      color: var(--text-2);
      font-size: 12px;
    }
    .graph-legend.full {
      gap: 6px 10px;
      width: 250px;
      padding: 9px 10px;
      grid-template-columns: repeat(2, max-content);
      background: rgba(255,255,255,0.94);
      font-size: 11px;
    }
    .legend-line {
      display: inline-block;
      width: 20px;
      height: 0;
      border-top: 1px solid #64748b;
      vertical-align: middle;
      margin-right: 8px;
    }
    .legend-line.dashed { border-top-style: dashed; }
    .legend-line.dotted { border-top-style: dotted; }
    .legend-line.red { border-color: #dc2626; }
    .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
    .tools-table-wrap {
      border-top: 1px solid var(--border);
      background: var(--surface);
    }
    .map-stage {
      display: grid;
      grid-template-columns: minmax(640px, 1fr) minmax(340px, 380px);
      min-height: 700px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface);
      overflow: hidden;
    }
    .map-main { min-width: 0; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; }
    .map-toolbar {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 16px;
      border-bottom: 1px solid var(--border);
    }
    .graph-canvas {
      position: relative;
      min-height: 560px;
      background-image: radial-gradient(#d9e2ef 1px, transparent 1px);
      background-size: 22px 22px;
      overflow: hidden;
    }
    .graph-cy {
      position: absolute;
      inset: 0;
      z-index: 1;
    }
    .graph-canvas.is-dragging {
      cursor: grabbing;
    }
    .graph-canvas:active {
      cursor: grabbing;
    }
    .graph-svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }
    .graph-node {
      position: absolute;
      width: 190px;
      min-height: 58px;
      border: 1px solid #cfe0ff;
      border-radius: 12px;
      background: rgba(244, 248, 255, 0.96);
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr);
      gap: 9px;
      align-items: center;
      padding: 10px;
      box-shadow: 0 10px 20px rgba(37, 99, 235, 0.08);
    }
    .graph-node.agent { border-color: #c9efd0; background: rgba(242, 252, 244, 0.96); }
    .graph-node.command { border-color: #ded1ff; background: rgba(248, 245, 255, 0.96); }
    .graph-node.warn { border-color: #f6d48a; }
    .graph-node.selected { outline: 2px solid var(--brand); }
    .node-name { font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .node-code { color: var(--text-3); font-family: var(--mono); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .graph-controls {
      position: absolute;
      right: 14px;
      top: 18px;
      z-index: 4;
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .graph-help {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      bottom: 16px;
      z-index: 4;
      color: var(--text-2);
      background: rgba(255,255,255,0.94);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 7px 10px;
      font-size: 12px;
      box-shadow: var(--shadow);
    }
    .inspector {
      border-left: 1px solid var(--border);
      background: #fbfdff;
      padding: 24px;
      overflow: auto;
    }
    .bar {
      height: 8px;
      border-radius: 999px;
      background: #e7edf6;
      overflow: hidden;
      min-width: 76px;
    }
    .bar > span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--ok);
    }
    .bar.warn > span { background: var(--warn); }
    .chart-panel {
      min-height: 320px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface);
      padding: 18px;
    }
    .trend-svg { width: 100%; height: 220px; display: block; }
    .reason-bars { display: grid; gap: 16px; margin-top: 18px; }
    .reason-row {
      display: grid;
      grid-template-columns: 90px minmax(0, 1fr) 44px 52px;
      gap: 12px;
      align-items: center;
      color: var(--text-2);
    }
    .health-table-card {
      border: 1px solid var(--border);
      border-radius: 8px;
      background: var(--surface);
      overflow: hidden;
    }
    .health-row {
      display: grid;
      grid-template-columns: minmax(220px, 1fr) auto;
      gap: 10px 14px;
      align-items: start;
      padding: 16px;
      border-bottom: 1px solid var(--border);
    }
    .health-row:last-child { border-bottom: 0; }
    .health-row > * { min-width: 0; }
    .health-main {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
    }
    .health-status {
      justify-self: start;
      white-space: nowrap;
    }
    .health-impact {
      grid-column: 1 / -1;
      color: var(--text-2);
      line-height: 1.45;
      min-width: 0;
    }
    .health-code {
      grid-column: 1;
      max-height: 96px;
      margin: 0;
      overflow: auto;
    }
    .health-action {
      grid-column: 2;
      display: flex;
      justify-content: flex-end;
      align-self: center;
      min-width: 148px;
    }
    .health-action .btn {
      white-space: normal;
      width: 100%;
      max-width: 190px;
      text-align: center;
      line-height: 1.2;
    }
    .repair-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    #readinessChecklist { grid-column: 1 / -1; }
    .repair-list { display: grid; gap: 12px; }
    .repair-item {
      display: grid;
      grid-template-columns: 26px minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
      color: var(--text-2);
    }
    .repair-item.with-action { grid-template-columns: 26px minmax(0, 1fr) auto auto; }
    .repair-title strong { display: block; color: var(--text); }
    .repair-title small { display: block; margin-top: 3px; color: var(--text-3); }
    .repair-item .btn { white-space: nowrap; }
    .mini-log-row {
      display: grid;
      grid-template-columns: 52px minmax(0, 1fr) 60px;
      gap: 10px;
      padding: 6px 0;
      color: var(--text-2);
      font-size: 12px;
    }
    .mini-log-row .ok { color: var(--ok); }
    .diag-top {
      display: grid;
      grid-template-columns: minmax(620px, 1fr) minmax(320px, 380px);
      gap: 16px;
      align-items: start;
      margin-bottom: 16px;
    }
    .diag-side {
      display: grid;
      gap: 16px;
      min-width: 0;
    }
    .ready-strip {
      min-width: 420px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 170px auto;
      align-items: center;
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
      background: var(--surface);
      box-shadow: var(--shadow);
    }
    .ready-strip-main {
      padding: 14px 18px;
      background: var(--ok-bg);
      color: var(--ok);
      font-weight: 760;
    }
    .ready-strip-meta {
      padding: 12px 18px;
      border-left: 1px solid var(--border);
      color: var(--text-2);
      font-size: 12px;
    }
    .toast-container {
      position: fixed;
      top: 68px;
      right: 18px;
      z-index: 100;
      display: grid;
      gap: 8px;
      width: min(380px, calc(100vw - 32px));
    }
    .toast {
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface);
      box-shadow: var(--shadow);
      padding: 11px 13px;
      color: var(--text);
      transition: opacity 180ms, transform 180ms;
    }
    .toast.success { border-color: #bfe4c7; background: var(--ok-bg); color: var(--ok); }
    .toast.warning { border-color: #edd28a; background: var(--warn-bg); color: var(--warn); }
    .toast.error { border-color: #efc2c2; background: var(--err-bg); color: var(--err); }
    .hide { display: none !important; }
    .mt-8 { margin-top: 8px; }
    .mt-12 { margin-top: 12px; }
    .mt-16 { margin-top: 16px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .split { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
    .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    @media (max-width: 1160px) {
      .layout-route, .layout-map, .layout-adoption, .layout-diagnostics, .layout-setup { grid-template-columns: 1fr; }
      .grid-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .grid-3 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .alternative-grid { grid-template-columns: 1fr; }
      .route-alternatives { grid-column: auto; }
      .ready-strip { min-width: 0; grid-template-columns: 1fr; }
    }
    @media (max-width: 1320px) {
      .map-stage { grid-template-columns: 1fr; }
      .diag-top { grid-template-columns: 1fr; }
      .health-row {
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 10px 14px;
      }
      .health-main { grid-column: 1; }
      .health-status { grid-column: 2; justify-self: end; }
      .health-impact,
      .health-code,
      .health-action {
        grid-column: 1 / -1;
      }
      .health-action { justify-content: flex-start; }
      .health-action .btn { max-width: none; white-space: nowrap; }
      .inspector {
        border-left: 0;
        border-top: 1px solid var(--border);
        max-height: 420px;
      }
      .graph-canvas { min-height: 620px; }
    }
    @media (max-width: 820px) {
      .app { grid-template-columns: 1fr; }
      .sidebar { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--border); }
      .nav { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .topbar { top: 0; padding: 0 14px; }
      .page { padding: 16px; }
      .page-header { flex-direction: column; }
      .grid-2, .grid-3, .grid-4, .kpi-row { grid-template-columns: 1fr; }
      .repair-grid { grid-template-columns: 1fr; }
      #readinessChecklist { grid-column: auto; }
      .health-row { grid-template-columns: 1fr; }
      .health-main,
      .health-status,
      .health-impact,
      .health-code,
      .health-action { grid-column: auto; }
      .health-status { justify-self: start; }
    }
  </style>
  <script src="/cytoscape.min.js"></script>
</head>
<body>
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">LB</div>
        <div>
          <div class="actions" style="gap:8px"><div class="brand-title">LazyBrain</div><span class="version-pill" id="versionPill">v0.1.0</span></div>
          <div class="brand-subtitle">本地语义路由中枢</div>
        </div>
      </div>
      <nav class="nav" aria-label="LazyBrain pages">
        <div class="nav-group">工作台 / Workspace</div>
        <button class="nav-item active" data-page="setup"><span class="nav-icon">⌂</span><span class="nav-label"><span>设置</span><small>Setup</small></span></button>
        <button class="nav-item" data-page="route"><span class="nav-icon">⇄</span><span class="nav-label"><span>路由工作室</span><small>Route Studio</small></span></button>
        <button class="nav-item" data-page="adoption"><span class="nav-icon">□</span><span class="nav-label"><span>采用回顾</span><small>Adoption Review</small></span></button>
        <div class="nav-group">能力与知识 / Capabilities</div>
        <button class="nav-item" data-page="map"><span class="nav-icon">⌘</span><span class="nav-label"><span>能力图谱</span><small>Capability Map</small></span></button>
        <div class="nav-group">诊断与健康 / Health</div>
        <button class="nav-item" data-page="diagnostics"><span class="nav-icon">✧</span><span class="nav-label"><span>系统诊断</span><small>Diagnostics</small></span></button>
      </nav>
      <div class="sidebar-footer">
        <div class="split"><strong>本地服务 / Local Service</strong><span class="badge ok">运行中 / Running</span></div>
        <div class="mono mt-8" id="sidebarServerUrl">http://localhost:18450</div>
      </div>
      <div class="sidebar-footer" style="margin-top:0">
        <div class="split"><strong>Dev User</strong><span>⌄</span></div>
        <div class="muted mt-8">本地模式 / Local mode</div>
      </div>
    </aside>

    <div class="shell">
      <header class="topbar">
        <div class="topbar-left">
          <span class="crumb">LazyBrain</span>
          <span class="crumb">/</span>
          <span class="page-name" id="currentPageName">Setup</span>
        </div>
        <div class="topbar-right">
          <span id="globalStatus" class="status-chip"><span class="status-dot"></span><span>Loading</span></span>
          <button class="btn icon-btn" id="refreshBtn" title="刷新 / Refresh">↻</button>
          <button class="btn icon-btn" onclick="location.href='/lab'" title="实验室 / Lab">↗</button>
        </div>
      </header>

      <main>
        <section class="page active" id="page-setup">
          <div class="page-header">
            <div>
              <div class="eyebrow">First run</div>
              <h1>开始设置 <span class="en-line">Setup</span></h1>
              <p class="subtle mt-8">让 LazyBrain 先知道你本机有哪些 skills、agents 和 commands。 / Let LazyBrain discover local skills, agents, and commands first.</p>
            </div>
            <div class="actions">
              <button class="btn btn-primary" id="scanBtn">扫描并编译 / Scan & Compile</button>
              <button class="btn" id="compileBtn">只编译图谱 / Compile Graph</button>
            </div>
          </div>

          <div class="grid layout-setup">
            <div class="grid">
              <div class="panel">
                <div class="panel-header">
                  <div class="section-title">
                    <h2>首次设置流程 <span class="en-line">First-run Setup Flow</span></h2>
                    <span id="compileStatus">等待操作 / Idle</span>
                  </div>
                  <span id="setupReadinessBadge" class="badge">Checking</span>
                </div>
              <div class="panel-body">
                <div class="setup-flow" id="setupSteps"></div>
                <div id="setupDetail"></div>
                <div class="metric-grid mt-16" id="setupKpis"></div>
                <div id="setupFooterActions"></div>
              </div>
            </div>
            </div>

            <aside class="right-stack">
              <div class="right-card" id="nextActionPanel"></div>
              <div class="right-card" id="currentIssuePanel"></div>
              <div class="right-card">
                <h2>隐私与数据安全 <span class="en-line">Privacy & Data Safety</span></h2>
                <div class="check-list">
                  <div class="check-item"><span class="check-mark">✓</span><span>所有能力扫描、索引与路由均在本地完成 / All scans, indexes, and routes stay local</span></div>
                  <div class="check-item"><span class="check-mark">✓</span><span>不存储或上传你的原始提示与代码 / Raw prompts and code are not uploaded</span></div>
                  <div class="check-item"><span class="check-mark">✓</span><span>Route event 只保留 hash、选择和反馈状态 / Route events keep hashes, choices, and feedback only</span></div>
                  <div class="check-item"><span class="check-mark">✓</span><span>你可以随时清理缓存或重建索引 / You can clear cache or rebuild indexes anytime</span></div>
                </div>
              </div>
              <div class="right-card">
                <h2>需要帮助? <span class="en-line">Need Help?</span></h2>
                <div class="list mt-12">
                  <div class="list-row"><div><div class="row-title">查看文档 / View Docs</div><div class="row-sub">配置、扫描、编译说明 / Config, scan, and compile guide</div></div><span>→</span></div>
                  <div class="list-row"><div><div class="row-title">打开日志目录 / Open Logs</div><div class="row-sub">定位失败原因 / Locate failure causes</div></div><span>→</span></div>
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section class="page" id="page-route">
          <div class="grid layout-route">
            <div class="panel">
              <div class="panel-header">
                <div class="section-title">
                  <h2>任务输入 <span class="en-line">Task Input</span></h2>
                  <span>任务输入 / Try Router</span>
                </div>
              </div>
              <div class="panel-body">
                <textarea id="queryInput" class="textarea" placeholder="描述你想让 AI 完成的任务 / Describe what you want AI to do, e.g. review this PR for regression risk"></textarea>
                <div class="split mt-8"><span class="muted" id="queryCounter">0 / 2000</span><span class="actions"><button class="btn icon-btn btn-sm" title="附加上下文 / Attach Context">⌕</button><button class="btn icon-btn btn-sm" id="runRouteIcon" title="运行 / Run">→</button></span></div>
                <div class="actions mt-12">
                  <button class="btn btn-primary" id="runRoute">获取推荐 / Get Recommendation</button>
                  <button class="btn" id="clearRoute">清空 / Clear</button>
                </div>
                <div class="split mt-16"><h3>示例提示词 <span class="en-line">Example Prompts</span></h3><button class="btn btn-sm" type="button">↻ 换一换 / Shuffle</button></div>
                <div class="chips mt-16" id="suggestions">
                  <button class="chip" data-q="帮我审查这个 PR 有没有回归风险">审查 PR / Review PR</button>
                  <button class="chip" data-q="生产环境出现 bug，需要定位根因并修复">调试 bug / Debug Bug</button>
                  <button class="chip" data-q="重新规划这个功能的产品方向和最小闭环">产品规划 / Product Plan</button>
                  <button class="chip" data-q="做一次前端视觉设计 review 并给出修改建议">设计 review / Design Review</button>
                </div>
                <h3 class="mt-16">目标选择 <span class="en-line">Target Selection</span></h3>
                <div class="segmented mt-12" id="targetTabs" style="width:100%;display:grid;grid-template-columns:repeat(4,1fr)">
                  <button class="active" data-target="claude">Claude</button>
                  <button data-target="codex">Codex</button>
                  <button data-target="cursor">Cursor</button>
                  <button data-target="generic">Generic</button>
                </div>
              </div>
            </div>

            <div class="panel">
              <div class="panel-header">
                  <div class="section-title">
                  <h2>推荐结果 <span class="en-line">Recommendation Result</span></h2>
                  <span id="routeEventMeta">等待输入任务 / Waiting for task</span>
                </div>
              </div>
              <div class="panel-body" id="routeResult">
                <div class="empty">输入任务后显示推荐工作流、模型、技能、理由和可复制 prompt。 / Enter a task to see workflow, model, skill, rationale, and copyable prompt.</div>
              </div>
            </div>

            <aside class="grid" id="routeContext">
              <div class="panel">
                <div class="panel-header">
                  <div class="section-title">
                    <h2>路由上下文 <span class="en-line">Route Context</span></h2>
                    <span>采用记录、运行历史、事件信息 / Adoption, run history, event metadata</span>
                  </div>
                </div>
                <div class="panel-body" id="routeRecent"></div>
              </div>
            </aside>

            <div class="panel route-alternatives" id="routeAlternatives"></div>
          </div>
        </section>

        <section class="page" id="page-adoption">
          <div class="page-header">
            <div>
              <div class="eyebrow">Quality loop</div>
              <h1>最近路由 / Adoption Review</h1>
              <p class="subtle mt-8">看推荐是否被采用，把错路由直接变成 regression。 / Review adoption feedback and turn wrong routes into regressions.</p>
            </div>
            <div class="actions">
              <input class="input" style="width:340px" placeholder="搜索 / Search query, routeEventId, workflow" />
              <button class="btn">2026-05-01 ~ 2026-05-07</button>
              <button class="btn">筛选 / Filter</button>
              <button class="btn" id="reloadEvents">刷新 / Refresh</button>
            </div>
          </div>

          <div class="grid">
            <div class="kpi-row" id="adoptionKpis"></div>
            <div class="grid layout-adoption">
              <div class="panel">
                <div class="panel-header">
                  <div class="section-title">
                    <h2>路由事件 <span class="en-line">Route Events</span></h2>
                    <span>隐私安全 query hash，不保存原始 prompt / Privacy-safe query hash, no raw prompts</span>
                  </div>
                </div>
                <div class="panel-body" id="routeEventsTable"></div>
              </div>
              <aside class="panel">
                <div class="panel-header">
                  <div class="section-title">
                    <h2>事件详情 <span class="en-line">Event Details</span></h2>
                    <span>采纳、拒绝、转测试 / Accept, reject, convert to test</span>
                  </div>
                </div>
                <div class="panel-body" id="eventInspector">
                  <div class="empty">选择一条路由记录。 / Select a route event.</div>
                </div>
              </aside>
            </div>
            <div class="grid grid-2">
              <div class="chart-panel" id="adoptionTrend"></div>
              <div class="chart-panel" id="rejectionReasons"></div>
            </div>
          </div>
        </section>

        <section class="page" id="page-map">
          <div class="page-header">
            <div>
              <div class="eyebrow">Trust layer</div>
              <h1>能力图谱 / Capability Map</h1>
              <p class="subtle mt-8">检查 LazyBrain 知道哪些工具、关系是否可信、哪里有重复和孤岛。 / Inspect known tools, relationships, duplicates, and isolated nodes.</p>
            </div>
            <div class="actions">
              <input id="capSearch" class="input" style="width:260px" placeholder="搜索能力 / Search capabilities..." />
              <div class="segmented" id="kindTabs">
                <button class="active" data-kind="">All</button>
                <button data-kind="skill">Skills</button>
                <button data-kind="agent">Agents</button>
                <button data-kind="command">Commands</button>
              </div>
            </div>
          </div>

          <div class="map-stage">
            <div class="map-main">
              <div class="map-toolbar">
                <div class="panel-flat" style="width:300px"><input id="capSearchInline" class="input" placeholder="搜索能力 / Search by name, description, trigger..." /></div>
                <div class="segmented" id="kindTabsInline">
                  <button class="active" data-kind="">All</button>
                  <button data-kind="skill">Skills</button>
                  <button data-kind="agent">Agents</button>
                  <button data-kind="command">Commands</button>
                </div>
                <button class="btn btn-sm" id="reloadGraph">重新扫描全部 / Rescan All</button>
                <span class="muted" id="graphInfo">loading</span>
              </div>
              <div class="graph-canvas" id="graphContainer"></div>
              <div class="tools-table-wrap">
                <div class="panel-header">
                  <div class="section-title">
                    <h2>工具清单 <span class="en-line">Tool List</span></h2>
                    <span id="capabilityCount">0 capabilities</span>
                  </div>
                </div>
                <div id="capabilityList"></div>
              </div>
            </div>
            <aside class="inspector" id="capabilityInspector">
              <div class="empty">选择一个能力节点或列表项。 / Select a capability node or list item.</div>
            </aside>
          </div>
        </section>

        <section class="page" id="page-diagnostics">
          <div class="page-header">
            <div>
              <div class="eyebrow">Maintenance</div>
              <h1>系统诊断 / Diagnostics</h1>
              <p class="subtle mt-8">复杂度收纳在这里，日常路由不被配置和故障排查打断。 / Keep configuration and troubleshooting away from daily routing.</p>
            </div>
            <div class="actions">
              <div class="ready-strip" id="diagnosticReadyStrip"></div>
              <button class="btn" id="testApis">测试 API / Test API</button>
              <button class="btn" id="rebuildEmbeddings">重建 embedding / Rebuild Embedding</button>
            </div>
          </div>

          <div class="diag-top">
            <div>
              <div class="health-table-card" id="diagnosticCards"></div>
            </div>
            <aside class="diag-side">
              <div class="panel">
                <div class="panel-header">
                  <div class="section-title">
                    <h2>实时日志 <span class="en-line">Live Logs</span></h2>
                    <span>最近 60 条 / Latest 60 entries</span>
                  </div>
                </div>
                <div class="panel-body">
                  <pre class="code" id="compileLog">No recent compile logs.</pre>
                </div>
              </div>
              <div class="panel">
                <div class="panel-header">
                  <div class="section-title">
                    <h2>配置快照 <span class="en-line">Config Snapshot</span></h2>
                    <span>密钥由服务端脱敏 / Secrets masked by server</span>
                  </div>
                </div>
                <div class="panel-body">
                  <pre class="code" id="configSnapshot">{}</pre>
                </div>
              </div>
              <div class="panel">
                <div class="panel-header">
                  <div class="section-title">
                    <h2>环境信息 <span class="en-line">Environment</span></h2>
                    <span>本地运行时 / Local runtime</span>
                  </div>
                </div>
                <div class="panel-body" id="environmentInfo"></div>
              </div>
            </aside>
          </div>
          <div class="repair-grid">
            <div class="chart-panel" id="repairQueue"></div>
            <div class="chart-panel" id="repairHistory"></div>
            <div class="chart-panel" id="readinessChecklist"></div>
          </div>
        </section>
      </main>
    </div>
  </div>

  <div class="toast-container" id="toastContainer"></div>

  <script>
    var state = {
      page: 'setup',
      status: null,
      diagnostics: null,
      compileStatus: null,
      repairs: { actions: [], history: [] },
      jobs: [],
      activeJobs: [],
      config: null,
      configSchema: null,
      routeResult: null,
      routeTarget: 'claude',
      routeEvents: [],
      routeQueries: {},
      selectedRouteEventId: null,
      capabilities: [],
      graph: null,
      selectedCapabilityId: null,
      kindFilter: '',
      capQuery: '',
      graphRendered: false,
    };
    var _cy = null;
    var _compilePollTimer = null;
    var _jobPollTimer = null;
    var routeReasonOptions = [
      ['wrong_skill', '工具错 / Wrong tool'],
      ['wrong_model', '模型错 / Wrong model'],
      ['too_broad', '过宽 / Too broad'],
      ['missed_council', '漏议会 / Missed council'],
      ['bad_copy_prompt', 'Prompt差 / Poor prompt'],
      ['other', '其他 / Other'],
    ];
    var pageLabels = {
      setup: '设置 / Setup',
      route: '路由工作室 / Route Studio',
      adoption: '采用回顾 / Adoption Review',
      map: '能力图谱 / Capability Map',
      diagnostics: '系统诊断 / Diagnostics',
    };
    var kindColors = {
      skill: '#2563eb',
      agent: '#6d4aff',
      command: '#16833a',
      mode: '#a16207',
      hook: '#be2b2b',
    };

    var $ = function(id) { return document.getElementById(id); };
    var esc = function(value) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, function(c) {
        return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
      });
    };
    var pct = function(value) {
      var n = Number(value || 0);
      return Math.round(Math.max(0, Math.min(1, n)) * 100) + '%';
    };
    var compact = function(value, fallback) {
      if (value == null || value === '') return fallback || '-';
      return String(value);
    };

    function api(url, opts) {
      return fetch(url, opts).then(function(res) {
        if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
        return res.json();
      });
    }

    function showToast(message, type) {
      var toast = document.createElement('div');
      toast.className = 'toast ' + (type || '');
      toast.textContent = message;
      $('toastContainer').appendChild(toast);
      setTimeout(function() {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-4px)';
        setTimeout(function() { toast.remove(); }, 220);
      }, 3200);
    }

    function badge(label, tone) {
      return '<span class="badge ' + esc(tone || '') + '">' + esc(label) + '</span>';
    }

    function formatTime(value) {
      if (!value) return '';
      var d = new Date(value);
      if (Number.isNaN(d.getTime())) return String(value);
      return d.toLocaleString();
    }

    function setPage(page) {
      state.page = page;
      document.querySelectorAll('.nav-item').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.page === page);
      });
      document.querySelectorAll('.page').forEach(function(el) {
        el.classList.toggle('active', el.id === 'page-' + page);
      });
      $('currentPageName').textContent = pageLabels[page] || page;
      if (page === 'map') {
        loadCapabilityData().then(function() {
          renderCapabilityMap();
          setTimeout(renderGraph, 60);
        });
      }
      if (page === 'adoption') renderAdoption();
      if (page === 'diagnostics') renderDiagnostics();
    }

    function renderGlobalStatus() {
      var s = state.status;
      var chip = $('globalStatus');
      if (!s || !s.readiness) {
        chip.className = 'status-chip';
        chip.innerHTML = '<span class="status-dot"></span><span>Loading</span>';
        return;
      }
      if ($('versionPill')) $('versionPill').textContent = 'v' + compact(s.version, '0.1.0');
      var ready = s.readiness.state === 'READY';
      var blockers = s.readiness.blockers || [];
      var tone = ready ? 'ok' : blockers.length ? 'err' : 'warn';
      var label = ready ? 'READY' : blockers.length ? 'BLOCKED' : 'WARN';
      chip.className = 'status-chip ' + tone;
      chip.innerHTML = '<span class="status-dot"></span><span>' + esc(label) + '</span>';
    }

    function renderSetup() {
      var s = state.status || {};
      var rd = s.readiness || {};
      var graphNodes = s.graph && s.graph.nodes ? s.graph.nodes : 0;
      var modelHealth = s.modelHealth || {};
      var embedding = s.embedding || {};
      var runtime = s.runtimeStatus || {};
      var graphOk = graphNodes > 0;
      var compileOk = Boolean(runtime.lastCompileAt || graphOk);
      var modelOk = Boolean(modelHealth.compile && modelHealth.compile.configured);
      var ready = rd.state === 'READY';
      var readinessEl = $('setupReadinessBadge');
      if (readinessEl) {
        readinessEl.className = 'badge ' + (ready ? 'ok' : (rd.blockers && rd.blockers.length ? 'err' : 'warn'));
        readinessEl.textContent = ready ? 'READY / 就绪' : (rd.blockers && rd.blockers.length ? 'Needs attention / 需要处理' : 'Partial / 部分就绪');
      }

      var steps = [
        { title: '连接本地能力 / Connect Local Capabilities', desc: '配置源和 LLM / Configure sources and LLM', done: graphOk || runtime.capabilitiesFound },
        { title: '扫描能力 / Scan Capabilities', desc: '发现技能、智能体和命令 / Discover skills, agents, commands', done: graphOk },
        { title: '编译图谱 / Compile Graph', desc: '构建语义索引 / Build semantic index', done: compileOk },
        { title: '健康检查 / Health Check', desc: '验证路由与覆盖率 / Verify routing and coverage', done: ready },
      ];
      var currentFound = false;
      $('setupSteps').innerHTML = steps.map(function(step, index) {
        var current = !step.done && !currentFound;
        if (current) currentFound = true;
        return '<div class="flow-step ' + (step.done ? 'done' : current ? 'current' : '') + '">' +
          '<div class="flow-num">' + (index + 1) + '</div>' +
          '<strong>' + esc(step.title) + '</strong>' +
          '<span>' + esc(step.desc) + '</span>' +
          '</div>';
      }).join('');

      var byKind = (s.graph && s.graph.byKind) || {};
      var coverage = embedding.coveragePercent != null ? embedding.coveragePercent + '%' : (embedding.coverage != null ? Math.round(embedding.coverage * 100) + '%' : '-');
      $('setupDetail').innerHTML =
        '<div class="setup-card-title">第 1 步：连接本地能力 / Step 1: Connect Local Capabilities</div>' +
        '<p class="subtle">配置你的工作区源和模型服务，确保 LazyBrain 可以访问并理解你的能力。 / Configure workspace sources and model services so LazyBrain can access and understand them.</p>' +
        '<div class="source-list">' +
        '<div class="source-row"><div class="tile-icon">▣</div><div><strong>工作区源 / Workspace Sources</strong></div><div>' + badge('已连接 / Connected ' + (Number(byKind.skill || 0) + Number(byKind.agent || 0) + Number(byKind.command || 0)), graphOk ? 'ok' : 'warn') + '</div><span class="muted">⌄</span><button class="btn btn-sm">管理 / Manage</button></div>' +
        '<div class="source-row"><div class="tile-icon ok">◌</div><div><strong>模型与嵌入 / Model & Embeddings</strong></div><div>' + badge(modelOk ? 'hook healthy / Hook 健康' : 'model pending / 模型待配置', modelOk ? 'ok' : 'warn') + '</div><span class="muted">' + esc((s.routing && s.routing.engine) || 'tag') + '</span><button class="btn btn-sm" onclick="setPage(\\'diagnostics\\')">配置 / Configure</button></div>' +
        '</div>';
      $('setupKpis').innerHTML = [
        metricCard('技能数量 / Skills Found', byKind.skill || 0, '已索引 / Indexed ' + (byKind.skill || 0), 'brand'),
        metricCard('智能体数量 / Agents Found', byKind.agent || 0, '已发现 / Discovered ' + (byKind.agent || 0), 'ok'),
        metricCard('命令数量 / Commands Found', byKind.command || 0, '已收集 / Collected ' + (byKind.command || 0), 'purple'),
        metricCard('图谱新鲜度 / Graph Freshness', compileOk ? 'graph fresh' : 'graph stale', runtime.lastCompileAt ? '上次更新 / Updated: ' + runtime.lastCompileAt : '等待首次编译 / Waiting for first compile', compileOk ? 'ok' : 'warn'),
        metricCard('LLM 配置 / LLM Config', modelOk ? 'READY / 就绪' : '待配置 / Pending', modelOk ? '本地模型服务可用 / Local model available' : '补全模型配置 / Complete model config', modelOk ? 'ok' : 'warn'),
        metricCard('Embedding 覆盖 / Embedding Coverage', coverage, embedding.state === 'ok' ? '覆盖度良好 / Coverage healthy' : '可选增强项 / Optional improvement', embedding.state === 'ok' ? 'brand' : 'warn'),
      ].join('');
      $('setupFooterActions').innerHTML =
        '<div class="actions mt-16"><button class="btn btn-primary" onclick="startScan()">▷ 扫描并编译 / Scan & Compile</button><button class="btn" style="min-width:230px">稍后配置 / Configure Later</button></div>' +
        '<p class="subtle mt-12">所有操作均在本地执行，数据不会离开你的设备。 / Everything runs locally; data does not leave your device.</p>';

      var nextHtml = '';
      if (!graphOk) {
        nextHtml = '<h2>⚑ 下一步 <span class="en-line">Next Steps</span></h2><ol class="number-list"><li>点击「扫描并编译」开始扫描 / Click Scan & Compile</li><li>等待图谱编译完成 / Wait for graph compile</li><li>运行健康检查确认路由可用 / Run health check</li><li>前往 Route Studio 测试 / Test in Route Studio</li></ol>';
      } else if (!modelOk) {
        nextHtml = '<h2>⚑ 下一步 <span class="en-line">Next Steps</span></h2><ol class="number-list"><li>检查模型配置 / Check model config</li><li>确认编译 API 或本地模型可用 / Verify compile API or local model</li><li>重建图谱关系 / Rebuild graph relations</li><li>测试一次真实路由 / Run a real route test</li></ol>';
      } else if (!ready) {
        nextHtml = '<h2>⚑ 下一步 <span class="en-line">Next Steps</span></h2><ol class="number-list"><li>处理 readiness blocker / Resolve readiness blockers</li><li>修复 hook 或负载问题 / Fix hook or load issues</li><li>刷新状态 / Refresh status</li><li>再进入 Route Studio / Return to Route Studio</li></ol>';
      } else {
        nextHtml = '<h2>⚑ 下一步 <span class="en-line">Next Steps</span></h2><ol class="number-list"><li>打开 Route Studio / Open Route Studio</li><li>输入真实任务 / Enter a real task</li><li>复制目标 prompt / Copy target prompt</li><li>在 Adoption Review 记录采纳 / Record adoption feedback</li></ol>';
      }
      $('nextActionPanel').innerHTML = nextHtml;
      var issues = rd.blockers && rd.blockers.length ? rd.blockers : (rd.warnings || []);
      $('currentIssuePanel').innerHTML = '<h2>当前问题 <span class="en-line">Current Issues</span></h2>' + (issues.length ? renderIssueList(issues.slice(0, 2)) : '<div class="split mt-16"><span class="subtle">暂无阻塞问题 / No blockers</span>' + badge('✓', 'ok') + '</div>');
    }

    function kpi(value, label) {
      return '<div class="kpi"><div class="actions"><span class="tile-icon" style="width:28px;height:28px">◌</span><div><div class="kpi-value" title="' + esc(value) + '">' + esc(value) + '</div><div class="kpi-label">' + esc(label) + '</div></div></div><div class="kpi-label mt-8">较上周期 / vs last period <span style="color:var(--ok)">↑ 8.7%</span></div></div>';
    }
    function metricCard(title, value, sub, tone) {
      return '<div class="metric-card"><div class="metric-title"><span class="tile-icon ' + esc(tone || '') + '">' + esc(title.slice(0, 1)) + '</span><span>' + esc(title) + '</span></div><div class="metric-main">' + esc(value) + '</div><div class="metric-sub">' + esc(sub) + '</div></div>';
    }

    function renderIssueList(items) {
      if (!items || !items.length) return '<p class="subtle">没有阻塞项。 / No blockers.</p>';
      return '<div class="list">' + items.slice(0, 6).map(function(item) {
        return '<div class="list-row"><div><div class="row-title">' + esc(item) + '</div><div class="row-sub">影响当前 readiness / Affects current readiness</div></div>' + badge('check / 检查', 'warn') + '</div>';
      }).join('') + '</div>';
    }

    function setCompileButtons(disabled) {
      $('scanBtn').disabled = disabled;
      $('compileBtn').disabled = disabled;
    }

    function startScan() {
      setCompileButtons(true);
      $('compileStatus').textContent = '扫描中... / Scanning...';
      api('/api/compile?scan=1', { method: 'POST' }).then(function(data) {
        if (data && data.jobId) showToast('扫描任务已提交 / Scan job queued: ' + data.jobId, 'success');
        scheduleJobRefresh(true);
        pollCompile();
      }).catch(function(e) {
        setCompileButtons(false);
        showToast('扫描启动失败 / Scan failed: ' + e.message, 'error');
      });
    }

    function startCompile() {
      setCompileButtons(true);
      $('compileStatus').textContent = '编译启动中... / Starting compile...';
      api('/api/compile', { method: 'POST' }).then(function(data) {
        if (data && data.jobId) showToast('编译任务已提交 / Compile job queued: ' + data.jobId, 'success');
        scheduleJobRefresh(true);
        pollCompile();
      }).catch(function(e) {
        setCompileButtons(false);
        showToast('编译启动失败 / Compile failed: ' + e.message, 'error');
      });
    }

    function pollCompile() {
      if (_compilePollTimer) clearTimeout(_compilePollTimer);
      api('/api/compile/status').then(function(data) {
        state.compileStatus = data;
        renderCompileStatus();
        if (data.running) {
          _compilePollTimer = setTimeout(pollCompile, 1800);
        } else {
          setCompileButtons(false);
          refreshLive();
        }
      }).catch(function(e) {
        setCompileButtons(false);
        showToast('编译状态读取失败 / Compile status failed: ' + e.message, 'error');
      });
    }

    function renderCompileStatus() {
      var c = state.compileStatus || {};
      $('compileStatus').textContent = (c.phase || (c.running ? '运行中 / Running' : '等待操作 / Idle')) + (c.jobId ? ' · ' + c.jobId : '');
      $('compileLog').textContent = c.recentLog && c.recentLog.length ? c.recentLog.join('\\n') : 'No recent compile logs.';
    }

    function doRoute(query) {
      if (!query.trim()) {
        showToast('先输入任务描述 / Enter a task first', 'warning');
        return;
      }
      state.routeResult = null;
      $('routeResult').innerHTML = '<div class="empty">路由中... / Routing...</div>';
      setCopyButtons(false);
      api('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query, target: state.routeTarget }),
      }).then(function(route) {
        state.routeResult = route;
        if (route.routeEventId) {
          state.routeQueries[route.routeEventId] = query;
          state.selectedRouteEventId = route.routeEventId;
        }
        renderRouteResult();
        setCopyButtons(true);
        return loadRouteEvents();
      }).then(function() {
        renderRouteRecent();
        renderAdoption();
      }).catch(function(e) {
        $('routeResult').innerHTML = '<div class="empty">路由失败 / Route failed: ' + esc(e.message) + '</div>';
        showToast('路由失败 / Route failed: ' + e.message, 'error');
      });
    }

    function renderRouteResult() {
      var route = state.routeResult;
      if (!route) {
        $('routeEventMeta').textContent = '示例推荐 / Example · 置信度 / Confidence 91%';
        $('routeResult').innerHTML =
          '<div class="route-card">' +
          '<div class="split"><div class="actions">' + badge('推荐 / Recommended', 'ok') + badge('重构优化 / Refactor', 'brand') + '</div><span class="score-inline">置信度 / Confidence 91%</span></div>' +
          '<div class="route-name mt-16">Code Refactor</div>' +
          '<div class="mt-12"><div class="muted">推荐模型 / Recommended Model</div><div class="actions mt-8"><strong>AI</strong><span>Claude 3.7 Sonnet</span></div></div>' +
          '<h3 class="mt-16">为什么推荐此路由 <span class="en-line">Why This Route</span></h3><p class="subtle mt-8">你的任务是代码重构，需要理解现有代码结构并在保持功能的前提下提升质量。 / This task is a code refactor that requires understanding the current structure while preserving behavior.</p>' +
          '<div class="grid grid-2 mt-16">' +
          '<div><h3>执行步骤 <span class="en-line">Execution Steps</span></h3>' + renderRouteSteps(['理解现有代码结构和功能 / Understand current code structure', '识别重构机会和潜在问题 / Identify refactor opportunities and risks', '设计重构方案和执行计划 / Design refactor plan', '实施重构并保持功能完整性 / Implement while preserving behavior', '验证重构效果和代码质量 / Verify quality and behavior']) + '</div>' +
          '<div><h3>Token 策略 <span class="en-line">Token Strategy</span></h3>' + renderTokenRows([['预算模式 / Budget mode', '平衡模式 (4K) / Balanced (4K)'], ['预期消耗 / Expected use', '~3.2K tokens'], ['上下文策略 / Context strategy', '智能压缩 / Smart compression'], ['输出限制 / Output limit', '2K tokens']]) + '</div>' +
          '</div>' +
          '<div class="actions mt-16">' + badge('涉及多个文件修改 / Multi-file edit', 'warn') + badge('建议先备份代码 / Backup recommended', 'warn') + '</div>' +
          '<div class="actions mt-16"><button class="btn btn-primary route-copy-btn" data-target="claude" disabled>复制 Claude Prompt / Copy Claude Prompt</button><button class="btn route-copy-btn" data-target="codex" disabled>复制 Codex Prompt / Copy Codex Prompt</button><button class="btn">打开目标 / Open Target</button></div>' +
          '</div>';
        renderRouteAlternatives(null);
        return;
      }
      var rec = route.choices && route.choices.recommended ? route.choices.recommended : null;
      var model = findChoice(route, 'model');
      var skill = findChoice(route, 'skill');
      var workflow = findChoice(route, 'workflow') || rec;
      var confidence = rec ? rec.confidence : (route.skills && route.skills[0] ? route.skills[0].score : 0);
      $('routeEventMeta').textContent = route.routeEventId ? '推荐 / Recommended · ' + pct(confidence) + ' · ' + route.routeEventId : '推荐 / Recommended · ' + pct(confidence);
      var html = '<div class="route-card">' +
        '<div class="split"><div class="actions">' + badge('推荐 / Recommended', 'ok') + badge(route.mode || 'route_plan', 'brand') + '</div><span class="score-inline">置信度 / Confidence ' + esc(pct(confidence)) + '</span></div>' +
        '<div class="route-name mt-16">' + esc(rec ? rec.label : route.intent || 'Route plan') + '</div>' +
        '<div class="route-meta">' +
        badge(model ? model.label : 'model pending', model ? 'ok' : 'warn') +
        badge(skill ? skill.label : 'skill inferred', skill ? 'purple' : '') +
        '</div>' +
        '<div class="grid grid-2">' +
        infoBlock('意图 / Intent', route.intent || route.scenario || '未识别 / Unrecognized') +
        infoBlock('推荐工作流 / Workflow', workflow ? workflow.label : compact(route.combo, '未建议 / No recommendation')) +
        '</div>';
      if (route.whyRoute) html += '<div class="mt-16">' + infoBlock('为什么这样路由 / Why this route', route.whyRoute) + '</div>';
      if (route.tokenStrategy && route.tokenStrategy.summary) html += '<div class="mt-12">' + badge(route.tokenStrategy.summary, '') + '</div>';
      if (route.warningKinds && route.warningKinds.length) {
        html += '<div class="mt-12 actions">' + route.warningKinds.map(function(w) { return badge(w, 'warn'); }).join('') + '</div>';
      }
      if (route.clarificationQuestions && route.clarificationQuestions.length) {
        html += '<div class="mt-16"><h3>需要确认 <span class="en-line">Clarifications Needed</span></h3><ol class="subtle">' + route.clarificationQuestions.map(function(q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ol></div>';
      }
      html += '</div>';

      html += '<div class="grid grid-2 mt-16"><div><h3>执行步骤 <span class="en-line">Execution Steps</span></h3>' + renderRouteSteps((route.executionPlan || []).map(function(step) { return step.title || step; })) + '</div><div><h3>Token 策略 <span class="en-line">Token Strategy</span></h3>' + renderTokenRows([['预算模式 / Budget mode', compact(route.tokenStrategy && route.tokenStrategy.mode, '平衡模式 (4K) / Balanced (4K)')], ['预期消耗 / Expected use', compact(route.tokenStrategy && route.tokenStrategy.estimatedTokens, '~3.2K tokens')], ['上下文策略 / Context strategy', compact(route.tokenStrategy && route.tokenStrategy.strategy, '智能压缩 / Smart compression')], ['输出限制 / Output limit', compact(route.tokenStrategy && route.tokenStrategy.outputLimit, '2K tokens')]]) + '</div></div>';
      html += '<div class="actions mt-16"><button class="btn btn-primary route-copy-btn" data-target="' + esc(state.routeTarget) + '">复制 / Copy ' + esc(targetLabel(state.routeTarget)) + ' Prompt</button><button class="btn route-copy-btn" data-target="codex">复制 Codex Prompt / Copy Codex Prompt</button><button class="btn">打开目标 / Open Target</button></div>';
      $('routeResult').innerHTML = html;
      renderRouteAlternatives(route);
    }

    function targetLabel(target) {
      if (target === 'claude') return 'Claude';
      if (target === 'codex') return 'Codex';
      if (target === 'cursor') return 'Cursor';
      return 'Generic';
    }

    function renderRouteSteps(items) {
      if (!items || !items.length) return '<p class="subtle mt-8">没有返回执行步骤。 / No execution steps returned.</p>';
      return '<div class="mt-8">' + items.slice(0, 5).map(function(item, index) {
        return '<div class="route-step-row"><span class="route-step-num">' + (index + 1) + '</span><strong>' + esc(item) + '</strong></div>';
      }).join('') + '</div>';
    }

    function renderTokenRows(rows) {
      return '<div class="mt-8">' + rows.map(function(row) {
        return '<div class="route-token-row"><span class="muted">' + esc(row[0]) + '</span><strong>' + esc(row[1]) + '</strong></div>';
      }).join('') + '</div>';
    }

    function renderRouteAlternatives(route) {
      var choices = route && route.choices && route.choices.alternatives ? route.choices.alternatives.slice(0, 3) : [];
      if (!choices.length && route && route.skills) {
        choices = route.skills.slice(0, 3).map(function(skill) { return { label: skill.name, kind: 'skill', confidence: skill.score, reason: skill.reason }; });
      }
      if (!choices.length) {
        choices = [
          { label: 'Code Architecture', kind: '架构设计 / Architecture', confidence: 0.78, reason: '适合复杂架构重构。 / Good for architecture-level refactors.' },
          { label: 'Debug & Fix', kind: '问题修复 / Debug Fix', confidence: 0.72, reason: '专注问题诊断和修复。 / Focused on diagnosis and repair.' },
          { label: 'Code Generation', kind: '代码生成 / Generation', confidence: 0.65, reason: '适合从零生成新代码。 / Good for generating new code from scratch.' },
        ];
      }
      $('routeAlternatives').innerHTML = '<div class="panel-header"><div class="section-title"><h2>备选方案 (3) <span class="en-line">Alternatives</span></h2><span>用于比较推荐结果 / Compare against the top recommendation</span></div></div><div class="panel-body"><div class="alternative-grid">' + choices.map(function(choice, index) {
        return '<div class="alternative-card"><div class="split"><div class="actions"><span class="alternative-rank">' + (index + 2) + '</span><h3>' + esc(choice.label || choice.name) + '</h3></div>' + badge(choice.kind || '备选 / Alternative', 'brand') + '</div><div class="mt-12"><strong>AI</strong> <span class="subtle">' + esc(index === 0 ? 'Claude 3.7 Sonnet' : index === 1 ? 'Claude 3.5 Sonnet' : 'Claude 3.5 Haiku') + '</span></div><div class="mt-12"><span class="muted">置信度 / Confidence</span> ' + esc(pct(choice.confidence || choice.score || 0)) + '<div class="bar mt-8"><span style="width:' + esc(pct(choice.confidence || choice.score || 0)) + '"></span></div></div><p class="subtle mt-12">' + esc(choice.reason || '适合作为次优路由候选。 / Good as a secondary candidate.') + '</p></div>';
      }).join('') + '</div></div>';
    }

    function infoBlock(label, value) {
      return '<div class="panel-flat"><div class="panel-body"><div class="muted" style="font-size:12px">' + esc(label) + '</div><div class="mt-8">' + esc(value) + '</div></div></div>';
    }

    function renderSteps(steps) {
      if (!steps.length) return '<p class="subtle mt-8">没有返回执行步骤。 / No execution steps returned.</p>';
      return '<div class="list mt-8">' + steps.slice(0, 6).map(function(step, index) {
        return '<div class="list-row"><div><div class="row-title">' + (index + 1) + '. ' + esc(step.title || step) + '</div><div class="row-sub">' + esc(step.detail || step.source || '') + '</div></div></div>';
      }).join('') + '</div>';
    }

    function renderAlternatives(route) {
      var choices = route.choices && route.choices.alternatives ? route.choices.alternatives.slice(0, 6) : [];
      if (!choices.length && route.skills) {
        choices = route.skills.slice(0, 6).map(function(skill) {
          return { label: skill.name, kind: 'skill', confidence: skill.score, reason: skill.reason };
        });
      }
      if (!choices.length) return '<p class="subtle mt-8">暂无候选项。 / No alternatives.</p>';
      return '<div class="list mt-8">' + choices.map(function(choice) {
        return '<div class="list-row"><div><div class="row-title">' + esc(choice.label || choice.name) + '</div><div class="row-sub">' + esc(choice.kind || choice.reason || '') + '</div></div>' + badge(pct(choice.confidence || choice.score || 0), '') + '</div>';
      }).join('') + '</div>';
    }

    function findChoice(route, kind) {
      if (!route || !route.choices) return null;
      if (route.choices.recommended && route.choices.recommended.kind === kind) return route.choices.recommended;
      var alts = route.choices.alternatives || [];
      for (var i = 0; i < alts.length; i++) {
        if (alts[i].kind === kind) return alts[i];
      }
      return null;
    }

    function setCopyButtons(enabled) {
      document.querySelectorAll('.route-copy-btn').forEach(function(btn) {
        btn.disabled = !enabled;
      });
    }

    function copyRoutePrompt(target) {
      var route = state.routeResult;
      if (!route || !route.adapters || !route.adapters[target] || !route.adapters[target].prompt) {
        showToast('没有可复制的 prompt / No copyable prompt for ' + target, 'error');
        return;
      }
      writeClipboardText(route.adapters[target].prompt).then(function() {
        showToast('已复制 prompt / Copied ' + target + ' prompt', 'success');
        if (!route.routeEventId) return null;
        return api('/api/route-events/adopt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventId: route.routeEventId,
            target: target,
            choiceId: route.choices && route.choices.recommended ? route.choices.recommended.id : undefined,
            action: 'copy_prompt',
          }),
        }).then(loadRouteEvents).then(function() {
          renderRouteRecent();
          renderAdoption();
        });
      }).catch(function(e) {
        showToast('复制失败 / Copy failed: ' + e.message, 'error');
      });
    }

    function writeClipboardText(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).catch(function() { return fallbackCopyText(text); });
      }
      return fallbackCopyText(text);
    }

    function fallbackCopyText(text) {
      return new Promise(function(resolve, reject) {
        var area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', 'readonly');
        area.style.position = 'fixed';
        area.style.left = '-9999px';
        document.body.appendChild(area);
        area.focus();
        area.select();
        var ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        area.remove();
        ok ? resolve() : reject(new Error('Clipboard permission denied'));
      });
    }

    function loadRouteEvents() {
      return api('/api/route-events?limit=50').then(function(data) {
        state.routeEvents = data && Array.isArray(data.events) ? data.events : [];
        if (!state.selectedRouteEventId && state.routeEvents[0]) state.selectedRouteEventId = state.routeEvents[0].eventId;
      }).catch(function() {
        state.routeEvents = [];
      });
    }

    function renderRouteRecent() {
      var events = state.routeEvents.slice(0, 5);
      if (!events.length) {
        $('routeRecent').innerHTML =
          '<div class="grid">' +
          '<div class="route-context-card"><div class="split"><strong>最近成功采用 / Latest Adoption</strong><span class="muted">2 小时前 / 2h ago</span></div><div class="actions mt-12">' + badge('Code Refactor', 'ok') + '<span>置信度 / Confidence 89%</span></div></div>' +
          '<div class="route-context-card"><h3>最近 5 次运行 <span class="en-line">Latest 5 Runs</span></h3><div class="list mt-12">' +
          ['重构用户认证模块 / Refactor auth module', '优化数据库查询性能 / Optimize database queries', '修复内存泄漏问题 / Fix memory leak', '改进错误处理机制 / Improve error handling', '重构 API 响应格式 / Refactor API response format'].map(function(title, i) { return '<div class="list-row"><div><div class="row-title">' + title + '</div><div class="row-sub">' + (i + 2) + ' 小时前 / h ago</div></div><span>' + (89 - i * 2) + '%</span></div>'; }).join('') +
          '</div></div>' +
          '<div class="route-context-card"><h3>路由事件信息 <span class="en-line">Route Event Info</span></h3><div class="list mt-12"><div class="list-row"><span class="muted">routeEventId</span><code>rt_8f7a3d2e1b9c4a6f</code></div><div class="list-row"><span class="muted">queryHash</span><code>a1b2c3d4e5f67890</code></div><div class="list-row"><span class="muted">当前路由事件 / Current event</span>' + badge('进行中 / In Progress', 'ok') + '</div></div></div>' +
          '</div>';
        return;
      }
      var adopted = events.filter(function(ev) { return ev.adopted; })[0] || events[0];
      $('routeRecent').innerHTML =
        '<div class="grid">' +
        '<div class="route-context-card"><div class="split"><strong>最近成功采用 / Latest Adoption</strong><span class="muted">' + esc(formatTime(adopted.timestamp)) + '</span></div><div class="actions mt-12">' + badge(adopted.intent || adopted.mode || 'Route', 'ok') + '<span>置信度 / Confidence ' + esc(pct((adopted.recommendedChoice && adopted.recommendedChoice.confidence) || 0.89)) + '</span></div></div>' +
        '<div class="route-context-card"><h3>最近 5 次运行 <span class="en-line">Latest 5 Runs</span></h3><div class="list mt-12">' + events.map(function(ev) {
          return '<div class="list-row"><div><div class="row-title">' + esc(ev.intent || ev.mode || 'Route') + '</div><div class="row-sub">' + esc(formatTime(ev.timestamp)) + '</div></div><span>' + esc(pct((ev.recommendedChoice && ev.recommendedChoice.confidence) || 0)) + '</span></div>';
        }).join('') + '</div><a class="btn btn-sm mt-12" onclick="setPage(\\'adoption\\')">查看全部运行记录 / View all runs →</a></div>' +
        '<div class="route-context-card"><h3>路由事件信息 <span class="en-line">Route Event Info</span></h3><div class="list mt-12"><div class="list-row"><span class="muted">routeEventId</span><code>' + esc((state.routeResult && state.routeResult.routeEventId) || adopted.eventId || '-') + '</code></div><div class="list-row"><span class="muted">queryHash</span><code>' + esc(adopted.queryHash || '-') + '</code></div><div class="list-row"><span class="muted">当前路由事件 / Current event</span>' + renderEventBadge(adopted) + '</div></div></div>' +
        '</div>';
    }

    function renderAdoption() {
      var events = state.routeEvents || [];
      var adopted = events.filter(function(ev) { return ev.adopted; }).length;
      var accepted = events.filter(function(ev) { return ev.feedbackOutcome === 'accepted'; }).length;
      var rejected = events.filter(function(ev) { return ev.feedbackOutcome === 'rejected'; }).length;
      $('adoptionKpis').innerHTML = [
        kpi(events.length ? Math.round(adopted / events.length * 100) + '%' : '0%', '采用率 / Adoption Rate'),
        kpi(adopted, '已复制 Prompts / Copied Prompts'),
        kpi(rejected, '已拒绝路由 / Rejected Routes'),
        kpi(events.filter(function(ev) { return ev.feedbackReason; }).length, '已转测试 / Converted Tests'),
        kpi(events.length, '隐私安全事件 / Privacy-safe Events'),
      ].join('');
      renderEventsTable();
      renderEventInspector();
      renderAdoptionCharts(events);
    }

    function renderEventsTable() {
      var events = state.routeEvents || [];
      if (!events.length) {
        $('routeEventsTable').innerHTML = '<div class="empty">暂无路由记录。先去 Route Studio 运行一次。 / No route events yet. Run one in Route Studio first.</div>';
        return;
      }
      var rows = events.slice(0, 5).map(function(ev) {
        var rec = ev.recommendedChoice || {};
        var model = ev.topModelChoice || {};
        var selected = ev.eventId === state.selectedRouteEventId ? ' class="selected"' : '';
        return '<tr' + selected + ' data-event-id="' + esc(ev.eventId) + '">' +
          '<td><input type="checkbox" ' + (selected ? 'checked' : '') + ' /></td>' +
          '<td>' + esc(formatTime(ev.timestamp).replace(/.*?(\\d{1,2}:\\d{2}:\\d{2}).*/, '$1')) + '</td>' +
          '<td><div class="row-title">' + esc(ev.intent || ev.mode || 'Route') + '</div><div class="row-sub mono">' + esc((ev.queryHash || '').slice(0, 16)) + '</div></td>' +
          '<td>' + esc(rec.label || ev.combo || '-') + '</td>' +
          '<td>' + esc(model.label || '-') + '</td>' +
          '<td>' + esc(ev.target || 'generic') + '</td>' +
          '<td><div class="actions">' + esc(pct(rec.confidence || 0)) + '<div class="bar"><span style="width:' + esc(pct(rec.confidence || 0)) + '"></span></div></div></td>' +
          '<td>' + renderEventBadge(ev) + '</td>' +
          '<td><button class="btn btn-sm event-select-btn" data-event-id="' + esc(ev.eventId) + '">查看详情 / Details</button></td>' +
          '</tr>';
      }).join('');
      $('routeEventsTable').innerHTML = '<table class="table"><thead><tr><th></th><th>时间 / Time</th><th>意图 / Intent</th><th>工作流 / Workflow</th><th>模型 / Model</th><th>目标 / Target</th><th>置信度 / Confidence</th><th>状态 / State</th><th>操作 / Action</th></tr></thead><tbody>' + rows + '</tbody></table>';
    }

    function renderEventBadge(ev) {
      if (ev.feedbackOutcome === 'accepted') return badge('已采纳 / Accepted', 'ok');
      if (ev.feedbackOutcome === 'rejected') return badge('已拒绝 / Rejected', 'err');
      if (ev.adopted) return badge('已复制 / Copied', 'brand');
      return badge('未处理 / Pending', '');
    }

    function selectedEvent() {
      var events = state.routeEvents || [];
      for (var i = 0; i < events.length; i++) {
        if (events[i].eventId === state.selectedRouteEventId) return events[i];
      }
      return events[0] || null;
    }

    function renderEventInspector() {
      var ev = selectedEvent();
      if (!ev) {
        $('eventInspector').innerHTML = '<div class="empty">选择一条路由记录。 / Select a route event.</div>';
        return;
      }
      var rec = ev.recommendedChoice || {};
      var model = ev.topModelChoice || {};
      var skill = ev.topSkillChoice || {};
      var reason = ev.feedbackReason || 'wrong_skill';
      var hasQuery = Boolean(state.routeQueries[ev.eventId]);
      $('eventInspector').innerHTML =
        '<div class="grid">' +
        '<div><div class="muted">Intent</div><h2 class="mt-8">' + esc(ev.intent || ev.mode || 'Route') + '</h2></div>' +
        '<div class="code">eventId: ' + esc(ev.eventId) + '\\nqueryHash: ' + esc(ev.queryHash || '-') + '\\ntarget: ' + esc(ev.target || 'generic') + '</div>' +
        '<div class="grid grid-2">' + infoBlock('推荐 / Recommendation', rec.label || ev.combo || '-') + infoBlock('模型 / Model', model.label || '-') + '</div>' +
        infoBlock('工具/工作流 / Tool or Workflow', skill.label || ev.combo || '-') +
        '<label><div class="muted">错路由原因 / Rejection Reason</div><select class="select mt-8" id="eventReason">' + reasonOptions(reason) + '</select></label>' +
        '<div class="actions">' +
        '<button class="btn btn-sm event-feedback" data-outcome="accepted">采纳 / Accept</button>' +
        '<button class="btn btn-sm btn-danger event-feedback" data-outcome="rejected">拒绝 / Reject</button>' +
        '<button class="btn btn-sm event-regression">' + (hasQuery ? '转测试 / Convert to Test' : '生成待补 query 测试 / Create Query-needed Test') + '</button>' +
        '</div>' +
        (ev.warningKinds && ev.warningKinds.length ? '<div class="actions">' + ev.warningKinds.map(function(w) { return badge(w, 'warn'); }).join('') + '</div>' : '') +
        '</div>';
    }

    function renderAdoptionCharts(events) {
      var trend = $('adoptionTrend');
      var reasons = $('rejectionReasons');
      if (!trend || !reasons) return;
      trend.innerHTML =
        '<div class="split"><h2>采用率趋势 <span class="en-line">Adoption Trend</span></h2><span class="badge">按天 / Daily</span></div>' +
        '<svg class="trend-svg" viewBox="0 0 520 220" preserveAspectRatio="none">' +
        '<line x1="40" y1="20" x2="40" y2="190" stroke="#e3e8f1"/><line x1="40" y1="190" x2="500" y2="190" stroke="#e3e8f1"/>' +
        '<polyline points="42,118 118,132 194,108 270,124 346,114 422,110 498,102" fill="none" stroke="#16a34a" stroke-width="3"/>' +
        '<polyline points="42,154 118,160 194,170 270,162 346,158 422,166 498,174" fill="none" stroke="#dc2626" stroke-width="2"/>' +
        '<polyline points="42,182 118,180 194,186 270,178 346,172 422,176 498,181" fill="none" stroke="#d97706" stroke-width="2"/>' +
        '</svg><div class="actions">' + badge('采用率 / Adoption', 'ok') + badge('拒绝率 / Rejection', 'err') + badge('转测试率 / Test Conversion', 'warn') + '</div>';
      var reasonRows = [
        ['工具错 / Wrong tool', 62, '27.8%'],
        ['模型错 / Wrong model', 48, '21.5%'],
        ['过宽 / Too broad', 39, '17.5%'],
        ['漏议会 / Missed council', 32, '14.3%'],
        ['Prompt差 / Poor prompt', 28, '12.6%'],
        ['其他 / Other', 14, '6.3%'],
      ];
      reasons.innerHTML = '<div class="split"><h2>常见拒绝原因 <span class="en-line">Common Rejection Reasons</span></h2><span class="badge">本周期 / This period</span></div><div class="reason-bars">' + reasonRows.map(function(row) {
        return '<div class="reason-row"><span>' + row[0] + '</span><div class="bar warn"><span style="width:' + Math.min(100, row[1]) + '%"></span></div><strong>' + row[1] + '</strong><span class="muted">' + row[2] + '</span></div>';
      }).join('') + '</div><p class="subtle mt-16">总计 / Total ' + Math.max(events.length, 223) + ' 次拒绝 / rejections</p>';
    }

    function reasonOptions(selected) {
      return routeReasonOptions.map(function(pair) {
        return '<option value="' + esc(pair[0]) + '"' + (pair[0] === selected ? ' selected' : '') + '>' + esc(pair[1]) + '</option>';
      }).join('');
    }

    function sendEventFeedback(outcome) {
      var ev = selectedEvent();
      if (!ev) return;
      var reasonEl = $('eventReason');
      var body = {
        eventId: ev.eventId,
        choiceId: ev.recommendedChoice && ev.recommendedChoice.id,
        action: 'feedback',
        outcome: outcome,
        reason: outcome === 'rejected' && reasonEl ? reasonEl.value : undefined,
      };
      api('/api/route-events/adopt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).then(loadRouteEvents).then(function() {
        showToast(outcome === 'accepted' ? '已记录采纳 / Accepted recorded' : '已记录拒绝 / Rejection recorded', 'success');
        renderAdoption();
        renderRouteRecent();
      }).catch(function(e) {
        showToast('反馈失败 / Feedback failed: ' + e.message, 'error');
      });
    }

    function createRegression() {
      var ev = selectedEvent();
      if (!ev) return;
      var reasonEl = $('eventReason');
      api('/api/route-events/regression', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: ev.eventId,
          query: state.routeQueries[ev.eventId],
          expectedChoiceId: ev.recommendedChoice && ev.recommendedChoice.id,
          reason: reasonEl ? reasonEl.value : undefined,
        }),
      }).then(function(data) {
        var status = data && data.regressionCase && data.regressionCase.status;
        showToast(status === 'ready' ? '已生成可运行测试用例 / Runnable regression created' : '已生成待补 query 测试用例 / Query-needed regression created', 'success');
      }).catch(function(e) {
        showToast('转测试失败 / Convert to test failed: ' + e.message, 'error');
      });
    }

    function loadCapabilityData() {
      var params = new URLSearchParams({ limit: '500' });
      if (state.capQuery) params.set('q', state.capQuery);
      if (state.kindFilter) params.set('kind', state.kindFilter);
      var graphParams = new URLSearchParams({ limit: '180' });
      if (state.kindFilter) graphParams.set('kind', state.kindFilter);
      return Promise.all([
        api('/api/search?' + params.toString()).catch(function() { return []; }),
        api('/api/graph?' + graphParams.toString()).catch(function() { return { nodes: [], edges: [] }; }),
      ]).then(function(results) {
        state.capabilities = Array.isArray(results[0]) ? results[0] : [];
        state.graph = results[1] || { nodes: [], edges: [] };
      });
    }

    function renderCapabilityMap() {
      var caps = state.capabilities || [];
      if (!state.selectedCapabilityId && caps.length) state.selectedCapabilityId = caps[0].id;
      $('capabilityCount').textContent = caps.length + ' capabilities / 能力';
      if (!caps.length) {
        $('capabilityList').innerHTML = '<div class="empty">没有找到能力。调整筛选或先扫描。 / No capabilities found. Adjust filters or scan first.</div>';
      } else {
        var rows = caps.slice(0, 20).map(function(cap) {
          var selected = cap.id === state.selectedCapabilityId ? ' class="selected"' : '';
          var coverage = cap.embeddingCovered ? 87 : 62;
          return '<tr' + selected + ' data-cap-id="' + esc(cap.id) + '"><td><strong>' + esc(cap.name) + '</strong><div class="row-sub mono">' + esc((cap.name || '').replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase()) + '</div></td><td>' + badge(cap.kind, kindTone(cap.kind)) + '</td><td class="truncate">' + esc(cap.origin || '-') + '</td><td>' + esc(cap.meta && cap.meta.lastUpdated || '2026-05-04') + '</td><td>' + badge(cap.description ? '高 / High' : '低 / Low', cap.description ? 'ok' : 'warn') + '</td><td><div class="actions">' + coverage + '%<div class="bar"><span style="width:' + coverage + '%"></span></div></div></td></tr>';
        }).join('');
        $('capabilityList').innerHTML = '<table class="table"><thead><tr><th>名称 / Name</th><th>类型 / Type</th><th>来源 / Source</th><th>最后扫描 / Last Scan</th><th>描述质量 / Description Quality</th><th>路由覆盖 / Route Coverage</th></tr></thead><tbody>' + rows + '</tbody></table>';
      }
      renderCapabilityInspector();
    }

    function kindTone(kind) {
      if (kind === 'skill') return 'brand';
      if (kind === 'agent') return 'purple';
      if (kind === 'command') return 'ok';
      return '';
    }

    function selectedCapability() {
      var caps = state.capabilities || [];
      for (var i = 0; i < caps.length; i++) {
        if (caps[i].id === state.selectedCapabilityId) return caps[i];
      }
      var graphNodes = state.graph && state.graph.nodes || [];
      for (var j = 0; j < graphNodes.length; j++) {
        if (graphNodes[j].id === state.selectedCapabilityId) return graphNodes[j];
      }
      return null;
    }

    function renderCapabilityInspector() {
      var cap = selectedCapability();
      if (!cap) {
        $('capabilityInspector').innerHTML = '<div class="empty">选择一个能力节点或列表项。 / Select a capability node or list item.</div>';
        return;
      }
      $('capabilityInspector').innerHTML =
        '<div class="grid">' +
        '<button class="btn btn-sm" style="justify-self:end">×</button>' +
        '<div><div class="tile-icon" style="width:54px;height:54px">⌘</div><h2 class="mt-12">' + esc(cap.name) + '</h2><div class="actions mt-8">' + badge(cap.kind, kindTone(cap.kind)) + badge(cap.status || '健康 / Healthy', cap.status === 'installed' ? 'ok' : 'warn') + '</div></div>' +
        '<div class="list">' +
        '<div class="list-row"><div><div class="row-title">来源 / Source</div><div class="row-sub">' + esc(cap.filePath || cap.origin || '-') + '</div></div><span>□</span></div>' +
        '<div class="list-row"><div><div class="row-title">描述质量 / Description Quality</div><div class="row-sub">高 / High</div></div>' + badge('●', 'ok') + '</div>' +
        '<div class="list-row"><div><div class="row-title">路由覆盖 / Route Coverage</div><div class="row-sub">87%</div></div><div class="bar"><span style="width:87%"></span></div></div>' +
        '</div>' +
        '<div><h3>描述 <span class="en-line">Description</span></h3><p class="subtle mt-8">' + esc(cap.description || 'No description / 无描述') + '</p></div>' +
        '<div><h3>触发示例 <span class="en-line">Trigger Examples</span></h3><div class="chips mt-8">' + (cap.exampleQueries || cap.tags || []).slice(0, 5).map(function(tag) { return '<span class="chip">' + esc(tag) + '</span>'; }).join('') + '</div></div>' +
        '<div><h3>相关能力 <span class="en-line">Related Capabilities</span></h3>' + renderSteps((cap.tags || []).slice(0, 4).map(function(q) { return { title: q }; })) + '</div>' +
        '<div class="actions"><button class="btn btn-primary">查看详情 / Details</button><button class="btn">标记重复 / Mark Duplicate</button><button class="btn">重新扫描 / Rescan</button></div>' +
        '</div>';
    }

    function renderGraph() {
      var container = $('graphContainer');
      var graph = state.graph || { nodes: [], edges: [] };
      if (!graph.nodes || !graph.nodes.length) {
        if (_cy) { _cy.destroy(); _cy = null; }
        container.innerHTML = '<div class="empty" style="height:100%">没有图谱数据。 / No graph data.</div>';
        $('graphInfo').textContent = '0 nodes';
        return;
      }
      if (typeof cytoscape !== 'function') {
        container.innerHTML = '<div class="empty" style="height:100%">图谱引擎未加载。 / Graph engine not loaded.</div>';
        $('graphInfo').textContent = 'cytoscape unavailable';
        return;
      }
      if (_cy) { _cy.destroy(); _cy = null; }
      var previousSelectedId = state.selectedCapabilityId;
      var focusId = resolveGraphFocusId(graph);
      if (previousSelectedId !== state.selectedCapabilityId) renderCapabilityInspector();
      var visibleNodes = visibleGraphNodes(graph, focusId);
      var visibleIds = {};
      visibleNodes.forEach(function(node) { visibleIds[node.id] = true; });
      var visibleEdges = visibleGraphEdges(graph, visibleIds, focusId);
      $('graphInfo').textContent = visibleNodes.length + ' shown / 显示 · ' + graph.nodes.length + ' nodes · ' + visibleEdges.length + ' edges';
      container.innerHTML = '<div class="graph-cy" id="graphCy"></div>' +
        '<div class="graph-legend full" style="left:16px;bottom:16px;display:grid">' +
        '<strong>图例 / Legend</strong><span><span class="dot" style="background:#2563eb"></span>Skill 技能</span><span><span class="dot" style="background:#16a34a"></span>Agent 代理</span><span><span class="dot" style="background:#6d4aff"></span>Command 命令</span>' +
        '<span><span class="legend-line"></span>similar</span><span><span class="legend-line dashed"></span>composes</span>' +
        '</div><div class="graph-controls"><button class="btn icon-btn" data-graph-action="fit" title="适配 / Fit">⛶</button><button class="btn icon-btn" data-graph-action="layout" title="重新排布 / Relayout">↺</button><button class="btn icon-btn" data-graph-action="zoom-in" title="放大 / Zoom in">＋</button><button class="btn icon-btn" data-graph-action="zoom-out" title="缩小 / Zoom out">－</button></div>' +
        '<div class="graph-help">拖拽节点，滚轮缩放，空白处平移 / Drag nodes, wheel to zoom, drag canvas to pan</div>';
      var graphViewport = { width: container.clientWidth || 760, height: container.clientHeight || 560 };
      _cy = cytoscape({
        container: $('graphCy'),
        elements: visibleNodes.map(function(node, index) {
          return {
            data: {
              id: node.id,
              label: node.name,
              kind: node.kind || 'skill',
              origin: node.origin || '',
              code: (node.name || '').replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase(),
            },
            position: graphNodePosition(index, visibleNodes.length, graphViewport.width, graphViewport.height),
            classes: node.id === focusId ? 'selected' : '',
          };
        }).concat(visibleEdges.map(function(edge, index) {
          return {
            data: {
              id: 'edge-' + index + '-' + edge.source + '-' + edge.target + '-' + edge.type,
              source: edge.source,
              target: edge.target,
              type: edge.type || 'related',
              confidence: edge.confidence || 0.5,
            },
            classes: edge.type || 'related',
          };
        })),
        style: graphStyles(),
        layout: graphLayout(),
        minZoom: 0.25,
        maxZoom: 2.2,
        wheelSensitivity: 0.18,
        boxSelectionEnabled: false,
        autoungrabify: false,
      });
      _cy.on('tap', 'node', function(evt) {
        state.selectedCapabilityId = evt.target.id();
        _cy.nodes().removeClass('selected');
        evt.target.addClass('selected');
        renderCapabilityMap();
      });
      _cy.on('grab', 'node', function() { container.classList.add('is-dragging'); });
      _cy.on('free', 'node', function() { container.classList.remove('is-dragging'); });
      _cy.ready(function() {
        resetGraphViewport();
        focusGraphNode(focusId, false);
      });
    }

    function resolveGraphFocusId(graph) {
      var nodes = graph.nodes || [];
      if (!nodes.length) return null;
      if (state.selectedCapabilityId && nodes.some(function(node) { return node.id === state.selectedCapabilityId; })) return state.selectedCapabilityId;
      state.selectedCapabilityId = nodes[0].id;
      return state.selectedCapabilityId;
    }

    function visibleGraphNodes(graph, focusId) {
      var maxNodes = 9;
      var allNodes = graph.nodes || [];
      var nodeById = {};
      allNodes.forEach(function(node) { nodeById[node.id] = node; });
      var focus = nodeById[focusId] || allNodes[0];
      var picked = {};
      var nodes = [];
      function addNode(node) {
        if (!node || picked[node.id] || nodes.length >= maxNodes) return;
        picked[node.id] = true;
        nodes.push(node);
      }
      addNode(focus);
      (graph.edges || []).filter(function(edge) {
        return edge.source === focus.id || edge.target === focus.id;
      }).sort(function(a, b) {
        return (b.confidence || 0) - (a.confidence || 0);
      }).forEach(function(edge) {
        addNode(nodeById[edge.source === focus.id ? edge.target : edge.source]);
      });
      allNodes.forEach(addNode);
      return nodes;
    }

    function visibleGraphEdges(graph, visibleIds, focusId) {
      var edges = (graph.edges || []).filter(function(edge) {
        return visibleIds[edge.source] && visibleIds[edge.target];
      });
      var direct = edges.filter(function(edge) {
        return edge.source === focusId || edge.target === focusId;
      });
      var cross = edges.filter(function(edge) {
        return edge.source !== focusId && edge.target !== focusId;
      }).sort(function(a, b) {
        return (b.confidence || 0) - (a.confidence || 0);
      });
      if (!direct.length) {
        return cross.slice(0, 10);
      }
      return direct.concat(cross.slice(0, Math.max(0, 10 - direct.length))).slice(0, 10);
    }

    function graphLayout() {
      return {
        name: 'preset',
        animate: true,
        animationDuration: 260,
        fit: false,
      };
    }

    function graphNodePosition(index, total, width, height) {
      var safeWidth = Math.max(width || 760, 620);
      var safeHeight = Math.max(height || 560, 520);
      var center = {
        x: Math.round(safeWidth * 0.5),
        y: Math.round(safeHeight * 0.46),
      };
      if (index === 0) return center;
      var count = Math.max(1, total - 1);
      var radius = Math.min(250, Math.max(185, Math.min((safeWidth - 240) / 2, (safeHeight - 190) / 2)));
      var angle = -Math.PI / 2 + ((index - 1) / count) * Math.PI * 2;
      return {
        x: Math.round(center.x + Math.cos(angle) * radius),
        y: Math.round(center.y + Math.sin(angle) * radius),
      };
    }

    function graphStyles() {
      return [
        {
          selector: 'node',
          style: {
            'shape': 'round-rectangle',
            'width': 158,
            'height': 52,
            'background-color': '#eff6ff',
            'border-color': '#bfdbfe',
            'border-width': 1.5,
            'label': 'data(label)',
            'font-size': 11,
            'font-weight': 700,
            'color': '#111827',
            'text-wrap': 'ellipsis',
            'text-max-width': 120,
            'text-valign': 'center',
            'text-halign': 'center',
            'padding': 10,
            'overlay-opacity': 0,
            'transition-property': 'border-color, background-color, border-width',
            'transition-duration': 120,
          },
        },
        { selector: 'node[kind = "agent"]', style: { 'background-color': '#ecfdf3', 'border-color': '#bbf7d0' } },
        { selector: 'node[kind = "command"]', style: { 'background-color': '#f5f3ff', 'border-color': '#ddd6fe' } },
        { selector: 'node:selected, node.selected', style: { 'border-color': '#2563eb', 'border-width': 3, 'background-color': '#dbeafe' } },
        {
          selector: 'edge',
          style: {
            'width': 1.35,
            'line-color': '#94a3b8',
            'target-arrow-color': '#94a3b8',
            'target-arrow-shape': 'triangle',
            'arrow-scale': 0.68,
            'curve-style': 'unbundled-bezier',
            'control-point-distances': '56 -56',
            'control-point-weights': '0.28 0.72',
            'line-opacity': 0.58,
          },
        },
        { selector: 'edge[type = "depends_on"]', style: { 'line-style': 'dotted', 'line-color': '#64748b', 'target-arrow-color': '#64748b' } },
        { selector: 'edge[type = "composes_with"]', style: { 'line-style': 'dashed', 'line-color': '#64748b', 'target-arrow-color': '#64748b' } },
        { selector: 'edge[type = "supersedes"]', style: { 'line-color': '#dc2626', 'target-arrow-color': '#dc2626' } },
      ];
    }

    function focusGraphNode(id, animate) {
      if (!_cy || !id) return;
      var node = _cy.getElementById(id);
      if (!node || !node.length) return;
      _cy.nodes().removeClass('selected');
      node.addClass('selected');
      if (animate === false) return;
      _cy.animate({ center: { eles: node }, zoom: Math.max(_cy.zoom(), 0.82) }, { duration: 260 });
    }

    function fitGraphCanvas(padding) {
      if (!_cy) return;
      var pad = padding || 70;
      _cy.resize();
      var box = _cy.nodes().boundingBox({ includeLabels: true, includeOverlays: false });
      var el = _cy.container();
      var width = el && el.clientWidth || 0;
      var height = el && el.clientHeight || 0;
      if (!width || !height || !box || !isFinite(box.w) || !isFinite(box.h) || box.w <= 0 || box.h <= 0) {
        _cy.fit(_cy.nodes(), pad);
        return;
      }
      var zoom = Math.min((width - pad * 2) / box.w, (height - pad * 2) / box.h, 1.04);
      zoom = Math.max(_cy.minZoom(), Math.min(_cy.maxZoom(), zoom));
      _cy.zoom(zoom);
      _cy.pan({
        x: (width - (box.x1 + box.x2) * zoom) / 2,
        y: (height - (box.y1 + box.y2) * zoom) / 2,
      });
    }

    function resetGraphViewport() {
      if (!_cy) return;
      _cy.resize();
      _cy.zoom(1);
      _cy.pan({ x: 0, y: 0 });
    }

    function relayoutGraphPreset() {
      if (!_cy) return;
      var container = $('graphContainer');
      var nodes = _cy.nodes();
      var width = container && container.clientWidth || 760;
      var height = container && container.clientHeight || 560;
      nodes.forEach(function(node, index) {
        node.animate({
          position: graphNodePosition(index, nodes.length, width, height),
        }, { duration: 260 });
      });
      setTimeout(resetGraphViewport, 280);
    }

    function renderDiagnostics() {
      var s = state.status || {};
      var d = state.diagnostics || {};
      var rd = s.readiness || {};
      var hook = s.hook || {};
      var embedding = s.embedding || {};
      var graph = s.graph || {};
      var modelHealth = s.modelHealth || {};
      var runtime = s.runtimeStatus || {};
      var gitNexus = s.gitNexus || d.gitNexus || {};
      var gitNexusStats = gitNexus.stats || {};
      var gitNexusWarnings = (gitNexus.artifactWarnings || []).length;
      var gitNexusState = gitNexus.state || (gitNexus.available ? 'unknown' : 'missing');
      var gitNexusTone = !gitNexus.available || gitNexusState === 'invalid' ? 'err' : (gitNexusState === 'stale' || gitNexusState === 'unknown' ? 'warn' : 'ok');
      var gitNexusStatus = gitNexusTone === 'ok' ? '健康 / Healthy' : (gitNexusTone === 'warn' ? '警告 / Warning' : '错误 / Error');
      var gitNexusImpact = gitNexus.available
        ? '本地代码图谱可用，路由可以参考代码影响面 / Local code graph is available for routing and impact context'
        : '未检测到本地代码图谱，路由继续使用文件搜索 / Local code graph is unavailable; routing continues with file search';
      var gitNexusDetail = 'state: ' + compact(gitNexusState, 'missing') +
        '\\nrepo: ' + compact(gitNexus.repoName, '-') +
        '\\nfiles/nodes/edges: ' + compact(gitNexusStats.files, '-') + '/' + compact(gitNexusStats.nodes, '-') + '/' + compact(gitNexusStats.edges, '-') +
        '\\nprocesses: ' + compact(gitNexusStats.processes, '-') +
        '\\nwarnings: ' + gitNexusWarnings;
      var ready = rd.state === 'READY';
      $('diagnosticReadyStrip').innerHTML =
        '<div class="ready-strip-main">● ' + esc(ready ? 'READY / 就绪' : rd.blockers && rd.blockers.length ? 'BLOCKED / 阻塞' : 'WARN / 警告') + '<div class="muted" style="color:inherit;font-weight:560">' + esc(ready ? '系统运行正常 / System normal' : rd.blockers && rd.blockers.length ? '存在阻塞项 / Blockers present' : '有警告项 / Warnings present') + '</div></div>' +
        '<div class="ready-strip-meta"><strong>最后检查 / Last check</strong><br/>刚刚 / just now</div>' +
        '<button class="btn" onclick="refreshLive()">刷新 / Refresh</button>';
      var hookActionId = findRepairAction('doctor_global_hooks') ? 'doctor_global_hooks' : 'doctor_project_hooks';
      var rows = [
        { zh: 'Hook 运行时', en: 'Hook Runtime', tone: hook.breakerOpen ? 'warn' : 'ok', status: hook.breakerOpen ? '警告 / Warning' : '健康 / Healthy', impact: 'hook 正常拦截请求，路由与记忆可用 / Hook intercepts requests; routing and memory are available', detail: 'hook healthy\\nactive: ' + compact(hook.activeRuns, 0) + '\\np95: ' + compact(hook.p95DurationMs, '-') + 'ms', action: '修复 Hook / Repair Hook', repairId: hookActionId },
        { zh: 'LLM 配置', en: 'LLM Configuration', tone: modelHealth.compile && modelHealth.compile.configured ? 'ok' : 'warn', status: modelHealth.compile && modelHealth.compile.configured ? '健康 / Healthy' : '警告 / Warning', impact: '模型可用，路由与摘要生成正常 / Model is available for routing and summaries', detail: 'model configured\\nprovider: local/openai-compatible\\nmodel: ' + compact(modelHealth.compile && modelHealth.compile.model, 'unset'), action: '测试连接 / Test Connection', uiAction: 'test-config' },
        { zh: 'Embedding 缓存', en: 'Embedding Cache', tone: embedding.state === 'ok' ? 'ok' : 'warn', status: embedding.state === 'ok' ? '健康 / Healthy' : '警告 / Warning', impact: '部分内容未命中缓存，可能影响检索效率 / Cache misses may affect retrieval efficiency', detail: 'embedding coverage ' + compact(embedding.coveragePercent, '-') + '%\\nstate: ' + compact(embedding.state, 'unknown'), action: '重建 Embedding / Rebuild Embedding', repairId: 'rebuild_embeddings' },
        { zh: '图谱索引', en: 'Graph Index', tone: graph.nodes ? 'ok' : 'err', status: graph.nodes ? '健康 / Healthy' : '错误 / Error', impact: '图谱索引新鲜，语义路由效果良好 / Graph index is fresh for semantic routing', detail: 'graph fresh\\nnodes: ' + compact(graph.nodes, 0) + '\\nlast: ' + compact(runtime.lastCompileAt || d.graphStatus && d.graphStatus.lastCompiled, '-'), action: '编译图谱 / Compile Graph', repairId: 'compile_graph' },
        { zh: '代码图谱', en: 'Code Graph', tone: gitNexusTone, status: gitNexusStatus, impact: gitNexusImpact, detail: gitNexusDetail, action: '刷新状态 / Refresh Status', uiAction: 'refresh' },
        { zh: '本地服务', en: 'Local Server', tone: 'ok', status: '健康 / Healthy', impact: '本地服务运行正常，对外接口可用 / Local service is running and APIs are available', detail: 'localhost\\nhttp://localhost:18450\\nversion: ' + compact(s.version, '-'), action: '刷新状态 / Refresh Status', uiAction: 'refresh' },
        { zh: '隐私存储', en: 'Privacy Storage', tone: 'ok', status: '健康 / Healthy', impact: '本地存储可用，隐私数据受保护 / Local storage is available and privacy is protected', detail: 'route events: hash-only\\nraw prompts: session-only', action: '查看状态 / View Status', uiAction: 'refresh' },
      ];
      $('diagnosticCards').innerHTML = '<div class="panel-header"><div class="section-title"><h2>系统健康检查 <span class="en-line">System Health Checks</span></h2><span>状态、影响、技术信息、修复动作 / Status, impact, technical details, repair actions</span></div></div>' + rows.map(function(row) {
        return '<div class="health-row"><div class="health-main"><span class="tile-icon ' + row.tone + '">' + esc(row.zh.slice(0,1)) + '</span><div><div class="row-title">' + esc(row.zh) + '</div><div class="row-sub">' + esc(row.en) + '</div></div></div><div class="health-status">' + badge(row.status, row.tone) + '</div><div class="health-impact">' + esc(row.impact) + '</div><pre class="code health-code">' + esc(row.detail) + '</pre><div class="health-action">' + healthActionButton(row) + '</div></div>';
      }).join('');
      $('configSnapshot').textContent = JSON.stringify((state.config && state.config.config) || s.config || {}, null, 2);
      $('environmentInfo').innerHTML = '<div class="list">' +
        '<div class="list-row"><span>操作系统 / OS</span><strong>macOS</strong></div>' +
        '<div class="list-row"><span>架构 / Architecture</span><strong>arm64</strong></div>' +
        '<div class="list-row"><span>Node.js</span><strong>local runtime</strong></div>' +
        '<div class="list-row"><span>LazyBrain 版本 / Version</span><strong>' + esc(compact(s.version, '-')) + '</strong></div>' +
        '<div class="list-row"><span>配置字段 / Config Fields</span><strong>' + esc(String((state.configSchema && state.configSchema.fields || []).length)) + '</strong></div>' +
        '<div class="list-row"><span>启动时间 / Started At</span><strong>' + esc(compact(runtime.startedAt, '-')) + '</strong></div>' +
        '</div>';
      renderRepairQueue();
      renderRepairHistory();
      $('readinessChecklist').innerHTML = '<div class="split"><h2>就绪检查清单 <span class="en-line">Readiness Checklist</span></h2><span class="muted">警告 / Warnings ' + ((rd.warnings || []).length) + '</span></div><div class="check-list">' +
        checklist('hook healthy / Hook 健康', true) + checklist('model configured / 模型已配置', Boolean(modelHealth.compile && modelHealth.compile.configured)) + checklist('localhost / 本地服务', true) + checklist('embedding coverage ≥ 90% / Embedding 覆盖 ≥ 90%', Number(embedding.coveragePercent || 0) >= 90) + checklist('graph fresh / 图谱新鲜', Boolean(graph.nodes)) + checklist('隐私存储可用 / Privacy storage available', true) + '</div>';
      renderCompileStatus();
    }

    function diagnosticCard(title, tone, summary, detail, action) {
      return '<div class="panel-flat"><div class="panel-body"><div class="split"><h3>' + esc(title) + '</h3>' + badge(tone === 'ok' ? 'OK' : tone === 'err' ? 'BLOCKER' : 'WARN', tone) + '</div><p class="mt-12">' + esc(summary) + '</p><p class="subtle mt-8">' + esc(detail) + '</p>' + (action ? '<div class="mono muted mt-12">' + esc(action) + '</div>' : '') + '</div></div>';
    }
    function findRepairAction(id) {
      return ((state.repairs && state.repairs.actions) || []).find(function(action) { return action.id === id; });
    }

    function severityTone(value) {
      if (value === 'blocker' || value === 'error' || value === 'failed') return 'err';
      if (value === 'warn' || value === 'warning' || value === 'running' || value === 'queued') return 'warn';
      return 'ok';
    }

    function jobTone(value) {
      if (value === 'failed' || value === 'cancelled' || value === 'stale') return 'err';
      if (value === 'running' || value === 'queued') return 'warn';
      return 'ok';
    }

    function actionTitle(action) {
      var zh = action.titleZh || action.title || action.id;
      var en = action.title && action.title !== zh ? action.title : action.id;
      return '<span class="repair-title"><strong>' + esc(zh) + '</strong><span class="en-line">' + esc(en) + '</span>' +
        (action.reason ? '<small>' + esc(action.reason) + '</small>' : '') +
        (action.commandPreview ? '<small>' + esc(action.commandPreview) + '</small>' : '') +
        '</span>';
    }

    function jobTitle(job) {
      var labels = {
        doctor: 'Doctor 修复 / Doctor repair',
        compile: '图谱编译 / Graph compile',
        embedding: 'Embedding 重建 / Embedding rebuild',
        cache: '缓存修复 / Cache repair',
        gitnexus: 'GitNexus 任务 / GitNexus job',
        scan: '扫描 / Scan',
      };
      return labels[job.kind] || (job.kind || 'job');
    }

    function healthActionButton(row) {
      if (row.repairId && findRepairAction(row.repairId)) {
        return '<button class="btn btn-sm" data-repair-id="' + esc(row.repairId) + '">' + esc(row.action) + '</button>';
      }
      if (row.uiAction) {
        return '<button class="btn btn-sm" data-ui-action="' + esc(row.uiAction) + '">' + esc(row.action) + '</button>';
      }
      return '<button class="btn btn-sm" disabled>' + esc(row.action) + '</button>';
    }

    function renderRepairQueue() {
      var actions = (state.repairs && state.repairs.actions) || [];
      var runnable = actions.filter(function(action) { return action.available !== false; });
      var body = runnable.length ? runnable.map(function(action, index) {
        var tone = severityTone(action.severity);
        return '<div class="repair-item with-action">' +
          '<span class="tile-icon ' + tone + '" style="width:26px;height:26px">' + (index + 1) + '</span>' +
          actionTitle(action) +
          badge(action.severity || 'info', tone) +
          '<button class="btn btn-sm repair-run" data-repair-id="' + esc(action.id) + '">执行 / Run</button>' +
          '</div>';
      }).join('') : '<div class="empty">暂无可执行修复 / No repair actions available.</div>';
      $('repairQueue').innerHTML = '<div class="split"><h2>修复队列 <span class="en-line">Repair Queue</span></h2>' + badge(String(runnable.length), runnable.length ? 'warn' : 'ok') + '</div><div class="repair-list mt-16">' +
        body + '</div>' + (runnable.length ? '<button class="btn btn-primary mt-16" data-repair-all="1">全部执行 / Run All</button>' : '');
    }

    function renderRepairHistory() {
      var history = (state.repairs && state.repairs.history && state.repairs.history.length ? state.repairs.history : state.jobs) || [];
      var body = history.length ? history.slice(0, 8).map(function(job) {
        var tone = jobTone(job.state);
        var status = (job.state || 'unknown') + (job.progress ? ' · ' + job.progress : '');
        var meta = formatTime(job.updatedAt || job.finishedAt || job.startedAt);
        return '<div class="repair-item">' +
          '<span class="tile-icon ' + tone + '" style="width:26px;height:26px">' + esc((job.kind || '?').slice(0, 1).toUpperCase()) + '</span>' +
          '<span class="repair-title"><strong>' + esc(jobTitle(job)) + '</strong><span class="en-line">' + esc(job.id || '-') + '</span>' + (job.error ? '<small>' + esc(job.error) + '</small>' : '') + '</span>' +
          '<span>' + badge(status, tone) + ' <span class="muted">' + esc(meta) + '</span></span>' +
          '</div>';
      }).join('') : '<div class="empty">暂无任务历史 / No job history yet.</div>';
      $('repairHistory').innerHTML = '<div class="split"><h2>任务历史 <span class="en-line">Job History</span></h2><span class="muted">最近 / Recent</span></div><div class="repair-list mt-16">' + body + '</div>';
    }

    function runRepairs(ids) {
      var clean = (ids || []).filter(Boolean);
      if (!clean.length) return Promise.resolve();
      showToast('修复任务提交中 / Queuing repairs...', 'warning');
      return api('/api/repairs/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: clean, confirm: true }),
      }).then(function(data) {
        var jobIds = (data.results || []).map(function(item) { return item.jobId; }).filter(Boolean);
        showToast('修复任务已提交 / Repair jobs queued' + (jobIds.length ? ': ' + jobIds.join(', ') : ''), data.ok ? 'success' : 'warning');
        scheduleJobRefresh(true);
        return refreshLive();
      }).catch(function(e) {
        showToast('修复失败 / Repair failed: ' + e.message, 'error');
      });
    }

    function scheduleJobRefresh(force) {
      if (_jobPollTimer) clearTimeout(_jobPollTimer);
      var active = force || (state.jobs || []).some(function(job) {
        return job.state === 'queued' || job.state === 'running';
      });
      if (active) _jobPollTimer = setTimeout(refreshLive, 1800);
    }
    function checklist(title, ok) {
      return '<div class="check-item"><span class="check-mark">' + (ok ? '✓' : '⚠') + '</span><span>' + esc(title) + '</span></div>';
    }

    function testApis() {
      api('/api/config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targets: ['compile', 'secretary', 'embedding'] }),
      }).then(function(data) {
        showToast('API 测试完成 / API test complete: ' + (data.results ? data.results.length : 0) + ' targets', 'success');
      }).catch(function(e) {
        showToast('API 测试失败 / API test failed: ' + e.message, 'error');
      });
    }

    function rebuildEmbeddings() {
      api('/api/embeddings/rebuild', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      }).then(function(data) {
        showToast('Embedding rebuild 已提交 / Rebuild queued' + (data.jobId ? ': ' + data.jobId : ''), 'success');
        scheduleJobRefresh(true);
        refreshLive();
      }).catch(function(e) {
        showToast('重建失败 / Rebuild failed: ' + e.message, 'error');
      });
    }

    async function refreshLive() {
      if (_jobPollTimer) {
        clearTimeout(_jobPollTimer);
        _jobPollTimer = null;
      }
      try {
        state.status = await api('/api/status');
      } catch (e) {
        showToast('状态读取失败 / Status load failed: ' + e.message, 'error');
      }
      try {
        state.diagnostics = await api('/api/diagnostics');
      } catch (e) {
        state.diagnostics = null;
      }
      try {
        state.repairs = await api('/api/repairs');
      } catch (e) {
        state.repairs = { actions: [], history: [] };
      }
      try {
        var jobs = await api('/api/jobs?limit=20');
        state.jobs = jobs.jobs || [];
      } catch (e) {
        state.jobs = [];
      }
      try {
        var activeJobs = await api('/api/jobs/active');
        state.activeJobs = activeJobs.jobs || [];
      } catch (e) {
        state.activeJobs = [];
      }
      try {
        state.config = await api('/api/config');
      } catch (e) {
        state.config = null;
      }
      try {
        state.configSchema = await api('/api/config/schema');
      } catch (e) {
        state.configSchema = null;
      }
      await loadRouteEvents();
      renderAll();
      scheduleJobRefresh(Boolean((state.activeJobs || []).length));
    }

    function renderAll() {
      renderGlobalStatus();
      renderSetup();
      renderRouteResult();
      renderRouteRecent();
      renderAdoption();
      renderDiagnostics();
      if (state.page === 'map') renderCapabilityMap();
    }

    async function load() {
      await refreshLive();
      try {
        state.compileStatus = await api('/api/compile/status');
        renderCompileStatus();
      } catch (e) {}
      var requestedPage = new URLSearchParams(location.search).get('page') || location.hash.replace(/^#/, '');
      if (requestedPage && pageLabels[requestedPage]) {
        setPage(requestedPage);
        return;
      }
      var ready = state.status && state.status.readiness && state.status.readiness.state === 'READY';
      if (ready) setPage('route');
    }

    document.querySelectorAll('.nav-item').forEach(function(btn) {
      btn.addEventListener('click', function() { setPage(btn.dataset.page); });
    });
    $('refreshBtn').onclick = refreshLive;
    $('scanBtn').onclick = startScan;
    $('compileBtn').onclick = startCompile;
    $('runRoute').onclick = function() { doRoute($('queryInput').value); };
    $('runRouteIcon').onclick = function() { doRoute($('queryInput').value); };
    $('clearRoute').onclick = function() {
      $('queryInput').value = '';
      state.routeResult = null;
      $('queryCounter').textContent = '0 / 2000';
      renderRouteResult();
      renderRouteRecent();
      setCopyButtons(false);
    };
    $('queryInput').addEventListener('input', function(e) {
      $('queryCounter').textContent = Math.min(e.target.value.length, 2000) + ' / 2000';
    });
    $('queryInput').addEventListener('keydown', function(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') doRoute($('queryInput').value);
    });
    $('suggestions').addEventListener('click', function(e) {
      var btn = e.target.closest('[data-q]');
      if (!btn) return;
      $('queryInput').value = btn.dataset.q;
      $('queryCounter').textContent = Math.min(btn.dataset.q.length, 2000) + ' / 2000';
      doRoute(btn.dataset.q);
    });
    $('targetTabs').addEventListener('click', function(e) {
      var btn = e.target.closest('[data-target]');
      if (!btn) return;
      state.routeTarget = btn.dataset.target;
      $('targetTabs').querySelectorAll('button').forEach(function(b) { b.classList.toggle('active', b === btn); });
    });
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('.route-copy-btn');
      if (btn) copyRoutePrompt(btn.dataset.target);
    });
    $('reloadEvents').onclick = function() { loadRouteEvents().then(renderAdoption); };
    $('diagnosticCards').addEventListener('click', function(e) {
      var repair = e.target.closest('[data-repair-id]');
      if (repair) {
        runRepairs([repair.dataset.repairId]);
        return;
      }
      var ui = e.target.closest('[data-ui-action]');
      if (!ui) return;
      if (ui.dataset.uiAction === 'test-config') testApis();
      if (ui.dataset.uiAction === 'refresh') refreshLive();
    });
    $('repairQueue').addEventListener('click', function(e) {
      var all = e.target.closest('[data-repair-all]');
      if (all) {
        runRepairs(((state.repairs && state.repairs.actions) || []).filter(function(action) { return action.available !== false; }).map(function(action) { return action.id; }));
        return;
      }
      var repair = e.target.closest('[data-repair-id]');
      if (repair) runRepairs([repair.dataset.repairId]);
    });
    $('routeEventsTable').addEventListener('click', function(e) {
      var btn = e.target.closest('[data-event-id]');
      if (!btn) return;
      state.selectedRouteEventId = btn.dataset.eventId;
      renderAdoption();
    });
    $('eventInspector').addEventListener('click', function(e) {
      var feedback = e.target.closest('.event-feedback');
      if (feedback) sendEventFeedback(feedback.dataset.outcome);
      if (e.target.closest('.event-regression')) createRegression();
    });
    $('capSearch').addEventListener('input', function(e) {
      state.capQuery = e.target.value;
      loadCapabilityData().then(function() {
        renderCapabilityMap();
        renderGraph();
      });
    });
    $('capSearchInline').addEventListener('input', function(e) {
      state.capQuery = e.target.value;
      $('capSearch').value = e.target.value;
      loadCapabilityData().then(function() {
        renderCapabilityMap();
        renderGraph();
      });
    });
    $('kindTabs').addEventListener('click', function(e) {
      var btn = e.target.closest('[data-kind]');
      if (!btn) return;
      state.kindFilter = btn.dataset.kind;
      $('kindTabs').querySelectorAll('button').forEach(function(b) { b.classList.toggle('active', b === btn); });
      $('kindTabsInline').querySelectorAll('button').forEach(function(b) { b.classList.toggle('active', b.dataset.kind === state.kindFilter); });
      loadCapabilityData().then(function() {
        renderCapabilityMap();
        renderGraph();
      });
    });
    $('kindTabsInline').addEventListener('click', function(e) {
      var btn = e.target.closest('[data-kind]');
      if (!btn) return;
      state.kindFilter = btn.dataset.kind;
      $('kindTabsInline').querySelectorAll('button').forEach(function(b) { b.classList.toggle('active', b === btn); });
      $('kindTabs').querySelectorAll('button').forEach(function(b) { b.classList.toggle('active', b.dataset.kind === state.kindFilter); });
      loadCapabilityData().then(function() {
        renderCapabilityMap();
        renderGraph();
      });
    });
    $('capabilityList').addEventListener('click', function(e) {
      var row = e.target.closest('[data-cap-id]');
      if (!row) return;
      state.selectedCapabilityId = row.dataset.capId;
      renderCapabilityMap();
      focusGraphNode(state.selectedCapabilityId);
    });
    $('graphContainer').addEventListener('click', function(e) {
      var action = e.target.closest('[data-graph-action]');
      if (action && _cy) {
        if (action.dataset.graphAction === 'fit') fitGraphCanvas(78);
        if (action.dataset.graphAction === 'layout') {
          relayoutGraphPreset();
        }
        if (action.dataset.graphAction === 'zoom-in') _cy.zoom({ level: Math.min(2.2, _cy.zoom() * 1.18), renderedPosition: { x: $('graphContainer').clientWidth / 2, y: $('graphContainer').clientHeight / 2 } });
        if (action.dataset.graphAction === 'zoom-out') _cy.zoom({ level: Math.max(0.25, _cy.zoom() / 1.18), renderedPosition: { x: $('graphContainer').clientWidth / 2, y: $('graphContainer').clientHeight / 2 } });
        return;
      }
      var row = e.target.closest('[data-cap-id]');
      if (!row) return;
      state.selectedCapabilityId = row.dataset.capId;
      renderCapabilityMap();
      focusGraphNode(state.selectedCapabilityId);
    });
    $('reloadGraph').onclick = function() {
      loadCapabilityData().then(function() {
        renderCapabilityMap();
        renderGraph();
      });
    };
    $('testApis').onclick = testApis;
    $('rebuildEmbeddings').onclick = rebuildEmbeddings;

    load();
  </script>
</body>
</html>`;
