import { describe, expect, it } from 'vitest';
import { Graph } from '../../src/graph/graph.js';
import { buildRouteSpec } from '../../src/orchestrator/route.js';
import { DEFAULT_CONFIG } from '../../src/constants.js';
import type { Capability } from '../../src/types.js';
import { DOGFOOD_ROUTE_CASES } from '../../src/orchestrator/route-dogfood-cases.js';

function cap(name: string, tags: string[], description = `${name} capability`): Capability {
  return {
    id: name,
    kind: 'skill',
    name,
    description,
    origin: 'test',
    status: 'installed',
    compatibility: ['claude-code'],
    tags,
    exampleQueries: [],
    category: 'dogfood',
  };
}

function makeDogfoodGraph(): Graph {
  const graph = new Graph();
  [
    cap('frontend-design', ['frontend', 'ui', 'redesign', 'screen']),
    cap('frontend-patterns', ['frontend', 'patterns']),
    cap('e2e-testing', ['e2e', 'testing']),
    cap('design-review', ['design', 'review']),
    cap('dashboard-builder', ['dashboard', 'metrics', 'ceo']),
    cap('product-capability', ['product', 'planning', 'capability']),
    cap('document-release', ['docs', 'release', 'readme', 'install']),
    cap('document-review', ['docs', 'review']),
    cap('devex-review', ['devex', 'docs']),
    cap('ai-regression-testing', ['test', 'regression', 'failing-tests', 'fix']),
    cap('github-ops', ['github', 'pull-request', 'pr']),
    cap('project-session-manager', ['project', 'session']),
    cap('ce:review', ['review', 'regression', 'risk']),
    cap('coding-standards', ['code-quality', 'review']),
    cap('agent-introspection-debugging', ['debug', 'runtime', 'stuck']),
    cap('omc-doctor', ['doctor', 'runtime']),
    cap('debugging', ['debug', 'crash', 'bug']),
    cap('ai-slop-cleaner', ['slop', 'cleanup', 'refactor']),
    cap('security-reviewer', ['security', 'auth', 'secret']),
    cap('django-security', ['security']),
    cap('laravel-security', ['security']),
    cap('office-hours', ['product', 'strategy', 'office-hours']),
    cap('plan-ceo-review', ['plan', 'ceo', 'product']),
    cap('critic', ['critic', 'decision', 'risk']),
    cap('ralplan', ['decision', 'tradeoff', 'planning']),
    cap('architect', ['architecture', 'tradeoff', 'council']),
    cap('ci-cd-best-practices', ['ci', 'release']),
    cap('claude-md-improver', ['claude-md', 'docs', 'fix'], 'Audit and improve CLAUDE.md files only when requested.'),
  ].forEach(node => graph.addNode(node));
  return graph;
}

describe('route dogfood golden set', () => {
  it('covers the daily routing surfaces that should not regress', () => {
    expect(DOGFOOD_ROUTE_CASES.length).toBeGreaterThanOrEqual(30);
    expect(DOGFOOD_ROUTE_CASES.some(testCase => testCase.query === 'bug ，帮查')).toBe(true);
    expect(new Set(DOGFOOD_ROUTE_CASES.map(testCase => testCase.category))).toEqual(new Set([
      'pr',
      'review',
      'release',
      'product',
      'council',
      'debug',
      'refactor',
      'security',
      'frontend',
      'dashboard',
      'docs',
    ]));
  });

  for (const testCase of DOGFOOD_ROUTE_CASES) {
    it(`routes "${testCase.query}" to ${testCase.combo}`, async () => {
      const spec = await buildRouteSpec(testCase.query, {
        graph: makeDogfoodGraph(),
        config: { ...DEFAULT_CONFIG },
        target: 'codex',
      });

      expect(spec.mode).toBe('route_plan');
      expect(spec.combo).toBe(testCase.combo);
      expect(spec.choices.recommended.id).toBe(`workflow:${testCase.combo}`);
      expect(spec.choices.alternatives.some(choice => choice.kind === 'model')).toBe(true);
      if (testCase.choice) {
        expect(spec.choices.alternatives.some(choice => choice.id === testCase.choice)).toBe(true);
      }
      if (testCase.combo === 'test_pr_repair') {
        expect(spec.skills.some(skill => skill.name === 'claude-md-improver')).toBe(false);
      }
    });
  }
});
