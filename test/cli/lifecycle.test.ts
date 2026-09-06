import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

describe('CLI lifecycle and actual process behavior', () => {
  test('queries are read-only; snapshot and adoption are separate explicit actions', () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'lazybrain-cli-'));
    const data = join(sandbox, 'data');
    const cli = resolve('dist/bin/lazybrain.js');
    const env = { ...process.env, LAZYBRAIN_DATA_DIR: data,
      LAZYBRAIN_SCAN_PATHS: resolve('test/fixtures/metadata-skill') };
    const run = (...args: string[]) => execFileSync(process.execPath, [cli, ...args], { cwd: sandbox, env, encoding: 'utf8' });
    try {
      const initial = JSON.parse(run('quickstart', '--json'));
      expect(initial.total).toBe(1);
      expect(JSON.parse(run('find', 'metadata-skill', '--json')).primary.name).toBe('metadata-skill');
      expect(JSON.parse(run('ready', '--json'))).toMatchObject({ status: 'METADATA_AVAILABLE', callableVerified: false });
      expect(existsSync(data)).toBe(false);

      run('compile');
      const graph = JSON.parse(readFileSync(join(data, 'graph.json'), 'utf8'));
      expect(graph.nodes).toHaveLength(1);
      expect(graph.nodes.some((node: any) => node.origin === 'builtin')).toBe(false);
      expect(existsSync(join(data, 'history.jsonl'))).toBe(false);
      run('use', 'metadata-skill', 'explicit test adoption');
      const entries = readFileSync(join(data, 'history.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
      expect(entries).toHaveLength(1);
      expect(entries[0].used).toBe('metadata-skill');
      expect(JSON.parse(run('stats', '--json')).adoptionReports).toBe(1);

      const desktop = JSON.parse(run('desktop', 'metadata-skill', '--json'));
      expect(desktop.desktopVisualization.surface).toBe('codex-desktop');
      expect(JSON.parse(run('find', 'metadata-skill', '--json')).desktopVisualization).toBeUndefined();
      expect(JSON.parse(run('demo', 'security review', '--json')).illustrativeOnly).toBe(true);
    } finally { rmSync(sandbox, { recursive: true, force: true }); }
  });

  test('packed-style stdio server survives a malformed message and continues', () => {
    const output = execFileSync(process.execPath, [resolve('dist/bin/mcp.js')], {
      input: 'bad json\n' +
        JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25' } }) + '\n' +
        JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n' +
        JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) + '\n',
      encoding: 'utf8', env: { ...process.env, LAZYBRAIN_SCAN_PATHS: resolve('test/fixtures/metadata-skill') },
    });
    const messages = output.trim().split('\n').map(JSON.parse);
    expect(messages[0].error.code).toBe(-32700);
    expect(messages.find((item: any) => item.id === 2).result.tools).toHaveLength(2);
  });

  test('legacy prompt hook is inert even for a concrete task', () => {
    const sandbox = mkdtempSync(join(tmpdir(), 'lazybrain-hook-'));
    try {
      const output = execFileSync(process.execPath, [resolve('dist/bin/hook.js')], {
        input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: 'deploy payment feature' }),
        encoding: 'utf8', env: { ...process.env, LAZYBRAIN_DATA_DIR: join(sandbox, 'data') },
      });
      expect(JSON.parse(output)).toEqual({ continue: true });
      expect(existsSync(join(sandbox, 'data'))).toBe(false);
    } finally { rmSync(sandbox, { recursive: true, force: true }); }
  });
});
