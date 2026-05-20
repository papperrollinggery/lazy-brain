# LazyBrain

> Type a task once. LazyBrain finds the right local AI capability and turns it into a deterministic orchestration plan.

![LazyBrain terminal demo](docs/assets/lazybrain-demo.svg)

## The Problem

You installed hundreds of AI skills, commands, plugins, and local rules. You remember the same twenty. LazyBrain makes the rest usable from plain language.

## Install

```bash
npx --yes lazybrain quickstart
npm install -g lazybrain
lb "review this PR for security issues"
```

From source:

```bash
npm ci
npm run build
node dist/bin/lazybrain.js quickstart
```

## What It Does

```bash
lb "review this PR for security issues"     # best matching capability
lb combo "deploy new feature to production" # reusable workflow template
lb orchestrate "deploy payment feature"     # multi-skill execution plan
lb stats                                    # recent usage and patterns
lb discover                                 # high-value unused capabilities
lb scan && lb compile                       # refresh the local knowledge graph
lb config show                              # inspect redacted local config
lazybrain-mcp                               # start the stdio MCP server
```

## How It Works

```text
task text
  -> trigger, tag, and example matcher
  -> optional local graph from scan/compile
  -> combo registry and orchestration rules
  -> CLI, hook, and statusline surfaces
```

The hot path is deterministic: no runtime LLM call, no embedding dependency for matching, and low-confidence hook cases stay silent.

## Works With

LazyBrain scans or indexes local capability files for:

`Claude Code` `Codex` `Cursor` `Windsurf` `Cline` `OpenCode` `local SKILL.md`

Default scan paths include Claude skills/commands, project commands, Cursor/Windsurf/Cline rule files, `.skillshub`, `.codex/skills`, and `.agents/skills`.

## Orchestration

`lb orchestrate` upgrades a single task into an ordered work plan:

```text
$ lb orchestrate "deploy payment feature"

Orchestration Plan 94%
payment/auth risk detected

1. /security-review
2. /tdd-workflow
3. /code-review
4. /ship

Sequence: sequential
Auto-activate: no
```

Workflow templates are available through `lb combo`:

```text
$ lb combo "deploy new feature to production"

Recommended workflow: release_public_audit
1. /document-release
2. /github-ops
3. /ci-cd-best-practices

Verification: npm run audit:public && npm pack --dry-run --json
```

## MCP Server

Installed package:

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

Source checkout:

```json
{
  "mcpServers": {
    "lazybrain": {
      "command": "node",
      "args": ["/absolute/path/to/lazybrain/dist/bin/mcp.js"]
    }
  }
}
```

## Benchmarks

Repository-backed checks:

| Claim | Evidence |
| --- | --- |
| Golden-set routing | 76 labeled cases plus negative checks in `test/golden/find.test.ts` |
| Precision gate | test requires at least 88% exact top-match precision |
| Latency gate | test requires average `find()` latency under 200ms across 100 runs |
| Built-in matcher surface | core skills plus generated capability names in `src/knowledge/builtin.ts` |
| Orchestration surface | 18 rules in `src/orchestrator/rules.ts`, 12 combos in `src/combos/registry.ts` |
| Runtime model | deterministic matcher and rule engine; no runtime LLM call on the hot path |

## Contributing

The smallest useful PR is one trigger phrase plus one golden-set case:

1. Add the trigger/example in `src/knowledge/builtin.ts`.
2. Add a labeled query in `test/golden/find.test.ts`.
3. Run `npm test`.

Useful contribution areas: trigger phrases, combo templates, orchestration rules, scanner coverage, and benchmark cases.

## License

AGPL-3.0.
