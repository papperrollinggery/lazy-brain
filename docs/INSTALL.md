# Install LazyBrain

LazyBrain is a local-first capability router for AI agent tools. It runs on Node.js 18 or newer.

## Current Beta Prerelease

```bash
npm install -g https://github.com/papperrollinggery/lazy-brain/releases/download/v2.0.0-beta.1/lazybrain-2.0.0.tgz
lb quickstart
lb "review this PR for security issues"
```

After npm beta is published:

```bash
npm install -g lazybrain@beta
```

If the beta package is not published yet, install from a checkout:

```bash
git clone https://github.com/papperrollinggery/lazy-brain.git
cd lazy-brain
npm ci
npm run build
node dist/bin/lazybrain.js quickstart
node dist/bin/lazybrain.js "review this PR for security issues"
```

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
lazybrain-mcp
```

Expected result: commands exit successfully and route to concrete capabilities such as `/security-review`, `/code-review`, or `/ship`.
