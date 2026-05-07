# LazyBrain

本地 AI coding agent 的能力路由器。

## 当前保留能力

核心命令：

```bash
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

`lazybrain route` 输出 RouteSpec `1.5.0`：mode、intent、命中能力、route plan、guardrails、verification、done conditions、目标 agent advisory prompt，以及确定性的推荐选择。它只做建议，不执行任务。

## MCP

`lazybrain mcp --stdio` 暴露只读工具，用于路由规划、能力搜索、技能卡片和组合模板。

```bash
lazybrain mcp status
```

## Ready

`lazybrain ready` 区分产品可用状态和本机 hook/runtime 临时状态。过期 runtime status 会标记为 stale，不阻塞产品可用状态。

## 公开包范围

npm 包只包含 `dist`、`README.md`、`README_CN.md`、`CHANGELOG.md`、`LICENSE` 和 package metadata。

## 验证

```bash
npm run lint
npm run audit:public
npm test
node dist/bin/lazybrain.js ready
node dist/bin/lazybrain.js ready --release
node dist/bin/lazybrain.js mcp status
node dist/bin/lazybrain.js embeddings status
node dist/bin/lazybrain.js route dogfood --target claude
```
