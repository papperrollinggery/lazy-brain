# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
