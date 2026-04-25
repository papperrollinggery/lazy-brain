import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanAgentInventory } from '../../src/lab/agent-inventory.js';

function writeAgent(path: string, frontmatter: string, body = 'PRIVATE BODY SHOULD NOT LEAK') {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `---\n${frontmatter}\n---\n\n${body}\n`, 'utf-8');
}

describe('agent inventory', () => {
  it('parses project, user, and plugin agents without returning body text', () => {
    const root = mkdtempSync(join(tmpdir(), 'lazybrain-lab-agents-'));
    try {
      const projectRoot = join(root, 'project');
      const claude = join(root, '.claude');
      writeAgent(
        join(projectRoot, '.claude', 'agents', 'reviewer.md'),
        'name: reviewer\ndescription: Project reviewer\nmodel: opus\ntools: Read, Grep',
      );
      writeAgent(
        join(claude, 'agents', 'reviewer.md'),
        'name: reviewer\ndescription: User reviewer\nmodel: sonnet',
      );
      writeAgent(
        join(claude, 'plugins', 'oh-my-claudecode', 'agents', 'security-reviewer.md'),
        'name: security-reviewer\ndescription: Security vulnerability detection specialist\ndisallowedTools: Write, Edit',
      );

      const inventory = scanAgentInventory({ projectRoot, claudeConfigDir: claude });
      const reviewers = inventory.filter(agent => agent.name === 'reviewer');
      const security = inventory.find(agent => agent.name === 'security-reviewer');

      expect(reviewers).toHaveLength(2);
      expect(reviewers.find(agent => agent.scope === 'project')?.available).toBe(true);
      expect(reviewers.find(agent => agent.scope === 'user')?.available).toBe(false);
      expect(security?.scope).toBe('plugin');
      expect(security?.source).toBe('plugin:oh-my-claudecode');
      expect(security?.tools).toEqual(['!Write', '!Edit']);
      expect(JSON.stringify(inventory)).not.toContain('PRIVATE BODY SHOULD NOT LEAK');
      expect(JSON.stringify(inventory)).not.toContain(projectRoot);
      expect(JSON.stringify(inventory)).not.toContain(claude);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
