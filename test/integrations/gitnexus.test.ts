import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getGitNexusStatus } from '../../src/integrations/gitnexus.js';

function makeGitRepo(): { dir: string; commit: string } {
  const dir = mkdtempSync(join(tmpdir(), 'lazybrain-gitnexus-'));
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: dir, stdio: 'ignore' });
  writeFileSync(join(dir, 'README.md'), '# test\n', 'utf-8');
  execFileSync('git', ['add', 'README.md'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: dir, stdio: 'ignore' });
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf-8' }).trim();
  return { dir, commit };
}

describe('GitNexus local status', () => {
  it('reports a current local index without requiring MCP', () => {
    const { dir, commit } = makeGitRepo();
    try {
      mkdirSync(join(dir, '.gitnexus'));
      writeFileSync(join(dir, '.gitnexus', 'meta.json'), JSON.stringify({
        repoPath: dir,
        lastCommit: commit,
        indexedAt: '2026-05-05T10:03:19.834Z',
        stats: { files: 1, nodes: 2, edges: 3, processes: 4, embeddings: 5 },
      }), 'utf-8');

      const status = getGitNexusStatus(dir);
      expect(status.available).toBe(true);
      expect(status.mcpRequired).toBe(false);
      expect(status.state).toBe('current');
      expect(status.stale).toBe(false);
      expect(status.currentCommit).toBe(commit);
      expect(status.stats?.nodes).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports stale and invalid local index states', () => {
    const { dir } = makeGitRepo();
    try {
      mkdirSync(join(dir, '.gitnexus'));
      writeFileSync(join(dir, '.gitnexus', 'meta.json'), JSON.stringify({
        repoPath: dir,
        lastCommit: '0000000000000000000000000000000000000000',
        indexedAt: '2026-05-05T10:03:19.834Z',
      }), 'utf-8');
      expect(getGitNexusStatus(dir).state).toBe('stale');

      writeFileSync(join(dir, '.gitnexus', 'meta.json'), '{bad json', 'utf-8');
      expect(getGitNexusStatus(dir).state).toBe('invalid');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
