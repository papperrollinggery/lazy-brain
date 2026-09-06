# Installation

## GitHub release artifact

After the GitHub v3.0.0 release artifact exists, install the exact package:

```bash
npm install -g https://github.com/papperrollinggery/lazy-brain/releases/download/v3.0.0/lazybrain-3.0.0.tgz
lb --version
```

Do not infer npm registry availability from this command. Verify the registry separately before installing a version tag.

## Source checkout and Codex Desktop

```bash
npm ci
npm run build
codex plugin marketplace add .
codex plugin add lazybrain@lazybrain-local --json
```

The repository `.mcp.json` starts the packaged server with:

```json
{"command":"node","args":["./dist/bin/mcp.js"],"cwd":"."}
```

`dist` is part of the package. No separately installed global MCP executable is required.

Open a new Codex task after installation or after a change to the plugin, Skill, or MCP contract. Confirm the host's own plugin/MCP readback before relying on it in that task.

## First checks

```bash
lb ready
lb catalog --kind skill --platform codex
lb find "local capability lookup"
```

`ready` reports metadata availability, not current-task tool exposure. `scan` and catalog queries read metadata without writing a graph. Use `lb compile` only when an explicit, persisted metadata snapshot is useful.

## Remove legacy assumptions

Do not install a LazyBrain hook for automatic routing. Legacy hook registrations continue as inert retirement shims and do not read prompts, inject messages, or write state. `combo`, `orchestrate`, and `rules` leave workflow selection to the host.

MCP calls require the current project’s absolute cwd, so a plugin installation directory cannot silently become the project scope.
