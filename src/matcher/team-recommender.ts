/**
 * LazyBrain — Team Composition Recommender
 *
 * Recommends optimal team compositions from the agent pool based on task query.
 */

import type { Capability } from '../types.js';
import type { Graph } from '../graph/graph.js';
import { tokenize } from './tag-layer.js';
import { expandTokens } from '../utils/cjk-bridge.js';
import { normalizeQuery } from '../utils/query-normalizer.js';

export interface TeamMember {
  agent: Capability;
  reason: string;
  category: string;
}

export interface TeamComposition {
  members: TeamMember[];
  overallReason: string;
  suggestedCommand: string;
  omcBridge: {
    workerType: string;
    workerCount: number;
    command: string;
    leadBrief: string;
  };
}

export const DOMAIN_KEYWORDS: Record<string, string[]> = {
  frontend: ['ui', 'ux', 'css', 'react', 'vue', '前端', '界面'],
  backend: ['api', 'server', 'database', 'db', '后端', '服务'],
  security: ['auth', 'crypto', 'security', '安全', '鉴权', '加密'],
  seo: ['seo', '搜索', '优化', '排名'],
  design: ['design', 'ui', 'ux', '设计', '视觉'],
  testing: ['test', 'tdd', 'qa', '测试', '质量'],
  data: ['data', 'analytics', 'etl', '数据', '分析'],
  content: ['content', 'writing', '内容', '文案'],
  ops: ['deploy', 'ci', 'cd', 'devops', '部署', '运维'],
  planning: ['plan', 'planning', 'architecture', 'architect', '规划', '架构', '方案', '拆解'],
  orchestration: ['team', 'agent', 'multi-agent', 'orchestrate', 'workflow', '团队', '组队', '编排'],
  product: ['product', 'strategy', 'positioning', 'monetization', 'pricing', '产品', '定位', '商业化', '变现'],
  research: ['research', 'analysis', 'investigate', '研究', '调研', '分析'],
  media: ['video', 'script', 'story', 'demo', '视频', '脚本', '故事'],
  debugging: ['debug', 'bug', 'fix', 'root-cause', '调试', '修复', '排查'],
  documentation: ['docs', 'document', 'onboarding', 'guide', '文档', '说明', '新人'],
};

const MAX_PER_CATEGORY = 2;
const MIN_TEAM_SCORE = 1.2;

interface ScoredAgent {
  agent: Capability;
  score: number;
  reason: string;
  category: string;
  role: string;
}

const OMC_EXEC_AGENT_TYPES = new Set([
  'executor',
  'debugger',
  'designer',
  'writer',
  'test-engineer',
  'codex',
  'gemini',
]);

interface ParsedTeamPrompt {
  taskQuery: string;
  explicitWorkerType?: string;
}

function parseExplicitTeamPrompt(query: string): ParsedTeamPrompt {
  const trimmed = query.trim();
  const match = trimmed.match(/^\/team(?:\s+\d+(?::([a-z-]+))?)?(?:\s+ralph)?\s+([\s\S]+)$/i);
  if (!match) {
    return { taskQuery: query };
  }

  const explicitWorkerType = match[1]?.toLowerCase();
  const rawTask = match[2]?.trim() || query;
  const quotedTask = rawTask.match(/^"(.*)"$/s)?.[1] ?? rawTask;

  return {
    taskQuery: quotedTask.trim() || query,
    explicitWorkerType,
  };
}

function detectDomains(query: string): string[] {
  const q = normalizeQuery(query).toLowerCase();
  const allQueryTerms = [...tokenize(query), ...expandTokens(tokenize(query)).expanded].map(t => t.toLowerCase());
  const detected: string[] = [];

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    for (const kw of keywords) {
      const keyword = kw.toLowerCase();
      if (q.includes(keyword) || allQueryTerms.includes(keyword)) {
        if (!detected.includes(domain)) detected.push(domain);
        break;
      }
    }
  }

  return detected;
}

function tokenMatches(token: string, target: string): boolean {
  if (token.length < 2) return target === token;
  if (/[a-z0-9]/i.test(token)) {
    const idx = target.indexOf(token);
    if (idx === -1) return false;
    const before = idx === 0 || /[^a-z0-9]/i.test(target[idx - 1]);
    const after = idx + token.length === target.length || /[^a-z0-9]/i.test(target[idx + token.length]);
    return before && after;
  }
  return target.includes(token);
}

function normalizeField(text: string | undefined): string {
  return normalizeQuery(text || '').toLowerCase();
}

function scoreTokensAgainstField(
  tokens: string[],
  field: string,
  weight: number,
  label: string,
  reasons: Set<string>,
): number {
  let score = 0;
  for (const token of tokens) {
    if (tokenMatches(token.toLowerCase(), field)) {
      score += weight;
      reasons.add(label);
    }
  }
  return score;
}

function getAgentFields(agent: Capability): Record<string, string> {
  return {
    alias: normalizeField((agent.aliases || []).join(' ')),
    tag: normalizeField(agent.tags.join(' ')),
    evolved: normalizeField((agent.evolvedTags || []).join(' ')),
    example: normalizeField(agent.exampleQueries.join(' ')),
    name: normalizeField(agent.name),
    category: normalizeField(agent.category),
    description: normalizeField(agent.description),
    scenario: normalizeField(agent.scenario),
  };
}

function getRole(agent: Capability): string {
  const combined = normalizeField([
    agent.name,
    agent.category,
    agent.tags.join(' '),
    agent.description,
  ].join(' '));

  const rolePatterns: Array<[RegExp, string]> = [
    [/(orchestrator|orchestrat|multi-agent|workflow|team|编排|团队)/, 'orchestration'],
    [/(architect|architecture|planner|planning|strategy|架构|规划|方案)/, 'planning'],
    [/(review|critic|audit|quality|审查|审核|质量)/, 'review'],
    [/(debug|bug|fix|investigate|root-cause|调试|修复|排查)/, 'debugging'],
    [/(security|auth|crypto|安全|漏洞|鉴权)/, 'security'],
    [/(design|ui|ux|visual|frontend|css|react|界面|视觉|前端)/, 'design'],
    [/(test|qa|tdd|测试)/, 'testing'],
    [/(data|analytics|metric|etl|数据|分析|指标)/, 'data'],
    [/(content|writing|video|script|story|文案|内容|视频|脚本)/, 'content'],
    [/(deploy|ops|ci|cd|devops|release|部署|发布|运维)/, 'ops'],
    [/(research|analysis|研究|调研)/, 'research'],
    [/(product|pricing|monetization|positioning|产品|定位|变现)/, 'product'],
  ];

  for (const [pattern, role] of rolePatterns) {
    if (pattern.test(combined)) return role;
  }

  return agent.category || 'other';
}

function scoreAgent(
  agent: Capability,
  query: string,
  detectedDomains: string[],
): ScoredAgent | null {
  const rawTokens = tokenize(query);
  const { original, expanded } = expandTokens(rawTokens);
  const tokens = [...new Set([...original, ...expanded])].map(t => t.toLowerCase());
  const fields = getAgentFields(agent);

  let score = 0;
  const reasons = new Set<string>();

  score += scoreTokensAgainstField(tokens, fields.alias, 4, 'alias', reasons);
  score += scoreTokensAgainstField(tokens, fields.tag, 3, 'tag', reasons);
  score += scoreTokensAgainstField(tokens, fields.evolved, 2, 'evolved', reasons);
  score += scoreTokensAgainstField(tokens, fields.example, 2, 'example', reasons);
  score += scoreTokensAgainstField(tokens, fields.name, 2.5, 'name', reasons);
  score += scoreTokensAgainstField(tokens, fields.category, 1.8, 'category', reasons);
  score += scoreTokensAgainstField(tokens.filter(t => t.length >= 3), fields.description, 1.2, 'description', reasons);
  score += scoreTokensAgainstField(tokens.filter(t => t.length >= 3), fields.scenario, 1.5, 'scenario', reasons);

  // Domain intent is derived from the normalized query and then matched against
  // all agent text. This lets sparse agents such as "Product Strategist" rank
  // even when they only have a name tag and rich English description.
  for (const domain of detectedDomains) {
    const keywords = DOMAIN_KEYWORDS[domain] || [];
    for (const kw of keywords) {
      const keyword = kw.toLowerCase();
      if (
        tokenMatches(keyword, fields.tag) ||
        tokenMatches(keyword, fields.name) ||
        tokenMatches(keyword, fields.category) ||
        tokenMatches(keyword, fields.description) ||
        tokenMatches(keyword, fields.scenario)
      ) {
        score += fields.category === domain ? 2 : 1.2;
        reasons.add(domain);
        break;
      }
    }
  }

  // If agent's category matches detected domain, give bonus
  if (detectedDomains.includes(agent.category)) {
    score += 2;
    reasons.add(agent.category);
  }

  if (score < MIN_TEAM_SCORE) return null;

  const reasonMap: Record<string, string> = {
    tag: 'Tag 匹配',
    name: '名称包含关键词',
    evolved: '历史信号匹配',
    frontend: '前端领域',
    backend: '后端领域',
    security: '安全领域',
    seo: 'SEO领域',
    design: '设计领域',
    testing: '测试领域',
    data: '数据领域',
    content: '内容领域',
    ops: '运维领域',
    planning: '规划/架构领域',
    orchestration: '多 Agent 编排领域',
    product: '产品策略领域',
    research: '研究分析领域',
    media: '媒体/演示领域',
    debugging: '调试排查领域',
    documentation: '文档/上手领域',
    alias: '别名匹配',
    example: '示例匹配',
    description: '描述匹配',
    scenario: '场景匹配',
    category: '类别匹配',
  };

  const reason = [...reasons].map(r => reasonMap[r] || r).join(' + ');

  return {
    agent,
    score,
    reason,
    category: agent.category || 'other',
    role: getRole(agent),
  };
}

function inferOmcWorkerType(selected: ScoredAgent[], query: string): string {
  const normalized = normalizeQuery(query).toLowerCase();
  const roleCounts = new Map<string, number>();
  for (const member of selected) {
    roleCounts.set(member.role, (roleCounts.get(member.role) ?? 0) + 1);
  }

  const topRole = [...roleCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  if (topRole === 'debugging') return 'debugger';
  if (topRole === 'design') return 'designer';
  if (topRole === 'content') return 'writer';
  if (topRole === 'testing') return 'test-engineer';

  if (/(调试|修复|报错|故障|debug|bug|fix|root-cause)/.test(normalized)) return 'debugger';
  if (/(界面|视觉|前端|ui|ux|design|css)/.test(normalized)) return 'designer';
  if (/(文档|写作|脚本|内容|docs|writing|script|content)/.test(normalized)) return 'writer';
  if (/(测试|验收|coverage|test|qa|tdd)/.test(normalized)) return 'test-engineer';

  return 'executor';
}

function buildOmcLeadBrief(query: string, selected: ScoredAgent[], workerType: string): string {
  const recommended = selected.slice(0, 5).map(member => member.agent.name).join(', ');
  const roles = [...new Set(selected.map(member => member.role))].join(', ');
  return [
    `Lead brief: task="${query}"`,
    `Preferred exec worker type: ${workerType}`,
    `Recommended specialists from LazyBrain inventory: ${recommended}`,
    `Cover these dimensions during planning/verify: ${roles}`,
    'If OMC registry lacks the named specialists, keep native stage routing but preserve the same decomposition intent.',
  ].join('\n');
}

export function recommendTeam(
  query: string,
  graph: Graph,
  maxMembers: number = 5,
): TeamComposition | null {
  const parsedPrompt = parseExplicitTeamPrompt(query);
  const effectiveQuery = parsedPrompt.taskQuery;
  const agents = graph.getAllNodes().filter(n => n.kind === 'agent');
  if (agents.length === 0) return null;

  const detectedDomains = detectDomains(effectiveQuery);
  const scored = agents
    .map(a => scoreAgent(a, effectiveQuery, detectedDomains))
    .filter((s): s is ScoredAgent => s !== null)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  const selected: ScoredAgent[] = [];
  const roleCount = new Map<string, number>();

  for (const candidate of scored) {
    const count = roleCount.get(candidate.role) ?? 0;
    if (count >= MAX_PER_CATEGORY) continue;

    roleCount.set(candidate.role, count + 1);
    selected.push(candidate);

    if (selected.length >= maxMembers) break;
  }

  if (selected.length === 0) return null;

  const members: TeamMember[] = selected.map(s => ({
    agent: s.agent,
    reason: s.reason,
    category: s.category,
  }));

  const categories = [...new Set(members.map(m => m.category))];
  const overallReason = `覆盖 ${categories.join(' + ')} 等维度`;

  const count = members.length;
  const shortenedQuery = effectiveQuery.slice(0, 30) + (effectiveQuery.length > 30 ? '...' : '');
  const suggestedCommand = `/team ${count}:mixed "${shortenedQuery}"`;
  const inferredWorkerType = inferOmcWorkerType(selected, effectiveQuery);
  const candidateWorkerType = parsedPrompt.explicitWorkerType ?? inferredWorkerType;
  const safeWorkerType = OMC_EXEC_AGENT_TYPES.has(candidateWorkerType) ? candidateWorkerType : 'executor';
  const omcCommand = `/team ${count}:${safeWorkerType} "${effectiveQuery}"`;
  const omcLeadBrief = buildOmcLeadBrief(effectiveQuery, selected, safeWorkerType);

  return {
    members,
    overallReason,
    suggestedCommand,
    omcBridge: {
      workerType: safeWorkerType,
      workerCount: count,
      command: omcCommand,
      leadBrief: omcLeadBrief,
    },
  };
}
