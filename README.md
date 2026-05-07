# LazyBrain

Semantic capability router for local AI coding agents.

## Supported Surface

Core commands:

```bash
lazybrain route "review this change" --target codex --brief
lazybrain route "review this change" --target claude --json
lazybrain route dogfood --target claude
lazybrain ready
lazybrain ready --release
lazybrain doctor --json
lazybrain embeddings status
lazybrain embeddings rebuild --yes
lazybrain mcp status
```

Build and refresh local capability data:

```bash
lazybrain scan
lazybrain compile --offline
lazybrain compile --with-relations
```

Local HTTP workbench:

```bash
lazybrain server
lazybrain ui --no-open
```

Stable local API:

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

## Route Output

`lazybrain route` returns RouteSpec `1.5.0`: mode, intent, matched capability, route plan, guardrails, verification, done conditions, target-specific advisory prompt, and a deterministic recommended choice. The output is advisory and does not execute tasks.

## MCP

`lazybrain mcp --stdio` exposes read-only tools for route planning, capability search, skill cards, and combo templates. Check readiness with:

```bash
lazybrain mcp status
```

## Readiness

`lazybrain ready` separates product readiness from transient local hook/runtime state. Stale persisted runtime status is reported as stale without blocking product readiness.

## Public Package

The npm package is limited to `dist`, `README.md`, `README_CN.md`, `CHANGELOG.md`, `LICENSE`, and package metadata.

## Verification

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
