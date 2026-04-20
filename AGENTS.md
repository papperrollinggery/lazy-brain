# LazyBrain — Project Context

## What is this
Semantic skill router for AI coding agents. Scans Claude Code skills/agents/commands, builds a knowledge graph, and matches user queries to the right capability at query time.

## Current state
- 491 capabilities indexed from local + ECC + community sources
- CLI fully wired: `lazybrain scan`, `compile --offline`, `match`, `list`, `stats`, `alias`, `config`, `wiki`, `hook install/uninstall`, `hook status`, `hook ps`, `hook clean`, `doctor`
- CJK-English bridge for cross-language matching
- Hook lifecycle is now `UserPromptSubmit` by default; LazyBrain no longer depends on `Stop`
- `SessionStart` is optional and only used for lightweight startup recap

## Key files
- `bin/lazybrain.ts` — CLI entry
- `bin/hook.ts` — Claude Code hook script
- `src/matcher/` — matching engine (alias → tag → semantic layers)
- `src/scanner/` — file discovery + parsers
- `src/compiler/` — LLM tag generation + category classification
- `src/graph/` — graph CRUD + wiki generation
- `src/utils/cjk-bridge.ts` — Chinese-English keyword mapping

## To activate hook (new session)
```
lazybrain hook install
# default = project scope
# use --global only when explicitly needed
```

## Hook lifecycle
- `UserPromptSubmit`: routing, decision card, governance, team bridge, recommendation logging
- `SessionStart` (optional): lightweight startup recap from local LazyBrain history
- `Stop`: legacy no-op only; not part of the product lifecycle anymore

## Hook safety
- default install scope is project-scoped
- runtime cwd guard prevents cross-project activation
- missing install metadata should fail closed rather than falling back to global activation
- `lazybrain doctor` diagnoses install/runtime state
- `lazybrain doctor --fix` only repairs LazyBrain-owned state, not third-party plugins
- `lazybrain hook ps` shows active runs
- `lazybrain hook clean` removes stale runtime records

## Team / model split
- Opus: planning, architecture decisions, final review
- MiniMax (via file prompt): execution of well-scoped tasks
- Prompts for MiniMax go to a file, not inline in chat

## Next priorities
1. LLM compile — configure `compileApiBase` in `~/.lazybrain/config.json`, run `lazybrain compile` for richer tags
2. Semantic layer — embedding-based matching for low-confidence queries
3. Hook quality validation — test in real sessions after installing

## Run
```
npm run build   # tsup
lazybrain scan && lazybrain compile --offline
lazybrain match "帮我审查代码"
```


<claude-mem-context>
# Memory Context

# [lazy_user] recent context, 2026-04-20 1:03pm GMT+8

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 5 obs (792t read) | 114,243t work | 99% savings

### Apr 19, 2026
383 8:34p 🔵 LazyBrain Execution Governance Layer: Insertion Point Analysis
389 11:08p 🟣 知识库完整修复规划启动
390 11:23p 🔵 CMUX terminal workaround requested
391 11:38p ✅ IRIS-Vault 知识库优化任务启动 — 标签整理与 kapathy wiki 参考
### Apr 20, 2026
392 12:10a 🔵 Session Context: 完整补完吧 请求

Access 114k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
