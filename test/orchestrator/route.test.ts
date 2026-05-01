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
    cap({
      id: 'release-risk',
      name: 'release-risk',
      description: 'Review production release, rollback, hook, and secret risks.',
      tags: ['release', 'publish', 'production', 'rollback', 'hook', 'secret', 'token'],
      exampleQueries: ['publish release to production and check secret token rollback'],
      category: 'release',
      riskLevel: 'destructive',
      requiresConfirmation: true,
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
    expect(spec.schemaVersion).toBe('1.5.0');
    expect(spec.combo).toBe('dashboard_ceo');
    expect(spec.whyRoute).toContain('dashboard_ceo');
    expect(spec.choices.recommended.kind).toBe('workflow');
    expect(spec.choices.recommended.id).toBe('workflow:dashboard_ceo');
    expect(spec.choices.alternatives.some(choice => choice.kind === 'model')).toBe(true);
    expect(spec.choices.conflicts.some(conflict => conflict.group === 'skill:same-intent')).toBe(true);
    expect(spec.adapters.generic.prompt).toContain('Recommended choice: dashboard_ceo');
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
    expect(spec.entryCommand).toContain('lazybrain route');
    expect(spec.executionMode).toBe('guided');
    expect(spec.verification.some(check => check.id === 'ui-desktop-screenshot')).toBe(true);
    expect(spec.verification.some(check => check.id === 'ui-console-clean')).toBe(true);
  });

  it('routes Chinese webpage redesign phrasing to the existing redesign combo', async () => {
    const spec = await buildRouteSpec('帮我重新设计这个网页', {
      graph: makeGraph(),
      config: { ...DEFAULT_CONFIG },
    });

    expect(spec.combo).toBe('frontend_existing_redesign');
    expect(spec.intent).toBe('Existing frontend redesign');
  });

  it('does not route function refactors to the frontend redesign combo', async () => {
    const spec = await buildRouteSpec('帮我重构这个函数', {
      graph: makeGraph(),
      config: { ...DEFAULT_CONFIG },
    });

    expect(spec.combo).not.toBe('frontend_existing_redesign');
  });

  it('does not route API publishing to the public npm release combo', async () => {
    const spec = await buildRouteSpec('准备发布这个API', {
      graph: makeGraph(),
      config: { ...DEFAULT_CONFIG },
    });

    expect(spec.combo).not.toBe('release_public_audit');
  });

  it('routes crash and bug phrasing to the debug crash combo', async () => {
    const spec = await buildRouteSpec('这个 bug 崩溃了，帮我排查报错', {
      graph: makeGraph(),
      config: { ...DEFAULT_CONFIG },
    });

    expect(spec.combo).toBe('debug_crash');
    expect(spec.executionPlan.some(step => step.id === 'reproduce-failure')).toBe(true);
  });

  it('routes messy code cleanup to the refactor combo', async () => {
    const spec = await buildRouteSpec('清理这段臃肿的垃圾代码', {
      graph: makeGraph(),
      config: { ...DEFAULT_CONFIG },
    });

    expect(spec.combo).toBe('refactor_clean');
    expect(spec.guardrails.some(rule => rule.title.includes('Preserve external behavior'))).toBe(true);
  });

  it('routes auth and permission risk to the security audit combo', async () => {
    const spec = await buildRouteSpec('检查认证权限和密钥泄漏安全风险', {
      graph: makeGraph(),
      config: { ...DEFAULT_CONFIG },
    });

    expect(spec.combo).toBe('audit_security');
    expect(spec.executionPlan.some(step => step.id === 'map-trust-boundary')).toBe(true);
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
    expect(spec.choices.recommended.id).toBe('mode:clarify-first');
    expect(spec.choices.policy.defaultAction).toBe('ask');
    expect(spec.choices.policy.askUser).toBe(true);
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
    expect(spec.choices.recommended.id).toBe('mode:direct');
    expect(spec.choices.policy.askUser).toBe(false);
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
    expect(spec.entryCommand).toContain('--target codex');
    expect(spec.adapters.generic.prompt).toContain('Generic AI agent');
    expect(spec.adapters.codex?.prompt).toContain('Codex advisory route plan');
  });

  it('renders combo entry commands for the requested target', async () => {
    const spec = await buildRouteSpec('review code for regressions', {
      graph: makeGraph(),
      config: { ...DEFAULT_CONFIG },
      target: 'cursor',
    });

    expect(spec.entryCommand).toBe('lazybrain route "<query>" --target cursor');
    expect(spec.entryCommand).not.toContain('codex');
  });

  it('ranks strong models and verification modes for high-risk release work', async () => {
    const spec = await buildRouteSpec('publish release to production and check secret token rollback', {
      graph: makeGraph(),
      config: { ...DEFAULT_CONFIG },
    });

    expect(spec.mode).toBe('route_plan');
    expect(spec.choices.policy.defaultAction).toBe('ask');
    expect(spec.choices.policy.askUser).toBe(true);
    expect(spec.choices.alternatives.some(choice => choice.id === 'model:strong-reasoning')).toBe(true);
    expect(spec.choices.alternatives.some(choice => choice.id === 'model:local-private')).toBe(true);
    expect(spec.choices.alternatives.some(choice => choice.id === 'mode:review' || choice.id === 'mode:qa')).toBe(true);
  });

  it('surfaces autopilot mode as an explicit high-risk alternative', async () => {
    const spec = await buildRouteSpec('autopilot 端到端完成这个 review', {
      graph: makeGraph(),
      config: { ...DEFAULT_CONFIG },
    });

    const autopilot = spec.choices.alternatives.find(choice => choice.id === 'mode:autopilot');
    expect(autopilot?.confidence).toBeGreaterThanOrEqual(0.7);
    expect(autopilot?.risk).toBe('high');
  });

  it('reports registry conflict groups in route choices', async () => {
    const graph = new Graph();
    graph.addNode(cap({
      id: 'core-review',
      name: 'core-review',
      description: 'Review code for regressions.',
      tags: ['review', 'regression'],
      exampleQueries: ['review code'],
      category: 'code-quality',
      origin: 'core',
      provider: 'core',
      conflictGroup: 'skill:review',
      sourcePriority: 0,
    }));
    graph.addNode(cap({
      id: 'plugin-review',
      name: 'plugin-review',
      description: 'Review code for regressions.',
      tags: ['review', 'regression'],
      exampleQueries: ['review code'],
      category: 'code-quality',
      origin: 'plugin',
      provider: 'plugin',
      conflictGroup: 'skill:review',
      sourcePriority: 10,
    }));

    const spec = await buildRouteSpec('review code for regressions', {
      graph,
      config: { ...DEFAULT_CONFIG },
    });

    expect(spec.choices.conflicts.some(conflict => conflict.group === 'skill:review')).toBe(true);
    expect(spec.choices.conflicts.find(conflict => conflict.group === 'skill:review')?.suggestedAction)
      .toContain('Use the winner');
  });
});
