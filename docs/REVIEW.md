# LazyBrain Review Gate

LazyBrain uses local checks and CI as the required release gate. Codex Cloud review is optional until the repository has a stable account and workflow.

## Required Local Review

Run before opening or updating a release PR:

```bash
npm ci
npm run build
npm test
npm run lint
npm run audit:public
npm pack --dry-run --json
```

For hook, matcher, config, workflow, package, or release-doc changes, also run:

```bash
node dist/bin/lazybrain.js hook plan --json
node dist/bin/lazybrain.js ready
node dist/bin/lazybrain.js embeddings status
```

## Required PR Gate

Single-maintainer policy:

- main changes go through PRs
- required approvals: `0`
- CODEOWNERS review is not required
- required status check: `Test`
- force push and branch deletion are blocked on `main`

High-risk PRs must include a PR comment with:

- what changed
- affected surface
- test evidence
- `npm run audit:public` result
- package impact
- rollback note
- risk label

High-risk paths:

- `src/hook/`
- `bin/hook.ts`
- `src/config/`
- `src/matcher/`
- `package.json`
- `.github/workflows/`
- release docs

## Optional Codex Cloud Review

Use this only as advisory review.

1. Open the PR in GitHub.
2. Generate a diff:

```bash
git fetch origin main
git diff --no-ext-diff --unified=80 origin/main...HEAD > /tmp/lazybrain-pr.diff
```

3. Send the diff to Codex Cloud or a Codex review Action with this prompt:

```text
Review this LazyBrain PR.

Return:
- findings: file, line, severity, issue, fix
- risk: low/medium/high
- verdict: pass/fail/needs_changes
- confidence: 0..1

Focus on:
- hook safety and non-destructive behavior
- privacy leaks, private paths, keys, transcripts, internal workflow docs
- version/package consistency
- API calls only when explicitly requested
- GUI routes staying read-only unless a user confirms an action
- embedding cache correctness and atomic writes
- package contents suitable for public npm release
```

4. Paste the review summary as a PR comment.

Do not send private transcripts, local secrets, `.paperclip`, `.omc`, or internal planning docs into any cloud review.
