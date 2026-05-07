# CODEX_HANDOFF

Current branch: `codex/lazybrain-route-compile-split`.

## Current Scope

This branch is being slimmed in place. Keep only verified core behavior:

- `lazybrain route`
- MCP status/tools
- compile and embedding status/rebuild
- `lazybrain ready` and `ready --release`
- statusline/runtime truth separation
- `/api/status`, `/api/diagnostics`, `/api/route`, route event readback

Removed product surface:

- choice preference CLI
- choice preference storage and feedback APIs
- route adoption/regression APIs
- public jobs/repairs/doctor-fix APIs
- config schema/test APIs
- unfinished multi-page UI panels and Cytoscape graph UI
- long planning docs for unshipped adaptive routing/UI work

## GitNexus Notes

High-risk symbols already checked before edits:

- `buildRouteSpec`: HIGH
- `buildStatusReport`: CRITICAL
- `createRouter`: LOW

Final gate: MCP `detect_changes(scope=all)`. If GitNexus reports a stale index, run `npx gitnexus analyze` first.

## Required Verification

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
