import type { Capability, CapabilityKind, Platform } from '../types.js';
import { Graph } from '../graph/graph.js';
import { find, type FindOptions, type FindResult } from '../matcher/matcher.js';
import { orchestrate } from '../orchestrator/engine.js';
import { signalFromQuery } from '../orchestrator/signals.js';

export type RecommendationAction = 'use' | 'compare' | 'clarify';

export interface RecommendationCandidate {
  name: string;
  kind: CapabilityKind;
  score: number;
  confidence: 'high' | 'medium' | 'low';
  description: string;
  reason: string;
  origin: string;
  compatibility: Platform[];
}

export interface RecommendationDecision {
  schemaVersion: 1;
  query: string;
  action: RecommendationAction;
  summary: string;
  primary: RecommendationCandidate | null;
  alternatives: RecommendationCandidate[];
  workflow: Array<{ order: number; name: string; reason: string }>;
  clarifyingQuestion?: string;
  visualization: {
    surface: 'decision';
    fallback: 'markdown';
    choices: Array<{ id: string; label: string; score: number; recommended: boolean }>;
  };
}

export interface RecommendOptions extends Pick<FindOptions, 'history' | 'limit'> {
  graph?: Graph;
  platform?: Platform;
}

function sourceCapability(result: FindResult, graph?: Graph): Capability | undefined {
  return graph?.getAllNodes().find((item) => item.status !== 'disabled' && item.name === result.skill);
}

function candidate(result: FindResult, graph?: Graph): RecommendationCandidate {
  const source = sourceCapability(result, graph);
  return {
    name: result.skill,
    kind: source?.kind ?? 'skill',
    score: result.score,
    confidence: result.score >= 0.8 ? 'high' : result.score >= 0.6 ? 'medium' : 'low',
    description: result.description,
    reason: result.reason,
    origin: source?.origin ?? 'builtin',
    compatibility: source?.compatibility ?? ['universal'],
  };
}

function platformCompatible(item: RecommendationCandidate, platform?: Platform): boolean {
  return !platform || item.compatibility.includes(platform) || item.compatibility.includes('universal');
}

function isVagueQuery(query: string): boolean {
  const generic = new Set(['help', 'me', 'with', 'this', 'that', 'it', 'please', 'do', 'something', '帮我', '这个', '那个', '一下', '处理', '弄']);
  const terms = query.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}-]*/gu) ?? [];
  return terms.length === 0 || terms.every((term) => generic.has(term));
}

export function recommend(query: string, options: RecommendOptions = {}): RecommendationDecision {
  const plan = orchestrate(signalFromQuery(query));
  const planOrder = new Map((plan?.enhancements ?? []).map((item, index) => [item.name, index]));
  const matches = find(query, {
    graph: options.graph,
    history: options.history,
    limit: Math.max(3, options.limit ?? 5),
    threshold: 0.3,
  }).map((item) => candidate(item, options.graph))
    .filter((item) => platformCompatible(item, options.platform))
    .sort((a, b) => {
      if (plan && plan.confidence >= 0.85) {
        const aOrder = planOrder.get(a.name) ?? Number.MAX_SAFE_INTEGER;
        const bOrder = planOrder.get(b.name) ?? Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder) return aOrder - bOrder;
      }
      return b.score - a.score || a.name.localeCompare(b.name);
    });
  const [primary, ...rest] = matches;
  const planResolved = Boolean(primary && plan && plan.confidence >= 0.85 && planOrder.get(primary.name) === 0);
  const ambiguous = Boolean(primary && rest[0] && primary.score < 0.9 && Math.abs(primary.score - rest[0].score) <= 0.05);
  const action: RecommendationAction = isVagueQuery(query) || !primary || primary.score < 0.6 ? 'clarify' : ambiguous && !planResolved ? 'compare' : 'use';
  const resolvedPrimary = primary && planResolved && plan
    ? { ...primary, reason: `${primary.reason}; orchestration: ${plan.reason}` }
    : primary;
  const workflow = plan && plan.confidence >= 0.7
    ? plan.enhancements.slice(0, 5).map((item, index) => ({ order: index + 1, name: item.name, reason: item.reason }))
    : [];
  const summary = action === 'use' && resolvedPrimary
    ? `Use ${resolvedPrimary.name}: ${resolvedPrimary.description}`
    : action === 'compare' && resolvedPrimary
      ? `Compare ${[resolvedPrimary, ...rest.slice(0, 2)].map((item) => item.name).join(', ')} before choosing.`
      : 'The prompt is too broad for a reliable capability choice.';

  return {
    schemaVersion: 1,
    query: query.trim(),
    action,
    summary,
    primary: action === 'clarify' ? null : resolvedPrimary ?? null,
    alternatives: action === 'clarify' ? [] : rest.slice(0, Math.max(0, (options.limit ?? 3) - 1)),
    workflow,
    ...(action === 'clarify' || action === 'compare'
      ? { clarifyingQuestion: 'What concrete outcome should the agent produce, and should it only advise or also change files or external systems?' }
      : {}),
    visualization: {
      surface: 'decision',
      fallback: 'markdown',
      choices: (action === 'clarify' ? [] : matches.slice(0, 3)).map((item, index) => ({
        id: `choice-${index + 1}`,
        label: `${item.kind}:${item.name}`,
        score: item.score,
        recommended: index === 0 && action === 'use',
      })),
    },
  };
}

export function formatDecisionMarkdown(decision: RecommendationDecision): string {
  const lines = [`## ${decision.summary}`];
  if (decision.primary) {
    const label = decision.action === 'compare' ? 'Leading candidate' : 'Recommended';
    lines.push('', `${label}: ${decision.primary.kind}:${decision.primary.name} (${Math.round(decision.primary.score * 100)}%)`);
    lines.push(`Why: ${decision.primary.reason}; source: ${decision.primary.origin}`);
  }
  if (decision.alternatives.length) {
    lines.push('', 'Alternatives:');
    decision.alternatives.forEach((item) => lines.push(`- ${item.kind}:${item.name} (${Math.round(item.score * 100)}%) — ${item.description}`));
  }
  if (decision.workflow.length) {
    lines.push('', 'Suggested order:');
    decision.workflow.forEach((item) => lines.push(`${item.order}. ${item.name} — ${item.reason}`));
  }
  if (decision.clarifyingQuestion) lines.push('', `Clarify: ${decision.clarifyingQuestion}`);
  return lines.join('\n');
}
