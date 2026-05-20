# LazyBrain Agent Work Delivery Architecture

## Summary

LazyBrain's next layer is an Agent Work Delivery Layer. It does not copy GoalBuddy's `/goal` flow or YAML board. It absorbs the useful part: every recommendation should tell the agent what role to take, what scope is allowed, how to verify, when to stop, and what receipt proves the work helped.

The release bar is public trial readiness: a new user can install, see useful automatic hook guidance, understand degraded states, recover with one command, and verify the tool without reading source code. If implementation finds a contradiction in this document, fix this document first, then continue.

The stable flow is:

```text
RouteSpec -> RecommendationEnvelope -> WorkEnvelope -> Delivery Surfaces -> Receipt Loop
```

`buildRouteSpec` remains the route input source. Matcher, compiler, and embedding behavior stay stable in this tranche.

## Execution Rules

- Default Hook delivery must stay under a low-latency budget and must not call `buildRouteSpec`.
- Full route analysis belongs to CLI, MCP, HTTP, and Workbench.
- `ready` can report product readiness, but it must warn when automatic Hook delivery is degraded by stale slow samples, host overload, breaker state, or missing visible HUD.
- `quickstart` is the public first-run entrypoint. It must be read-only and print the next useful command.
- Workbench must start from "what should I do now?" instead of route internals.
- Documentation must describe only implemented behavior.

## Interfaces

`RecommendationEnvelope` remains the recommendation contract for user/model lanes, alternatives, confidence, freshness, degraded state, and copyable prompt.

`WorkEnvelope` is the execution-governance contract shared by Hook, CLI, MCP, API, and UI. It carries `role`, `activeStep`, `objective`, `allowedScope`, `verify`, `stopIf`, `nextAction`, and `completionProof`.

`ReceiptEvent` records whether a recommendation became useful work. Supported outcomes are `recommendation_shown`, `copied`, `accepted`, `executed`, `verified`, `blocked`, `wrong`, and `ignored`.

`FastWorkEnvelope` is the default Hook implementation detail. It is derived from `classifyRouteNeed`, built-in combo metadata, and optional tag matches. It must emit the same `WorkEnvelope` shape but with bounded local work.

## Delivery Surfaces

- Hook injects a short formatted `WorkEnvelope` so the active agent sees role, next step, allowed scope, verification, stop conditions, and receipt requirements.
- CLI and MCP include `workEnvelope` while preserving existing route and recommendation fields.
- HTTP adds fields and endpoints without deleting existing shapes.
- Agent Workbench makes work state primary: hook automatic state, current role, missing context, allowed scope, verify commands, stop conditions, receipt required, and recent outcomes.
- Quickstart explains graph, hook, MCP, runtime latency, blockers, warnings, and the next command.

## Receipt Loop

Route adoption remains backward compatible. Receipt events are append-only metadata in the same route event log and are merged into route stats. Status and diagnostics surface execution health: last work role, last receipt outcome, verified count, blocked count, wrong count, and execution rate.

Hook records `recommendation_shown` when it actually injects a work recommendation. UI can record copied, accepted, executed, verified, blocked, wrong, and ignored.

## Boundaries

- Do not rewrite matcher, compiler, embedding, or `buildRouteSpec`.
- Do not introduce GoalBuddy board files, `/goal`, or filesystem Scout/Judge/Worker workflows.
- Add HTTP/MCP/CLI fields; do not remove old fields.
- Keep degraded hook output fast, local, and useful under high load.

## Implementation Checklist

- Add or keep `WorkEnvelope`, `ReceiptEvent`, receipt stats, and compatibility fields.
- Add `fast-work-envelope` and wire default Hook through it.
- Keep legacy/full Hook path compatible, but do not make it the default.
- Add `lazybrain quickstart [--json]`.
- Make `ready` warn on stale slow Hook state.
- Make Workbench first screen show Hook automatic state, examples, last hook recommendation, recovery action, role/scope/verify/stop-if, and receipt actions.
- Update README, README_CN, package description, and changelog to public trial positioning.
- Add tests for fast Hook work, readiness warnings, quickstart smoke, route/receipt compatibility, UI strings, and existing route benchmarks.

## Verification

The implementation must pass contract tests, hook degraded tests, API/MCP/CLI tests, UI smoke checks, the matcher benchmark, `npm run lint`, `npm test`, `npm run build`, `npm run audit:public`, `node dist/bin/lazybrain.js quickstart --json`, `node dist/bin/lazybrain.js ready`, `node dist/bin/lazybrain.js ready --release`, `node dist/bin/lazybrain.js mcp status`, `node dist/bin/lazybrain.js route dogfood --target claude`, `git diff --check`, and `npx gitnexus detect-changes --repo lazy-brain`.
