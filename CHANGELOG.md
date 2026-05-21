# Changelog

## [v2.0.1]

- Removed the leftover optional HuggingFace/embedding dependency from the public package.
- Clarified that `lb quickstart` performs the first scan and local graph build; npm install itself does not scan user files.
- Clarified that `lb compile` means local capability graph compilation, not LLM/embedding compilation.

## [v2.0.0]

- Added product-grade README, Chinese README, terminal SVG demo, CONTRIBUTING guide, and issue/PR templates.
- Expanded deterministic orchestration to 18 rules and 12 combo templates.
- Integrated learned local workflow signals into orchestration with cached history reads.
- Added stdio MCP server entrypoint `lazybrain-mcp` with find, orchestrate, stats, scan, graph, and history surfaces.
- Added user-defined orchestration rules from `~/.lazybrain/rules.yaml` plus `lb rules`.
- Expanded golden set to 76 labeled cases plus negative cases, with 88% precision gate.
- Added benchmark, edge-case, MCP, combo, and user-rule tests.
- Improved `lb stats` with growth, combo, time-saved, and never-tried signals.

## [v1.5.0]

- Added public-trial work delivery positioning: Hook WorkEnvelope guidance, quickstart readiness, receipt execution health, and Agent Workbench first-use cues.
- Kept the verified route, MCP, compile, embeddings, ready, statusline, status, and diagnostics path.
- Replaced the unfinished web console with a compact Workbench for status, diagnostics, route, compile, embeddings, and API tests.
- Removed unfinished choice preference, route adoption, route regression, public jobs, repairs, doctor-fix, and config-test/schema surfaces.
- Removed unpublished planning documents and the bundled Cytoscape asset from the public package.
- Kept RouteSpec `1.5.0` output stable for CLI, HTTP, and MCP consumers.
