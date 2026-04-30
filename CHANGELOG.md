# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Combo route entry commands now render for the requested target instead of hardcoding `--target codex`.
- GUI config controls now use backend-valid routing engine and strategy values.
- GUI Cytoscape loading now uses only packaged local assets.
- CLI and GUI config writes now share the same whitelist, enum checks, string checks, secret blank-value no-op behavior, and `autoThreshold` bounds.

### Fixed
- Hook install backups now include `.claude/hooks/hooks.json`; rollback restores or removes that file according to the captured manifest.
- Relation compile output now validates link types, records missing targets and parse failures as structured errors, persists compile errors in `graph.json`, and makes `lazybrain ready` block on unresolved compile errors.
- Relation compile now records non-array relation responses as structured shape errors instead of silently dropping them.
- Tags-only compile now preserves unresolved relation compile errors until relations are recompiled with force.
- `lazybrain compile errors` now exposes persisted relation compile errors and summary counts for follow-up.
- GUI/API readiness now blocks on persisted graph compile errors just like `lazybrain ready`.
- GUI "scan and compile" now runs `lazybrain scan` before `lazybrain compile`.
- GUI compile success now reloads the in-memory graph before the status view refreshes.
- Hook cleanup now matches exact LazyBrain hook path segments instead of similarly named paths.
- GUI API key edits no longer clear existing keys when the field is left blank.
- GUI compile polling now preserves the final exit code, re-enables both compile controls, and resolves the CLI path from the package/source layout instead of `~/.lazybrain`.

## [v1.5.0] - 2026-04-27

### Added
- Persistent statusline with active (bold) vs dormant (dim) visual distinction, always visible in combined HUD mode.
- Complete UI/UX redesign: unified design system, dark mode support, Chinese-first scrollable single-page layout.
- Chinese admin panel with 6 sections: status overview, live route tester, tool browser, API config editor, system diagnostics, and setup guide.
- Inline API config editing (compile/embedding/secretary LLM settings, API keys, routing engine) with save-to-config.
- `POST /api/config` endpoint to write configuration from the web UI (14 whitelisted keys).
- `GET /api/diagnostics` endpoint returning hook runtime stats, recent events, graph status, and embedding cache health.
- Tiny gate hook now runs lightweight tag-layer matching and injects real results with scores (🟢🟡⚪), tool names, descriptions, and personality roasts.
- Auto language detection (zh/en) for hook-injected routing suggestions.
- Project CLAUDE.md with model-friendly install instructions.

### Changed
- Search API (`/api/search`) now returns all nodes when no query or filter is specified, fixing the empty tools display.
- Lab page redesigned to match the unified design system.

### Fixed
- JavaScript syntax error in setup guide cmd strings due to unescaped newlines in TypeScript template literals.
- Config fields displaying as "未配置" (not configured) due to field name mismatch in renderConfig().
- `autoThreshold` validation now rejects NaN values.
- `POST /api/config` now checks Origin header for defense-in-depth.
- Tiny gate hook now writes `last-match.json` so the statusline shows real match results instead of "建议路由".
- Platform-specific native packages moved to `optionalDependencies` for cross-platform CI compatibility.

## [v1.4.5] - 2026-04-26

### Added
- `RouteSpec` schema version, `no_route_needed` mode, `tokenStrategy`, and route rationale fields for stable cross-surface routing.
- `lazybrain prompt "<query>" --target claude|codex|cursor|generic` with explicit `--copy` clipboard support.
- Read-only MCP stdio server via `lazybrain mcp --stdio`, exposing `lazybrain.route`, `lazybrain.search`, `lazybrain.skill_card`, and `lazybrain.combos`.
- Privacy-preserving route counters through `lazybrain route stats`.
- `lazybrain hook status --json` for runtime diagnostics including skip reason, breaker state, active/hung runs, and p95 duration.

### Changed
- The default Claude hook is now a tiny gate: it performs a fast complexity/vagueness/risk check and injects only a short reminder to call `lazybrain.route`.
- `/api/route` now uses the same history/profile inputs as CLI routing and enforces query/body size limits.
- Public docs now position MCP and prompt output as the main low-intrusion route surfaces, with hook as a reminder gate.

### Security
- MCP tools are read-only, do not execute skills, do not install hooks, do not return agent bodies, and do not read transcripts.
- Hook route telemetry stores only hashes and compact metadata, not raw prompts.

## [v1.4.0] - 2026-04-25

### Added
- Advisory Route Plan orchestrator via `lazybrain route "<query>"`, `--json`, and `--target generic|claude|codex|cursor`.
- Stable `RouteSpec` output with intent, scenario, skills, workflow, context needed, guardrails, verification, done conditions, adapter prompts, warnings, and clarification questions.
- Optional SKILL.md frontmatter schema fields: `useWhen`, `avoidWhen`, `inputs`, `workflow`, `verification`, `doneWhen`, `contextNeeded`, and `guardrails`.
- Built-in combo templates for frontend pages, redesigns, CEO dashboards, public install docs, regression review, stuck-runtime debugging, and public release audit.
- `lazybrain combos [category]` for read-only combo discovery.
- Verification catalog for UI screenshots, dashboard operating questions, docs readability, code checks, hook dry-run, rollback, privacy scan, and package dry-run.
- `POST /api/route` and GUI Try Router Route Plan display.

### Changed
- Route planning stays outside the matcher; `match()` remains retrieval-only while the orchestrator builds execution guidance.
- README and README_CN now document RouteSpec, combo templates, advisory-only behavior, and schema metadata.

### Security
- Route planning does not execute skills, install hooks, read transcripts, return agent bodies, or write Claude/Codex/Cursor configuration.

## [v1.3.0] - 2026-04-25

### Added
- Local Web GUI via `lazybrain ui`, with Overview, Try Router, Skill DB, Hook Safety, Lab, Health, Troubleshooting, and Settings pages.
- Read-only GUI/status APIs: `/`, `/ui`, `/api/status`, `/api/health`, `/api/stats`, `/api/search`, `/api/embeddings/status`, and Lab API aliases.
- Explicit action APIs for `POST /api/test` and `POST /api/embeddings/rebuild` with confirmation gates.
- CLI status homepage as the default `lazybrain` output.
- `lazybrain api test` for compile LLM, secretary LLM, and embedding checks without printing keys.
- `lazybrain embeddings status` and `lazybrain embeddings rebuild --yes` with temp-file atomic cache writes.
- Public audit gate through `npm run audit:public`, PR template, optional Codex review guide, and GitHub release workflow.

### Changed
- `lazybrain --version`, `/health`, `/api/health`, package metadata, and changelog now share one package-version source.
- CI keeps a stable required `Test` check while covering Node 18, 20, and 22, package dry-run, public privacy scan, hook tests, and Lab/server smoke.
- README and README_CN now document GUI usage, API testing, embedding cache rebuild, release gates, and bug recovery.

### Security
- Public audit blocks private paths, local planning docs, personal email markers, token-like secrets, private runtime directory markers, and internal workspace-name leaks.
- Root `AGENTS.md` is no longer tracked in the public repository.
- GUI v1 does not install hooks, read Claude transcripts, return agent body text, or write `.claude/settings.json`.

## [v1.2.0] - 2026-04-25

### Added
- Non-install LazyBrain Lab at `/lab` for visual recommendation testing, agent mapping, team gating, token strategy, and hook readiness.
- Agent inventory scanner for project, user, and plugin agents using metadata only.
- Trusted hook install workflow with dry-run plan, automatic backups, rollback, readiness checks, and global-install confirmation.
- Advisory team model guidance, runtime adapters, and subagent prompt suggestions.

### Changed
- Documentation now recommends scan, offline compile, ready check, Lab preview, hook plan, then project-scoped install.
- Hook docs now separate implemented behavior from planned capabilities and clarify semantic fallback behavior.
- `lazybrain ready` now blocks when hook breaker state, hung records, or host load would make the hook fail closed.
- README and README_CN now include v1.2.0 release positioning, skill/agent metadata coverage, daily usage, and troubleshooting guidance.

### Security
- Redact sensitive config values in CLI output.
- Lab and hook plan responses avoid agent body text, Claude private transcripts, local home paths, and statusline secret parameters.
- Project-scope runtime guard now canonicalizes symlinked workspace paths before comparing cwd.
- Remove internal agent workflow protocol documents from the public repository.

## [v1.1.0] - 2026-04-23

### Added
- Add baseline token cost calculation for accurate token savings in session statistics and dashboard.

## [v1.0.2] - 2026-04-20

### Added
- Project-scoped hook install metadata and workspace `cwd` guard so LazyBrain only runs inside the intended repo by default
- Hook runtime registry, active run inspection, and breaker diagnostics via `lazybrain doctor`, `lazybrain hook ps`, and `lazybrain hook clean`

### Changed
- Hardened hook runtime safety with concurrency limits, hung/stale run handling, overload breaker checks, and fail-closed scope behavior when install metadata is missing
- `doctor --fix` now only repairs LazyBrain-owned state and refuses to silently rebind a missing project scope
- `hook status` and startup diagnostics now surface scope, active hooks, hung hooks, breaker state, and confirm that LazyBrain does not participate in `Stop`
- Documentation updated to reflect the sidecar-agent lifecycle, project-scoped hook behavior, and CLI-first runtime guidance

## [v1.0.0] - 2026-04-19

### Added
- Step 1: Cleanup embedding dead code and fixup decision type identification quality
- Step 2: Decision type identifier for classifying user intents
- Step 3: Team recommender for intelligent agent team formation
- Step 4: Thinking trigger for proactive tool suggestions
- Step 5: Duplicate detector for identifying redundant tools/skills
- Step 6: HTTP API server for desktop UI integration
- Step 7: Real usage data tracking for analytics and improvement
