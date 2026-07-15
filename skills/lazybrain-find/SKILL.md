---
name: lazybrain-find
description: Choose, compare, visualize, and sequence installed local Skills, Plugins, MCP servers, agents, or commands from a natural-language task. Use in Codex Desktop when the user asks what capability to use, gives a vague prompt, cannot remember a tool name, or wants a Codex/Claude Code workflow. Do not install or execute a recommendation without confirmation.
---

# LazyBrain capability router

Turn the user's task into one explainable local capability decision. Codex Desktop is the primary interaction surface; CLI and Claude Code are compatibility surfaces.

## Workflow

1. Preserve the user's original task text. Do not invent missing scope.
2. Prefer the read-only `lazybrain_recommend` MCP tool.
3. If the MCP tool is unavailable but the CLI is installed, run `lb desktop "<task>" --json`.
4. If neither surface is available, explain that LazyBrain is not ready and suggest `npm install -g lazybrain && lb quickstart`; do not install or scan automatically.
5. Read the returned decision, source, score, alternatives, and suggested order.
6. If the decision is `clarify`, ask the returned question instead of guessing.
7. If the decision is `compare`, explain the user-visible tradeoff among at most three candidates.
8. If the decision is `use`, recommend the primary capability and explain why it fits.
9. Read `desktopVisualization.shouldRender` from the result. When it is `true` and `@Visualize` is exposed in the current Codex Desktop task because the user selected it in the composer, pass `desktopVisualization.visualizePrompt` to `@Visualize` without altering its data.
10. Installing `@Visualize` does not automatically expose it to every task. When it is not exposed, still rolling out, or fails to render, show the MCP Markdown/table fallback and provide the exact `visualizePrompt` for a new task where the user selects `@Visualize`. Do not route this desktop workflow to Codex CLI or claim a cross-plugin call occurred.
11. Treat any suggested workflow as a plan. Selecting a card is not execution. Never invoke, install, enable, or execute another capability unless the user has authorized that action.

## Presentation

- Lead with one recommendation or one clarification question.
- Show source and confidence when they help the choice.
- Keep alternatives to three or fewer.
- For two or three close choices, use one compact decision explorer: recommendation first, visible scores and reasons, then optional workflow.
- Preserve the payload's candidate, kind, platform, and workflow controls. Keep essential values visible without hover and retain its keyboard/table fallback.
- When visualization rendering is unavailable, use the tool's Markdown fallback. Do not claim a visualization was rendered without Codex Desktop host readback.

## Useful calls

```text
lazybrain_recommend({ "query": "review this payment PR safely" })
lazybrain_catalog({})
lazybrain_orchestrate({ "query": "ship a database migration" })
```

Use `lazybrain_catalog` only when the user asks what is installed or the recommendation needs inventory context. Use `lazybrain_orchestrate` only when the task genuinely needs multiple capabilities.

## Safety and privacy

- LazyBrain indexes metadata and names, not secrets or credential values.
- A recommendation is not permission to write files, change configuration, install software, publish, send messages, or perform destructive actions.
- If a candidate's side effects are unknown, say so and require confirmation before execution.
