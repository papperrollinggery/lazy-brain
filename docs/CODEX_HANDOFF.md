# Codex Handoff — LazyBrain

## Project Purpose

LazyBrain is a semantic capability router for AI coding agents. It scans local
skills, agents, commands, and hooks, compiles them into a capability graph, and
matches user intent to the right capability at prompt time.

The product must not be Claude-only. Its long-term direction is a cross-client
capability layer for:

- Claude Code
- Codex
- OpenCode
- OpenClaw
- Hermes
- Cursor / Kiro / other agent runtimes

## Product Direction

The v1 product should stay CLI/hook-first, but must visibly communicate value:

- What decision LazyBrain made
- Why it picked a capability
- What alternatives existed
- What decision it made and what work it avoided
- Which runtime/model layer is being used

The next product layer is adaptive routing. The project roadmap now lives at
`docs/adaptive-routing-roadmap.md` and defines how LazyBrain should expose
model choices, mode choices, skill/plugin alternatives, and conflict notices
through a stable `ChoiceSet`.

Execution order:

1. Freeze the current route and release-readiness baseline.
2. Add `ChoiceSet` schema to route, CLI, HTTP, and MCP outputs.
3. Add model and mode recommendation policy.
4. Add skill/plugin/hook conflict resolution.
5. Add workspace preference learning.
6. Expose choices in customer-facing surfaces.
7. Add benchmark and release gates for adaptive routing.

Future UI direction is a desktop companion / virtual pet, but it should be the
visible companion shell around a reliable routing engine, not a separate product
that hides weak routing.

## Current Priorities

1. Make value visible in Claude Code and other terminals.
2. Keep matching bilingual: Chinese and English queries should both work.
3. Expand platform support beyond Claude Code.
4. Keep metrics honest: never label total usage as "savings".
5. Preserve the future desktop UI path through the local HTTP API.

## Platform Compatibility Requirements

Capability metadata must keep platform compatibility explicit. A capability may
be universal, platform-specific, or shared across platforms.

Current platform IDs:

- `claude-code`
- `codex`
- `opencode`
- `openclaw`
- `hermes`
- `cursor`
- `kiro`
- `workbuddy`
- `droid`
- `universal`

When adding scanner support, avoid assuming every skill is Claude-compatible.
Prefer explicit compatibility inferred from file paths and frontmatter.

## Bilingual Requirements

Chinese and English are both first-class. Do not treat Chinese matching as a
translation afterthought.

Required behavior:

- Chinese query to English capability should work.
- English query to Chinese capability should work.
- Mixed CJK + Latin queries should work.
- Explanation text should follow user language when possible.

Relevant files:

- `src/utils/cjk-bridge.ts`
- `src/matcher/tag-layer.ts`
- `test/benchmark/golden-set.json`

## Desktop Companion Direction

The desktop virtual pet should eventually be a companion surface for the existing
engine:

- Shows current mode, budget, and active routing decisions
- Explains why it picked a tool
- Surfaces summaries and warnings
- Lets the user approve escalation to expensive models

Do not start with animations or a heavy UI framework. The sequence should be:

1. CLI/hook visibility
2. Local HTTP API stability
3. Lightweight companion status surface
4. Full desktop virtual pet

## Operating Guidance

- Do not replace strong-manager reasoning with MiniMax-style execution models.
- Use strong models for high-level judgment only when the decision is worth it.
- Use cheaper models/runtimes for execution, tests, docs, and local iteration.
- Prefer code-backed improvements over strategy-only documents.
- Always verify with tests before claiming completion.

## Recent Codex Changes

- Added adaptive `ChoiceSet` output to `RouteSpec` v1.5.0 across CLI JSON,
  HTTP `/api/route`, and MCP `lazybrain.route`. Route responses now expose a
  recommended option, alternatives, conflict notices, and decision policy while
  preserving the existing RouteSpec fields.
- Added model and mode ranking inside adaptive choices: fast/balanced/strong/private
  model strategies plus route-plan, review, QA, autopilot, and team mode options.
  High-risk routes now set the choice policy to ask before execution.
- Added local choice preference learning. `lazybrain choices prefs` inspects
  stored preference counters, and `lazybrain choices feedback <choice-id>
  --accepted|--rejected` records accepted/rejected choices without storing raw
  prompts. Preference weighting can promote safer alternatives but does not
  bypass high-risk ask-user policy.
- Added conflict-diagnostics substrate: capabilities now carry derived provider,
  conflict group, and side-effect metadata, and `lazybrain doctor --json` exposes
  structured hook/capability conflicts without mutating third-party state.
- Scanner frontmatter can now declare provider/conflictGroup/sideEffects; route
  skill refs preserve those fields and emit registry conflict-group notices.
- Graph load/save now preserves governance metadata used by routing decisions:
  `costLevel`, `riskLevel`, `requiresConfirmation`, `hiddenByDefault`,
  `sourcePriority`, `overlapsWith`, and conflict metadata.
- Sensitive high-risk routes now keep `model:local-private` in visible
  alternatives before truncation, so token/secret/privacy tasks surface a local
  or private model option.
- Repositioned session summary as a manual audit surface instead of a
  Stop-hook-driven “savings” report.
- Converted the session dashboard from a table into a narrative value surface.
- Added initial Hermes platform support and scanner paths.
- Removed LazyBrain from the `Stop` lifecycle. Hook install now keeps
  `UserPromptSubmit` only and treats `Stop` as legacy compatibility no-op.
- Session recap responsibility moved to `SessionStart`, sourced from local
  recommendation/history data instead of transcript parsing.

## Current Working State

This workspace now includes several in-progress but validated changes aimed at
turning LazyBrain from a pure capability router into a companion sidecar agent.

### Adaptive Routing Completion

The adaptive-routing Ralph run is complete and reviewer-approved.

Completed commit boundary:

- `c3392d6 docs: add adaptive routing roadmap`
- `912e984 feat(route): add adaptive choice set`
- `5a978c7 feat(route): rank adaptive model and mode choices`
- `6f3ef65 feat(doctor): report capability conflicts`
- `e8b1b35 feat(route): preserve registry conflict metadata`
- `165fceb feat(route): learn local choice preferences`
- `e221bf8 fix(route): preserve high-risk choice metadata`
- Continuation pass: specialized intent routing for AI slop cleanup, database
  work, planning, review, architecture, API docs, deploy, performance, and
  backend refactor queries.

Final validation evidence:

- `npm run build` passed.
- `npm test` passed: 58 files / 629 tests.
- `npm run lint` passed.
- `npm run audit:public` passed.
- `npm pack --dry-run --json` passed with 21 entries, including dist JS/map
  artifacts and `src/ui/cytoscape.min.js`.
- `node dist/bin/lazybrain.js ready --release` returned `READY`.
- Reviewer re-verification returned `APPROVED`.
- Bounded ai-slop-cleaner pass found no required cleanup edits.

### Routing / Matching

- Added bilingual query normalization and broader CJK-English bridging.
- Improved team recommendation for abstract Chinese prompts and broader agent
  inventory.
- Plugin scanning now includes nested `agents/*.md` and `commands/*.md`, not
  just `SKILL.md`.

### Hook / HUD / Compatibility

- Decision card output was moved into Claude hook context to reduce folded
  blocks in the CLI.
- Team bridge context now auto-injects for team-shaped prompts.
- Governance schema, preflight, and policy skeletons were added.
- Control/meta prompts such as "不要继续" or "只输出验收说明" now bypass routing
  so LazyBrain does not misfire with `/debug`-style recommendations.
- LazyBrain statusline no longer shows "无候选" for bypassed prompts.
- Combined HUD layer now suppresses low-signal LazyBrain labels like "已跳过"
  when an upstream HUD is already present.
- Upstream verbose token lines are normalized into a shorter cumulative form at
  the combination layer rather than by patching the upstream plugin.

### Graph Surface

- The repo previously had `graph.json` plus wiki markdown, but no direct graph
  visualization/export surface.
- A minimal graph view export now exists:
  - CLI: `lazybrain graph --limit 20`
  - Mermaid: `lazybrain graph --mermaid --limit 20`
  - HTTP: `GET /graph` and `GET /graph?format=mermaid&limit=20`
- Relationship quality is still noisy; this view is useful for inspection, not
  yet a final user-facing truth surface.

## Current Product Judgment

The capability graph / wiki stack is still valuable, but it should be treated
as the memory and retrieval substrate, not as the main product brain.

Recommended mental model:

- LazyBrain is a companion / sidecar agent.
- Claude/Codex/OpenCode/etc. remain the primary executors.
- LazyBrain owns:
  - memory
  - routing
  - governance
  - expression
- It should not try to replace the main model's core reasoning loop.

## Known Risks / Open Questions

- Claude `Stop` hooks may still be crowded because of other plugins. LazyBrain
  should no longer appear in that chain after reinstalling hooks, but users may
  still observe slow `Stop` behavior from unrelated plugins.
- Hook install now defaults to project scope. LazyBrain should only activate
  inside the recorded workspace root, and should fail closed if install
  metadata is missing.
- HUD semantics are still not fully clean. Current token display should be
  treated as cumulative consumption, not savings.
- Natural-language heavy-mode detection is still weaker than explicit mode
  detection. Governance works best today on clear signals.
- Relation inference for the graph still produces noisy edges; it should be
  denoised before becoming a polished product surface.

## Routing Benchmark Status

The benchmark suite now has perfect top-3 coverage on the current golden set.
Some log-only cases still miss top-1, so do not claim perfect first-choice
routing quality.

### Current benchmark output

- Top-1: `49/55 = 89.1%`
- Top-3: `55/55 = 100.0%`
- Chinese Top-1: `29/33 = 87.9%`
- Chinese Top-3: `33/33 = 100.0%`
- Tag-only Top-3: `55/55 = 100.0%`

### Regressions that should stay protected or re-tuned

- `设计系统架构`
  - should continue to rank `Backend Architect / architect / Software Architect`
    above generic planning commands
- `重构代码让它更简洁`
  - should continue to surface `refactor-clean / code-simplifier`
- `提交代码`
  - should continue to surface `prp-commit / code-review / git-master`
- `数据库查询优化`
  - should continue to surface `prompt-optimize / Database Optimizer`
- `代码库新人上手`
  - should continue to surface onboarding-aligned capabilities instead of
    generic docs/search commands

### Guardrails for future routing changes

- Keep `category` as a secondary signal only. Do not let category alone trigger
  intent-cluster boosts.
- Prefer targeted query-side expansions over widening generic planning /
  development / documentation boosts.
- Re-run:
  - `npm run build`
  - `npm test`
  - `npm test -- test/benchmark/match-quality.test.ts`
  before claiming routing improvements.

## New Session Resume Advice

In a fresh session, do not rely on prior chat memory. Read this file first, then
inspect:

- `bin/hook.ts`
- `bin/statusline.ts`
- `bin/statusline-combined.ts`
- `src/governance/`
- `src/hook/runtime.ts`
- `src/hook/install-state.ts`

## Claude / LazyBrain Safety Model

- `lazybrain hook install` defaults to project scope
- runtime activation is guarded by workspace cwd
- `lazybrain doctor` is the first diagnostic entrypoint
- `lazybrain doctor --fix` only repairs LazyBrain-owned state:
  - normalize hook registration
  - clean stale runtime records
  - clear breaker state
  - preserve existing install metadata when available
- `doctor --fix` must not silently rebind an unknown installation to a new
  project and must not modify third-party plugins or system services
- `src/graph/graph-view.ts`
- `src/utils/meta-prompt.ts`
- `src/utils/hud-normalizer.ts`

Then continue from the current product framing: companion sidecar agent, not
just a skill router.
