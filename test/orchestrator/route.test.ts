import { describe, expect, it } from 'vitest';
import { Graph } from '../../src/graph/graph.js';
import { buildRouteSpec } from '../../src/orchestrator/route.js';
import { DEFAULT_CONFIG } from '../../src/constants.js';
import type { Capability } from '../../src/types.js';

function cap(overrides: Partial<Capability> & Pick<Capability, 'id' | 'name'>): Capability {
  return {
    kind: 'skill',
    description: '',
    origin: 'test',
    status: 'installed',
    compatibility: ['claude-code'],
    tags: [],
    exampleQueries: [],
    category: 'other',
    ...overrides,
  };
}

function makeGraph(): Graph {
  const graph = new Graph();
  const nodes: Capability[] = [
    cap({
      id: 'dashboard-builder',
      name: 'dashboard-builder',
      description: 'Build operational CEO dashboards',
      tags: ['dashboard', 'ceo', 'metrics', 'operations'],
      exampleQueries: ['build a CEO dashboard'],
      category: 'dashboard',
      schema: {
        useWhen: ['operator needs a dashboard'],
        avoidWhen: [],
        inputs: ['metrics'],
        workflow: [{ title: 'Define operating questions', source: 'schema' }],
        verification: [{ title: 'Operator can answer key questions', required: true, source: 'schema' }],
        doneWhen: ['The operator can identify the next action'],
        contextNeeded: ['Metric source'],
        guardrails: [{ title: 'Keep the dashboard operational', strength: 'strict', source: 'schema' }],
      },
    }),
    cap({
      id: 'frontend-design',
      name: 'frontend-design',
      description: 'Design frontend interfaces',
      tags: ['frontend', 'ui', 'redesign', 'interface'],
      exampleQueries: ['redesign existing UI'],
      category: 'frontend',
    }),
    cap({
      id: 'document-release',
      name: 'document-release',
      description: 'Write public release documentation',
      tags: ['docs', 'readme', 'install', 'release'],
      exampleQueries: ['write install docs'],
      category: 'docs',
    }),
    cap({
      id: 'review',
      name: 'ce:review',
      description: 'Review code changes',
      tags: ['review', 'regression', 'risk', 'test'],
      exampleQueries: ['review code for regressions'],
      category: 'code-quality',
    }),
  ];
  for (const node of nodes) graph.addNode(node);
  return graph;
}

describe('buildRouteSpec', () => {
  it('returns dashboard combo and operating verification for CEO dashboard query', async () => {
    const spec = await buildRouteSpec('把后台改成 CEO dashboard', {
      graph: makeGraph(),
      config: { ...DEFAULT_CONFIG },
    });

    expect(spec.mode).toBe('route_plan');
    expect(spec.schemaVersion).toBe('1.4.5');
    expect(spec.combo).toBe('dashboard_ceo');
    expect(spec.whyRoute).toContain('dashboard_ceo');
    expect(spec.tokenStrategy.includeFullSkillBody).toBe(false);
    expect(spec.tokenStrategy.topKSkills).toBeGreaterThan(0);
    expect(spec.skills.some(skill => skill.name === 'dashboard-builder')).toBe(true);
    expect(spec.verification.some(check => check.id === 'dashboard-operating-questions')).toBe(true);
    expect(spec.doneWhen.join(' ')).toContain('CEO');
    expect(spec.skills.every(skill => !skill.reason || skill.reason.length <= 220)).toBe(true);
  });

  it('returns redesign combo with screenshot and console checks', async () => {
    const spec = await buildRouteSpec('优化现有页面，做一次 existing redesign', {
      graph: makeGraph(),
      config: { ...DEFAULT_CONFIG },
    });

    expect(spec.combo).toBe('frontend_existing_redesign');
    expect(spec.verification.some(check => check.id === 'ui-desktop-screenshot')).toBe(true);
    expect(spec.verification.some(check => check.id === 'ui-console-clean')).toBe(true);
  });

  it('returns docs workflow without execution controls', async () => {
    const spec = await buildRouteSpec('把安装流程写给普通用户，更新 README', {
      graph: makeGraph(),
      config: { ...DEFAULT_CONFIG },
    });

    expect(spec.combo).toBe('docs_public_install');
    expect(spec.executionPlan.some(step => step.title.includes('install'))).toBe(true);
    expect(JSON.stringify(spec)).not.toContain('execute');
  });

  it('returns release checks for hook and public audit query', async () => {
    const spec = await buildRouteSpec('检查公开安装 hook 的隐私和回滚风险，然后准备 release', {
      graph: makeGraph(),
      config: { ...DEFAULT_CONFIG },
    });

    expect(spec.combo).toBe('release_public_audit');
    expect(spec.verification.some(check => check.id === 'privacy-scan')).toBe(true);
    expect(spec.verification.some(check => check.id === 'package-dry-run')).toBe(true);
    expect(spec.verification.some(check => check.id === 'hook-rollback')).toBe(true);
  });

  it('returns needs_clarification for vague voice-like query', async () => {
    const spec = await buildRouteSpec('这个项目有点乱，你看怎么安排', {
      graph: makeGraph(),
      config: { ...DEFAULT_CONFIG },
    });

    expect(spec.mode).toBe('needs_clarification');
    expect(spec.tokenStrategy.shouldClarifyFirst).toBe(true);
    expect(spec.clarificationQuestions?.length).toBeGreaterThan(0);
    expect(spec.skills).toEqual([]);
  });

  it('returns no_route_needed for simple direct tasks', async () => {
    const spec = await buildRouteSpec('what is TypeScript?', {
      graph: makeGraph(),
      config: { ...DEFAULT_CONFIG },
    });

    expect(spec.mode).toBe('no_route_needed');
    expect(spec.skills).toEqual([]);
    expect(spec.tokenStrategy.topKSkills).toBe(0);
    expect(spec.tokenStrategy.includeFullSkillBody).toBe(false);
  });

  it('renders target-specific adapter prompt without changing the plan', async () => {
    const spec = await buildRouteSpec('review code for regressions', {
      graph: makeGraph(),
      config: { ...DEFAULT_CONFIG },
      target: 'codex',
    });

    expect(spec.target).toBe('codex');
    expect(spec.adapters.generic.prompt).toContain('Generic AI agent');
    expect(spec.adapters.codex?.prompt).toContain('Codex advisory route plan');
  });
});
