<div align="center">

# 🧠 LazyBrain

**Semantic Skill Router for AI Coding Assistants**

> You have dozens of skills installed, but can never remember which one to use.
> LazyBrain matches your intent to the right tool — automatically.

[English](README.md) | [中文文档](README_CN.md)

---

</div>

## What Problem Does This Solve?

If you use Claude Code (or similar AI coding assistants), you probably have dozens of skills, agents, and commands installed. The problem is: **you can never remember which one to use**. You end up either ignoring your toolbelt or spending time searching for the right command.

LazyBrain fixes this by being a **semantic router** between your intent and your tools. The moment you type a prompt, it instantly identifies the most relevant skill and injects it into your context — no manual lookup needed.

```
You type: "帮我审查这个 PR"
LazyBrain: → /review-pr (92%) | /critic (78%) | /santa-loop (71%)
           ✅ Auto-injected /review-pr into system prompt
```

## How It Works

LazyBrain has three phases: **Scan → Compile → Hook**.

```
  ┌──────────┐     ┌──────────┐     ┌──────────┐
  │   scan   │────▶│ compile  │────▶│   hook   │
  │ Discover │     │ LLM tags │     │ Auto     │
  │ tools    │     │ + graph  │     │ match    │
  └──────────┘     └──────────┘     └──────────┘
       │                 │                 │
  ~/.claude/skills/  graph.json      UserPromptSubmit
  MCP servers       366 nodes       every prompt
  built-in cmds     11666 links     <100ms latency
```

1. **scan** — Discovers all skills, agents, MCP tools, and built-in commands
2. **compile** — Uses an LLM to generate semantic tags, relationships, example queries, and a knowledge graph
3. **hook** — Installs into Claude Code and auto-matches every prompt to the right tool

## The Five-Layer Matching Engine

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

**Offline capable**: Layers 0–1 work without any network connection (76.4% top-3 accuracy). Layer 2 requires an API key and further boosts accuracy.

## Evolution: It Gets Smarter Over Time

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

## Where is the Wiki?

`lazybrain compile` generates a knowledge base at `~/.lazybrain/wiki/`. It's a runtime artifact, not in the project repo.

```
~/.lazybrain/wiki/
├── index.md           # Master index ("491 capabilities across 15 categories")
├── development.md     # Development tools (107)
├── operations.md      # Operations tools (65)
├── orchestration.md   # Orchestration & multi-agent (27)
└── ...                # More categories
```

Each file lists tool name, one-line description, tags, and relationships (depends_on, similar_to, composes_with).

## Quick Start

```bash
# Install
npm install -g lazybrain

# Setup
lazybrain scan                        # Scan local tools
lazybrain compile                     # Compile knowledge graph (needs API key)

# Or compile offline (no API key needed, tag-layer only)
lazybrain compile --offline

# Install into Claude Code
lazybrain hook install
```

That's it. Every prompt you type in Claude Code will now be automatically matched.

## Configuration

```bash
# Required: LLM for compilation (OpenAI-compatible)
lazybrain config set compileApiBase https://api.siliconflow.cn/v1
lazybrain config set compileApiKey  <your-key>
lazybrain config set compileModel   Qwen/Qwen3-235B-A22B-Instruct-2507

# Optional: Secretary LLM (SiliconFlow free tier, falls back to compile key)
lazybrain config set secretaryApiKey  <your-key>
lazybrain config set secretaryModel   Qwen/Qwen2.5-7B-Instruct

# UI mode
lazybrain config set mode auto        # Auto-inject (silent)
# lazybrain config set mode ask       # Show selection UI
```

Config file: `~/.lazybrain/config.json`

## Commands

### Matching

```bash
lazybrain match "重构这段代码"       # Find matching tools
lazybrain find  "代码审查"           # Alias for match
```

### Management

```bash
lazybrain scan                       # Re-scan tools
lazybrain compile                    # Recompile knowledge graph
lazybrain compile --force            # Force full recompile
lazybrain compile --offline          # Compile without LLM (tag-based only)
lazybrain list                       # List all tools
lazybrain stats                      # Graph statistics
```

### Evolution (learn from usage)

```bash
lazybrain suggest-aliases            # Show suggested aliases (read-only)
lazybrain evolve                     # Learn new tags from usage patterns
lazybrain evolve --dry-run           # Preview what evolve would do
lazybrain evolve --rollback          # Undo last evolution
```

### Hook

```bash
lazybrain hook install               # Install Claude Code hook
lazybrain hook uninstall             # Uninstall hook
lazybrain hook status                # Check hook status
```

### Config

```bash
lazybrain config list                # Show current config
lazybrain config set <key> <val>     # Set config value
```

## Data Directory

```
~/.lazybrain/
├── config.json           # Configuration
├── graph.json            # Knowledge graph (390 nodes)
├── history.jsonl         # Usage history
├── profile.json          # Distilled user profile
├── last-match.json       # Latest match result
└── wiki/                 # Tool wiki articles
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
| Full pipeline (tag + Secretary) | 69% | 76% |
| Tag-only (offline) | 69% | 76% |

Tested on 55 queries (33 Chinese, 22 English) across 366 tools.

## License

MIT
