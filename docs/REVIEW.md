# Reviewing LazyBrain

Run the same checks used by CI:

```bash
npm ci
npm run verify
npm audit --audit-level=high
```

The verification command checks types, builds the distribution, runs the tests, validates the plugin, audits public package contents, and performs an isolated tarball install with real CLI and stdio MCP calls. It does not run model inference or prove current Codex host activation.

Before a release, have an independent reviewer read the current diff and verify the discovery/availability boundary, source identity, task scope, read-only queries, and compatibility changes. Reproduce findings and recheck the fixes. A workflow that only prepares a prompt or uploads a diff is not a completed review.

The optional model exercise uses existing Codex account authentication and writes its reports to a directory you choose. Run it only when inference evaluation is intended:

```bash
node scripts/model-smoke.mjs --run --model MODEL --effort EFFORT --output /absolute/report-directory
```

Read the actual tool-call transcripts and generated text. Check both a lookup that should use LazyBrain and ordinary/known-entry work that should bypass it. Model selection in the command is a requested configuration; do not infer backend identity, quality across all models, or saved credits from it.

The main branch uses the required `Test` CI check. Release changes go through a reviewed pull request; CI validates Node 18, 20, 22, and 24. The release workflow verifies tag/package identity and produces a tarball. Registry publication and GitHub release publication are separate, externally verifiable actions.

Keep private transcripts, credentials, local paths, and pre-existing personal drafts out of the public review and release. Record current evidence rather than copying an earlier release's results.
