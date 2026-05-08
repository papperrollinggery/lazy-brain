# LazyBrain

本地 AI coding agent 的工作交付层。

LazyBrain 把用户任务变成 agent 能直接执行的工作简报：角色、下一步、允许范围、验证方式、停止条件和 receipt 证据。它仍然保留能力路由，但公开产品价值是：在真实 coding 工作流里自动给 agent 有用的工作指导。

## 快速开始

```bash
lazybrain quickstart
lazybrain route "审查这次改动有没有回归风险" --target codex --brief
lazybrain ui --no-open
```

如果 Hook 已安装，LazyBrain 会在非平凡任务上自动注入低延迟工作建议。如果 Hook 降级，`quickstart`、`ready` 和 Workbench 会显示恢复命令，而不是静默失效。

## 当前保留能力

核心命令：

```bash
lazybrain quickstart
lazybrain quickstart --json
lazybrain route "审查这次改动" --target codex --brief
lazybrain route "审查这次改动" --target claude --json
lazybrain route dogfood --target claude
lazybrain ready
lazybrain ready --release
lazybrain doctor --json
lazybrain embeddings status
lazybrain embeddings rebuild --yes
lazybrain mcp status
```

刷新本地能力图谱：

```bash
lazybrain scan
lazybrain compile --offline
lazybrain compile --with-relations
```

本地 HTTP workbench：

```bash
lazybrain server
lazybrain ui --no-open
```

稳定本地 API：

- `GET /api/status`
- `GET /api/routes`
- `GET /api/diagnostics`
- `POST /api/route`
- `POST /api/compile`
- `GET /api/compile/status`
- `GET /api/embeddings/status`
- `POST /api/embeddings/rebuild`
- `GET /api/config`
- `POST /api/config`
- `POST /api/test`

## Route 输出

`lazybrain route` 输出 RouteSpec `1.5.0`、`RecommendationEnvelope` 和 `WorkEnvelope`：mode、intent、命中能力、route plan、guardrails、verification、done conditions、目标 agent prompt、用户/模型推荐通道，以及当前 work role。它只做建议，不执行任务。

## Hook 工作指导

默认 Hook 路径刻意保持轻量：只使用 fast route gate、combo metadata 和 tag match 生成短 `WorkEnvelope`，不跑完整 route 分析。完整分析仍在 CLI、MCP、HTTP 和 Workbench 中可用。

示例 Hook 输出：

```text
LazyBrain WorkEnvelope
Role: scout
Do next: Inspect the relevant files, diff, errors, or UI state.
Allowed scope: Read-only evidence gathering. | Capability: code-review
Verify: npm test | npm run lint
Stop if: Required context is still missing.
Receipt: result, summary, evidence, ambiguity_or_next_tasks
```

恢复命令：

```bash
lazybrain ready
lazybrain doctor --fix
lazybrain hook rollback
```

## MCP

`lazybrain mcp --stdio` 暴露只读工具，用于路由规划、能力搜索、技能卡片和组合模板。

```bash
lazybrain mcp status
```

## Ready

`lazybrain ready` 区分产品可用状态和本机 hook/runtime 临时状态。过期 runtime status 会标记为 stale，不阻塞产品可用状态。Hook 的慢样本污染、主机高负载、breaker、HUD 不可见会作为 warning/blocker 展示，并给出恢复命令。

`lazybrain quickstart` 是公开试用用户的首次检查入口，会报告 graph、Hook 自动建议、MCP tools、runtime latency、blocker、warning 和下一条该执行的命令。

## 公开包范围

npm 包只包含 `dist`、`README.md`、`README_CN.md`、`CHANGELOG.md`、`LICENSE` 和 package metadata。

## 验证

```bash
npm run lint
npm run audit:public
npm test
node dist/bin/lazybrain.js quickstart --json
node dist/bin/lazybrain.js ready
node dist/bin/lazybrain.js ready --release
node dist/bin/lazybrain.js mcp status
node dist/bin/lazybrain.js embeddings status
node dist/bin/lazybrain.js route dogfood --target claude
```
