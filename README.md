# LazyBrain

Agent work delivery for local AI coding agents.

LazyBrain turns a user task into a compact work brief for the active agent: role, next step, allowed scope, verification, stop conditions, and receipt evidence. It still includes semantic capability routing, but the public product value is the automatic work guidance shown inside real coding workflows.

## Quickstart

```bash
lazybrain quickstart
lazybrain route "review this change for regressions" --target codex --brief
lazybrain ui --no-open
```

If the Hook is installed, LazyBrain can inject low-latency work guidance automatically on non-trivial prompts. If the Hook is degraded, `quickstart`, `ready`, and the Workbench show the recovery command instead of silently failing.

## Supported Surface

Core commands:

```bash
lazybrain quickstart
lazybrain quickstart --json
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

`lazybrain route` returns RouteSpec `1.5.0` plus a `RecommendationEnvelope` and `WorkEnvelope`: mode, intent, matched capability, route plan, guardrails, verification, done conditions, target-specific advisory prompt, user/model recommendation lanes, and the active work role. The output is advisory and does not execute tasks.

## Hook Work Guidance

The default Hook path is intentionally lightweight. It uses fast route gating, combo metadata, and tag matches to produce a short `WorkEnvelope` without running full route analysis. Full analysis remains available through CLI, MCP, HTTP, and the Workbench.

Example Hook guidance:

```text
LazyBrain WorkEnvelope
Role: scout
Do next: Inspect the relevant files, diff, errors, or UI state.
Allowed scope: Read-only evidence gathering. | Capability: code-review
Verify: npm test | npm run lint
Stop if: Required context is still missing.
Receipt: result, summary, evidence, ambiguity_or_next_tasks
```

Recovery commands:

```bash
lazybrain ready
lazybrain doctor --fix
lazybrain hook rollback
```

## MCP

`lazybrain mcp --stdio` exposes read-only tools for route planning, capability search, skill cards, and combo templates. Check readiness with:

```bash
lazybrain mcp status
```

## Readiness

`lazybrain ready` separates product readiness from transient local hook/runtime state. Stale persisted runtime status is reported as stale without blocking product readiness. Hook delivery problems such as stale slow samples, host overload, breaker state, or missing visible HUD are shown as warnings or blockers with recovery commands.

`lazybrain quickstart` is the first-run check for public trial users. It reports graph, Hook automatic guidance, MCP tools, runtime latency, blockers, warnings, and the next command to run.

## Public Package

The npm package is limited to `dist`, `README.md`, `README_CN.md`, `CHANGELOG.md`, `LICENSE`, and package metadata.

## Verification

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
