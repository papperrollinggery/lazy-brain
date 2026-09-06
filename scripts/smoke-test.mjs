#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sandbox = mkdtempSync(join(tmpdir(), 'lazybrain-package-'));
const run = (command, args, options = {}) => execFileSync(command, args, {
  encoding: 'utf8', cwd: root, stdio: ['pipe', 'pipe', 'pipe'], ...options,
});
try {
  const packageInfo = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const pack = JSON.parse(run('npm', ['pack', '--json', '--pack-destination', sandbox]))[0];
  const tarball = join(sandbox, pack.filename);
  const installation = join(sandbox, 'standalone install');
  run('npm', ['install', '--prefix', installation, tarball, '--ignore-scripts', '--offline', '--no-audit', '--no-fund']);
  const installed = join(installation, 'node_modules', 'lazybrain');
  const installedInfo = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
  assert.equal(installedInfo.version, packageInfo.version);
  assert.equal(Object.keys(installedInfo.dependencies ?? {}).length, 0);

  const library = join(sandbox, 'library');
  const data = join(sandbox, 'data');
  mkdirSync(join(library, 'valley-storyboard'), { recursive: true });
  writeFileSync(join(library, 'valley-storyboard', 'SKILL.md'),
    '---\nname: valley-storyboard\ndescription: Convert a screenplay into a valley storyboard.\n---\nUse one continuous shot.\n');
  const env = { ...process.env, LAZYBRAIN_DATA_DIR: data, LAZYBRAIN_SCAN_PATHS: library };
  const cli = (...args) => run(process.execPath, [join(installed, 'dist/bin/lazybrain.js'), ...args], { cwd: sandbox, env });
  assert.equal(cli('--version').trim(), 'lazybrain ' + packageInfo.version);
  const decision = JSON.parse(cli('find', 'valley storyboard', '--json'));
  assert.equal(decision.primary.name, 'valley-storyboard');
  assert.equal(decision.primary.callableVerified, false);
  assert.ok(existsSync(decision.primary.filePath));
  assert.equal(decision.desktopVisualization, undefined);
  assert.equal(existsSync(data), false);

  // Launch the exact packaged MCP command without a global lazybrain-mcp binary.
  const config = JSON.parse(readFileSync(join(installed, '.mcp.json'), 'utf8')).mcpServers.lazybrain;
  const requests = [
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'lazybrain_recommend', arguments: { query: 'valley storyboard', cwd: sandbox } } },
  ];
  const responses = run(config.command, config.args, {
    cwd: resolve(installed, config.cwd), env, input: requests.map((item) => JSON.stringify(item)).join('\n') + '\n',
  }).trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(responses.length, 3);
  assert.equal(responses[0].result.serverInfo.version, packageInfo.version);
  assert.deepEqual(responses[1].result.tools.map((tool) => tool.name), ['lazybrain_recommend', 'lazybrain_catalog']);
  assert.equal(responses[2].result.structuredContent.primary.name, 'valley-storyboard');
  assert.equal(existsSync(data), false);

  cli('compile');
  assert.ok(existsSync(join(data, 'graph.json')));
  assert.equal(existsSync(join(data, 'history.jsonl')), false);
  mkdirSync(join(library, 'new-entry'), { recursive: true });
  writeFileSync(join(library, 'new-entry', 'SKILL.md'), '---\nname: new-entry\ndescription: New local entry\n---\n');
  assert.equal(JSON.parse(cli('find', 'new-entry', '--json')).primary.name, 'new-entry');
  cli('use', 'valley-storyboard', 'explicit adoption test');
  assert.equal(JSON.parse(cli('stats', '--json')).adoptionReports, 1);
  const report = {
    version: packageInfo.version, packageSha256: createHash('sha256').update(readFileSync(tarball)).digest('hex'),
    cli: true, packagedMcp: true, queriesReadOnly: true, metadataRefresh: true,
    explicitAdoption: true, zeroRuntimeDependencies: true,
  };
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
