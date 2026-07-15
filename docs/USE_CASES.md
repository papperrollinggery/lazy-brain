# LazyBrain Use Cases

## 1. Find the Right Capability

```bash
lb "review this PR for security issues"
```

Expected result: LazyBrain recommends `/security-review` and nearby alternatives.

Use this when the user has many skills or slash commands and does not remember the exact name.

## 2. Resolve a Vague Prompt

First turn a vague request into an explicit decision:

```bash
lb ask "help me ship this safely" --json
```

Expected result: LazyBrain either selects one installed capability, compares close candidates, or asks one concrete clarification question.

## 3. Turn a Task Into an Execution Plan

```bash
lb orchestrate "deploy payment feature"
```

Expected result: LazyBrain returns an ordered sequence such as security review, TDD, code review, and ship.

Use this for risky tasks where ordering matters.

## 4. Pick a Reusable Workflow

```bash
lb combo "deploy new feature to production"
```

Expected result: LazyBrain returns a reusable workflow template plus verification commands.

Use this for repeated work such as releases, incident response, audits, and documentation.

## 5. Discover Underused Local Tools

```bash
lb discover
lb stats
```

Expected result: LazyBrain shows high-value local capabilities and usage patterns.

Use this after installing many local skills or when a team wants to standardize how agent tools are used.

## 6. Use LazyBrain From an Agent

```bash
lazybrain-mcp
```

Expected result: the stdio MCP server exposes routing and orchestration tools to an agent client.

Use this when Claude, Codex, Cursor, or another MCP client needs deterministic capability selection.

## 7. Audit a Local Capability Library

```bash
lb scan
lb compile
```

Then call `lazybrain_catalog` from an MCP client. The catalog covers local Skills, Plugins, MCP server names, agents, commands, and supported rule files without copying MCP credential values.

Use this when a developer has accumulated many extensions and needs an inventory before choosing or removing anything.

## 8. Choose Visually in Codex Desktop

Install the local development plugin after building and linking the checkout, then ask:

```text
$lazybrain-find Which installed capability should I use to review a payment migration?
```

Codex Desktop receives a backward-compatible decision plus `desktopVisualization`. For an interactive result, the user selects `@Visualize` in the composer for that task. When multiple candidates or a workflow benefit from interaction and the plugin is exposed, the Skill passes the exact prompt to it; otherwise the same values remain visible as an accessible Markdown table with a reusable prompt.

Selecting a card changes the explanation only. It does not execute, install, enable, or authorize the selected capability.

## Good Beta Fit

- local AI power users
- teams with many skills, prompts, rules, or commands
- agent workflow authors
- developers who want deterministic routing with no runtime LLM dependency

## Not a Fit Yet

- users who expect LazyBrain to execute every step automatically
- users who need a hosted team dashboard
- users who need cross-machine sync
- users who need managed cloud telemetry or analytics
