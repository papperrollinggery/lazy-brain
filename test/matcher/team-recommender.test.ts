import { describe, it, expect } from 'vitest';
import { recommendTeam, DOMAIN_KEYWORDS } from '../../src/matcher/team-recommender.js';
import { Graph } from '../../src/graph/graph.js';

function makeGraph(agents: Array<{
  name: string;
  description?: string;
  tags?: string[];
  exampleQueries?: string[];
  aliases?: string[];
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
      exampleQueries: a.exampleQueries || [],
      category: a.category || 'other',
      evolvedTags: a.evolvedTags,
      aliases: a.aliases,
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
    expect(result!.omcBridge.command).toContain('/team');
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

  it('routes abstract Chinese team requests to planning and orchestration agents', () => {
    const graph = makeGraph([
      {
        name: 'Agents Orchestrator',
        description: 'Autonomous pipeline manager that orchestrates multi-agent development workflows',
        tags: ['agents orchestrator', 'multi-agent'],
        category: 'orchestration',
      },
      {
        name: 'architect',
        description: 'Software architecture specialist for system design and technical decisions',
        tags: ['architect', 'decision-making'],
        category: 'planning',
      },
      {
        name: 'frontend-fixer',
        description: 'CSS and UI implementation worker',
        tags: ['frontend', 'css'],
        category: 'frontend',
      },
    ]);

    const result = recommendTeam('team模式 这个项目带不起来，一直兜圈子，帮我拆解一下', graph, 3);

    expect(result).not.toBeNull();
    expect(result!.members.map(m => m.agent.name)).toEqual(
      expect.arrayContaining(['Agents Orchestrator', 'architect']),
    );
  });

  it('matches sparse agents from description instead of only fixed domain tags', () => {
    const graph = makeGraph([
      {
        name: 'Product Strategist',
        description: 'Defines product positioning, user value, go-to-market strategy, pricing, and monetization',
        tags: ['product strategist'],
        category: 'strategy',
      },
      {
        name: 'Ops Runner',
        description: 'Deploy scripts and CI maintenance',
        tags: ['ops'],
        category: 'ops',
      },
    ]);

    const result = recommendTeam('这个工具产品感不强，帮我想商业化和定位', graph, 2);

    expect(result).not.toBeNull();
    expect(result!.members[0].agent.name).toBe('Product Strategist');
  });

  it('uses full inventory signals to compose cross-domain teams', () => {
    const graph = makeGraph([
      { name: 'Fixed Frontend 1', tags: ['frontend', 'react'], category: 'frontend' },
      { name: 'Fixed Frontend 2', tags: ['frontend', 'css'], category: 'frontend' },
      { name: 'Fixed Frontend 3', tags: ['frontend', 'vue'], category: 'frontend' },
      {
        name: 'Video Producer',
        description: 'Creates video scripts, demos, and launch storytelling',
        tags: ['video producer'],
        category: 'media',
      },
      {
        name: 'Data Analyst',
        description: 'Analyzes usage funnels, retention, analytics, and product metrics',
        tags: ['data analyst'],
        category: 'analytics',
      },
      {
        name: 'UX Researcher',
        description: 'Researches user behavior and usability issues',
        tags: ['ux researcher'],
        category: 'research',
      },
    ]);

    const result = recommendTeam('team模式 做一个视频脚本 + 前端页面 + 数据分析来验证产品', graph, 5);

    expect(result).not.toBeNull();
    const names = result!.members.map(m => m.agent.name);
    expect(names).toEqual(expect.arrayContaining(['Video Producer', 'Data Analyst']));
    expect(result!.members.filter(m => m.category === 'frontend')).toHaveLength(2);
  });

  it('maps debugging-heavy tasks to OMC debugger workers', () => {
    const graph = makeGraph([
      {
        name: 'debugger',
        description: 'Root-cause analysis and debugging specialist',
        tags: ['debugger', 'root-cause'],
        category: 'debugging',
      },
      {
        name: 'architect',
        description: 'Architecture specialist',
        tags: ['architect'],
        category: 'planning',
      },
    ]);

    const result = recommendTeam('team模式 调试这个报错并修复根因', graph, 3);

    expect(result).not.toBeNull();
    expect(result!.omcBridge.workerType).toBe('debugger');
    expect(result!.omcBridge.command).toContain('/team');
    expect(result!.omcBridge.leadBrief).toContain('Recommended specialists');
  });

  it('maps generic planning tasks to executor workers for OMC compatibility', () => {
    const graph = makeGraph([
      {
        name: 'architect',
        description: 'Architecture specialist for system design',
        tags: ['architect', 'planning'],
        category: 'planning',
      },
      {
        name: 'Agents Orchestrator',
        description: 'Coordinates multi-agent workflows',
        tags: ['orchestrator', 'multi-agent'],
        category: 'orchestration',
      },
    ]);

    const result = recommendTeam('team模式 帮我拆解这个项目怎么推进', graph, 2);

    expect(result).not.toBeNull();
    expect(result!.omcBridge.workerType).toBe('executor');
    expect(result!.omcBridge.command).toContain(':executor');
  });

  it('returns advisory model guidance and sub-agent prompts', () => {
    const graph = makeGraph([
      {
        name: 'architect',
        description: 'Architecture specialist for system design',
        tags: ['architect', 'planning'],
        category: 'planning',
      },
      {
        name: 'security-reviewer',
        description: 'Security review and privacy risk analysis',
        tags: ['security', 'review'],
        category: 'security',
      },
      {
        name: 'test-engineer',
        description: 'Regression test and verification specialist',
        tags: ['test', 'qa'],
        category: 'testing',
      },
    ]);

    const result = recommendTeam('team模式 深度检查公开安装方案的安全、隐私和测试风险', graph, 3);

    expect(result).not.toBeNull();
    expect(result!.advisory).toBe(true);
    expect(result!.mainModel.decisionOwner).toBe('main_model_or_user');
    expect(result!.mainModel.model).toBe('opus');
    expect(result!.tokenStrategy.reason).toContain('避免把完整上下文重复塞给所有子智能体');
    expect(result!.members.every(m => m.prompt?.includes('是否执行由主模型或用户决定'))).toBe(true);
    expect(result!.members.some(m => m.suggestedModel === 'haiku')).toBe(true);
    expect(result!.omcBridge.leadBrief).toContain('Suggested sub-agent prompts');
    expect(result!.runtimeGuides.map(g => g.target)).toEqual(['generic', 'claude_subagent', 'omc_team']);
    expect(result!.runtimeGuides.find(g => g.target === 'claude_subagent')?.constraints.join(' ')).toContain('不要为了凑名字调用无关 agent');
    expect(result!.runtimeGuides.every(g => g.memberPrompts.length === result!.members.length)).toBe(true);
    expect(result!.runtimeGuides.find(g => g.target === 'omc_team')?.command).toBe(result!.omcBridge.command);
  });

  it('does not treat generic agent names as orchestration matches', () => {
    const graph = makeGraph([
      {
        name: 'Agents Orchestrator',
        description: 'Coordinates multi-agent workflows',
        tags: ['orchestrator', 'multi-agent'],
        category: 'orchestration',
      },
      {
        name: 'Workflow Architect',
        description: 'Designs workflow routing and task decomposition',
        tags: ['workflow', 'architect'],
        category: 'orchestration',
      },
      {
        name: 'Accounts Payable Agent',
        description: 'Processes invoices and finance approvals',
        tags: ['agent', 'finance'],
        category: 'finance',
      },
    ]);

    const result = recommendTeam('team模式 这个项目有点乱，你看怎么安排', graph, 3);

    expect(result).not.toBeNull();
    expect(result!.members.map(m => m.agent.name)).not.toContain('Accounts Payable Agent');
    expect(result!.members.map(m => m.agent.name)).toEqual(
      expect.arrayContaining(['Agents Orchestrator', 'Workflow Architect']),
    );
    expect(result!.members.find(m => m.agent.name === 'Agents Orchestrator')?.role).toBe('orchestration');
    expect(result!.members.find(m => m.agent.name === 'Workflow Architect')?.role).toBe('planning');
  });

  it('normalizes explicit /team prompts instead of nesting commands', () => {
    const graph = makeGraph([
      {
        name: 'architect',
        description: 'Architecture specialist for system design',
        tags: ['architect', 'planning'],
        category: 'planning',
      },
      {
        name: 'Workflow Architect',
        description: 'Coordinates multi-agent workflows',
        tags: ['workflow architect', 'orchestration'],
        category: 'orchestration',
      },
    ]);

    const result = recommendTeam('/team 5:executor "这个项目带不起来，一直兜圈子，帮我拆解一下"', graph, 5);

    expect(result).not.toBeNull();
    expect(result!.omcBridge.workerType).toBe('executor');
    expect(result!.omcBridge.command).toBe('/team 2:executor "这个项目带不起来，一直兜圈子，帮我拆解一下"');
    expect(result!.omcBridge.leadBrief).toContain('task="这个项目带不起来，一直兜圈子，帮我拆解一下"');
    expect(result!.omcBridge.command).not.toContain('/team 2:executor "/team');
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
