<div align="center">

# 🧠 LazyBrain

**Semantic Skill Router / Sidecar Agent for AI Coding Assistants**  
**面向 AI 编码助手的语义路由器 / 附属性智能体**

[![CI](https://github.com/papperrollinggery/lazy-brain/actions/workflows/ci.yml/badge.svg)](https://github.com/papperrollinggery/lazy-brain/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A518-brightgreen.svg)](https://nodejs.org)

> A sidecar agent that turns a fragmented toolbelt into an intent-aware execution layer.  
> Scan capabilities, compile a graph, route every prompt, and stay out of the `Stop` lifecycle.

[English](README.md) | [中文文档](README_CN.md)

---

</div>

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
- matches user intent to the right capability at prompt time
- provides lightweight startup recap
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
           ✅ Auto-injected /review-pr into system prompt
```

## Core Properties

- **Intent-first routing**: users describe goals, not command names
- **Capability-agnostic**: covers skills, agents, commands, modes, and hooks
- **Bilingual matching**: Chinese and English queries are both first-class
- **Local-first pipeline**: scan, graph, wiki, and tag layers work from local artifacts
- **Sidecar lifecycle**: defaults to `UserPromptSubmit`; can optionally add `SessionStart`; does not rely on `Stop`

## How It Works / 工作方式

LazyBrain has three phases: **Scan → Compile → Hook**。  
LazyBrain 分三个阶段工作：**Scan → Compile → Hook**。

```
  ┌──────────┐     ┌──────────┐     ┌──────────┐
  │   scan   │────▶│ compile  │────▶│   hook   │
  │ Discover │     │ LLM tags │     │ Auto     │
  │ tools    │     │ + graph  │     │ match    │
  └──────────┘     └──────────┘     └──────────┘
       │                 │                 │
  local capability  graph.json      UserPromptSubmit
  surfaces          wiki/           every prompt
  MCP + built-ins   relations       low-latency routing
```

1. **scan** — Discovers all skills, agents, MCP tools, and built-in commands  
   **scan**：扫描本地 skill、agent、MCP 工具和内置命令
2. **compile** — Uses an LLM to generate semantic tags, relationships, example queries, and a knowledge graph  
   **compile**：用 LLM 生成标签、关系、示例查询和图谱
3. **hook** — Installs into Claude Code and auto-matches every prompt to the right tool  
   **hook**：装进 Claude Code，在每次输入时自动匹配合适能力

## Matching Engine / 匹配引擎

When you type a prompt, LazyBrain routes it through five matching layers in order. Each layer can short-circuit and return immediately, or pass through to the next:

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
  │  Layer 0.5: Auto-Alias (learned)                │
  │  Same query → same tool 3+ times? → Auto-alias  │
  │  Zero latency, no API needed                    │
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
  │  Layer 2: Secretary (LLM fallback)              │
  │  LLM second-pass judgment for ambiguous cases   │
  │  ~2s, requires API key                          │
  └─────────────────────────────────────────────────┘
```

**Offline capable**: Layers 0–1 work without any network connection. Layer 2 requires an API key and further boosts accuracy.

**支持离线**：第 0–1 层完全可以离线运行；第 2 层需要 API key，但可以提升模糊查询的判断质量。

## Continuous Adaptation

LazyBrain doesn't just match — it learns from your usage patterns:

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
  │  Auto-Alias Generation                        │
  │  "审查代码" → /code-review matched 3 times    │
  │  → auto-promote to alias (zero latency next)  │
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
lazybrain compile                     # Compile knowledge graph (needs API key)

# Or compile offline / 或离线编译（无需 API key，仅 tag layer）
lazybrain compile --offline

# Install into Claude Code / 安装到 Claude Code
lazybrain hook install
# Explicit global install / 显式全局安装
# lazybrain hook install --global
```

That's it. Prompts inside the recorded project workspace will now be automatically matched.

这样就完成了。之后你在**当前记录的项目工作区内**输入时，都会自动经过 LazyBrain 路由。

## Configuration / 配置

```bash
# Required / 必填：用于 compile 的 LLM（OpenAI-compatible）
lazybrain config set compileApiBase https://api.siliconflow.cn/v1
lazybrain config set compileApiKey  <your-key>
lazybrain config set compileModel   Qwen/Qwen3-235B-A22B-Instruct-2507

# Optional / 可选：Secretary LLM（可回退到 compile key）
lazybrain config set secretaryApiKey  <your-key>
lazybrain config set secretaryModel   Qwen/Qwen2.5-7B-Instruct

# UI mode / 界面模式
lazybrain config set mode auto        # Auto-inject (silent)
# lazybrain config set mode ask       # Show selection UI
```

Config file / 配置文件：`~/.lazybrain/config.json`

## Commands / 命令

### Matching / 匹配

```bash
lazybrain match "重构这段代码"       # Find matching tools
lazybrain find  "代码审查"           # Alias for match
```

### Management / 管理

```bash
lazybrain scan                       # Re-scan tools
lazybrain compile                    # Recompile knowledge graph
lazybrain compile --force            # Force full recompile
lazybrain compile --offline          # Compile without LLM (tag-based only)
lazybrain list                       # List all tools
lazybrain stats                      # Graph statistics
```

### Evolution / 演化（从使用中学习）

```bash
lazybrain suggest-aliases            # Show suggested aliases (read-only)
lazybrain evolve                     # Learn new tags from usage patterns
lazybrain evolve --dry-run           # Preview what evolve would do
lazybrain evolve --rollback          # Undo last evolution
```

### Hook / Hook 安装

```bash
lazybrain hook install               # Install Claude Code hook
lazybrain hook uninstall             # Uninstall hook
lazybrain hook status                # Check hook status
lazybrain hook ps                    # Show active hook runs
lazybrain hook clean                 # Clean stale hook records
lazybrain doctor                     # Diagnose LazyBrain runtime state
lazybrain doctor --fix               # Repair LazyBrain-only state drift
```

### Hook Safety / Hook 安全模型

- `lazybrain hook install` now defaults to **project scope**
- runtime routing only applies inside the recorded workspace root
- if a prompt comes from another cwd, LazyBrain returns no-op immediately
- `Stop` is still outside the product lifecycle
- `doctor --fix` only repairs **LazyBrain's own state**
  - hook registration normalization
  - stale runtime record cleanup
  - breaker reset
  - install metadata repair when metadata already exists
- `doctor --fix` does **not** modify third-party plugins or system services

### Smoke Test / 冒烟测试

Validates the full install path from fresh clone to hook interception:

```bash
./scripts/smoke-test.sh
```

The smoke test verifies / 这个测试会验证：
- `npm ci && npm run build` succeeds
- `lazybrain hook install` correctly modifies `~/.claude/settings.json`
- `lazybrain scan && lazybrain compile` produces `~/.lazybrain/graph.json`
- Hook returns non-empty `additionalSystemPrompt` for a test prompt
- Hook uninstall cleanly removes all traces

See [`scripts/smoke-test.sh`](scripts/smoke-test.sh) for the full test implementation.

#### SessionStart Dashboard / 启动回顾

LazyBrain 默认只依赖 `UserPromptSubmit`。如果你希望在每次打开新会话时看到一段轻量启动回顾，可以额外配置 `SessionStart` hook。

By default, LazyBrain only depends on `UserPromptSubmit`. If you want a lightweight startup recap when a new session opens, you can additionally wire `SessionStart`.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "command": "node",
        "args": ["${CLAUDE_CONFIG_DIR}/../../.local/lib/node_modules/lazybrain/dist/bin/hook.js"]
      }
    ]
  }
}
```

这个启动回顾只读取 LazyBrain 自己已经写下的轻量数据，例如最近推荐、接受率、常用能力和重复能力提示。

The startup recap only reads lightweight local LazyBrain data such as recent recommendations, adoption rate, top capabilities, and duplicate-capability hints.

它不会 / It will not:

- 依赖 `Stop` hook
- 重解析 transcript
- 调用 LLM 做总结
- 与记忆/通知类插件竞争会话收尾生命周期

`lazybrain hook install` 现在只会安装 `UserPromptSubmit`，并自动清理旧版本残留的 LazyBrain `Stop` 注册。

`lazybrain hook install` now installs `UserPromptSubmit` only, and automatically removes stale LazyBrain `Stop` registrations left by older versions.

### Config

```bash
lazybrain config list                # Show current config
lazybrain config set <key> <val>     # Set config value
```

## Data Directory

```
~/.lazybrain/
├── config.json           # Configuration
├── graph.json            # Knowledge graph (local capability graph)
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
├── matcher/          # Five-layer matching engine
│   ├── alias-layer.ts     # Layer 0: manual + auto aliases
│   ├── tag-layer.ts       # Layer 1: keyword + CJK bigram
│   └── matcher.ts         # Orchestrator + history boost + corrections
├── secretary/        # Layer 3: LLM second-pass judgment
├── history/          # Usage tracking & profile distillation
├── evolution/        # Tag evolution engine
├── config/           # Configuration management
└── utils/            # CJK bridge, progress, YAML
```

## Benchmark

| Mode | Top-1 | Top-3 |
|------|-------|-------|
| Full pipeline (tag + Secretary) | varies by local graph | varies by local graph |
| Tag-only (offline) | baseline local match quality | baseline local match quality |

Benchmark results depend on:

- what capabilities exist on the current machine
- whether offline or LLM-assisted compile was used
- whether Secretary / governance layers are enabled
- which evaluation set is being used

## License

MIT
