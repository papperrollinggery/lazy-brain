# LazyBrain 3.0

LazyBrain is a local metadata lookup for Codex. It helps when you cannot remember where an installed Skill, Plugin, MCP server, agent, or command came from, or when several local entries overlap.

It does not replace host reasoning, native tool selection, or user authorization. If you already know the Skill or tool you need, use it directly.

## Use it for the lookup, not every task

Use native Codex capabilities directly for a concrete task: write a Seedance prompt with an identified prompt skill, inspect a supplied video with the selected analysis workflow, edit a chosen client deck, implement a known website change, or run a known automation.

Use LazyBrain when the local capability itself is unresolved:

```bash
lb find "which installed skill handles evidence-led video breakdown?"
lb catalog "presentation" --kind skill --platform codex
lb catalog --cwd /absolute/project --kind mcp --limit 20 --offset 0
```

Results are metadata evidence only. A path, plugin cache entry, or configuration entry does not prove that a capability is enabled, callable, or appropriate. Read the selected Skill or inspect the current host tool before using it.

## What it reads

LazyBrain performs bounded, metadata-only local scans of the Codex home, configured project roots up to the Git root, supported manifests, and symlinked metadata locations. It recognizes Skills, plugins, MCP declarations, agents, commands, and marketplace entries. Cache and configuration records are inventory evidence, not callable capabilities.

Matching is local. It makes no runtime LLM, embedding, or network call, and it does not replace a host model name or choose a model version. The current host decides which model and native tool are available for a task.

YAML parsing is a build dependency bundled into `dist`; the package declares no runtime dependencies.

## Codex Desktop

The packaged MCP server advertises two read-only tools:

- `lazybrain_recommend` for a short, unresolved capability lookup.
- `lazybrain_catalog` for inventory, source comparison, and overlap review.

Both accept `cwd`, `platform`, `kind`, `limit`, and `refresh`; catalog also accepts `offset`. Default catalog snapshots live in memory for up to 15 seconds. `refresh: true` bypasses that cache. Returned entries include source path, origin, discovery state, and `callableVerified: false`.

LazyBrain does not add a default visualization, confirmation step, workflow, or automatic action. An optional comparison payload is available only when explicitly requested; rendering and any action remain host and user decisions.

Install the local plugin from a source checkout:

```bash
npm ci
npm run build
codex plugin marketplace add .
codex plugin add lazybrain@lazybrain-local --json
```

Start a new Codex task after changing the plugin, Skill, or MCP contract. See [Codex Desktop setup](docs/CODEX_DESKTOP.md).

## CLI

```bash
lb find "local capability lookup"
lb catalog "video" --kind skill --json
lb scan                    # reads metadata; writes nothing
lb compile                 # explicitly saves a local metadata snapshot
lb ready                   # reports metadata availability, not tool readiness
lb use skill-name "task"  # records an adoption report; does not execute or verify
lb stats                   # explicit adoption reports only
lb demo "write a test"    # built-in examples only; not installed capabilities
```

`quickstart`, `discover`, and `scan` are catalog aliases. Legacy `combo`, `orchestrate`, and `rules` commands return local candidates and leave workflow composition to the host. Legacy hook registrations are retirement shims: they continue without reading prompts, injecting guidance, or writing state.

Queries are not stored as history. `compile` is the only command above that saves a graph snapshot. `use` records only an explicit adoption report; it is not evidence that a capability ran, succeeded, generated media, or deployed anything. `stats` excludes recommendations that were never explicitly adopted and does not estimate time saved.

## Install a release artifact

When the GitHub v3.0.0 release artifact is available, install the exact tarball:

```bash
npm install -g https://github.com/papperrollinggery/lazy-brain/releases/download/v3.0.0/lazybrain-3.0.0.tgz
```

The npm registry release state is separate and must be verified before using an npm version tag. The package includes `dist`; its `.mcp.json` launches `node ./dist/bin/mcp.js` with the package directory as `cwd`, so it does not require another globally installed MCP binary.

## Boundaries and verification

LazyBrain is useful for discovery and audit, not as proof of runtime behavior. A metadata result cannot prove a video was generated, a presentation was delivered, a site was deployed, or a native capability was exposed in the current Codex task.

Before a release candidate, run the repository checks and record their actual output:

```bash
npm ci
npm run lint
npm run build
npm test
npm run audit:public
node scripts/validate-codex-plugin.js
```

Read [PRODUCT](docs/PRODUCT.md), [INSTALL](docs/INSTALL.md), [PRIVACY](docs/PRIVACY.md), and [USE CASES](docs/USE_CASES.md) before changing the public contract.

MCP calls require the current project’s absolute cwd, so a plugin installation directory cannot silently become the project scope.
