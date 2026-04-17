/**
 * LazyBrain — Team Composition Recommender
 *
 * Recommends optimal team compositions from the agent pool based on task query.
 */

import type { Capability } from '../types.js';
import type { Graph } from '../graph/graph.js';

export interface TeamMember {
  agent: Capability;
  reason: string;
  category: string;
}

export interface TeamComposition {
  members: TeamMember[];
  overallReason: string;
  suggestedCommand: string;
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
};

const MAX_PER_CATEGORY = 2;

interface ScoredAgent {
  agent: Capability;
  score: number;
  reason: string;
  category: string;
}

function detectDomains(query: string): string[] {
  const q = query.toLowerCase();
  const detected: string[] = [];

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    for (const kw of keywords) {
      if (q.includes(kw.toLowerCase())) {
        if (!detected.includes(domain)) detected.push(domain);
        break;
      }
    }
  }

  return detected;
}

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const cleaned = text.replace(/[^\p{L}\p{N}\s]/gu, ' ').toLowerCase();

  let current = '';
  for (const char of cleaned) {
    if (/\s/.test(char)) {
      if (current.length > 1) tokens.push(current);
      current = '';
    } else if (/[\p{L}]/u.test(char)) {
      current += char;
    } else if (current.length > 1) {
      tokens.push(current);
      current = '';
    } else {
      current = '';
    }
  }
  if (current.length > 1) tokens.push(current);

  return [...new Set(tokens)];
}

function scoreAgent(
  agent: Capability,
  query: string,
  detectedDomains: string[],
): ScoredAgent | null {
  const q = query.toLowerCase();
  const nameLower = agent.name.toLowerCase();
  const descLower = (agent.description || '').toLowerCase();
  const tokens = tokenize(q);

  let score = 0;
  const reasons: string[] = [];

  // Tag hit: +2
  for (const tag of agent.tags) {
    const tagLower = tag.toLowerCase();
    for (const token of tokens) {
      if (tagLower.includes(token) || token.includes(tagLower)) {
        score += 2;
        if (!reasons.includes('tag')) reasons.push('tag');
        break;
      }
    }
    // Also check if tag matches detected domain keywords
    for (const domain of detectedDomains) {
      const domainKeywords = DOMAIN_KEYWORDS[domain] || [];
      for (const kw of domainKeywords) {
        if (tagLower.includes(kw.toLowerCase()) || kw.toLowerCase().includes(tagLower)) {
          score += 2;
          if (!reasons.includes(domain)) reasons.push(domain);
          break;
        }
      }
    }
  }

  // Name contains query keyword: +3
  for (const token of tokens) {
    if (token.length > 2 && nameLower.includes(token)) {
      score += 3;
      if (!reasons.includes('name')) reasons.push('name');
      break;
    }
  }

  // Description contains domain keyword: +1
  for (const domain of detectedDomains) {
    const keywords = DOMAIN_KEYWORDS[domain] || [];
    for (const kw of keywords) {
      if (descLower.includes(kw.toLowerCase())) {
        score += 1;
        if (!reasons.includes(domain)) reasons.push(domain);
        break;
      }
    }
  }

  // If agent's category matches detected domain, give bonus
  if (detectedDomains.includes(agent.category)) {
    score += 1.5;
    if (!reasons.includes(agent.category)) reasons.push(agent.category);
  }

  // evolvedTags hit: +1.5
  if (agent.evolvedTags) {
    for (const etag of agent.evolvedTags) {
      for (const token of tokens) {
        if (etag.toLowerCase().includes(token) || token.includes(etag.toLowerCase())) {
          score += 1.5;
          if (!reasons.includes('evolved')) reasons.push('evolved');
          break;
        }
      }
    }
  }

  if (score === 0) return null;

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
  };

  const reason = reasons.map(r => reasonMap[r] || r).join(' + ');

  return {
    agent,
    score,
    reason,
    category: agent.category || 'other',
  };
}

export function recommendTeam(
  query: string,
  graph: Graph,
  maxMembers: number = 5,
): TeamComposition | null {
  const agents = graph.getAllNodes().filter(n => n.kind === 'agent');
  if (agents.length === 0) return null;

  const detectedDomains = detectDomains(query);
  const scored = agents
    .map(a => scoreAgent(a, query, detectedDomains))
    .filter((s): s is ScoredAgent => s !== null)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  const selected: ScoredAgent[] = [];
  const categoryCount = new Map<string, number>();

  for (const candidate of scored) {
    const count = categoryCount.get(candidate.category) ?? 0;
    if (count >= MAX_PER_CATEGORY) continue;

    categoryCount.set(candidate.category, count + 1);
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
  const suggestedCommand = `/team ${count}:mixed "<query>"`.replace('<query>', query.slice(0, 30) + (query.length > 30 ? '...' : ''));

  return {
    members,
    overallReason,
    suggestedCommand,
  };
}
