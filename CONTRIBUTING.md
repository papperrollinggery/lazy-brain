# Contributing

LazyBrain accepts small, evidence-backed improvements to local metadata discovery, source parsers, capability filtering, and documentation.

## Before changing behavior

1. State the local metadata problem and the expected observable result.
2. Keep discovery separate from execution: paths and manifests do not prove callability.
3. Preserve the host boundary. Do not introduce default routing, confirmation, automation, model overrides, LLM calls, embeddings, or network matching.
4. Add a focused fixture or regression test for parser, filter, cache, persistence, or privacy behavior.

## Local checks

```bash
npm ci
npm run lint
npm run build
npm test
npm run audit:public
node scripts/validate-codex-plugin.js
```

Describe exactly which checks you ran and what they cover. A passing metadata test is not evidence that a plugin was exposed in a user's current Codex task or that a third-party capability executed.

## Documentation

Keep README, Chinese README, installation, privacy, Codex Desktop, and release docs aligned with the actual advertised tools and CLI. Do not claim release publication, registry state, model behavior, automatic execution, or generated/deployed output without current evidence.
