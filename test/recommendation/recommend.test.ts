import { describe, expect, test } from 'vitest';
import { Graph } from '../../src/graph/graph.js';
import { recommend } from '../../src/recommendation/recommend.js';

describe('recommendation decision', () => {
  test('returns a high-confidence decision for a concrete task', () => {
    const decision = recommend('review this PR for security issues');
    expect(decision.action).toBe('use');
    expect(decision.primary?.name).toBe('security-review');
    expect(decision.visualization.surface).toBe('decision');
  });

  test('asks for clarification instead of guessing on a vague prompt', () => {
    const decision = recommend('help me with this');
    expect(decision.action).toBe('clarify');
    expect(decision.primary).toBeNull();
    expect(decision.clarifyingQuestion).toContain('concrete outcome');
  });

  test('preserves local capability origin and kind', () => {
    const graph = new Graph();
    graph.addNode({
      id: 'mcp:figma',
      kind: 'mcp',
      name: 'figma-layout',
      description: 'Inspect Figma layout metadata',
      origin: 'mcp:figma-layout',
      status: 'installed',
      compatibility: ['codex'],
      tags: ['figma', 'layout'],
      triggers: ['inspect figma layout'],
      exampleQueries: [],
      category: 'design',
    });
    const decision = recommend('inspect figma layout', { graph, platform: 'codex' });
    expect(decision.primary).toMatchObject({ name: 'figma-layout', kind: 'mcp', origin: 'mcp:figma-layout' });
  });

  test('uses a high-confidence orchestration signal to resolve close matches', () => {
    const decision = recommend('review this payment PR safely');
    expect(decision.action).toBe('use');
    expect(decision.primary?.name).toBe('security-review');
    expect(decision.workflow[0]?.name).toBe('security-review');
  });
});
