<div align="center">

# 🧠 LazyBrain

**Semantic Skill Router / Sidecar Agent for AI Coding Assistants**  
**面向 AI 编码助手的语义路由器 / 附属性智能体**

[![CI](https://github.com/papperrollinggery/lazy-brain/actions/workflows/ci.yml/badge.svg)](https://github.com/papperrollinggery/lazy-brain/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen.svg)](https://nodejs.org)

> A sidecar agent that turns a fragmented toolbelt into an intent-aware execution layer.  
> Scan capabilities, compile a graph, route non-trivial work, and stay out of the `Stop` lifecycle.

[English](README.md) | [中文文档](README_CN.md)

---

</div>

## Current Release

Current version: **v1.4.5**

Release position: **low-intrusion routing beta**. This version hardens `RouteSpec`, adds a read-only MCP server, adds copyable target prompts, and changes the Claude hook into a tiny gate. The hook only reminds the main model to call LazyBrain for non-trivial work; full recommendations stay in `lazybrain route`, `/api/route`, MCP, GUI, or explicit prompt output.

## Overview

Modern coding environments accumulate a large number of capabilities:

- local skills
- project agents
- CLI commands
- MCP-backed tools
- orchestration modes

The real bottleneck is not capability supply. It is **capability recall and execution routing**.

LazyBrain sits beside the primary coding model as a **sidecar agent**:

- it scans the local capability surface
- compiles a knowledge graph over those capabilities
- builds advisory route plans for the main model
- exposes the same route contract through CLI, HTTP API, MCP, and prompt output
- avoids competing for `Stop` hooks with memory and notification plugins

The result is a system where the user says what they want, and the router decides which capability should be brought into context.

## Why It Exists

Without a routing layer, advanced AI coding setups degrade in predictable ways:

- installed tools go unused because nobody remembers exact names
- cross-language queries fail (`中文需求` vs English capability names)
- users over-trigger expensive modes because the surface is too fragmented
- multiple plugins overlap, but no layer explains which one should act

LazyBrain addresses that by turning a loose toolbelt into a structured capability layer.

```
You type: "帮我审查这个 PR"
LazyBrain: → /review-pr (92%) | /critic (78%) | /santa-loop (71%)
           → Route Plan: use code review + regression checks + test evidence
```

## Core Properties

- **Intent-first routing**: users describe goals, not command names
- **Capability-agnostic**: covers skills, agents, commands, modes, and hooks
- **Bilingual matching**: Chinese and English queries are both first-class
- **Local-first pipeline**: scan, graph, wiki, and tag layers work from local artifacts
- **Low-intrusion lifecycle**: project-scoped `UserPromptSubmit` tiny gate only; no `Stop`, no default `SessionStart`

## How It Works / 工作方式

LazyBrain has three phases: **Scan → Compile → Route**. Routing can be tested in Lab first, then installed as a Claude Code hook when you are ready.

```
  ┌──────────┐     ┌──────────┐     ┌──────────────┐
  │   scan   │────▶│ compile  │────▶│ route / lab  │
  │ Discover │     │ LLM tags │     │ preview or   │
  │ tools    │     │ + graph  │     │ MCP / prompt │
  └──────────┘     └──────────┘     └──────────────┘
       │                 │                 │
  local capability  graph.json      Lab preview
  surfaces          wiki/           or UserPromptSubmit
  MCP + built-ins   relations       tiny hook gate
```

1. **scan** — Discovers all skills, agents, MCP tools, and built-in commands  
   **scan**：扫描本地 skill、agent、MCP 工具和内置命令
2. **compile** — Builds the graph offline, or uses an LLM when configured for richer tags and relationships
   **compile**：离线构建图谱；配置 LLM 后可生成更丰富的标签和关系
3. **route** — Returns an advisory `RouteSpec`; hook/MCP/prompt are just delivery surfaces

## Public-Safe Workflow

Default flow for public users:

```bash
lazybrain scan
lazybrain compile --offline
lazybrain ready
lazybrain ui
lazybrain route "review this PR"
lazybrain prompt "review this PR" --target claude
lazybrain hook plan
lazybrain hook install
```

Safety defaults:

- Lab does not install hooks and does not write `.claude/settings.json`
- `hook plan` is dry-run only
- `hook install` defaults to project scope and creates a backup first
- global install requires `lazybrain hook install --global --yes`
- LazyBrain does not use `Stop` as a product lifecycle
- third-party hooks and HUD/statusline entries are preserved by default
- GUI v1 does not install hooks directly; it shows status, previews, and CLI fallback commands
- `lazybrain route` is advisory only; it does not execute skills or write target CLI config
- `lazybrain mcp` is read-only and does not return agent bodies or private transcripts
- installed hook only injects a short reminder: `Consider calling lazybrain.route for skill routing, context reduction, and verification planning.`

## What Counts as a Skill / Agent / Capability

LazyBrain treats the local AI tool surface as **capabilities**. A capability can be:

- a skill directory with `SKILL.md`
- a Claude/Agent Agency agent markdown file
- a command markdown file
- a mode, hook, or plugin-provided entry that appears in scanned paths

For skills, LazyBrain reads:

- `name`, `description`, `trigger`, `triggers`, and `origin` from frontmatter when present
- optional route schema fields: `useWhen`, `avoidWhen`, `inputs`, `workflow`, `verification`, `doneWhen`, `contextNeeded`, and `guardrails`
- the first useful body paragraph as a fallback description
- the parent directory name as a fallback skill name

For agents, the Lab inventory only exposes public metadata:

- `name`
- `description`
- `scope`
- `source`
- `model`
- `tools`

It does not return agent body text, Claude private transcripts, or conversation history. During scan/compile, LazyBrain parses local markdown files to build a capability graph; it does not execute the skill or agent.

Recommended skill shape:

```markdown
---
name: code-review
description: Review code for correctness, regressions, maintainability, and missing tests.
triggers:
  - review code
  - 审查代码
useWhen: ["review code changes", "check regression risk"]
workflow: [{"title":"Inspect changed files"},{"title":"Prioritize behavioral findings"}]
verification: [{"title":"Run tests","command":"npm test"}]
doneWhen: ["Findings are grounded in file evidence or tests pass"]
contextNeeded: ["diff or branch", "expected behavior"]
guardrails: [{"title":"Lead with bugs and regressions","strength":"strict"}]
---

Use this skill when the user asks for a focused engineering review.
```

If a skill does not appear in results, check that it is under a scanned skill path, has a `SKILL.md`, and includes a clear `name` or `description`.

## Matching Engine / 匹配引擎

When you type a prompt, LazyBrain uses the currently implemented routing layers in order:

```
  Prompt: "帮我审查这个 PR"
       │
       ▼
  ┌─────────────────────────────────────────────────┐
  │  Layer 0: Manual Alias                          │
  │  Exact match? → Return immediately              │
  │  e.g. "review" → /review-pr                    │
  └─────────────────┬───────────────────────────────┘
                    │ No match
                    ▼
  ┌─────────────────────────────────────────────────┐
  │  Layer 1: Tag Matching                          │
  │  CJK bigram + cross-language bridge              │
  │  "审查" → expanded to ["review", "audit"]        │
  │  <1ms, fully offline                            │
  └─────────────────┬───────────────────────────────┘
                    │ Low confidence
                    ▼
  ┌─────────────────────────────────────────────────┐
  │  Layer 2: Semantic / Hybrid                     │
  │  Embedding cache required                       │
  │  Falls back with warnings when cache is missing │
  └─────────────────┬───────────────────────────────┘
                    │ Build route contract
                    ▼
  ┌─────────────────────────────────────────────────┐
  │  RouteSpec                                      │
  │  route_plan / needs_clarification /             │
  │  no_route_needed                                │
  │  token strategy + verification guidance         │
  └─────────────────────────────────────────────────┘
```

**Offline capable**: manual aliases and tag matching work without any network connection. `semantic` / `hybrid` requires embedding config plus `graph.embeddings.*` cache; when cache is missing, LazyBrain falls back to the lower layers and reports a warning.

The default hook does not run Secretary or inject full recommendations. Secretary/API checks are explicit through `lazybrain api test`; route planning stays advisory and compact.

**支持离线**：手工别名和 tag-layer 不需要网络；`semantic` / `hybrid` 需要 embedding 配置和 `graph.embeddings.*` 缓存，缓存缺失时会降级并给出 warning。

## Implemented vs Planned

| Area | Current behavior | Notes |
|------|------------------|-------|
| Offline routing | Manual alias + tag/CJK bridge | Works without API keys |
| Semantic / hybrid | Uses embedding cache when configured | Falls back with warnings when cache is missing |
| Route plan | `lazybrain route` returns v1.4.5 `RouteSpec` | Includes `route_plan`, `needs_clarification`, and `no_route_needed` |
| MCP | `lazybrain mcp --stdio` exposes read-only route/search/card/combo tools | Does not write target CLI config or return agent bodies |
| Manual prompt | `lazybrain prompt` renders target-specific copyable guidance | Useful when MCP is not configured |
| Combo templates | Built-in high-frequency orchestration templates | `lazybrain combos [category]` is read-only |
| Hook install | Project scope tiny gate, dry-run plan, backup, rollback | Global install requires `--global --yes`; hook injects only a short reminder |
| Lab | Built-in fixtures, local agent metadata, team gate, token strategy, hook readiness | Does not read Claude transcripts or install hooks |
| Team guidance | Advisory model split, runtime adapters, subagent prompts | Main model or user keeps final decision |
| Auto-alias | Suggest/read-only path today | Fully automatic promotion is still planned |

## Continuous Adaptation

LazyBrain can learn from usage patterns without treating every planned capability as already mature:

```
  ┌───────────────────────────────────────────────┐
  │              Usage History                     │
  │  "审查代码" → /code-review (accepted)          │
  │  "审查代码" → /wiki (rejected!)                │
  │  "审查代码" → /code-review (accepted)          │
  └───────────────┬───────────────────────────────┘
                  │ distill
                  ▼
  ┌───────────────────────────────────────────────┐
  │  Rejection Learning                           │
  │  wiki was rejected for "审查代码" queries      │
  │  → auto-deprioritize wiki for similar queries │
  ├───────────────────────────────────────────────┤
  │  Auto-Alias Generation (planned)              │
  │  repeated choices can become shortcuts        │
  │  this is not treated as mature yet            │
  ├───────────────────────────────────────────────┤
  │  Tag Evolution                                │
  │  Users search "审查代码" but tag is only       │
  │  "review" → evolve adds "审查" as a new tag   │
  ├───────────────────────────────────────────────┤
  │  Task Chain Prediction                        │
  │  After using /review-pr → suggest /refactor   │
  │  (within current session only)                │
  └───────────────────────────────────────────────┘
```

## Wiki and Graph Outputs

`lazybrain compile` generates runtime artifacts under `~/.lazybrain/`. They are local machine outputs, not project-source files committed to this repo.

```
~/.lazybrain/wiki/
├── index.md
├── development.md
├── operations.md
├── orchestration.md
└── ...
```

Important details:

- category files are generated from a **fixed category vocabulary** plus dynamic local classification
- the number of generated category files depends on what actually exists in your local graph
- counts in examples are **illustrative**, not guaranteed project constants
- wiki pages cover **capabilities**, not just “tools”; that includes:
  - skills
  - agents
  - commands
  - other capability kinds that appear in the graph

Current wiki output is category-centric:

- `index.md` links to category pages
- `kinds.md` groups capabilities by kind (`skill / agent / command / mode / hook`)
- `origins.md` groups capabilities by source/origin (`local / ECC / OMC / plugin / external ...`)
- each category page groups entries under `Skills`, `Agents`, `Commands`, and `Other`

So agents and commands are not missing; they are currently surfaced inside category pages rather than separate top-level indices.

## Quick Start / 快速开始

**Prerequisites / 前置条件**: Node.js ≥ 18

```bash
# Install from GitHub / 从 GitHub 安装
git clone https://github.com/papperrollinggery/lazy-brain.git
cd lazy-brain
npm install
npm run build
npm link        # makes the `lazybrain` / `lb` commands global

# Verify / 验证
lazybrain --version
```

```bash
# Setup / 初始化
lazybrain scan                        # Scan local tools
lazybrain compile --offline           # Build tag-layer graph without API key
lazybrain ready                       # Check graph, hook, HUD, and semantic readiness

# Non-install visual check / 非安装式可视化检查
lazybrain ui                          # Opens http://127.0.0.1:18450/
lazybrain route "review this PR"      # Advisory execution plan, no writes
# lazybrain ui --no-open
# open http://127.0.0.1:18450/lab

# Install only after reviewing the plan / 审查预演后再安装
lazybrain hook plan                   # Preview settings changes, no writes
lazybrain hook install                # Install project-scoped Claude Code hook

# Explicit global install / 显式全局安装
# lazybrain hook install --global --yes

# Roll back latest LazyBrain hook backup / 回滚最近一次 Hook 备份
# lazybrain hook rollback
```

After hook install, prompts inside the recorded project workspace pass through the tiny gate. Complex, vague, or high-risk prompts get a short reminder to call LazyBrain; full plans are pulled through CLI/API/MCP.

安装 hook 后，当前记录的项目工作区只经过 tiny gate。复杂、模糊或高风险任务会收到短提醒；完整计划由 CLI/API/MCP 拉取。

`lazybrain hook install` writes project `.claude/settings.json` by default and creates a LazyBrain backup first. Global install is refused unless `--global --yes` is present.

## Daily Usage

Use these commands for the normal public flow:

```bash
lazybrain --version                  # Confirm the installed version
lazybrain scan                       # Refresh local capabilities
lazybrain compile --offline          # Build graph without an API key
lazybrain match "review this PR"     # Test recommendation quality in terminal
lazybrain route "review this PR"     # Build advisory RouteSpec plan
lazybrain prompt "review this PR" --target claude
lazybrain mcp status                 # Check MCP readiness
lazybrain ready                      # Check graph, hook, HUD, and semantic readiness
lazybrain ui                         # Open the local GUI
lazybrain hook plan                  # Preview hook changes
lazybrain hook install               # Install project-scoped hook
```

Use the GUI before hook install when you want a visual check:

```bash
lazybrain ui
open http://127.0.0.1:18450/lab
```

Use rollback when hook behavior is not what you expected:

```bash
lazybrain hook rollback
lazybrain hook status
```

## Configuration / 配置

```bash
# Optional / 可选：LLM compile（OpenAI-compatible）
lazybrain config set compileApiBase https://api.siliconflow.cn/v1
lazybrain config set compileApiKey  <your-key>
lazybrain config set compileModel   Qwen/Qwen3-235B-A22B-Instruct-2507

# Optional / 可选：semantic / hybrid matching
lazybrain config set embeddingApiBase https://api.siliconflow.cn/v1
lazybrain config set embeddingApiKey  <your-key>
lazybrain config set embeddingModel   BAAI/bge-m3
lazybrain config set engine           hybrid
lazybrain api test                    # Explicit external API check
lazybrain embeddings status           # Read-only cache coverage check
lazybrain embeddings rebuild --yes    # Writes ~/.lazybrain/graph.embeddings.*

# Optional / 可选：Secretary LLM（可回退到 compile key）
lazybrain config set secretaryApiKey  <your-key>
lazybrain config set secretaryModel   Qwen/Qwen2.5-7B-Instruct

# UI mode / 界面模式
lazybrain config set mode auto        # Auto-inject (silent)
# lazybrain config set mode ask       # Show selection UI
```

Config file / 配置文件：`~/.lazybrain/config.json`

`lazybrain config show` redacts API keys in terminal output.

## Commands / 命令

### Matching / 匹配

```bash
lazybrain match "重构这段代码"       # Find matching tools
lazybrain find  "代码审查"           # Alias for match
lazybrain route "把后台改成 CEO dashboard"
lazybrain route "review this PR" --target codex
lazybrain route "review this PR" --json
lazybrain route stats
lazybrain prompt "review this PR" --target claude
lazybrain prompt "review this PR" --target codex --copy
lazybrain mcp status
lazybrain mcp --stdio
lazybrain combos frontend
```

`lazybrain route` upgrades raw matches into an advisory `RouteSpec`: `schemaVersion`, `mode`, scenario, skills, token strategy, context needed, workflow, guardrails, verification, done conditions, and a target-specific prompt style for `generic`, `claude`, `codex`, or `cursor`.

Route modes:

- `route_plan`: use LazyBrain's top-K compact skill plan.
- `needs_clarification`: ask clarifying questions before loading skills.
- `no_route_needed`: handle the task directly; do not spend routing context.

`lazybrain prompt` renders the same plan as a copyable target prompt. `lazybrain mcp --stdio` exposes read-only tools: `lazybrain.route`, `lazybrain.search`, `lazybrain.skill_card`, and `lazybrain.combos`. These surfaces do not execute skills, install hooks, read transcripts, return agent bodies, or write Claude/Codex/Cursor configuration.

### Management / 管理

```bash
lazybrain scan                       # Re-scan tools
lazybrain compile                    # Recompile knowledge graph
lazybrain compile --force            # Force full recompile
lazybrain compile --offline          # Compile without LLM (tag-based only)
lazybrain list                       # List all tools
lazybrain stats                      # Graph statistics
lazybrain ready                      # Check graph, hook, HUD, and semantic readiness
lazybrain ui                         # Start local Web GUI
lazybrain server --daemon            # Start local API server directly
```

### Local Web GUI / 本地 GUI

```bash
lazybrain ui
lazybrain ui --no-open
lazybrain ui --port 18451
lazybrain ui status
lazybrain ui stop
```

GUI entrypoints:

- `GET /` and `GET /ui` — local status GUI
- `GET /lab` — non-install recommendation Lab
- `GET /api/status` — readiness, graph, routing, hook, API, embedding, agent, and server status
- `POST /api/route` — advisory route plan; no execution and no target CLI config writes
- `POST /api/test` — explicit API test only after user action
- `POST /api/embeddings/rebuild` — requires `{ "confirm": "rebuild" }`

GUI v1 is status-first: it does not read Claude transcripts, return agent body text, install hooks, or write `.claude/settings.json`.

### Lab / Non-install visual testing

```bash
lazybrain server --daemon
open http://127.0.0.1:18450/lab
```

The Lab uses built-in fixtures to inspect matching quality, team gating, token strategy, hook readiness, and Claude/Agent Agency subagent mapping without installing hooks or writing Claude settings.

Lab endpoints:

- `GET /lab` — self-contained local HTML page
- `GET /lab/fixtures` — built-in evaluation cases
- `GET /lab/agents` — local agent metadata only: name, description, scope, source, model, tools
- `POST /lab/evaluate` — match, team guidance, runtime adapters, token strategy, hook readiness, and warnings

The agent inventory scanner does not return agent body text and does not read Claude private transcripts.

### Evolution / 演化（从使用中学习）

```bash
lazybrain suggest-aliases            # Show suggested aliases (read-only)
lazybrain evolve                     # Learn new tags from usage patterns
lazybrain evolve --dry-run           # Preview what evolve would do
lazybrain evolve --rollback          # Undo last evolution
```

### Hook / Hook 安装

```bash
lazybrain hook plan                  # Preview hook install, no writes
lazybrain hook install               # Install Claude Code hook
lazybrain hook install --global --yes # Explicit confirmed global install
lazybrain hook rollback              # Restore latest LazyBrain hook backup
lazybrain hook uninstall             # Uninstall hook
lazybrain hook status                # Check hook status
lazybrain hook status --json         # Machine-readable runtime status
lazybrain hook ps                    # Show active hook runs
lazybrain hook clean                 # Clean stale hook records
lazybrain doctor                     # Diagnose LazyBrain runtime state
lazybrain doctor --fix               # Repair LazyBrain-only state drift
lazybrain doctor --all               # Report project and global scopes, no fix
```

### Hook Safety / Hook 安全模型

- `lazybrain hook install` now defaults to **project scope**
- `lazybrain hook plan` previews the target settings path, lifecycle hooks, third-party hooks, statusline handling, install-state path, and risk conclusion without writing `.claude/settings.json` or `~/.lazybrain/*`
- `lazybrain hook install` creates a LazyBrain backup before writing settings
- `lazybrain hook rollback` restores only files that LazyBrain backed up
- `lazybrain hook install --global` is refused unless `--yes` is also present
- runtime tiny gate only applies inside the recorded workspace root
- if a prompt comes from another cwd, LazyBrain returns no-op immediately
- the default hook does not run Secretary, wiki-card generation, full matching output, or agent/team expansion
- high load, concurrency limit, breaker, missing graph, and non-`UserPromptSubmit` events fail closed with no user-facing delay
- `Stop` is still outside the product lifecycle
- third-party hooks and mixed hook entries are preserved
- existing third-party HUD/statusline is skipped by default; `--statusline` combines, `--replace-statusline` replaces
- `doctor --fix` only repairs **LazyBrain's own state**
  - hook registration normalization
  - stale runtime record cleanup
  - breaker reset
  - install metadata repair when metadata already exists
- `doctor --fix` does **not** modify third-party plugins or system services
- `doctor --all --fix` is disabled to avoid cross-scope writes

### Uninstall and Rollback / 卸载与回滚

```bash
lazybrain hook uninstall              # Remove LazyBrain hook registration
lazybrain hook rollback               # Restore latest LazyBrain backup
lazybrain hook rollback --to <id>     # Restore a specific backup timestamp
```

Rollback restores only files that were captured by LazyBrain backups. It does not delete third-party hook files.

### What It Will Not Do / 默认不会做什么

- no global hook install by default
- no `Stop` lifecycle dependency
- no third-party hook deletion
- no third-party HUD overwrite by default
- no config writes during `hook plan`
- no silent semantic claim when embedding cache is missing
- no full skill body injection from the hook

## Troubleshooting

| Symptom | Check | Fix |
|---------|-------|-----|
| `lazybrain ready` says graph is missing | `~/.lazybrain/graph.json` does not exist | Run `lazybrain scan && lazybrain compile --offline` |
| GUI or Lab page does not open | Server is not running or port is different | Run `lazybrain ui`, or `lazybrain ui --port 18451` |
| Lab shows no agents | No readable agent metadata found | Add project agents under `.claude/agents/` or user agents under `~/.claude/agents/`, then refresh Lab |
| `hook plan` reports `needs_attention` because of LazyBrain in `Stop` | Older LazyBrain hook registration remains | Review the plan; `lazybrain hook install` will clean LazyBrain-owned `Stop` entries |
| `hook install --global` fails | Global install requires explicit confirmation | Use `lazybrain hook install --global --yes` only if you want every Claude project affected |
| Hook is installed but no recommendation appears | v1.4.5 hook is a tiny gate, not a full recommender | Run `lazybrain hook status --json`; test the full plan with `lazybrain route "<same query>"` |
| Main model ignores LazyBrain | MCP is not configured or the task looked trivial | Use `lazybrain prompt "<same query>" --target claude`, or configure `lazybrain mcp --stdio` in the client |
| Hook seems stuck or returns no output after a long run | Runtime breaker or stale record may be active | Run `lazybrain hook ps`, then `lazybrain hook clean`, then `lazybrain ready` |
| Third-party HUD/statusline is present | LazyBrain skips it by default | Use `lazybrain hook install --statusline` to combine, or `--replace-statusline` only when you intentionally want replacement |
| `lazybrain api test` reports 401 | API key is invalid or not accepted by the configured base/model | Reset the key with `lazybrain config set ...ApiKey <key>` and rerun `lazybrain api test` |
| semantic/hybrid does not improve matches | Embedding config or cache is missing/stale/dimension-mismatched | Run `lazybrain embeddings status`; rebuild with `lazybrain embeddings rebuild --yes` after config is correct |
| A skill is missing from results | The skill path or metadata is incomplete | Ensure the skill has `SKILL.md` with `name` or `description`, then run `lazybrain scan` |

Safe recovery commands:

```bash
lazybrain ready
lazybrain hook status
lazybrain hook status --json
lazybrain hook ps
lazybrain hook clean
lazybrain hook rollback
lazybrain doctor
lazybrain api test
lazybrain embeddings status
lazybrain route stats
lazybrain mcp status
```

`doctor --fix` only repairs LazyBrain-owned state in the current scope. `doctor --all --fix` is intentionally disabled.

### Smoke Test / 冒烟测试

Validates the full install path from fresh clone to hook interception:

```bash
./scripts/smoke-test.sh
```

The smoke test verifies / 这个测试会验证：
- `npm ci && npm run build` succeeds
- `lazybrain ready` reports the current readiness state
- `lazybrain hook plan` previews install changes without writing settings
- `lazybrain hook install` correctly modifies project `.claude/settings.json`
- `lazybrain scan && lazybrain compile` produces `~/.lazybrain/graph.json`
- Hook returns the tiny route reminder for a complex test prompt
- `lazybrain hook rollback` restores the latest LazyBrain backup

See [`scripts/smoke-test.sh`](scripts/smoke-test.sh) for the full test implementation.

### Release and Review Gate

Required before release PRs:

```bash
npm ci
npm run build
npm test
npm run lint
npm run audit:public
npm pack --dry-run --json
```

The stable required GitHub check is `Test`. It runs Node 18/20/22, package dry-run, public privacy scan, version consistency checks, hook-focused tests, and Lab/server smoke.

Public package contents are limited to `dist`, `README.md`, `README_CN.md`, `CHANGELOG.md`, `LICENSE`, and package metadata. npm publishing is handled by the GitHub Release workflow.

Optional Codex review instructions are in [`docs/REVIEW.md`](docs/REVIEW.md).

#### MCP and Manual Fallback

Use MCP when the primary model should pull structured advice itself:

```bash
lazybrain mcp status
lazybrain mcp --stdio
```

Use prompt output when MCP is not configured:

```bash
lazybrain prompt "review this PR" --target claude
lazybrain prompt "debug this stuck hook" --target codex --copy
```

`lazybrain hook install` installs `UserPromptSubmit` only and automatically removes stale LazyBrain `Stop` registrations left by older versions. The default hook is a tiny reminder gate; it does not run the old startup dashboard, Secretary path, or full recommendation injection.

### Config

```bash
lazybrain config show                # Show current redacted config
lazybrain config set <key> <val>     # Set config value
```

## Data Directory

```
~/.lazybrain/
├── config.json           # Configuration
├── graph.json            # Knowledge graph (local capability graph)
├── graph.embeddings.bin  # Semantic vector cache
├── graph.embeddings.index.json
├── hook-install-map.json # Project/global hook install metadata
├── history.jsonl         # Usage history
├── profile.json          # Distilled user profile
├── last-match.json       # Latest match result
└── wiki/                 # Capability wiki indices and category pages
```

## Source Structure

```
src/
├── scanner/          # Tool discovery & parsers (skill/agent/command)
├── compiler/         # LLM tag generation & category classification
├── graph/            # Graph CRUD & wiki generation
├── matcher/          # Matching engine
│   ├── alias-layer.ts     # Layer 0: manual aliases
│   ├── tag-layer.ts       # Layer 1: keyword + CJK bigram
│   ├── embedding-layer.ts # Layer 2: semantic/hybrid cache
│   └── matcher.ts         # Orchestrator + history boost + corrections
├── lab/              # Non-install Lab UI, fixtures, agent inventory, evaluator
├── hook/             # Hook planning, install safety, rollback, readiness
├── server/           # Local HTTP API and Lab routes
├── secretary/        # Hook LLM second-pass judgment
├── history/          # Usage tracking & profile distillation
├── evolution/        # Tag evolution engine
├── config/           # Configuration management
└── utils/            # CJK bridge, progress, YAML
```

## Benchmark

| Mode | Top-1 | Top-3 |
|------|-------|-------|
| Route pipeline (tag + optional semantic) | varies by local graph | varies by local graph |
| Tag-only (offline) | baseline local match quality | baseline local match quality |

Benchmark results depend on:

- what capabilities exist on the current machine
- whether offline or LLM-assisted compile was used
- whether semantic cache is configured and current
- which evaluation set is being used

## License

MIT
