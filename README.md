# LazyBrain

> Stop memorizing AI-agent commands. Describe the task; LazyBrain routes it to the right local capability.

[![npm version](https://img.shields.io/npm/v/lazybrain.svg)](https://www.npmjs.com/package/lazybrain)
[![Node.js >=18](https://img.shields.io/badge/node-%3E%3D18-339933.svg)](package.json)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![No runtime deps](https://img.shields.io/badge/runtime_deps-0-success.svg)](package.json)

![LazyBrain terminal demo](docs/assets/lazybrain-demo.svg)

LazyBrain is a local-first router for AI-agent tooling. It scans your local skills, slash commands, rules, prompts, MCP tools, and workflow templates, then turns a plain-language task into the best matching capability or execution plan.

It is built for developers who already have powerful agent tools installed and do not want to remember every exact command.

```bash
npm install -g lazybrain
lb quickstart
lb "review this PR for security issues"
```

## Why LazyBrain

| Problem | LazyBrain gives you |
| --- | --- |
| Too many skills, commands, and rules to remember | One natural-language entrypoint |
| Agents picking random tools or generic workflows | Deterministic local routing |
| Repeated release, security, migration, and review workflows | Reusable combos and orchestration plans |
| Hook suggestions that interrupt too often | Quiet suggestions only when confidence is high |
| Concern about scanned files leaving the machine | Local graph, local cache, no telemetry |

## What It Does

| Surface | Status | Use it for |
| --- | --- | --- |
| `lb` CLI | Ready | Find capabilities, combos, plans, stats, readiness |
| Claude Code hook | Ready | Automatic high-confidence suggestions inside a project |
| `lazybrain-mcp` | Ready | Deterministic routing from MCP-capable agent clients |
| Local graph/cache | Ready | Fast matching from local capability metadata |
| Hosted dashboard | Not included | No cloud UI or team sync in this beta |
| Automatic task execution | Not included | LazyBrain recommends and plans; your agent executes |

Current package version: `2.0.1`.

## Install

Requires Node.js 18 or newer.

```bash
npm install -g lazybrain
lb quickstart
lb ready
```

`npm install` only installs the CLI. It does not scan your home directory. `lb quickstart` is the explicit first-run command that scans local capability metadata and builds `~/.lazybrain/graph.json`.

Beta channel:

```bash
npm install -g lazybrain@beta
```

GitHub release tarball:

```bash
npm install -g https://github.com/papperrollinggery/lazy-brain/releases/download/v2.0.1/lazybrain-2.0.1.tgz
```

Source checkout:

```bash
git clone https://github.com/papperrollinggery/lazy-brain.git
cd lazy-brain
npm ci
npm run build
npm link
lb quickstart
lb ready
```

Full install, cleanup, MCP, and smoke-test instructions: [docs/INSTALL.md](docs/INSTALL.md).

## Quick Demo

Find the right capability:

```bash
lb "review this PR for security issues"
```

Example output:

```text
/security-review 98%
Scan code for OWASP Top 10, auth bypass, injection, and credential exposure.

Also consider:
- /code-review
- /gitnexus-pr-review
```

Turn a risky task into an ordered plan:

```bash
lb orchestrate "deploy payment feature"
```

Pick a reusable workflow:

```bash
lb combo "deploy new feature to production"
```

Install quiet Claude Code suggestions for the current project:

```bash
lb hook install
lb hook status
```

After the hook is installed, you can keep typing normal prompts in Claude Code. LazyBrain only adds a suggestion when the match is confident.

## Commands

| Command | Purpose |
| --- | --- |
| `lb "task"` | Find the best matching capability |
| `lb combo "task"` | Return a reusable workflow template |
| `lb orchestrate "task"` | Build a multi-skill execution plan |
| `lb scan` | Scan local capability files |
| `lb compile` | Rebuild the local capability graph; no LLM or embedding call |
| `lb quickstart` | Scan and compile in one first-run command |
| `lb stats` | Show recent usage and patterns |
| `lb discover` | Find high-value unused local capabilities |
| `lb config show` | Print local config with secrets redacted |
| `lb ready` / `lb ready --json` | Check graph and hook readiness |
| `lb hook plan` | Show the hook change that would be made |
| `lb hook install` | Install the project Claude Code hook |
| `lb hook uninstall` | Remove the project hook |
| `lazybrain-mcp` | Start the stdio MCP server |

## MCP

Add LazyBrain to an MCP-capable client:

```json
{
  "mcpServers": {
    "lazybrain": {
      "command": "lazybrain-mcp",
      "args": []
    }
  }
}
```

Source checkout variant:

```json
{
  "mcpServers": {
    "lazybrain": {
      "command": "node",
      "args": ["/absolute/path/to/lazy-brain/dist/bin/mcp.js"]
    }
  }
}
```

Current MCP tools:

| Tool | Purpose |
| --- | --- |
| `lazybrain_find` | Find matching capabilities for a task |
| `lazybrain_orchestrate` | Build an orchestration plan |
| `lazybrain_stats` | Read recent local usage stats |
| `lazybrain_scan` | Scan local capability sources |

Smoke test:

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n' | lazybrain-mcp
```

## Works With

`lb quickstart`, `lb scan`, and `lb compile` read local capability metadata from common agent-tool locations:

- Claude Code skills and commands
- Codex skills
- project `.claude/commands`
- `.skillshub`
- `.codex/skills`
- `.agents/skills`
- Cursor, Windsurf, Cline, and OpenCode rule files
- local `SKILL.md`-style capability files

Empty machines still work because LazyBrain includes built-in capabilities for common development workflows.

## Reliability

LazyBrain's hot path is deterministic:

- no runtime LLM call for normal matching
- no embedding dependency for normal matching
- no runtime dependencies in the published package
- low-confidence hook suggestions stay silent
- golden-set tests cover 76 labeled routing cases plus negative cases
- precision gate requires at least 88% top-match precision
- latency gate requires average `find()` time under 200ms

Verification commands:

```bash
npm run lint
npm test
npm run build
npm run audit:public
npm pack --dry-run --json
```

## Privacy

LazyBrain is local-first. It scans local capability metadata and writes local cache/history files under `~/.lazybrain`. It does not upload scanned files, does not require a cloud account, and does not send telemetry.

Details: [docs/PRIVACY.md](docs/PRIVACY.md).

## Best Fit

Use LazyBrain when you have:

- many local agent skills, slash commands, rules, prompts, or plugins
- repeated workflows such as release, security review, migration, incident response, or PR review
- an MCP-capable agent client that needs deterministic tool selection
- a preference for local routing over runtime model calls

Wait if you need:

- fully automatic task execution
- hosted team dashboards
- cross-machine sync
- managed cloud analytics

## Docs

- [Install](docs/INSTALL.md)
- [Use cases](docs/USE_CASES.md)
- [Privacy](docs/PRIVACY.md)
- [Release checklist](docs/RELEASE_CHECKLIST.md)

## Contributing

The smallest useful PR is one trigger phrase plus one golden-set case:

1. Add the trigger/example in `src/knowledge/builtin.ts`.
2. Add a labeled query in `test/golden/find.test.ts`.
3. Run `npm test`.

Useful contribution areas: trigger phrases, combo templates, orchestration rules, scanner coverage, and benchmark cases.

## License

AGPL-3.0.
