import { describe, expect, it } from 'vitest';
import { Graph } from '../../src/graph/graph.js';
import { buildRouteSpec, formatRouteSpecBrief } from '../../src/orchestrator/route.js';
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
      id: 'ai-regression-testing',
      name: 'ai-regression-testing',
      description: 'Fix failing tests and verify regression coverage before PR handoff.',
      tags: ['test', 'testing', 'regression', 'fix', 'failing-tests'],
      exampleQueries: ['fix failing tests and create a PR'],
      category: 'code-quality',
    }),
    cap({
      id: 'github-ops',
      name: 'github-ops',
      description: 'Prepare pull request handoffs and GitHub workflow evidence.',
      tags: ['github', 'pull-request', 'pr', 'handoff'],
      exampleQueries: ['create a PR with verification evidence'],
      category: 'deployment',
    }),
    cap({
      id: 'claude-md-improver',
      name: 'claude-md-improver',
      description: 'Audit and improve CLAUDE.md files in repositories. Use when user asks to check, audit, update, improve, or fix CLAUDE.md files.',
      tags: ['claude', 'claude-md', 'docs', 'fix', 'audit'],
      exampleQueries: ['fix CLAUDE.md project memory'],
      category: 'code-quality',
    }),
    cap({
      id: 'office-hours',
      name: 'office-hours',
      description: 'YC office hours for product ideas, product direction, and whether something is worth building.',
      tags: ['product', 'startup', 'planning', 'office-hours'],
      exampleQueries: ['help me rethink this product direction'],
      category: 'planning',
    }),
    cap({
      id: 'product-capability',
      name: 'product-capability',
      description: 'Define product capabilities, wedges, and user-facing value.',
      tags: ['product', 'capability', 'planning'],
      exampleQueries: ['plan product direction and execution'],
      category: 'planning',
    }),
    cap({
      id: 'architect',
      name: 'architect',
      description: 'Run multi-perspective council review for architecture, cost, and irreversible tradeoffs.',
      tags: ['architect', 'planning', 'architecture', 'tradeoff', 'decision'],
      exampleQueries: ['use architect review to decide this architecture tradeoff'],
      category: 'planning',
      costLevel: 'high',
      riskLevel: 'caution',
    }),
    cap({
      id: 'critic',
      name: 'critic',
      description: 'Challenge assumptions and surface risks before a decision.',
      tags: ['critic', 'review', 'risk', 'decision'],
      exampleQueries: ['critic review this decision'],
      category: 'planning',
    }),
    cap({
      id: 'ralplan',
      name: 'ralplan',
      description: 'Compare options and make a decision plan.',
      tags: ['decision', 'options', 'tradeoff', 'planning'],
      exampleQueries: ['choose between options with tradeoffs'],
      category: 'planning',
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
    cap({
      id: 'gitnexus-pr-review',
      name: 'gitnexus-pr-review',
      description: 'Use GitNexus knowledge graph context to review PR blast radius, risk, and missing tests.',
      tags: ['gitnexus', 'knowledge-graph', 'pr', 'review', 'risk', 'impact'],
      exampleQueries: ['use GitNexus to review PR risk'],
      category: 'code-quality',
    }),
    cap({
      id: 'fresh-plugin-router',
      name: 'fresh-plugin-router',
      description: 'A newly installed plugin skill that should be visible before embedding coverage catches up.',
      origin: 'plugin:fresh-plugin',
      tags: ['fresh-plugin', 'routing', 'unlock'],
      exampleQueries: ['use fresh-plugin-router for this route'],
      category: 'routing',
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
    expect(spec.choices.policy.defaultAction).toBe('auto');
    expect(spec.choices.policy.askUser).toBe(false);
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

  it('routes failing tests and PR handoff away from CLAUDE.md maintenance', async () => {
    const spec = await buildRouteSpec('fix failing tests and create a PR', {
      graph: makeGraph(),
      config: { ...DEFAULT_CONFIG },
      target: 'codex',
    });

    expect(spec.mode).toBe('route_plan');
    expect(spec.combo).toBe('test_pr_repair');
    expect(spec.intent).toBe('Test repair and PR handoff');
    expect(spec.choices.recommended.id).toBe('workflow:test_pr_repair');
    expect(spec.skills[0]?.name).toBe('ai-regression-testing');
    expect(spec.skills.some(skill => skill.name === 'claude-md-improver')).toBe(false);
    expect(spec.adapters.codex?.prompt).toContain('Test repair and PR handoff');
  });

  it('routes Chinese failing-test PR handoff to the same combo', async () => {
    const spec = await buildRouteSpec('帮我修失败测试并提交 PR', {
      graph: makeGraph(),
      config: { ...DEFAULT_CONFIG },
      target: 'codex',
    });

    expect(spec.mode).toBe('route_plan');
    expect(spec.combo).toBe('test_pr_repair');
    expect(spec.intent).toBe('Test repair and PR handoff');
    expect(spec.choices.recommended.id).toBe('workflow:test_pr_repair');
    expect(spec.skills[0]?.name).toBe('ai-regression-testing');
  });

  it('does not surface generic create/plugin/router token matches as explicit skills', async () => {
    const graph = makeGraph();
    graph.addNode(cap({
      id: 'skill-create',
      name: 'skill-create',
      description: 'Create a reusable skill.',
      tags: ['skill', 'create'],
      exampleQueries: ['create a skill'],
      category: 'development',
    }));
    graph.addNode(cap({
      id: 'create-plugin',
      name: 'create-plugin',
      description: 'Create a plugin package.',
      tags: ['plugin', 'create'],
      exampleQueries: ['create a plugin'],
      category: 'development',
    }));

    const spec = await buildRouteSpec('fix failing tests and create a PR', {
      graph,
      config: { ...DEFAULT_CONFIG },
      target: 'codex',
    });

    expect(spec.combo).toBe('test_pr_repair');
    expect(spec.skills.some(skill => skill.name === 'skill-create')).toBe(false);
    expect(spec.skills.some(skill => skill.name === 'create-plugin')).toBe(false);
  });

  it('formats a brief human dogfood route summary without dumping adapter prompts', async () => {
    const spec = await buildRouteSpec('fix failing tests and create a PR', {
      graph: makeGraph(),
      config: { ...DEFAULT_CONFIG },
      target: 'claude',
    });

    const output = formatRouteSpecBrief(spec);

    expect(output).toContain('Route: test_pr_repair');
    expect(output).toContain('Recommended: workflow:test_pr_repair');
    expect(output).toContain('Use: ai-regression-testing, github-ops');
    expect(output).toContain('Missing: project-session-manager (generic prompt)');
    expect(output).toContain('Prompt: lazybrain prompt "fix failing tests and create a PR" --target claude --copy');
    expect(output).not.toContain('adapter prompt');
    expect(output.split('\n').length).toBeLessThanOrEqual(3);
  });

  it('does not treat prepare/test-plan wording as a PR handoff', async () => {
    const spec = await buildRouteSpec('prepare a test plan for this module', {
      graph: makeGraph(),
      config: { ...DEFAULT_CONFIG },
    });

    expect(spec.combo).not.toBe('test_pr_repair');
  });

  it('routes Chinese product replanning to product direction planning', async () => {
    const spec = await buildRouteSpec('帮我重新规划产品方向和执行方案', {
      graph: makeGraph(),
      config: { ...DEFAULT_CONFIG },
    });

    expect(spec.mode).toBe('route_plan');
    expect(spec.combo).toBe('product_direction_planning');
    expect(spec.intent).toBe('Product direction planning');
    expect(spec.skills.some(skill => skill.name === 'office-hours')).toBe(true);
  });

  it('routes council-mode architecture tradeoffs to council escalation', async () => {
    const spec = await buildRouteSpec('请用 council/议会模式裁决这个架构取舍，确认项目是否符合预期标准', {
      graph: makeGraph(),
      config: { ...DEFAULT_CONFIG },
      target: 'claude',
    });

    expect(spec.mode).toBe('route_plan');
    expect(spec.combo).toBe('council_escalation');
    expect(spec.intent).toBe('Council escalation review');
    expect(spec.choices.recommended.id).toBe('workflow:council_escalation');
    expect(spec.choices.alternatives.some(choice => choice.id === 'mode:council' && choice.confidence >= 0.8)).toBe(true);
    expect(spec.choices.alternatives.some(choice => choice.kind === 'model' && choice.cost === 'high')).toBe(true);
    expect(spec.tokenStrategy.suggestSubagents).toBe(true);
    expect(spec.skills.some(skill => skill.name === 'critic')).toBe(true);
    expect(spec.skills.some(skill => skill.name === 'ralplan')).toBe(true);
    expect(spec.skills.some(skill => skill.name === 'architect')).toBe(true);
    expect(spec.skills.every(skill => skill.available)).toBe(true);
    expect(spec.guardrails.some(rule => rule.title.includes('irreversible'))).toBe(true);
  });

  it('keeps tag fallback useful when hybrid semantic cache is unavailable', async () => {
    const spec = await buildRouteSpec('review this PR for regressions', {
      graph: makeGraph(),
      config: { ...DEFAULT_CONFIG, engine: 'hybrid' },
    });

    expect(spec.combo).toBe('code_review_regression');
    expect(spec.choices.recommended.id).toBe('workflow:code_review_regression');
    expect(spec.warnings.some(warning => warning.toLowerCase().includes('semantic') || warning.toLowerCase().includes('embedding'))).toBe(true);
  });

  it('surfaces explicitly named installed skills alongside combo skills in brief output', async () => {
    const spec = await buildRouteSpec('我刚装了一个 GitNexus 插件, 帮我 review PR 风险', {
      graph: makeGraph(),
      config: { ...DEFAULT_CONFIG },
      target: 'claude',
    });

    const output = formatRouteSpecBrief(spec);

    expect(spec.combo).toBe('code_review_regression');
    expect(spec.skills.some(skill => skill.name === 'gitnexus-pr-review')).toBe(true);
    expect(output).toContain('Use: ce:review, ai-regression-testing, gitnexus-pr-review');
    expect(output).toContain('Missing: coding-standards');
  });

  it('surfaces explicitly named newly installed plugin skills before semantic coverage', async () => {
    const spec = await buildRouteSpec('我刚装了 fresh-plugin-router 插件，帮我 route 这个 workflow', {
      graph: makeGraph(),
      config: { ...DEFAULT_CONFIG },
      target: 'claude',
    });

    const explicit = spec.skills.find(skill => skill.name === 'fresh-plugin-router');
    expect(explicit).toBeDefined();
    expect(explicit?.layer).toBe('alias');
    expect(explicit?.score).toBeGreaterThanOrEqual(0.9);
    expect(formatRouteSpecBrief(spec)).toContain('fresh-plugin-router');
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

  it('routes short mixed-punctuation bug investigation phrasing to the debug crash combo', async () => {
    const spec = await buildRouteSpec('bug ，帮查', {
      graph: makeGraph(),
      config: { ...DEFAULT_CONFIG },
    });

    expect(spec.combo).toBe('debug_crash');
    expect(spec.choices.recommended.id).toBe('workflow:debug_crash');
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

  it('deduplicates repeated display skills and verification commands in route output', async () => {
    const graph = makeGraph();
    graph.addNode(cap({
      id: 'review-pr-a',
      name: 'review-pr',
      description: 'Review pull requests for regressions.',
      tags: ['review', 'pr', 'regression'],
      category: 'code-quality',
    }));
    graph.addNode(cap({
      id: 'review-pr-b',
      name: 'review-pr',
      description: 'Alternative review PR provider.',
      tags: ['review', 'pr', 'regression'],
      category: 'code-quality',
    }));

    const reviewSpec = await buildRouteSpec('review this PR for regressions', {
      graph,
      config: { ...DEFAULT_CONFIG },
    });
    expect(reviewSpec.skills.filter(skill => skill.name === 'review-pr')).toHaveLength(1);

    const releaseSpec = await buildRouteSpec('检查公开安装 hook 的隐私和回滚风险，然后准备 release', {
      graph,
      config: { ...DEFAULT_CONFIG },
    });
    const commands = releaseSpec.verification.map(check => check.command).filter(Boolean);
    expect(commands).toHaveLength(new Set(commands).size);
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
    expect(spec.choices.policy.reason).toContain('clarify');
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
    expect(spec.choices.policy.reason).toContain('requires confirmation');
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
