# Release Checklist

## Beta Release

Run from a clean checkout:

```bash
npm ci
npm run build
npm run lint
npm test
npm run validate:plugin
npm run audit:public
npm audit --audit-level=high
npm pack --dry-run --json
```

Install smoke:

```bash
npm pack --json
tmpdir=$(mktemp -d)
cd "$tmpdir"
npm init -y
npm install /absolute/path/to/lazybrain-2.1.0.tgz
./node_modules/.bin/lb --version
./node_modules/.bin/lb quickstart
./node_modules/.bin/lb "review this PR for security issues"
./node_modules/.bin/lb ask "help me ship this safely" --json
./node_modules/.bin/lb desktop "review this payment PR safely" --json
./node_modules/.bin/lb orchestrate "deploy payment feature"
printf '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"lazybrain_recommend","arguments":{"query":"review this payment PR safely"}}}\n' | ./node_modules/.bin/lazybrain-mcp
```

Publish beta:

```bash
npm publish --tag beta
npm view lazybrain dist-tags --json
npx --yes lazybrain@beta quickstart
```

## Required Release Notes

Include:

- beta status
- Node.js 18+ requirement
- local-first privacy boundary
- no runtime LLM call on the hot path
- supported command surfaces: `lb`, `lazybrain`, `lazybrain-mcp`
- source/package/plugin manifest versions are identical
- packed artifact contains `.codex-plugin/plugin.json`, `.mcp.json`, and `skills/lazybrain-find`
- packed artifact contains `docs/CODEX_DESKTOP.md`
- MCP `desktopVisualization` remains backward-compatible with the root recommendation decision
- local Codex Desktop plugin and `@Visualize` availability are read back independently
- the repository validator (`npm run validate:plugin`) and the current Codex Plugin/Skill validators pass
- MCP tool annotations match actual read/write behavior
- known limits: no hosted dashboard, no automatic execution, no cross-machine sync

## Stable Release Gate

Do not promote beta to latest until:

- at least 3 real users complete install and first route
- at least 30 real user queries are added to golden or smoke coverage
- README install command works from npm registry
- privacy doc and package contents have been reviewed
- GitHub Release notes are published
- local Codex plugin install is tested in a new Codex Desktop task
- `@Visualize` renders one real LazyBrain decision explorer, or release notes explicitly mark account/workspace preview availability as the remaining boundary
