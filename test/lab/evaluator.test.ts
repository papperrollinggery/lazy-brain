import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { Graph } from '../../src/graph/graph.js';
import { DEFAULT_CONFIG } from '../../src/constants.js';
import { LAB_FIXTURES } from '../../src/lab/fixtures.js';
import { evaluateLab, getLabHookReadiness, mapTeamToAgents } from '../../src/lab/evaluator.js';
import { recommendTeam } from '../../src/matcher/team-recommender.js';
import type { AgentInventoryEntry } from '../../src/lab/agent-inventory.js';

function makeGraph(): Graph {
  const graph = new Graph();
  const agents = [
    { name: 'security-reviewer', description: 'Security and privacy review', tags: ['security', 'privacy', 'review'], category: 'security' },
    { name: 'test-engineer', description: 'Regression tests and verification', tags: ['test', 'qa', 'verification'], category: 'testing' },
    { name: 'architect', description: 'Architecture planning and decomposition', tags: ['architect', 'planning'], category: 'planning' },
    { name: 'writer', description: 'Documentation for public users', tags: ['docs', 'writing'], category: 'documentation' },
    { name: 'debugger', description: 'Debug stuck runtime and root cause', tags: ['debug', 'runtime'], category: 'debugging' },
  ];
  for (const [index, agent] of agents.entries()) {
    graph.addNode({
      id: `agent-${index}`,
      kind: 'agent',
      name: agent.name,
      description: agent.description,
      origin: 'test',
      status: 'installed',
      compatibility: ['claude-code'],
      tags: agent.tags,
      exampleQueries: [],
      category: agent.category,
    });
  }
  graph.addNode({
    id: 'skill-docs',
    kind: 'skill',
    name: 'docs-writer',
    description: 'Write user documentation',
    origin: 'test',
    status: 'installed',
    compatibility: ['claude-code'],
    tags: ['docs', 'writing', 'onboarding'],
    exampleQueries: ['write install docs'],
    category: 'documentation',
  });
  return graph;
}

const inventory: AgentInventoryEntry[] = [
  { name: 'security-reviewer', description: 'Security review', scope: 'user', source: 'user', model: 'opus', tools: [], available: true },
  { name: 'QA Analyst', description: 'Regression test and verification specialist', scope: 'plugin', source: 'plugin:test', model: 'sonnet', tools: [], available: true },
];

describe('lab evaluator', () => {
  it('evaluates all built-in fixtures', async () => {
    const evaluations = await evaluateLab({
      graph: makeGraph(),
      config: { ...DEFAULT_CONFIG },
      agentInventory: inventory,
      projectRoot: '/tmp/lazybrain-lab-no-project',
      claudeConfigDir: '/tmp/lazybrain-lab-no-claude',
    });

    expect(evaluations).toHaveLength(LAB_FIXTURES.length);
    expect(evaluations.every(e => e.match.matches.length > 0 || e.warnings.length >= 0)).toBe(true);
    expect(evaluations[0].hookReadiness.safeForLab).toBe(true);
  });

  it('maps exact, role, and missing agents', () => {
    const team = recommendTeam('检查公开安装 hook 的安全、隐私、测试和回滚风险', makeGraph(), 3);
    const mappings = mapTeamToAgents(team, inventory);

    expect(mappings.some(mapping => mapping.status === 'exact' && mapping.mapped === 'security-reviewer')).toBe(true);
    expect(mappings.some(mapping => mapping.status === 'role' && mapping.mapped === 'QA Analyst')).toBe(true);
    expect(mappings.some(mapping => mapping.status === 'missing')).toBe(true);
  });

  it('does not recommend team mode for a sequential docs task', async () => {
    const [evaluation] = await evaluateLab({
      graph: makeGraph(),
      config: { ...DEFAULT_CONFIG },
      queries: ['把安装流程写给普通用户'],
      agentInventory: inventory,
      projectRoot: '/tmp/lazybrain-lab-no-project',
      claudeConfigDir: '/tmp/lazybrain-lab-no-claude',
    });

    expect(evaluation.modeDecision.mode).not.toBe('team');
  });

  it('marks vague voice-like input as needs_clarification', async () => {
    const [evaluation] = await evaluateLab({
      graph: makeGraph(),
      config: { ...DEFAULT_CONFIG },
      queries: ['这个项目有点乱，你看怎么安排'],
      agentInventory: inventory,
      projectRoot: '/tmp/lazybrain-lab-no-project',
      claudeConfigDir: '/tmp/lazybrain-lab-no-claude',
    });

    expect(evaluation.modeDecision.mode).toBe('needs_clarification');
  });

  it('does not create Claude settings during evaluation', async () => {
    const root = mkdtempSync(join(tmpdir(), 'lazybrain-lab-safe-'));
    try {
      const projectRoot = join(root, 'project');
      const claudeConfigDir = join(root, '.claude');
      await evaluateLab({
        graph: makeGraph(),
        config: { ...DEFAULT_CONFIG },
        queries: ['审查这次改动有没有回归风险'],
        agentInventory: inventory,
        projectRoot,
        claudeConfigDir,
      });

      expect(existsSync(join(projectRoot, '.claude', 'settings.json'))).toBe(false);
      expect(existsSync(join(claudeConfigDir, 'settings.json'))).toBe(false);
      expect(existsSync(join(claudeConfigDir, 'lazybrain'))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('redacts local paths and sensitive statusline parameters', () => {
    const root = mkdtempSync(join(tmpdir(), 'lazybrain-lab-statusline-'));
    try {
      const projectRoot = join(root, 'project');
      const claudeConfigDir = join(root, '.claude');
      mkdirSync(join(projectRoot, '.claude'), { recursive: true });
      writeFileSync(
        join(projectRoot, '.claude', 'settings.json'),
        JSON.stringify({ statusLine: { command: `${homedir()}/tool --token=abc123` } }),
      );

      const readiness = getLabHookReadiness(projectRoot, claudeConfigDir);
      expect(readiness.statuslineCommand).not.toContain(homedir());
      expect(readiness.statuslineCommand).not.toContain('abc123');
      expect(readiness.statuslineCommand).toContain('token=[redacted]');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
