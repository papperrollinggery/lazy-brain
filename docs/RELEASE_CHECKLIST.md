# Release Checklist

## Beta Release

Run from a clean checkout:

```bash
npm ci
npm run build
npm run lint
npm test
npm run audit:public
npm pack --dry-run --json
```

Install smoke:

```bash
npm pack --json
tmpdir=$(mktemp -d)
cd "$tmpdir"
npm init -y
npm install /absolute/path/to/lazybrain-2.0.0.tgz
./node_modules/.bin/lb --version
./node_modules/.bin/lb quickstart
./node_modules/.bin/lb "review this PR for security issues"
./node_modules/.bin/lb orchestrate "deploy payment feature"
```

Publish beta:

```bash
npm publish --tag beta
npm view lazybrain dist-tags --json
npx --yes lazybrain@beta quickstart
```

## Required Release Notes

Include:

- beta status
- Node.js 18+ requirement
- local-first privacy boundary
- no runtime LLM call on the hot path
- supported command surfaces: `lb`, `lazybrain`, `lazybrain-mcp`
- known limits: no hosted dashboard, no automatic execution, no cross-machine sync

## Stable Release Gate

Do not promote beta to latest until:

- at least 3 real users complete install and first route
- at least 30 real user queries are added to golden or smoke coverage
- README install command works from npm registry
- privacy doc and package contents have been reviewed
- GitHub Release notes are published
