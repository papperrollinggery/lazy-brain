# Install LazyBrain

LazyBrain is a local-first capability router for AI agent tools. It runs on Node.js 18 or newer.

## npm Package

```bash
npm install -g lazybrain
lb quickstart
lb "review this PR for security issues"
```

Beta tag:

```bash
npm install -g lazybrain@beta
```

GitHub release tarball fallback:

```bash
npm install -g https://github.com/papperrollinggery/lazy-brain/releases/download/v2.0.0/lazybrain-2.0.0.tgz
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
- `~/.codex/skills`
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
lb orchestrate "deploy payment feature"
printf '{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n' | lazybrain-mcp
```

Expected result: commands exit successfully, MCP returns `lazybrain_find`, and routing returns concrete capabilities such as `/security-review`, `/code-review`, or `/ship`.
