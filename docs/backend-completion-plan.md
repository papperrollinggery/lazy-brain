# LazyBrain Backend Completion Plan

Generated: 2026-05-06 15:00 +0800
Updated: 2026-05-06 15:34 +0800

## 2026-05-06 P0 落地状态

P0 后端已落地，当前文档后续章节中的 P0 条目保留为实现依据，不再视为待办。

已确认落地：

- 持久化 job store：`src/runtime/jobs.ts`
- doctor 修复模块：`src/hook/doctor.ts`，fix 前创建 backup
- 本地 API：`/api/jobs*`、`/api/doctor/fix`、`/api/repairs*`、`/api/config*`
- `POST /api/compile`、`POST /api/embeddings/rebuild` 返回 `jobId`
- embedding rebuild confirm 同时兼容 `true` 和 `"rebuild"`
- stale `~/.lazybrain/status.json` 不再阻塞 readiness
- server 覆盖测试已补齐

本轮 UI 已接入 P0：

- Diagnostics 修复队列来自 `/api/repairs`
- Diagnostics 任务历史来自 `/api/jobs`
- 健康检查按钮提交真实 `/api/repairs/run` 或 `/api/config/test`
- compile、scan、embedding rebuild 显示 `jobId` 并轮询 job 状态

下一阶段重点转向 P1：Capability Map 质量指标、source manager、route/adoption 统计聚合、可取消长任务和更完整配置表单。

## 目标

把 LazyBrain 后端补齐到可以支撑当前多页面 UI 的真实产品状态：

- Setup 可以完成扫描、配置、编译、修复 readiness。
- Route Studio 可以稳定生成、复制、记录、回放路由推荐。
- Adoption Review 可以真实筛选、统计、转 regression。
- Capability Map 可以查询、聚焦、重扫、查看真实质量指标。
- Diagnostics 可以执行修复动作、查看持久任务进度、读取真实日志。

当前原则：不要把 `NOT_READY` 伪装成 `READY`。UI 可以更好看，但后端必须给真实状态、真实动作、真实失败原因。

## 当前真实状态

来自本机 `http://127.0.0.1:18450/api/status` 和相关 API：

- `readiness.state`: `NOT_READY`
- 当前 blocker:
  - `Host load average is high (10.48 > 8); LazyBrain hook would fail closed until load drops.`
- 已修复 blocker:
  - global LazyBrain hook 重复注册已由 `/api/repairs/run` 执行 `doctor_global_hooks` 修复。
  - jobId: `doctor-motqs9o6-b22b5f6a`
  - backup: `2026-05-06T07-34-54-199Z`
- `graph.nodes`: `831`
- graph kind:
  - `skill`: `475`
  - `agent`: `238`
  - `command`: `118`
- embedding:
  - state: `ok`
  - coverage: `831/831 = 100%`
  - model: `BAAI/bge-m3`
  - provider: `https://api.siliconflow.cn/v*`
- model health:
  - compile configured: yes, `MiniMax-M2.7`
  - secretary configured: yes, `MiniMax-M2.7`
  - embedding configured: yes
- GitNexus:
  - state: `current`
  - files: `171`
  - nodes/symbols: `3598`
  - edges: `6028`
  - processes: `263`
  - embeddings: `3065`
- `/api/compile/status`:
  - running: `false`
  - phase: `idle`
  - recentLog: empty
- persisted `~/.lazybrain/status.json` 即使残留旧状态，也不再阻塞 readiness：
  - state: `compiling`
  - progress: `292/859`
  - updatedAt: `2026-05-06T05:38:21.491Z`

结论：核心索引、模型、P0 后端动作面、持久任务状态、UI/API 合约一致性、诊断修复闭环已具备。当前 `NOT_READY` 来自机器负载 fail-closed，不是 hook 注册或 stale job state。

## 当前已存在的后端能力

### 路由

- `POST /api/route`
  - 输入 `{ query, target }`
  - 返回 route spec，并记录 route event。
- `POST /api/match`
  - 基础能力匹配。
- `POST /api/team`
  - 根据 query 推荐 agent team。

### 采用记录

- `GET /api/route-events?limit=...`
- `POST /api/route-events/adopt`
- `POST /api/route-events/regression`
- `GET /api/choices`
- `POST /api/choices/feedback`
- `POST /api/choices/clear`

### 图谱和能力查询

- `GET /api/graph`
- `GET /api/search`
- `GET /capability/:id`
- `GET /dups`
- `GET /api/stats`

### 状态、诊断、配置

- `GET /api/status`
- `GET /api/diagnostics`
- `POST /api/config`
- `POST /api/test`
- `GET /api/health`

### 编译和 embedding

- `POST /api/compile`
- `GET /api/compile/status`
- `GET /api/embedding/discover`
- `GET /api/embeddings/status`
- `POST /api/embeddings/rebuild`

### Lab / report

- `GET /lab`
- `GET /api/lab/fixtures`
- `GET /api/lab/agents`
- `POST /api/lab/evaluate`
- `GET /report/summary`
- `GET /report/sessions`
- `GET /report/session/:id`

## P0 必须补齐

### P0.1 Readiness 修复动作 API

当前 UI 能看到 blocker，但不能一键修复。当前 blocker 是全局 hook 重复，需要把 CLI 的 doctor 能力暴露给本地 API。

新增 API：

```http
POST /api/doctor/fix
Content-Type: application/json

{
  "scope": "global" | "project",
  "dryRun": false
}
```

返回：

```json
{
  "ok": true,
  "scope": "global",
  "repairs": ["normalized_hooks_json_registration"],
  "readiness": { "state": "READY", "blockers": [] }
}
```

要求：

- 只允许 localhost。
- 默认 `dryRun: true` 可以先预览。
- `scope=global` 必须显式传入，避免误改用户全局 Claude 配置。
- 写入前创建 backup。
- 修复后自动刷新 `/api/status`。
- 对应 UI：
  - Diagnostics 健康卡里的 `重新加载 Hook / Reload Hook`
  - Setup 当前问题卡里的 `check / 检查`

验收：

- 当 global hook count 为 3 时，调用后降为 1。
- `/api/status.readiness.blockers` 不再包含 duplicate hook。
- `npm test -- test/hook/readiness.test.ts test/server/server.test.ts` 通过。

### P0.2 统一后台任务系统

当前 `/api/compile/status` 是进程内状态，服务重启后丢失；`~/.lazybrain/status.json` 又可能残留 stale `compiling`。这会导致 UI 和真实任务状态不一致。

新增统一 job 模型：

```ts
type JobKind = "scan" | "compile" | "embedding" | "doctor" | "gitnexus" | "cache";
type JobState = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "stale";

interface BackendJob {
  id: string;
  kind: JobKind;
  state: JobState;
  progress?: string;
  startedAt?: string;
  updatedAt: string;
  finishedAt?: string;
  exitCode?: number | null;
  error?: string;
  recentLog: string[];
}
```

新增文件：

- `src/runtime/jobs.ts`
- 持久化：`~/.lazybrain/jobs/<jobId>.json`
- 最新指针：`~/.lazybrain/jobs/latest.json`

新增 API：

```http
GET /api/jobs?limit=20
GET /api/jobs/:id
POST /api/jobs/:id/cancel
GET /api/jobs/active
```

改造现有 API：

- `POST /api/compile` 返回 `{ ok, jobId }`
- `GET /api/compile/status` 从 job store 读，不只读内存变量。
- `POST /api/embeddings/rebuild` 返回 `{ ok, jobId }`，长任务异步执行。
- `/api/status.runtimeStatus` 标明 stale：

```json
{
  "state": "compiling",
  "progress": "292/859",
  "stale": true,
  "staleReason": "no active compile process"
}
```

验收：

- 重启 UI server 后仍能看到最近任务日志。
- stale `~/.lazybrain/status.json` 不再误导 UI。
- 编译、embedding、doctor 都有同一套任务进度。

### P0.3 修复 Embedding Rebuild 合约不一致

当前前端发送：

```js
{ "confirm": true }
```

后端要求：

```json
{ "confirm": "rebuild" }
```

这会导致 UI 的 `重建 embedding / Rebuild Embedding` 按钮失败。

后端兼容方案：

```ts
confirm === "rebuild" || confirm === true
```

同时前端应改成标准字符串，但后端需要做兼容，避免旧 UI 或脚本失败。

验收：

- `POST /api/embeddings/rebuild {"confirm":true}` 返回 200 或 jobId。
- `POST /api/embeddings/rebuild {"confirm":"rebuild"}` 也返回 200 或 jobId。
- 无 confirm 仍返回 400。

### P0.4 诊断修复队列从静态 UI 改为真实 API

当前 Diagnostics 里的修复队列是静态文案：

- 重建 embedding
- 编译图谱
- 清理缓存
- hook plan
- 全部执行

需要后端返回可执行 repair actions。

新增 API：

```http
GET /api/repairs
POST /api/repairs/run
```

`GET /api/repairs` 返回：

```json
{
  "actions": [
    {
      "id": "doctor_global_hooks",
      "title": "Normalize global LazyBrain hook registrations",
      "titleZh": "修复全局 LazyBrain hook 重复注册",
      "severity": "blocker",
      "available": true,
      "requiresConfirmation": true,
      "commandPreview": "lazybrain doctor --fix --global"
    }
  ],
  "history": []
}
```

`POST /api/repairs/run` 输入：

```json
{
  "ids": ["doctor_global_hooks", "compile_graph"],
  "confirm": true
}
```

验收：

- repair queue 不再硬编码。
- 每个 action 要么返回 jobId，要么返回不可执行原因。
- repair history 来自 job store。

### P0.5 配置读写完整化

当前只有 `POST /api/config`，UI 没有完整配置表单，状态靠 `/api/status.config` 读。

新增：

```http
GET /api/config
GET /api/config/schema
POST /api/config/test
```

要求：

- `GET /api/config` 返回脱敏配置。
- `GET /api/config/schema` 返回可编辑字段、枚举、是否 secret、默认值。
- `POST /api/config` 保持现有白名单校验。
- 空 secret 不覆盖旧值。
- `POST /api/config/test` 可以测试 compile/secretary/embedding 任意目标。

验收：

- Setup 页面可以真实编辑模型和 embedding 配置。
- `测试连接 / Test Connection` 按钮接入后端。
- 错误返回字段级 message，不只是一句 400。

## P1 需要补齐

### P1.1 Adoption Review 真实聚合统计

当前 Adoption Review 的趋势图和拒绝原因统计是硬编码数字，例如总数 fallback 到 `223`。需要后端聚合。

新增 API：

```http
GET /api/route-events/stats?from=2026-05-01&to=2026-05-07&target=codex&source=api
```

返回：

```json
{
  "total": 120,
  "adopted": 84,
  "accepted": 62,
  "rejected": 15,
  "pending": 21,
  "adoptionRate": 0.7,
  "byDay": [
    { "date": "2026-05-01", "total": 10, "adopted": 7, "rejected": 1 }
  ],
  "rejectionReasons": [
    { "reason": "wrong_skill", "count": 6, "percent": 0.4 }
  ],
  "topWorkflows": [
    { "combo": "test_pr_repair", "count": 12, "accepted": 9 }
  ]
}
```

同时扩展 `GET /api/route-events`：

- `from`
- `to`
- `target`
- `source`
- `mode`
- `outcome`
- `q`
- `workflow`
- `limit`
- `cursor`

验收：

- Adoption chart 全部来自 API。
- 搜索框、日期、筛选按钮能工作。
- 不暴露原始 prompt，只用 `queryHash`。

### P1.2 Regression Case 管理闭环

当前可以 append regression case，但没有列表、补 query、运行测试、状态管理。

新增 API：

```http
GET /api/route-regressions
GET /api/route-regressions/:id
PATCH /api/route-regressions/:id
POST /api/route-regressions/:id/run
POST /api/route-regressions/run-all
```

要求：

- `pending_query` case 可以补 query。
- 补 query 时校验 hash。
- 可以跑单条或全量 regression。
- 结果写入 case run history。

验收：

- Adoption Review 的 `转测试 / Convert to Test` 后可以在 UI 中看到 case。
- 待补 query 的 case 不被误判为可运行。
- dogfood/regression 测试能包含 UI 创建的 case。

### P1.3 Capability Map 真实质量指标

当前 UI 中这些值是硬编码或伪指标：

- Description Quality: `High`
- Route Coverage: `87%`
- Last Scan: `2026-05-04`
- Related Capabilities 使用 tags 伪装。

新增 API：

```http
GET /api/capabilities/:id/quality
GET /api/capabilities/:id/neighborhood?depth=1
POST /api/capabilities/:id/rescan
POST /api/capabilities/:id/mark-duplicate
POST /api/capabilities/:id/disable
```

质量指标建议：

```json
{
  "descriptionQuality": {
    "score": 0.82,
    "level": "high",
    "reasons": ["has description", "has examples", "has tags"]
  },
  "routeCoverage": {
    "score": 0.74,
    "matchedEvents": 12,
    "acceptedEvents": 8,
    "rejectedEvents": 1
  },
  "embeddingCoverage": true,
  "duplicateRisk": {
    "level": "low",
    "duplicates": []
  },
  "lastScanAt": "2026-05-06T..."
}
```

验收：

- Inspector 不再显示假数据。
- `标记重复 / Mark Duplicate` 有后端落点。
- `重新扫描 / Rescan` 可以单节点或来源级扫描。

### P1.4 Scanner / Graph 增量重扫

当前 Setup 的 `Scan & Compile` 是粗粒度。Capability Map 的 `Rescan All` 实际只是重新拉 `/api/search` 和 `/api/graph`，没有启动 scan。

新增：

```http
POST /api/scan
POST /api/scan/source
GET /api/scan/status
```

输入：

```json
{
  "paths": ["/Users/.../.skillshub"],
  "kind": "skill",
  "compileAfter": true
}
```

验收：

- UI 的 `重新扫描全部 / Rescan All` 启动真实 scan job。
- scan 结束后自动触发 compile 或提示用户。
- `newCapabilities` 能在 Setup 中显示。

### P1.5 日志系统

当前 Diagnostics 的实时日志只读 `/api/compile/status.recentLog`，而且只覆盖本次进程内编译。

新增：

```http
GET /api/logs?source=compile|scan|embedding|hook|server&limit=100
GET /api/logs/stream
```

要求：

- compile/scan/embedding/doctor/job log 统一。
- 支持 SSE 或轮询。
- 日志要脱敏 API key、prompt、路径中敏感片段。

验收：

- Diagnostics Live Logs 真实显示最近 60 条。
- 重启 server 后仍可读取最近任务日志。

### P1.6 Hook 生命周期管理

后端已经能读 hook 生命周期，但 UI 没有完整动作：

- install
- uninstall
- doctor
- rollback
- clean stale run
- clear breaker
- statusline repair

新增：

```http
GET /api/hooks/status
POST /api/hooks/install
POST /api/hooks/uninstall
POST /api/hooks/clean
POST /api/hooks/clear-breaker
POST /api/hooks/rollback
```

验收：

- 所有 hook 操作都有 dry-run。
- 全局操作必须二次确认。
- 每次操作写 repair history。

## P2 产品化补齐

### P2.1 Target Launcher / Open Target

Route Studio 里 `打开目标 / Open Target` 目前没有后端动作。

新增：

```http
POST /api/targets/open
```

输入：

```json
{
  "target": "claude" | "codex" | "cursor" | "generic",
  "routeEventId": "..."
}
```

行为：

- `codex`: 复制 prompt 并给出本地 Codex 使用说明，或调用可用 launcher。
- `claude`: 复制 prompt，可选打开 Claude Code 工作目录。
- `cursor`: 输出 workspace URI 或打开 Cursor。

验收：

- 无可用 launcher 时返回清晰 fallback，不静默失败。

### P2.2 Context Attachment

Route Studio 的 `Attach Context` 现在是纯按钮。

新增：

```http
POST /api/context/preview
POST /api/context/attach
```

支持：

- 文件路径
- Git diff
- GitNexus context
- 最近 route event

验收：

- route request 可以带 context references。
- 不把原始大段代码写入 route-events。

### P2.3 GitNexus 操作化

当前 GitNexus status 能读，但缺少操作入口。

新增：

```http
GET /api/gitnexus/status
POST /api/gitnexus/reindex
POST /api/gitnexus/query
POST /api/gitnexus/impact
```

验收：

- GitNexus stale 时 UI 可以一键 reindex。
- MCP 不可用时自动 fallback CLI，并把原因返回 UI。

### P2.4 Report Export

已有 `/report/*`，但 UI 没有导出 Adoption/Diagnostics 报告。

新增：

```http
GET /api/reports/adoption
GET /api/reports/diagnostics
GET /api/reports/backend-readiness
```

格式：

- `json`
- `md`

验收：

- 可以生成一份可交接的本地运行报告。

## UI 与后端当前不一致清单

| UI 位置 | 当前问题 | 后端补齐 |
| --- | --- | --- |
| Setup `管理 / Manage` | 无动作 | `GET/POST /api/config`, source manager |
| Setup `稍后配置 / Configure Later` | 无动作 | onboarding state API |
| Setup docs/log rows | 无动作 | `/api/logs`, local docs path |
| Route `Attach Context` | 无动作 | `/api/context/*` |
| Route `Shuffle` | 无动作 | frontend-only 或 `/api/examples` |
| Route `Open Target` | 无动作 | `/api/targets/open` |
| Adoption search/date/filter | 无动作 | `/api/route-events` filters |
| Adoption charts | 硬编码 | `/api/route-events/stats` |
| Capability quality | 硬编码 | `/api/capabilities/:id/quality` |
| Capability rescan | 只刷新数据 | `/api/scan`, `/api/capabilities/:id/rescan` |
| Capability duplicate | 无动作 | `/api/capabilities/:id/mark-duplicate` |
| Diagnostics health action buttons | 无动作 | `/api/repairs/run`, `/api/hooks/*` |
| Diagnostics repair queue/history | 硬编码 | `/api/repairs`, job store |
| Diagnostics logs | 只读本进程 compile log | `/api/logs` |
| Embedding rebuild | 前后端 confirm 不一致 | 兼容 `true` 和 `"rebuild"` |

## 数据持久化建议

当前持久数据分散在 `~/.lazybrain`，建议保留但规范 schema：

```text
~/.lazybrain/
  graph.json
  graph.embeddings.index.json
  graph.embeddings.bin
  graph.embeddings.status.json
  route-events.jsonl
  route-regressions.jsonl
  status.json
  jobs/
    latest.json
    <jobId>.json
    logs/
      <jobId>.log
  repairs.jsonl
  ui-state.json
```

要求：

- JSONL append-only 用于审计。
- job 当前状态用 JSON 文件。
- log 单独保存，避免 status 文件过大。
- 所有 prompt/raw code 默认不落盘。
- secret 永远脱敏返回。

## 推荐实施顺序

### Phase 1: Readiness 和任务系统

1. 增加 `src/runtime/jobs.ts`。
2. 改造 `/api/compile` 和 `/api/compile/status`。
3. 兼容 `/api/embeddings/rebuild` confirm。
4. 增加 `/api/doctor/fix`。
5. 增加 `/api/repairs`。
6. 更新 Diagnostics UI 按钮接入真实 API。

验收命令：

```bash
npm test -- test/server/server.test.ts test/runtime/status.test.ts test/hook/readiness.test.ts
npm run lint
npm run build
node dist/bin/lazybrain.js ready --release
```

### Phase 2: Adoption 和 Regression

1. 增加 route event filter/stats。
2. 增加 regression list/update/run。
3. 替换 Adoption Review 假 chart 数据。
4. 增加 tests。

验收命令：

```bash
npm test -- test/orchestrator/route-events.test.ts test/orchestrator/route-regressions.test.ts test/server/server.test.ts
npm run lint
```

### Phase 3: Capability backend

1. 增加 capability quality API。
2. 增加 neighborhood API。
3. 增加 scan/rescan API。
4. 接入 Capability Map inspector 按钮。

验收命令：

```bash
npm test -- test/scanner/scanner.test.ts test/server/server.test.ts test/embeddings/cache-rebuild.test.ts
npm run lint
```

### Phase 4: Target / Context / GitNexus

1. 增加 target open fallback。
2. 增加 context preview/attach。
3. 增加 GitNexus operation API。
4. 增加 report export。

验收命令：

```bash
npm test -- test/integrations/gitnexus.test.ts test/server/server.test.ts
npm run lint
npm run build
```

## 最终验收标准

### 功能验收

- `/api/status.ok === true` 或 blocker 可由 UI 一键修复。
- Setup 能从空状态完成 scan -> compile -> embedding -> ready。
- Route Studio 能生成推荐、复制 prompt、记录 adoption。
- Adoption Review 的表格、筛选、图表全部来自真实 API。
- Capability Map 的质量、关系、重复、rescan 全部来自真实 API。
- Diagnostics 的 repair queue、history、logs 全部来自真实 backend。

### 安全验收

- 所有写操作只允许 localhost。
- 全局 hook/config 操作需要显式确认。
- API key 不进入任何响应、日志、JSONL。
- 原始 prompt 不写入 route-events。
- regression pending query 不伪装成可运行测试。

### 稳定性验收

- server 重启后任务历史、日志、最近状态仍可读。
- 长任务不阻塞 HTTP 请求。
- compile/embedding/doctor 不能并发踩锁。
- stale status 会显示 stale，不会误导 readiness。

### 测试验收

最低需要新增或补强：

- `test/server/server.test.ts`
  - job API
  - doctor API
  - repairs API
  - embedding rebuild confirm compatibility
  - route event filters/stats
- `test/runtime/jobs.test.ts`
  - persist/reload/cancel/stale
- `test/orchestrator/route-events.test.ts`
  - aggregation/filter/cursor
- `test/orchestrator/route-regressions.test.ts`
  - list/update/run
- `test/scanner/scanner.test.ts`
  - incremental scan/rescan
- `test/privacy/prompts.test.ts`
  - route/context/report 不泄露 raw prompt

## 当前最短可交付切片

如果只做一轮后端补齐，建议先做：

1. `/api/doctor/fix`
2. job store
3. `/api/repairs`
4. embedding rebuild confirm 兼容
5. route-events stats

这 5 个完成后，当前 UI 最明显的假动作会少一半，`NOT_READY` 也能从界面闭环处理。
