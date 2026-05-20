# Contributing to LazyBrain

LazyBrain stays useful when the built-in routing knowledge is small, precise, and easy to verify.

## Quick Start

```bash
npm ci
npm test
```

Use `npm run lint` and `npm run build` before opening a pull request when your change touches TypeScript or the CLI.

## Trigger Phrases

The simplest contribution is a new trigger phrase for an existing skill or combo.

- Add phrases users would actually type.
- Include common synonyms and short commands.
- Add non-English phrases only when they are clear and common.
- Avoid broad terms that would steal unrelated matches.
- Keep the Golden Set passing with `npm test`.

## Combo Templates

Combo templates should describe a repeatable workflow, not a one-off preference.

- Include keywords and negative keywords.
- Define ordered workflow steps.
- Add guardrails that prevent risky automation.
- Add verification commands or checks.
- State `doneWhen` in user-visible terms.

## Orchestration Rules

Rules should fire only when LazyBrain can produce a better plan than a single skill match.

- Keep triggers specific.
- Prefer deterministic text signals.
- Include fallback behavior when confidence is low.
- Preserve zero runtime dependencies.
- Add or update Golden Set coverage for new behavior.

## Pull Requests

Every PR should include:

- What changed and why.
- The affected surface: CLI, matcher, scanner, combo, orchestration, docs, or release.
- Validation evidence, including `npm test` for Golden Set coverage.
- Any change to generated package contents or public commands.

PRs must keep `npm test` green. Changes to matching, combos, or orchestration must not regress the existing Golden Set.

## Issues

Use the bug report template for broken behavior and include `lb --version` plus `lb scan` output when available.

Use the feature request template for new commands, integrations, templates, rules, or documentation improvements.
