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
  role?: string;
  suggestedModel?: TeamModelPlan;
  prompt?: string;
}

export type TeamModelPlan = 'haiku' | 'sonnet' | 'opus';

export interface TeamModelRecommendation {
  model: TeamModelPlan;
  reason: string;
  decisionOwner: 'main_model_or_user';
}

export interface TeamTokenStrategy {
  summary: string;
  reason: string;
}

export type TeamRuntimeTarget = 'generic' | 'claude_subagent' | 'omc_team';

export interface TeamRuntimeMemberPrompt {
  agentName: string;
  role: string;
  model: TeamModelPlan;
  invocation: string;
  prompt: string;
}

export interface TeamRuntimeGuide {
  target: TeamRuntimeTarget;
  label: string;
  whenToUse: string;
  command?: string;
  leadPrompt: string;
  memberPrompts: TeamRuntimeMemberPrompt[];
  constraints: string[];
}

export interface TeamComposition {
  members: TeamMember[];
  overallReason: string;
  suggestedCommand: string;
  mainModel: TeamModelRecommendation;
  tokenStrategy: TeamTokenStrategy;
  runtimeGuides: TeamRuntimeGuide[];
  advisory: true;
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
  orchestration: ['team', 'multi-agent', 'subagent', 'orchestrate', 'workflow', '团队', '组队', '编排', '子智能体'],
  product: ['product', 'strategy', 'positioning', 'monetization', 'pricing', '产品', '定位', '商业化', '变现'],
  research: ['research', 'analysis', 'investigate', '研究', '调研', '分析'],
  media: ['video', 'script', 'story', 'demo', '视频', '脚本', '故事'],
  debugging: ['debug', 'bug', 'fix', 'root-cause', '调试', '修复', '排查'],
  documentation: ['docs', 'document', 'onboarding', 'guide', '文档', '说明', '新人'],
};

const MAX_PER_CATEGORY = 2;
const MIN_TEAM_SCORE = 1.2;
const GENERIC_ORCHESTRATION_TOKENS = new Set([
  'team',
  'agent',
  'agents',
  'subagent',
  'subagents',
  'multi-agent',
  'workflow',
  'mode',
  '模式',
  '团队',
  '组队',
  '编排',
  '子智能体',
]);

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
  const name = normalizeField(agent.name);
  const namePatterns: Array<[RegExp, string]> = [
    [/(debug|bug|fix|root-cause)/, 'debugging'],
    [/(security|auth|crypto)/, 'security'],
    [/(test|qa|tdd)/, 'testing'],
    [/(review|critic|audit|quality)/, 'review'],
    [/(architect|planner|planning|strategy)/, 'planning'],
    [/(orchestrator|orchestrat|workflow|multi-agent|team)/, 'orchestration'],
    [/(design|ui|ux|visual|frontend)/, 'design'],
    [/(data|analytics|metric|etl)/, 'data'],
    [/(content|writing|video|script|story)/, 'content'],
    [/(deploy|ops|ci|cd|devops|release)/, 'ops'],
    [/(research|analysis)/, 'research'],
    [/(product|pricing|monetization|positioning)/, 'product'],
  ];

  for (const [pattern, role] of namePatterns) {
    if (pattern.test(name)) return role;
  }

  const combined = normalizeField([
    agent.name,
    agent.category,
    agent.tags.join(' '),
    agent.description,
  ].join(' '));

  const rolePatterns: Array<[RegExp, string]> = [
    [/(debug|bug|fix|investigate|root-cause|调试|修复|排查)/, 'debugging'],
    [/(security|auth|crypto|安全|漏洞|鉴权)/, 'security'],
    [/(test|qa|tdd|测试)/, 'testing'],
    [/(review|critic|audit|quality|审查|审核|质量)/, 'review'],
    [/(architect|architecture|planner|planning|strategy|架构|规划|方案)/, 'planning'],
    [/(design|ui|ux|visual|frontend|css|react|界面|视觉|前端)/, 'design'],
    [/(orchestrator|orchestrat|multi-agent|workflow|team|编排|团队)/, 'orchestration'],
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
  const role = getRole(agent);
  const scoringTokens = ['orchestration', 'planning'].includes(role)
    ? tokens
    : tokens.filter(t => !GENERIC_ORCHESTRATION_TOKENS.has(t));

  let score = 0;
  const reasons = new Set<string>();

  score += scoreTokensAgainstField(scoringTokens, fields.alias, 4, 'alias', reasons);
  score += scoreTokensAgainstField(scoringTokens, fields.tag, 3, 'tag', reasons);
  score += scoreTokensAgainstField(scoringTokens, fields.evolved, 2, 'evolved', reasons);
  score += scoreTokensAgainstField(scoringTokens, fields.example, 2, 'example', reasons);
  score += scoreTokensAgainstField(scoringTokens, fields.name, 2.5, 'name', reasons);
  score += scoreTokensAgainstField(scoringTokens, fields.category, 1.8, 'category', reasons);
  score += scoreTokensAgainstField(scoringTokens.filter(t => t.length >= 3), fields.description, 1.2, 'description', reasons);
  score += scoreTokensAgainstField(scoringTokens.filter(t => t.length >= 3), fields.scenario, 1.5, 'scenario', reasons);

  // Domain intent is derived from the normalized query and then matched against
  // all agent text. This lets sparse agents such as "Product Strategist" rank
  // even when they only have a name tag and rich English description.
  for (const domain of detectedDomains) {
    if (domain === 'orchestration' && !['orchestration', 'planning'].includes(role)) {
      continue;
    }

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
    role,
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

const ROLE_FOCUS: Record<string, string> = {
  orchestration: '拆解任务边界、并行顺序、交付接口和验收点',
  planning: '架构取舍、执行计划、依赖关系和风险',
  review: '缺陷、回归风险、缺失测试和可维护性',
  debugging: '复现路径、根因定位、最小修复和验证命令',
  security: '安全边界、权限、数据泄露和可被利用路径',
  design: '交互流程、视觉一致性、信息密度和可用性',
  testing: '测试缺口、验收用例、回归路径和失败信号',
  data: '指标、样本、数据质量和可验证结论',
  content: '表达结构、用户理解、示例和对外文案',
  ops: '部署、发布、配置、回滚和运行状态',
  research: '资料来源、竞品事实、差异点和证据强度',
  product: '用户场景、价值主张、优先级和商业化路径',
  documentation: '安装、使用、限制、故障恢复和公开说明',
  backend: '接口、数据流、状态一致性和错误处理',
  frontend: '界面状态、组件边界、响应式和交互反馈',
};

function selectMainModel(query: string, selected: ScoredAgent[]): TeamModelRecommendation {
  const normalized = normalizeQuery(query).toLowerCase();
  const roles = new Set(selected.map(member => member.role));
  const highRisk = /(深度|架构|全局|安全|隐私|公开|发布|复杂|重构|根因|战略|商业化|成本|token|语音|模糊|risk|security|architecture|privacy|release|strategy)/i.test(normalized);
  const needsLeadReasoning = selected.length >= 4 ||
    roles.has('planning') ||
    roles.has('orchestration') ||
    roles.has('security') ||
    roles.has('product') ||
    roles.has('research');

  if (highRisk && needsLeadReasoning) {
    return {
      model: 'opus',
      reason: '高风险或高模糊度任务，主模型负责拆解、取舍和最终验收',
      decisionOwner: 'main_model_or_user',
    };
  }

  if (needsLeadReasoning || selected.length >= 2) {
    return {
      model: 'sonnet',
      reason: '主模型保留规划和合并判断，子 agent 承担局部分析或执行',
      decisionOwner: 'main_model_or_user',
    };
  }

  return {
    model: 'haiku',
    reason: '任务较轻，可先用低成本模型快速确认方向',
    decisionOwner: 'main_model_or_user',
  };
}

function selectMemberModel(member: ScoredAgent): TeamModelPlan {
  if (['planning', 'orchestration', 'review', 'debugging', 'security', 'research', 'product'].includes(member.role)) {
    return 'sonnet';
  }
  return 'haiku';
}

function buildAgentPrompt(query: string, member: ScoredAgent, index: number, model: TeamModelPlan): string {
  const focus = ROLE_FOCUS[member.role] || ROLE_FOCUS[member.category] || '只处理与你角色最相关的部分';
  return [
    `你是 ${member.agent.name}，作为第 ${index} 个子智能体参与。`,
    `主任务: ${query}`,
    `建议模型: ${model}`,
    `你的重点: ${focus}。`,
    '输出: 结论、关键依据、建议动作、验证方式；控制在 800 字内。',
    '边界: 这是建议提示词，是否执行由主模型或用户决定；未被明确授权时不要改文件、不要派生其他 agent。',
  ].join('\n');
}

function buildTokenStrategy(mainModel: TeamModelRecommendation, selected: ScoredAgent[]): TeamTokenStrategy {
  const workerModels = selected.map(selectMemberModel);
  const haikuCount = workerModels.filter(model => model === 'haiku').length;
  const sonnetCount = workerModels.filter(model => model === 'sonnet').length;
  return {
    summary: `主模型 ${mainModel.model} 决策，子任务 ${sonnetCount} 个 sonnet + ${haikuCount} 个 haiku`,
    reason: '只把对应子任务提示词交给对应 agent，避免把完整上下文重复塞给所有子智能体',
  };
}

function buildRuntimeMemberPrompts(members: TeamMember[], target: TeamRuntimeTarget): TeamRuntimeMemberPrompt[] {
  return members.map((member, index) => {
    const role = member.role ?? member.category;
    const model = member.suggestedModel ?? 'sonnet';
    const prompt = member.prompt ?? '';
    let invocation: string;

    if (target === 'claude_subagent') {
      invocation = `选择 ${member.agent.name}；若不存在，选择最接近 ${role} 职责的子智能体`;
    } else if (target === 'omc_team') {
      invocation = `作为第 ${index + 1} 个 worker brief 交给 ${member.agent.name} 或最接近的 ${role} worker`;
    } else {
      invocation = `把该 prompt 交给 ${member.agent.name}；若平台不支持命名 agent，交给 ${role} 专长 agent`;
    }

    return {
      agentName: member.agent.name,
      role,
      model,
      invocation,
      prompt,
    };
  });
}

function buildRuntimeGuides(
  query: string,
  members: TeamMember[],
  mainModel: TeamModelRecommendation,
  tokenStrategy: TeamTokenStrategy,
  omcCommand: string,
  omcLeadBrief: string,
): TeamRuntimeGuide[] {
  const genericPrompts = buildRuntimeMemberPrompts(members, 'generic');
  const claudePrompts = buildRuntimeMemberPrompts(members, 'claude_subagent');
  const omcPrompts = buildRuntimeMemberPrompts(members, 'omc_team');
  const commonConstraints = [
    '只作为建议，不自动启动或派生 agent',
    '主模型或用户保留最终选择权',
    '只给每个子智能体它需要的局部 prompt，避免重复灌入完整上下文',
  ];

  return [
    {
      target: 'generic',
      label: 'Generic agent runner',
      whenToUse: '适用于任何支持“选择 agent + 粘贴 prompt”的多智能体工具',
      leadPrompt: [
        `Task: ${query}`,
        `Recommended main model: ${mainModel.model} — ${mainModel.reason}`,
        `Token strategy: ${tokenStrategy.summary}; ${tokenStrategy.reason}.`,
        'Pick only the needed member prompts. Keep execution advisory until the user or main model confirms.',
      ].join('\n'),
      memberPrompts: genericPrompts,
      constraints: commonConstraints,
    },
    {
      target: 'claude_subagent',
      label: 'Claude Code / Agent Agency subagents',
      whenToUse: '适用于 Claude Code Task 工具、Agent Agency、或类似子智能体选择器',
      leadPrompt: [
        `Task: ${query}`,
        `Lead model suggestion: ${mainModel.model}`,
        'Use exact subagent names when available. If not available, route by role and keep the same prompt boundaries.',
      ].join('\n'),
      memberPrompts: claudePrompts,
      constraints: [
        ...commonConstraints,
        '没有同名子智能体时按 role 选择最近能力，不要为了凑名字调用无关 agent',
      ],
    },
    {
      target: 'omc_team',
      label: 'OMC /team',
      whenToUse: '适用于已有 /team <count>:<worker> 入口的团队执行器',
      command: omcCommand,
      leadPrompt: omcLeadBrief,
      memberPrompts: omcPrompts,
      constraints: [
        ...commonConstraints,
        '如果 registry 缺少推荐 agent，保留同样分工，映射到最近 worker type',
      ],
    },
  ];
}

function buildOmcLeadBrief(
  query: string,
  selected: ScoredAgent[],
  workerType: string,
  mainModel: TeamModelRecommendation,
): string {
  const recommended = selected.slice(0, 5).map(member => member.agent.name).join(', ');
  const roles = [...new Set(selected.map(member => member.role))].join(', ');
  const prompts = selected.slice(0, 5).map((member, index) => {
    const model = selectMemberModel(member);
    return `${index + 1}. ${member.agent.name} (${model})\n${buildAgentPrompt(query, member, index + 1, model)}`;
  }).join('\n\n');
  return [
    `Lead brief: task="${query}"`,
    'Decision owner: main model or user. LazyBrain is advisory only.',
    `Recommended main model: ${mainModel.model} — ${mainModel.reason}`,
    `Preferred exec worker type: ${workerType}`,
    `Recommended specialists from LazyBrain inventory: ${recommended}`,
    `Cover these dimensions during planning/verify: ${roles}`,
    'Suggested sub-agent prompts:',
    prompts,
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

  const members: TeamMember[] = selected.map((s, index) => {
    const suggestedModel = selectMemberModel(s);
    return {
      agent: s.agent,
      reason: s.reason,
      category: s.category,
      role: s.role,
      suggestedModel,
      prompt: buildAgentPrompt(effectiveQuery, s, index + 1, suggestedModel),
    };
  });

  const categories = [...new Set(members.map(m => m.category))];
  const overallReason = `覆盖 ${categories.join(' + ')} 等维度`;
  const mainModel = selectMainModel(effectiveQuery, selected);
  const tokenStrategy = buildTokenStrategy(mainModel, selected);

  const count = members.length;
  const shortenedQuery = effectiveQuery.slice(0, 30) + (effectiveQuery.length > 30 ? '...' : '');
  const suggestedCommand = `/team ${count}:mixed "${shortenedQuery}"`;
  const inferredWorkerType = inferOmcWorkerType(selected, effectiveQuery);
  const candidateWorkerType = parsedPrompt.explicitWorkerType ?? inferredWorkerType;
  const safeWorkerType = OMC_EXEC_AGENT_TYPES.has(candidateWorkerType) ? candidateWorkerType : 'executor';
  const omcCommand = `/team ${count}:${safeWorkerType} "${effectiveQuery}"`;
  const omcLeadBrief = buildOmcLeadBrief(effectiveQuery, selected, safeWorkerType, mainModel);
  const runtimeGuides = buildRuntimeGuides(effectiveQuery, members, mainModel, tokenStrategy, omcCommand, omcLeadBrief);

  return {
    members,
    overallReason,
    suggestedCommand,
    mainModel,
    tokenStrategy,
    runtimeGuides,
    advisory: true,
    omcBridge: {
      workerType: safeWorkerType,
      workerCount: count,
      command: omcCommand,
      leadBrief: omcLeadBrief,
    },
  };
}
