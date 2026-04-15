# LazyBrain

Semantic skill router for AI coding agents — automatically recommends the right skill/agent based on your intent.

## Features

- **Auto-match**: Hook into Claude Code, auto-inject the best skill on every prompt
- **Multi-platform**: Scans skills, agents, commands across claude-code, cursor, kiro
- **Hybrid search**: Tag + embedding semantic matching
- **History boost**: Frequently used tools rank higher
- **Parchment pet**: Visual recommendation UI in terminal
- **Secretary layer**: LLM-powered intent disambiguation

## Install

```bash
npm install -g lazybrain
lazybrain scan
lazybrain compile
lazybrain hook install
```

## Usage

```bash
lazybrain match "refactor this code"   # find matching skills
lazybrain find "代码审查"              # alias for match
lazybrain list                         # list all capabilities
lazybrain stats                        # graph statistics
lazybrain wiki                         # generate wiki articles
```

## Config

```bash
lazybrain config set engine hybrid          # tag | embedding | hybrid
lazybrain config set mode auto              # auto | ask
lazybrain config set embeddingApiKey <key>  # for semantic search
lazybrain config set compileApiKey <key>    # for secretary + compile
```

Config stored at `~/.lazybrain/config.json`.

## How it works

1. `scan` — discovers skills/agents from `~/.claude/skills/`, MCP servers, built-in commands
2. `compile` — LLM enriches each capability with tags, example queries, categories
3. `hook` — installs a Claude Code `UserPromptSubmit` hook that matches every prompt and injects the best skill into system context

## License

MIT
