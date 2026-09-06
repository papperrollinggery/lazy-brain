# 3.0 release checklist

Complete the checks below against the candidate checkout and record actual results. Passing source checks does not prove registry publication, a hosted GitHub release, or every Codex account configuration.

```bash
npm ci
npm run lint
npm run build
npm test
npm run audit:public
node scripts/validate-codex-plugin.js
```

Then verify:

- `package.json`, CLI version, plugin manifest, MCP declaration, and archive filename all say `3.0.0` where applicable.
- The packed archive includes `dist`, `.mcp.json`, bundled Skill files, and the public documents it promises.
- A fresh local Codex task sees the installed plugin/MCP contract and advertises only `lazybrain_recommend` and `lazybrain_catalog`.
- `lazybrain_catalog` returns origin/path/discovery data and `callableVerified: false`; `refresh`, filtering, and pagination work.
- `lb compile` is the only catalog operation that persists a graph snapshot; queries do not write history.
- `lb use` and `lb stats` report explicit adoption only.
- Legacy hooks are inert shims, and legacy workflow commands delegate to the host.
- The GitHub v3.0.0 tarball URL is tested only after its artifact exists. Verify npm registry state separately before making an npm release claim.

Run an independent review of the final package and current documentation. Do not claim a completed merge, published release, broad model support, or successful creative/production output without direct evidence.
