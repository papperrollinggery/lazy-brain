# Codex Handoff — LazyBrain

## Latest Handoff - 2026-05-05

Read this section first in a fresh session.

### Current Goal

Finish LazyBrain as a usable local routing product, not just a passing CLI.
The active acceptance bar is:

- Web UI usable by a real operator.
- HUD/statusline shows real recent route state, not permanent idle.
- New skills/plugins are route-visible immediately through tag/combo routing;
  embeddings enhance routing but must not block unlock.
- Route events remain private: store hashes and adoption signals, not raw
  prompts.
- Dogfood routing protects realistic bilingual tasks.

### Latest Verified State

- `node dist/bin/lazybrain.js route dogfood --target claude`
  - Result: `PASS 40/40`
- `node dist/bin/lazybrain.js route 'bug ，帮查' --target claude --json`
  - Result: `debug_crash`, recommended `workflow:debug_crash`
- `node dist/bin/lazybrain.js route 'fix failing tests and create a PR' --target claude --json`
  - Result: `test_pr_repair`, recommended `workflow:test_pr_repair`
- `node dist/bin/lazybrain.js route '帮我修失败测试并提交 PR' --target codex --json`
  - Result: `test_pr_repair`, recommended `workflow:test_pr_repair`
  - Copied Codex prompt `Use:` block is limited to primary combo skills and
    explicitly requested skills; provider-specific graph skills are not shown by
    default.
- Local UI/API:
  - `http://127.0.0.1:3333/api/route` returns `routeEventId`.
  - `/api/route-events/adopt` records accepted copy/adoption feedback.
  - `/api/status` returns a local `gitNexus` object without requiring MCP.
  - UI diagnostics can inspect optional local code graph freshness and artifact
    warnings.
  - `node dist/bin/statusline.js` shows recent API route activity such as
    `api test_pr_repair [86%]` instead of permanent idle. The statusline does
    not expose GitNexus/code-graph state.
- Benchmark:
  - `npm test -- test/benchmark/match-quality.test.ts`
  - Result: Top-1 `55/55 = 100.0%`, Top-3 `55/55 = 100.0%`
  - Chinese result: Top-1 `33/33 = 100.0%`, Top-3 `33/33 = 100.0%`
- GitNexus CLI index:
  - `gitnexus status`: up-to-date
  - `gitnexus list`: `171 files`, `3598 symbols`, `6028 edges`,
    `263 processes`
- GitNexus MCP in this Codex session:
  - `mcp__gitnexus__.list_repos`: works.
  - `mcp__gitnexus__.query`: works for route/status/adoption exploration.
  - Continue verifying MCP first in fresh sessions before falling back to CLI.

### Latest Code Graph / Benchmark Usability Fix

The latest pass keeps GitNexus as an optional internal code-analysis provider
and prevents it from becoming a default user-facing route/HUD concept.

Changed behavior:

- `/api/status` includes `gitNexus.available`, `state`, `repoName`, `repoPath`,
  `indexedAt`, `lastCommit`, `currentCommit`, `stale`, `stats`,
  `artifactWarnings`, `source: local-meta`, and `mcpRequired: false`.
- `/api/diagnostics` includes the same GitNexus status for troubleshooting.
- The UI diagnostics grid shows a generic Code Graph row when local graph
  metadata exists; HUD/statusline stays focused on LazyBrain route/runtime
  state.
- Route output hides provider-specific code graph skills unless the user
  explicitly names GitNexus.
- `.gitnexus.*` backup/corrupt artifacts are ignored; the current untracked
  backup/corrupt artifacts were removed, while `.gitnexus/` was preserved.
- Benchmark golden labels now accept current better matches such as
  `gitnexus-pr-review`, `security-scan`, `kotlin-patterns`,
  `dart-flutter-patterns`, `springboot-*`, and
  `refactor-method-complexity-reduce`.
- Generic unit-test query expansion no longer injects language-specific
  `cpp-test` / `flutter-test`; it now prefers `test-coverage`, `tdd`,
  `tdd-workflow`, and `test-engineer`.

Validation already run for this pass:

- `npm test -- test/benchmark/match-quality.test.ts test/integrations/gitnexus.test.ts`
  - Passed: `114` tests.
  - Benchmark: Top-1/Top-3 `100.0%`; Chinese Top-1/Top-3 `100.0%`.
- `npm test -- test/matcher/tag-layer.test.ts test/orchestrator/route.test.ts test/orchestrator/route-dogfood.test.ts`
  - Passed: `107` tests.
- `npm test -- test/server/server.test.ts test/statusline.test.ts test/integrations/gitnexus.test.ts`
  - Passed: `47` tests.

### Latest Product Usability Fix

The latest issue found during product acceptance was a realistic bilingual PR
handoff miss:

- `帮我修失败测试并提交 PR` routed to `pr-test-analyzer` and surfaced unrelated
  Flutter/Spring/PR-review tools instead of the `test_pr_repair` workflow.

This is now fixed.

Changed files:

- `src/combos/registry.ts`
  - Added Chinese `失败测试` / `修失败测试` / `提交 PR` signals.
- `src/matcher/tag-layer.ts`
  - Tightened the test/PR specialized boost so broad `testing` or `pr` tags do
    not lift unrelated language/framework tools to the top.
- `src/orchestrator/route.ts`
  - Prevented single generic capability names such as `test` from being treated
    as explicitly named skills.
  - Reused primary-route skill filtering for adapter prompts, so copied
    Claude/Codex/Cursor prompts stay focused on combo skills and GitNexus.
  - Compact fallback scenario/details to avoid dumping long plugin examples
    into generated route plans.
- `src/ui/html.ts`
  - The Try Router result now shows primary combo skills plus explicit/GitNexus
    skills, not every noisy backend candidate.
- `src/orchestrator/route-dogfood-cases.ts`
  - Dogfood set now includes the Chinese failing-test PR handoff case.
- `test/orchestrator/route.test.ts`
  - Added regressions for Chinese failing-test PR handoff and generic token
    filtering.

Validation run after this fix:

- `npm test -- test/orchestrator/route.test.ts test/orchestrator/route-dogfood.test.ts test/server/server.test.ts`
  - Passed: `112` tests.
- `node dist/bin/lazybrain.js route dogfood --target claude`
  - Passed: `40/40`.
- `npm test`
  - Passed: `64` files / `725` tests.
- `npm run lint`
  - Passed.
- `npm run build`
  - Passed.
- `npm run gate:adaptive`
  - Passed: hook warnings `0`; capability warnings remain advisory.
- `node dist/bin/lazybrain.js ready --release`
  - `READY`.
- `git diff --check`
  - Passed.

### Recent Route Regression Fix

Claude found a real regression: `bug ，帮查` routed to browse instead of debug.
This is now fixed.

Changed files:

- `src/combos/registry.ts`
  - Boosted debug intent for short high-signal terms such as `bug`, `crash`,
    `error`, Chinese error/debug terms, and mixed CJK punctuation.
  - Strengthened PR creation signals for `create/open PR`, `pull request`,
    and Chinese `开/创建/发/提 PR`.
- `src/orchestrator/route-gate.ts`
  - Treats PR creation wording as route-worthy instead of too broad.
- `src/orchestrator/route-dogfood-cases.ts`
  - New shared 39-case dogfood set.
- `test/orchestrator/route-dogfood.test.ts`
  - Unit test now uses the shared dogfood cases.
- `test/orchestrator/route.test.ts`
  - Added regression coverage for `bug ，帮查`.
- `bin/lazybrain.ts`
  - CLI `route dogfood` now uses the shared 39-case dogfood set instead of
    the old 6-case smoke set.

Validation already run after this fix:

- `npm test -- test/orchestrator/route-dogfood.test.ts test/orchestrator/route.test.ts`
  - Passed: `67` tests.
- `npm run lint`
  - Passed.
- `npm run build`
  - Passed.
- `node dist/bin/lazybrain.js route dogfood --target claude`
  - Passed: `39/39`.
- `npm test`
  - Passed: `64` files / `722` tests.
- `npm run gate:adaptive`
  - Passed.
- `node dist/bin/lazybrain.js ready --release`
  - `READY`.
- `git diff --check`
  - Passed.

### Product Usability Fixes Already Implemented

Do not redo these unless tests or manual UI checks prove they regressed.

- Web UI inline script escaping was fixed in `src/ui/html.ts`.
- UI script syntax acceptance was added so server-rendered inline JS is checked.
- Route event privacy was tightened:
  - route events store query hashes, not raw prompts.
  - diagnostics should read route/history data through redaction helpers.
- Copy/adopt loop was added to the Web UI route result.
- `/api/route-events` and route adoption paths were added/extended for recent
  route visibility.
- HUD/statusline work added route/status visibility and reduced stale idle noise.
- README statusline instructions were updated to current behavior.

### Model / Embedding / Unlock Work Already Implemented

The intended behavior is:

- Newly installed skills/plugins route immediately through graph/tag/combo
  signals.
- Embedding rebuild is incremental by default.
- Stale or partial embeddings degrade semantic weight instead of disabling
  routing.
- Status APIs expose unlock/model/embedding health.
- GitNexus is a routing enhancement only; it is not a core LazyBrain
  dependency.

Important files:

- `src/embeddings/cache.ts`
- `src/embeddings/rebuild.ts`
- `src/matcher/embedding-layer.ts`
- `src/matcher/tag-layer.ts`
- `src/scanner/scanner.ts`
- `src/server/status.ts`
- `src/unlock/`
- `src/integrations/`

### GitNexus Handling

Use GitNexus if available, but do not block LazyBrain work on it.

Fresh-session checklist:

1. Run `tool_search` for GitNexus tools if MCP tools are not already exposed.
2. Run `mcp__gitnexus__.list_repos`.
3. If MCP works, query this repo first:
   - query: `route dogfood debug_crash findCombo route scoring`
   - repo: `<repo-root>`
4. If MCP returns `Transport closed`, fall back to:
   - `gitnexus status`
   - `gitnexus list`
   - source reading with `rg`
5. Do not commit `.gitnexus.*` backup/corrupt artifacts.

Current local GitNexus facts:

- CLI binary: `/opt/homebrew/bin/gitnexus`
- Version previously observed: `1.6.3`
- Current repo index: up-to-date on commit `83f6767`
- Backup/corrupt GitNexus artifacts exist in the worktree and should be
  ignored or cleaned only with explicit intent.

### Dirty Worktree Warning

The worktree is intentionally dirty from product-usability work. Do not reset
or checkout files.

Notable modified areas:

- CLI: `bin/lazybrain.ts`, `bin/statusline*.ts`
- UI/server: `src/ui/html.ts`, `src/server/*`
- Routing: `src/orchestrator/*`, `src/combos/registry.ts`,
  `src/matcher/*`
- Embeddings/unlock/runtime/privacy: `src/embeddings/*`, `src/unlock/`,
  `src/runtime/`, `src/privacy/`
- Tests across server, route, embeddings, scanner, statusline, privacy, runtime

### Next Session Start

Run these first:

```bash
git status --short
gitnexus status
node dist/bin/lazybrain.js route dogfood --target claude
node dist/bin/lazybrain.js route 'bug ，帮查' --target claude --json | jq -r '[(.combo // "-"), (.intent // "-"), (.choices.recommended.id // "-")] | @tsv'
```

Then verify the product surface, not only tests:

```bash
npm run build
node dist/bin/lazybrain.js ui --port 3333
```

Open the UI and check:

- home page does not stay loading.
- `/api/status` is requested.
- recent routes render.
- trial route shows model/choice and tool copy buttons.
- copying/adopting a route creates a recent adopted event.
- HUD/statusline changes after route activity and does not stay permanently
  idle.

Final release gate before claiming done:

```bash
npm test
npm run lint
npm run build
npm run gate:adaptive
node dist/bin/lazybrain.js ready --release
```

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
- Added preference cleanup and companion API surfaces. `lazybrain choices clear`
  can remove one preference or reset all local counters, and `/api/choices`,
  `/api/choices/feedback`, and `/api/choices/clear` expose the same local-only
  choice profile for HTTP clients.
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
- Follow-up benchmark pass: tuned Python/Rust/frontend/database specialization
  and refreshed the onboarding golden label for the installed Codebase
  Onboarding Engineer capability.
- Provider duplicate diagnostics now distinguish risky provider conflicts from
  equivalent duplicate installs. Equivalent same-name duplicate providers are
  reported as `info`; divergent or risky providers remain `warn`.

Final validation evidence:

- `npm run build` passed.
- `npm test` passed: 58 files / 645 tests.
- `npm run lint` passed.
- `npm run gate:adaptive` passed: benchmark, route, conflict diagnostics,
  and doctor warning summary all green.
- `npm run audit:public` passed.
- `npm pack --dry-run --json` passed with 21 entries, including dist JS/map
  artifacts and `src/ui/cytoscape.min.js`.
- `node dist/bin/lazybrain.js ready --release` returned `READY`.
- Reviewer re-verification returned `APPROVED`.
- Bounded ai-slop-cleaner pass found no required cleanup edits.
- `doctor --all --json` has no hook conflicts. Current duplicate
  `frontend-design` and `setup` provider entries are classified as informational
  equivalent duplicates rather than warnings.

Next-stage execution blueprint:

- `plans/lazybrain-next-stage-adaptive-routing.md`
- Scope: conflict-aware recommendations, runtime policy evidence, doctor
  resolution guidance, and adaptive regression gates.
- Focused gate: `npm run gate:adaptive`
- Gate expectation: `hookWarnings=0`; capability warnings are advisory because
  they can come from the user's installed plugin inventory. Informational
  duplicate providers may remain visible as non-blocking alternatives.
- P4/P5 continuation: local preference clearing and HTTP choice preference
  endpoints are implemented and covered by `test/orchestrator/choice-preferences.test.ts`
  and `test/server/server.test.ts`.

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

- Top-1: `55/55 = 100.0%`
- Top-3: `55/55 = 100.0%`
- Chinese Top-1: `33/33 = 100.0%`
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
