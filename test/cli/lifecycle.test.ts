import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

describe('CLI lifecycle truth', () => {
  test('quickstart builds links and explicit use is distinct from recommendation', () => {
    const home = mkdtempSync(join(tmpdir(), 'lazybrain-cli-'));
    const cli = resolve(process.cwd(), 'dist/bin/lazybrain.js');
    const env = { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: join(home, '.claude') };
    const run = (...args: string[]) => execFileSync(process.execPath, [cli, ...args], { cwd: process.cwd(), env, encoding: 'utf8' });
    try {
      run('quickstart');
      const graph = JSON.parse(readFileSync(join(home, '.lazybrain', 'graph.json'), 'utf8')) as { nodes: unknown[]; links: unknown[] };
      expect(graph.nodes.length).toBeGreaterThan(0);
      expect(graph.links.length).toBeGreaterThan(0);

      const ready = JSON.parse(run('ready', '--json')) as { status: string; linkCount: number };
      expect(ready).toMatchObject({ status: 'READY' });
      expect(ready.linkCount).toBeGreaterThan(0);

      run('find', 'review this PR for security issues');
      let entries = readFileSync(join(home, '.lazybrain', 'history.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line) as { used: string | null });
      expect(entries.at(-1)?.used).toBeNull();

      run('use', 'security-review', 'review this PR for security issues');
      entries = readFileSync(join(home, '.lazybrain', 'history.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line) as { used: string | null });
      expect(entries.at(-1)?.used).toBe('security-review');

      const desktop = JSON.parse(run('desktop', 'review this payment PR safely', '--json')) as {
        surface: string;
        renderer: { preferredPlugin: string };
        shouldRender: boolean;
      };
      expect(desktop).toMatchObject({
        surface: 'codex-desktop',
        renderer: { preferredPlugin: '@Visualize' },
        shouldRender: true,
      });
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
