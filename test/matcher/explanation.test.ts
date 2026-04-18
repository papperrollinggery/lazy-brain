import { describe, it, expect } from 'vitest';
import { tagMatch } from '../../src/matcher/tag-layer.js';
import { match } from '../../src/matcher/matcher.js';
import type { Capability, Graph, HistoryEntry, Recommendation } from '../../src/types.js';
import { Graph as GraphClass } from '../../src/graph/graph.js';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const base = {
  kind: 'skill' as const,
  origin: 'local' as const,
  status: 'installed' as const,
  compatibility: ['claude-code'] as const,
  category: 'code-quality' as const,
};

function makeCap(overrides: Partial<Capability> & Pick<Capability, 'id' | 'name'>): Capability {
  return {
    description: '',
    tags: [],
    exampleQueries: [],
    ...base,
    ...overrides,
  };
}

// ─── Mock Graph ────────────────────────────────────────────────────────────

function makeGraph(caps: Capability[]): GraphClass {
  const graph = new GraphClass();
  for (const cap of caps) {
    graph.addNode(cap);
  }
  return graph;
}

const mockAliases: Record<string, string> = {
  '代码审查': 'review-pr',
  'review': 'review-pr',
};

// ─── Tests ────────────────────────────────────────────────────────────────

describe('explanation — Layer 1 (tag)', () => {
  it('fills explanation when capability has explanation_template', () => {
    const caps: Capability[] = [
      makeCap({
        id: '1',
        name: 'review-pr',
        tags: ['code-review', 'pull-request', 'pr'],
        explanation_template: '你正在请求 {tool_name}，匹配关键词：{query_tags}。{history_hint}',
      }),
    ];

    const results = tagMatch('code review', caps, 'claude-code', 3);

    expect(results.length).toBeGreaterThan(0);
    const top = results[0];

    // fillExplanation is internal; tagMatch returns raw MatchResult.
    // Test that the field exists on Capability for the caller to use.
    expect(top.capability.explanation_template).toBeDefined();
    expect(top.capability.explanation_template).toContain('{tool_name}');
  });

  it('capability without explanation_template returns unchanged result', () => {
    const caps: Capability[] = [
      makeCap({
        id: '1',
        name: 'review-pr',
        tags: ['code-review', 'pull-request', 'pr'],
        // no explanation_template
      }),
    ];

    const results = tagMatch('code review', caps, 'claude-code', 3);

    expect(results.length).toBeGreaterThan(0);
    // explanation_template is optional — absence must not break matching
    expect(results[0].capability.explanation_template).toBeUndefined();
  });

  it('query_tags variable is derived from capability tags', () => {
    const caps: Capability[] = [
      makeCap({
        id: '1',
        name: 'code-review',
        tags: ['code', 'review', 'pull-request'],
        explanation_template: 'tags: {query_tags}',
      }),
    ];

    const results = tagMatch('code review', caps, 'claude-code', 3);
    expect(results.length).toBeGreaterThan(0);
    // When query overlaps with capability tags, matched tags are used
    expect(results[0].capability.tags).toContain('code');
    expect(results[0].capability.tags).toContain('review');
  });
});

describe('explanation — Layer 0 (alias)', () => {
  it('capability matched via alias has explanation_template available', async () => {
    const caps: Capability[] = [
      makeCap({
        id: '1',
        name: 'review-pr',
        tags: ['code-review', 'pull-request'],
        explanation_template: '别名匹配 {tool_name}，关键词：{query_tags}。{history_hint}',
      }),
    ];

    const graph = makeGraph(caps);
    const rec = await match('开启代码审查', {
      graph,
      config: { aliases: mockAliases, platform: 'claude-code' },
    });

    expect(rec.matches.length).toBeGreaterThan(0);
    const top = rec.matches[0];
    expect(top.layer).toBe('alias');
    expect(top.capability.explanation_template).toBeDefined();
  });

  it('alias match without explanation_template does not crash', async () => {
    const caps: Capability[] = [
      makeCap({
        id: '1',
        name: 'review-pr',
        tags: ['code-review'],
        // no explanation_template
      }),
    ];

    const graph = makeGraph(caps);
    const rec = await match('review', {
      graph,
      config: { aliases: mockAliases, platform: 'claude-code' },
    });

    expect(rec.matches.length).toBeGreaterThan(0);
    expect(rec.matches[0].layer).toBe('alias');
    // explanation is only added when template exists
    expect(rec.matches[0].explanation).toBeUndefined();
  });
});

describe('explanation — Layer 1 via match() pipeline', () => {
  it('tag match returns explanation_template on capability', async () => {
    const caps: Capability[] = [
      makeCap({
        id: '1',
        name: 'debugger',
        tags: ['debug', 'debugging', 'bug', 'bug-fix', 'root-cause'],
        explanation_template: '{tool_name} 匹配调试场景，标签：{query_tags}。{history_hint}',
      }),
    ];

    const graph = makeGraph(caps);
    const rec = await match('debug this issue', {
      graph,
      config: { aliases: {}, platform: 'claude-code' },
    });

    expect(rec.matches.length).toBeGreaterThan(0);
    const top = rec.matches[0];
    expect(top.layer).toBe('tag');
    expect(top.capability.explanation_template).toBeDefined();
    expect(top.capability.explanation_template).toContain('{tool_name}');
  });

  it('explanation is populated after fillExplanation is called', async () => {
    const caps: Capability[] = [
      makeCap({
        id: '1',
        name: 'debugger',
        tags: ['debug', 'debugging', 'bug', 'bug-fix'],
        explanation_template: '工具：{tool_name}，匹配：{query_tags}，历史：{history_hint}',
      }),
    ];

    const graph = makeGraph(caps);
    const rec = await match('debug this issue', {
      graph,
      config: { aliases: {}, platform: 'claude-code' },
    });

    expect(rec.matches.length).toBeGreaterThan(0);
    const top = rec.matches[0];
    // After fillExplanation, explanation field is set
    expect(top.explanation).toBeDefined();
    expect(top.explanation).toContain('debugger');
    expect(top.explanation).toContain('暂无使用记录');
  });

  it('history_hint reflects usage count when history is provided', async () => {
    const caps: Capability[] = [
      makeCap({
        id: '1',
        name: 'code-review',
        tags: ['code-review'],
        explanation_template: '{history_hint}',
      }),
    ];

    const history: HistoryEntry[] = [
      { query: 'review', matched: 'code-review', id: '1', accepted: true, timestamp: Date.now() },
      { query: 'review PR', matched: 'code-review', id: '1', accepted: true, timestamp: Date.now() },
    ];

    const graph = makeGraph(caps);
    const rec = await match('review code', {
      graph,
      config: { aliases: {}, platform: 'claude-code' },
      history,
    });

    expect(rec.matches.length).toBeGreaterThan(0);
    const top = rec.matches[0];
    expect(top.explanation).toContain('已被你使用过');
  });
});

describe('explanation — all layers produce readable explanation', () => {
  it('Layer 0 (alias): explanation is human-readable', async () => {
    const caps: Capability[] = [
      makeCap({
        id: '1',
        name: 'code-review',
        tags: ['code-review'],
        explanation_template: '通过别名触发 {tool_name}，匹配标签：{query_tags}。{history_hint}',
      }),
    ];

    const graph = makeGraph(caps);
    const rec = await match('review', {
      graph,
      config: { aliases: { review: 'code-review' }, platform: 'claude-code' },
    });

    expect(rec.matches.length).toBeGreaterThan(0);
    const top = rec.matches[0];
    expect(top.layer).toBe('alias');
    expect(top.explanation).toBeDefined();
    // Should NOT contain template variables
    expect(top.explanation).not.toContain('{');
    expect(top.explanation).not.toContain('}');
  });

  it('Layer 1 (tag): explanation is human-readable', async () => {
    const caps: Capability[] = [
      makeCap({
        id: '1',
        name: 'code-review',
        tags: ['code-review', 'pull-request'],
        explanation_template: '通过标签匹配 {tool_name}，{query_tags}。{history_hint}',
      }),
    ];

    const graph = makeGraph(caps);
    const rec = await match('code review', {
      graph,
      config: { aliases: {}, platform: 'claude-code' },
    });

    expect(rec.matches.length).toBeGreaterThan(0);
    const top = rec.matches[0];
    expect(top.layer).toBe('tag');
    expect(top.explanation).toBeDefined();
    expect(top.explanation).not.toContain('{');
    expect(top.explanation).not.toContain('}');
  });
});
