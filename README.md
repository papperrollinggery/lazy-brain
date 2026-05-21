# LazyBrain

> Local-first capability routing for AI agent tools.

![LazyBrain terminal demo](docs/assets/lazybrain-demo.svg)

LazyBrain turns a plain-language task into the right local AI capability, workflow combo, or orchestration plan. It is useful when you have many skills, slash commands, plugins, MCP tools, and local rules, but do not want to remember every exact command name.

Current package version: `2.0.0`.

## What Works Now

| Surface | Status | Use it for |
| --- | --- | --- |
| CLI: `lb` / `lazybrain` | Ready | Manual routing, workflow lookup, stats, graph refresh |
| Claude Code project hook | Ready | One-time project install, then automatic high-confidence suggestions |
| MCP: `lazybrain-mcp` | Ready | Agent clients that can call stdio MCP tools |
| Local graph/cache | Ready | Fast deterministic matching from local capability metadata |
| Hosted dashboard | Not included | No cloud UI or team sync in this beta |
| Automatic task execution | Not included | LazyBrain recommends and plans; your agent still executes |

## Install

Requires Node.js 18 or newer.

Install from npm:

```bash
npm install -g lazybrain
lb quickstart
lb ready
```

Beta tag:

```bash
npm install -g lazybrain@beta
```

From a source checkout:

```bash
git clone https://github.com/papperrollinggery/lazy-brain.git
cd lazy-brain
npm ci
npm run build
npm link
lb quickstart
lb ready
```

GitHub release tarball fallback:

```bash
npm install -g https://github.com/papperrollinggery/lazy-brain/releases/download/v2.0.0/lazybrain-2.0.0.tgz
```

Full install, cleanup, MCP, and smoke-test instructions: [docs/INSTALL.md](docs/INSTALL.md).

## First Run

Run once after install or after changing local skills/rules:

```bash
lb quickstart
```

This scans supported local capability sources and writes the local graph under `~/.lazybrain`.

Use the CLI manually when you want to ask what capability fits a task:

```bash
lb "review this PR for security issues"
```

Install the Claude Code hook once per project if you want automatic suggestions:

```bash
lb hook install
lb hook status
```

After that, you do not need to type `lb` for every prompt in that project. The hook stays quiet when confidence is low.

## Commands

| Command | Purpose |
| --- | --- |
| `lb "task"` | Find the best matching capability |
| `lb combo "task"` | Return a reusable workflow template |
| `lb orchestrate "task"` | Build a multi-skill execution plan |
| `lb scan` | Scan local capability files |
| `lb compile` | Rebuild the local capability graph |
| `lb quickstart` | Scan and compile in one first-run command |
| `lb stats` | Show recent usage and patterns |
| `lb discover` | Find high-value unused local capabilities |
| `lb config show` | Print local config with secrets redacted |
| `lb ready` / `lb ready --json` | Check graph and hook readiness |
| `lb hook plan` | Show the hook change that would be made |
| `lb hook install` | Install the project Claude Code hook |
| `lb hook uninstall` | Remove the project hook |
| `lazybrain-mcp` | Start the stdio MCP server |

Example:

```text
$ lb "review this PR for security issues"

/security-review 98%
Scan code for OWASP Top 10, auth bypass, injection, and credential exposure.

Also consider:
- /code-review
- /gitnexus-pr-review
```

## MCP

Add this to an MCP-capable client:

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

## Supported Sources

`lb quickstart`, `lb scan`, and `lb compile` read local capability metadata from common agent-tool locations, including:

- Claude Code skills and commands
- Codex skills
- project `.claude/commands`
- `.skillshub`
- `.codex/skills`
- `.agents/skills`
- Cursor, Windsurf, Cline, and OpenCode rule files
- local `SKILL.md`-style capability files

Empty machines still work because LazyBrain includes built-in capabilities for common development workflows.

## How Recommendations Are Kept Honest

LazyBrain's hot path is deterministic:

- no runtime LLM call for normal matching
- no embedding dependency for normal matching
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

## Beta Fit

Good fit:

- local AI power users
- teams with many skills, prompts, rules, commands, or plugins
- agent workflow authors
- developers who want deterministic routing without a runtime LLM call

Not a fit yet:

- users expecting LazyBrain to execute every step automatically
- users needing a hosted team dashboard
- users needing cross-machine sync
- users needing managed cloud telemetry or analytics

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
