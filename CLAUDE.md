# LazyBrain — Project Context

## What is this
Semantic skill router for AI coding agents. Scans Claude Code skills/agents/commands, builds a knowledge graph, and matches user queries to the right capability at query time.

## Current state (Phase 1 complete)
- 491 capabilities indexed from local + ECC + community sources
- CLI fully wired: `lazybrain scan`, `compile --offline`, `match`, `list`, `stats`, `alias`, `config`, `wiki`, `hook install/uninstall`
- CJK-English bridge for cross-language matching
- UserPromptSubmit hook written but NOT installed (uninstalled to preserve session context)

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
# restart Claude Code
```

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
