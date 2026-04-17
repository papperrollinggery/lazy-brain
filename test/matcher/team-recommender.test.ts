import { describe, it, expect } from 'vitest';
import { recommendTeam, DOMAIN_KEYWORDS } from '../../src/matcher/team-recommender.js';
import { Graph } from '../../src/graph/graph.js';

function makeGraph(agents: Array<{
  name: string;
  description?: string;
  tags?: string[];
  category?: string;
  evolvedTags?: string[];
}>): Graph {
  const graph = new Graph();
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    graph.addNode({
      id: `agent-${i}`,
      kind: 'agent',
      name: a.name,
      description: a.description || '',
      origin: 'test',
      status: 'installed',
      compatibility: ['claude-code'],
      tags: a.tags || [],
      exampleQueries: [],
      category: a.category || 'other',
      evolvedTags: a.evolvedTags,
    });
  }
  return graph;
}

describe('recommendTeam', () => {
  it('returns null for empty graph', () => {
    const graph = makeGraph([]);
    const result = recommendTeam('做 SEO 优化', graph, 4);
    expect(result).toBeNull();
  });

  it('returns SEO agent for SEO task', () => {
    const graph = makeGraph([
      { name: 'SEO Specialist', description: 'SEO optimization expert', tags: ['seo', 'search'], category: 'frontend' },
      { name: 'Frontend Developer', description: 'React and CSS expert', tags: ['frontend', 'ui'], category: 'frontend' },
    ]);
    const result = recommendTeam('做一个 SEO 优化页面', graph, 4);
    expect(result).not.toBeNull();
    expect(result!.members.some(m => m.agent.name.includes('SEO'))).toBe(true);
  });

  it('returns security agent for security task', () => {
    const graph = makeGraph([
      { name: 'Security Auditor', description: 'Security review and audit', tags: ['security', 'audit'], category: 'security' },
      { name: 'Frontend Developer', description: 'React expert', tags: ['frontend'], category: 'frontend' },
    ]);
    const result = recommendTeam('检查这段代码的安全漏洞', graph, 3);
    expect(result).not.toBeNull();
    expect(result!.members.some(m => m.agent.name.toLowerCase().includes('security') || m.agent.category === 'security')).toBe(true);
  });

  it('enforces diversity - max 2 per category', () => {
    const graph = makeGraph([
      { name: 'Frontend Dev 1', tags: ['frontend', 'react'], category: 'frontend' },
      { name: 'Frontend Dev 2', tags: ['frontend', 'vue'], category: 'frontend' },
      { name: 'Frontend Dev 3', tags: ['frontend', 'css'], category: 'frontend' },
      { name: 'Backend Dev', tags: ['backend', 'api'], category: 'backend' },
    ]);
    const result = recommendTeam('做一个前端页面带后端 API', graph, 5);
    expect(result).not.toBeNull();
    const frontendCount = result!.members.filter(m => m.category === 'frontend').length;
    expect(frontendCount).toBeLessThanOrEqual(2);
  });

  it('returns diverse categories for mixed task', () => {
    const graph = makeGraph([
      { name: 'Frontend Dev', tags: ['frontend'], category: 'frontend' },
      { name: 'Backend Dev', tags: ['backend'], category: 'backend' },
      { name: 'Security Expert', tags: ['security'], category: 'security' },
      { name: 'Data Analyst', tags: ['data'], category: 'data' },
    ]);
    const result = recommendTeam('做一个前端页面带后端 API', graph, 4);
    expect(result).not.toBeNull();
    const categories = [...new Set(result!.members.map(m => m.category))];
    expect(categories.length).toBeGreaterThanOrEqual(2);
  });

  it('respects maxMembers limit', () => {
    const graph = makeGraph([
      { name: 'Agent 1', tags: ['test'], category: 'testing' },
      { name: 'Agent 2', tags: ['test'], category: 'testing' },
      { name: 'Agent 3', tags: ['test'], category: 'testing' },
      { name: 'Agent 4', tags: ['test'], category: 'testing' },
      { name: 'Agent 5', tags: ['test'], category: 'testing' },
      { name: 'Agent 6', tags: ['test'], category: 'testing' },
    ]);
    const result = recommendTeam('测试一下这个功能', graph, 3);
    expect(result!.members.length).toBeLessThanOrEqual(3);
  });

  it('uses evolvedTags for scoring', () => {
    const graph = makeGraph([
      { name: 'Frequent Agent', tags: [], category: 'other', evolvedTags: ['security', 'audit'] },
      { name: 'Normal Agent', tags: ['security'], category: 'security' },
    ]);
    const result = recommendTeam('安全审查', graph, 2);
    expect(result).not.toBeNull();
  });
});

describe('DOMAIN_KEYWORDS', () => {
  it('has seo keyword', () => {
    expect(DOMAIN_KEYWORDS.seo).toContain('seo');
  });
  it('has security keyword', () => {
    expect(DOMAIN_KEYWORDS.security).toContain('security');
  });
  it('has frontend keyword', () => {
    expect(DOMAIN_KEYWORDS.frontend).toContain('ui');
  });
  it('has backend keyword', () => {
    expect(DOMAIN_KEYWORDS.backend).toContain('api');
  });
  it('has testing keyword', () => {
    expect(DOMAIN_KEYWORDS.testing).toContain('test');
  });
});
