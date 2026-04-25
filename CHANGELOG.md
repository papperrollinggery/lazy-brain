# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
