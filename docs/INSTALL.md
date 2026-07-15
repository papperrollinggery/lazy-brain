# Install LazyBrain

LazyBrain is a local-first capability router for AI agent tools. It runs on Node.js 18 or newer.

## npm Package

```bash
npm install -g lazybrain
lb quickstart
lb "review this PR for security issues"
```

`npm install` does not scan local files. The explicit first-run command is `lb quickstart`, which runs local metadata scan and local graph compilation.

Beta tag:

```bash
npm install -g lazybrain@beta
```

GitHub release tarball fallback after v2.1.0 is published:

```bash
npm install -g https://github.com/papperrollinggery/lazy-brain/releases/download/v2.1.0/lazybrain-2.1.0.tgz
```

Install from a checkout:

```bash
git clone https://github.com/papperrollinggery/lazy-brain.git
cd lazy-brain
npm ci
npm run build
npm link
lb quickstart
lb "review this PR for security issues"
lb ask "help me ship this safely" --json
lb desktop "review this payment PR safely" --json
lb use security-review "review this PR for security issues"
```

Without linking, run the checkout directly:

```bash
node dist/bin/lazybrain.js quickstart
node dist/bin/lazybrain.js "review this PR for security issues"
```

## Clean Previous Installs

Remove an old global package or stale symlink before linking a checkout:

```bash
npm uninstall -g lazybrain || true
hash -r
command -v lb || true
command -v lazybrain || true
command -v lazybrain-mcp || true
```

Check for stale Claude hook entries:

```bash
rg -n "lazybrain|lazy-brain/.*/hook\\.js|dist/bin/hook\\.js" ~/.claude ~/.lazybrain 2>/dev/null || true
```

Do not delete `~/.lazybrain/config.json` unless you intentionally want to remove local provider settings and API keys. Safe cleanup targets are stale lock files and broken hook entries that point to missing files.

## MCP Setup

After global install:

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

The MCP server exposes read-only recommendation, catalog, find, orchestration, stats, and scan tools. It recommends or plans; it does not execute the selected capability.

## Codex Desktop Plugin

The checkout includes `.codex-plugin/plugin.json`, `.mcp.json`, the `$lazybrain-find` Skill, and a local marketplace entry. Build and link the CLI first so the bundled MCP command is on `PATH`:

```bash
npm ci
npm run build
npm link
codex plugin marketplace add .
codex plugin add lazybrain@lazybrain-local
```

These commands modify personal Codex configuration. Run them only when you intend to install the development plugin, then start a new Codex task. LazyBrain never performs this installation during `npm install`, `lb quickstart`, or scanning.

LazyBrain is desktop-first. Its `lazybrain_recommend` MCP tool returns `desktopVisualization`. The user must select the installed OpenAI `@Visualize` plugin in the Codex Desktop composer for the task before the Skill can pass that payload's exact prompt to it. Check both plugin states with:

```bash
codex plugin list
```

If `@Visualize` is not selected or not available for the account/workspace, LazyBrain uses the same payload's Markdown/table fallback and provides the exact prompt for retry. See [CODEX_DESKTOP.md](CODEX_DESKTOP.md).

From a source checkout:

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

## Local Capability Sources

`lb quickstart` scans common local agent capability locations:

- `~/.claude/skills`
- `~/.claude/commands`
- `~/.claude/plugins`
- `~/.codex/skills`
- `~/.codex/plugins/cache`
- MCP server names from Codex `config.toml`, Claude config, and `.mcp.json`
- `~/.agents/skills`
- `~/.skillshub`
- project `.claude/commands`
- Cursor, Windsurf, Cline, and OpenCode rule files

Empty machines still work. LazyBrain includes a built-in capability set, so a first run without local skills can still route common tasks.

## Smoke Test

```bash
lb --version
lb quickstart
lb "review this PR for security issues"
lb ask "help me ship this safely" --json
lb desktop "review this payment PR safely" --json
lb orchestrate "deploy payment feature"
printf '{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n' | lazybrain-mcp
```

Expected result: commands exit successfully, MCP returns `lazybrain_recommend` with `desktopVisualization`, concrete prompts return capabilities such as `/security-review`, `/code-review`, or `/ship`, and vague prompts return `clarify`.

`lb compile` means compiling the local capability graph at `~/.lazybrain/graph.json`. It is not an LLM or embedding operation.
