import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { Graph } from '../graph/graph.js';
import type { Capability, MatchResult, Recommendation, UserConfig } from '../types.js';
import { getClaudeConfigDir } from '../constants.js';
import { match } from '../matcher/matcher.js';
import { recommendTeam, type TeamComposition, type TeamMember } from '../matcher/team-recommender.js';
import { hasLazyBrainHookRegistration } from '../hook/settings.js';
import { getStatusLineCommand } from '../hook/plan.js';
import type { LabCase, LabMode } from './fixtures.js';
import { LAB_FIXTURES } from './fixtures.js';
import { scanAgentInventory, type AgentInventoryEntry } from './agent-inventory.js';

export interface LabCapabilityView {
  id: string;
  kind: string;
  name: string;
  description: string;
  origin: string;
  status: string;
  category: string;
  tags: string[];
}

export interface LabMatchView {
  matches: Array<{
    capability: LabCapabilityView;
    score: number;
    layer: string;
    confidence: string;
    explanation?: string;
  }>;
  warnings: string[];
}

export interface AgentMapping {
  recommended: string;
  role: string;
  status: 'exact' | 'role' | 'missing';
  mapped?: string;
  mappedScope?: AgentInventoryEntry['scope'];
  mappedSource?: string;
  reason: string;
}

export interface LabModeDecision {
  mode: LabMode;
  reason: string;
  confidence: number;
}

export interface LabHookReadiness {
  projectSettingsExists: boolean;
  projectLazyBrainInstalled: boolean;
  globalLazyBrainInstalled: boolean;
  statuslineMode: 'none' | 'project' | 'global';
  statuslineCommand: string;
  safeForLab: boolean;
}

export interface LabTeamView {
  members: Array<{
    name: string;
    category: string;
    role?: string;
    suggestedModel?: string;
    reason: string;
    prompt?: string;
  }>;
  overallReason: string;
  suggestedCommand: string;
  mainModel: TeamComposition['mainModel'];
  tokenStrategy: TeamComposition['tokenStrategy'];
  runtimeGuides: TeamComposition['runtimeGuides'];
  omcBridge: TeamComposition['omcBridge'];
}

export interface LabEvaluation {
  query: string;
  fixture?: LabCase;
  match: LabMatchView;
  team: LabTeamView | null;
  modeDecision: LabModeDecision;
  agentMappings: AgentMapping[];
  tokenStrategy?: TeamComposition['tokenStrategy'];
  hookReadiness: LabHookReadiness;
  warnings: string[];
}

export interface LabEvaluationOptions {
  graph: Graph;
  config: UserConfig;
  cases?: LabCase[];
  queries?: string[];
  maxMembers?: number;
  projectRoot?: string;
  claudeConfigDir?: string;
  agentInventory?: AgentInventoryEntry[];
}

function capabilityView(capability: Capability): LabCapabilityView {
  return {
    id: capability.id,
    kind: capability.kind,
    name: capability.name,
    description: capability.description,
    origin: capability.origin,
    status: capability.status,
    category: capability.category,
    tags: capability.tags.slice(0, 12),
  };
}

function matchView(recommendation: Recommendation): LabMatchView {
  return {
    matches: recommendation.matches.slice(0, 5).map((result: MatchResult) => ({
      capability: capabilityView(result.capability),
      score: Math.round(result.score * 1000) / 1000,
      layer: result.layer,
      confidence: result.confidence,
      explanation: result.explanation,
    })),
    warnings: recommendation.warnings ?? [],
  };
}

function teamView(team: TeamComposition | null): LabTeamView | null {
  if (!team) return null;
  return {
    members: team.members.map(member => ({
      name: member.agent.name,
      category: member.category,
      role: member.role,
      suggestedModel: member.suggestedModel,
      reason: member.reason,
      prompt: member.prompt,
    })),
    overallReason: team.overallReason,
    suggestedCommand: team.suggestedCommand,
    mainModel: team.mainModel,
    tokenStrategy: team.tokenStrategy,
    runtimeGuides: team.runtimeGuides,
    omcBridge: team.omcBridge,
  };
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function roleText(entry: AgentInventoryEntry): string {
  return [entry.name, entry.description, entry.model, entry.tools.join(' ')].join(' ').toLowerCase();
}

const ROLE_ALIASES: Record<string, string[]> = {
  testing: ['test', 'testing', 'qa', 'verification', 'coverage'],
  security: ['security', 'privacy', 'vulnerability', 'secrets'],
  debugging: ['debug', 'debugging', 'runtime', 'root cause', 'stuck'],
  planning: ['planning', 'architect', 'architecture', 'strategy'],
  orchestration: ['orchestrator', 'workflow', 'team', 'multi-agent', 'subagent'],
  documentation: ['docs', 'documentation', 'writing', 'onboarding'],
  product: ['product', 'strategy', 'positioning', 'value'],
};

function scoreRoleMatch(member: TeamMember, entry: AgentInventoryEntry): number {
  const text = roleText(entry);
  const role = (member.role ?? '').toLowerCase();
  const category = member.category.toLowerCase();
  const tags = member.agent.tags.map(tag => tag.toLowerCase());
  let score = 0;
  if (role && text.includes(role)) score += 4;
  if (category && text.includes(category)) score += 2;
  for (const alias of ROLE_ALIASES[role] ?? ROLE_ALIASES[category] ?? []) {
    if (text.includes(alias)) score += 2;
  }
  for (const tag of tags.slice(0, 8)) {
    if (tag.length >= 3 && text.includes(tag)) score += 1;
  }
  return score;
}

export function mapTeamToAgents(team: TeamComposition | null, inventory: AgentInventoryEntry[]): AgentMapping[] {
  if (!team) return [];
  const available = inventory.filter(agent => agent.available);
  const byName = new Map(available.map(agent => [normalizeName(agent.name), agent]));

  return team.members.map(member => {
    const exact = byName.get(normalizeName(member.agent.name));
    const role = member.role ?? member.category;
    if (exact) {
      return {
        recommended: member.agent.name,
        role,
        status: 'exact',
        mapped: exact.name,
        mappedScope: exact.scope,
        mappedSource: exact.source,
        reason: '同名子智能体可用',
      };
    }

    const roleMatch = available
      .map(agent => ({ agent, score: scoreRoleMatch(member, agent) }))
      .filter(item => item.score >= 3)
      .sort((a, b) => b.score - a.score)[0]?.agent;

    if (roleMatch) {
      return {
        recommended: member.agent.name,
        role,
        status: 'role',
        mapped: roleMatch.name,
        mappedScope: roleMatch.scope,
        mappedSource: roleMatch.source,
        reason: `无同名 agent，按 ${role} 职责映射`,
      };
    }

    return {
      recommended: member.agent.name,
      role,
      status: 'missing',
      reason: '没有同名或近似职责 agent，使用 generic prompt',
    };
  });
}

function isVagueQuery(query: string): boolean {
  const q = query.toLowerCase();
  const vague = /(有点乱|不太行|你看看|看怎么安排|怎么变得更有用|语音|模糊|不清楚|随便说|感觉)/.test(q);
  const concrete = /(文件|函数|hook|安装|回滚|测试|审查|修复|报错|debug|文档|代码|agent|token|安全)/i.test(q);
  return vague && !concrete;
}

function decideMode(query: string, team: TeamComposition | null, recommendation: Recommendation): LabModeDecision {
  if (isVagueQuery(query)) {
    return { mode: 'needs_clarification', reason: '输入过于宽泛，先澄清目标和边界更省 token', confidence: 0.86 };
  }

  const normalized = query.toLowerCase();
  const explicitTeam = /(team模式|多\s*agent|组队|子智能体|agent agency|multi-agent|subagent)/i.test(normalized);
  const parallel = /(并行|多个|跨域|团队|竞争假设|多方案|安全.*测试|隐私.*回滚|review.*test)/i.test(normalized);
  const complex = /(深度|架构|全局|安全|隐私|回滚|风险|排查|debug|token|审查)/i.test(normalized);
  const hasTeam = Boolean(team && team.members.length >= 2);

  if ((explicitTeam || parallel) && hasTeam) {
    return { mode: 'team', reason: '任务显式需要多智能体或可并行拆分', confidence: 0.82 };
  }
  if ((complex || recommendation.decisionHint?.type === 'analysis') && hasTeam) {
    return { mode: 'subagent', reason: '适合用聚焦子智能体审查局部风险，但不一定需要完整 team', confidence: 0.74 };
  }
  return { mode: 'regular', reason: '单模型顺序处理足够，team 成本不划算', confidence: 0.72 };
}

function readJsonObject(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function sanitizeDisplay(text: string): string {
  const home = homedir().replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  return text
    .replace(new RegExp(home, 'g'), '~')
    .replace(/\/Users\/[^\s"'`]+/g, '~')
    .replace(/((?:api[_-]?key|token|secret|password)=)[^\s&]+/gi, '$1[redacted]');
}

export function getLabHookReadiness(projectRoot = process.cwd(), claudeConfigDir = getClaudeConfigDir()): LabHookReadiness {
  const projectSettingsPath = join(projectRoot, '.claude', 'settings.json');
  const globalSettingsPath = join(claudeConfigDir, 'settings.json');
  const projectSettings = readJsonObject(projectSettingsPath);
  const globalSettings = readJsonObject(globalSettingsPath);
  const projectStatusline = getStatusLineCommand(projectSettings.statusLine);
  const globalStatusline = getStatusLineCommand(globalSettings.statusLine);
  return {
    projectSettingsExists: existsSync(projectSettingsPath),
    projectLazyBrainInstalled: hasLazyBrainHookRegistration(projectSettings),
    globalLazyBrainInstalled: hasLazyBrainHookRegistration(globalSettings),
    statuslineMode: projectStatusline ? 'project' : globalStatusline ? 'global' : 'none',
    statuslineCommand: sanitizeDisplay(projectStatusline || globalStatusline),
    safeForLab: true,
  };
}

function semanticFallbackWarning(config: UserConfig, recommendation: Recommendation): string | null {
  if (config.engine !== 'semantic' && config.engine !== 'hybrid') return null;
  const hasSemantic = recommendation.matches.some(matchResult => matchResult.layer === 'semantic');
  return hasSemantic ? null : 'Semantic/hybrid selected but no semantic result was used; Lab is showing fallback routing.';
}

async function evaluateCase(
  labCase: LabCase,
  options: LabEvaluationOptions,
  inventory: AgentInventoryEntry[],
  hookReadiness: LabHookReadiness,
): Promise<LabEvaluation> {
  const recommendation = await match(labCase.query, { graph: options.graph, config: options.config });
  const team = recommendTeam(labCase.query, options.graph, options.maxMembers ?? 5);
  const mappings = mapTeamToAgents(team, inventory);
  const modeDecision = decideMode(labCase.query, team, recommendation);
  const warnings = [
    ...(recommendation.warnings ?? []),
    ...mappings.filter(mapping => mapping.status === 'missing').map(mapping => `Missing mapped agent for ${mapping.recommended}; generic prompt will be used.`),
  ];
  const fallbackWarning = semanticFallbackWarning(options.config, recommendation);
  if (fallbackWarning) warnings.push(fallbackWarning);

  return {
    query: labCase.query,
    fixture: labCase,
    match: matchView(recommendation),
    team: teamView(team),
    modeDecision,
    agentMappings: mappings,
    tokenStrategy: team?.tokenStrategy,
    hookReadiness,
    warnings,
  };
}

export async function evaluateLab(options: LabEvaluationOptions): Promise<LabEvaluation[]> {
  const cases = options.cases ??
    options.queries?.map((query, index) => ({
      id: `custom-${index + 1}`,
      title: `Custom ${index + 1}`,
      query,
      expectedIntent: 'custom query',
      expectedMode: 'regular' as const,
      tags: ['custom'],
    })) ??
    LAB_FIXTURES;
  const inventory = options.agentInventory ?? scanAgentInventory({
    projectRoot: options.projectRoot,
    claudeConfigDir: options.claudeConfigDir,
  });
  const hookReadiness = getLabHookReadiness(options.projectRoot, options.claudeConfigDir);
  const evaluations: LabEvaluation[] = [];
  for (const labCase of cases) {
    evaluations.push(await evaluateCase(labCase, options, inventory, hookReadiness));
  }
  return evaluations;
}
