# Privacy

LazyBrain is local-first.

## What It Reads

LazyBrain reads local capability metadata so it can route plain-language tasks:

- skill names, descriptions, triggers, and examples
- command names and local rule metadata
- local usage history written by LazyBrain
- optional user rules in `~/.lazybrain/rules.yaml`

Default scan paths include Claude, Codex, Cursor, Windsurf, Cline, OpenCode, `.skillshub`, `.codex/skills`, and `.agents/skills`.

## What It Writes

LazyBrain writes local cache and history files under the user's home directory. These files support faster routing, stats, discovery, and learned workflow signals.

`npm install` does not scan local files. Scanning starts only when the user runs commands such as `lb quickstart`, `lb scan`, `lb compile`, or the MCP `lazybrain_scan` tool.

## What It Does Not Do

- No runtime LLM call on the hot path.
- No upload of scanned capability files.
- No cloud account is required.
- No telemetry is sent by LazyBrain.
- No credentials are required for normal CLI routing.

## Sensitive Data

Do not put secrets in skill descriptions, command files, examples, or rules. LazyBrain treats local capability text as routing metadata. If private content exists in those files, it may appear in local cache or local command output.

Before publishing a package, run:

```bash
npm run audit:public
npm pack --dry-run --json
```
