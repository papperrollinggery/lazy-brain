# Privacy

LazyBrain is local-first.

## What It Reads

LazyBrain reads local capability metadata so it can route plain-language tasks:

- skill names, descriptions, triggers, and examples
- command names and local rule metadata
- plugin names, versions, descriptions, and bundled capability metadata
- MCP server names and transport type
- local usage history written by LazyBrain
- optional user rules in `~/.lazybrain/rules.yaml`

Default scan paths include Claude, Codex, Cursor, Windsurf, Cline, OpenCode, `.skillshub`, `.codex/skills`, `.agents/skills`, installed plugin caches, and local MCP configuration files.

MCP parsers extract server names and whether a server is configured through stdio or HTTP. They do not copy command arguments, headers, bearer tokens, environment values, or other credential fields into the capability graph.

## What It Writes

LazyBrain writes local cache and history files under the user's home directory. These files support faster routing, stats, discovery, and learned workflow signals.

`npm install` does not scan local files. Scanning starts only when the user runs commands such as `lb quickstart`, `lb scan`, `lb compile`, or the MCP `lazybrain_scan` tool.

## What It Does Not Do

- No runtime LLM call on the hot path.
- No upload of scanned capability files.
- No cloud account is required.
- No telemetry is sent by LazyBrain.
- No credentials are required for normal CLI routing.
- No recommendation or orchestration plan grants permission to execute, install, publish, or change external systems.

## Codex Desktop Visualization Boundary

Local matching and graph compilation do not call an LLM. When the user uses LazyBrain inside a Codex Desktop conversation, the recommendation snapshot returned to that conversation can contain capability names, descriptions, reasons, origins, compatibility, and workflow steps.

If the user selects the OpenAI `@Visualize` plugin in the composer and the bundled Skill sends `desktopVisualization.visualizePrompt` to it, that snapshot is processed as part of the current Codex Desktop conversation. LazyBrain excludes credential values and raw MCP arguments/headers, but users should still avoid visualizing sensitive capability descriptions when workspace policy does not permit sharing them in ChatGPT/Codex.

## Sensitive Data

Do not put secrets in skill descriptions, command files, examples, or rules. LazyBrain treats local capability text as routing metadata. If private content exists in those files, it may appear in local cache or local command output.

Before publishing a package, run:

```bash
npm run audit:public
npm pack --dry-run --json
```
