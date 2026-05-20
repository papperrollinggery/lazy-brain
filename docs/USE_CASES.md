# LazyBrain Use Cases

## 1. Find the Right Capability

```bash
lb "review this PR for security issues"
```

Expected result: LazyBrain recommends `/security-review` and nearby alternatives.

Use this when the user has many skills or slash commands and does not remember the exact name.

## 2. Turn a Task Into an Execution Plan

```bash
lb orchestrate "deploy payment feature"
```

Expected result: LazyBrain returns an ordered sequence such as security review, TDD, code review, and ship.

Use this for risky tasks where ordering matters.

## 3. Pick a Reusable Workflow

```bash
lb combo "deploy new feature to production"
```

Expected result: LazyBrain returns a reusable workflow template plus verification commands.

Use this for repeated work such as releases, incident response, audits, and documentation.

## 4. Discover Underused Local Tools

```bash
lb discover
lb stats
```

Expected result: LazyBrain shows high-value local capabilities and usage patterns.

Use this after installing many local skills or when a team wants to standardize how agent tools are used.

## 5. Use LazyBrain From an Agent

```bash
lazybrain-mcp
```

Expected result: the stdio MCP server exposes routing and orchestration tools to an agent client.

Use this when Claude, Codex, Cursor, or another MCP client needs deterministic capability selection.

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
