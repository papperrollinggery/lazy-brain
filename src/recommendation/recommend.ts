import type { Capability, CapabilityKind, Platform } from '../types.js';
import { Graph } from '../graph/graph.js';
import { find, type FindOptions, type FindResult } from '../matcher/matcher.js';
import { searchTerms } from '../matcher/terms.js';

export type RecommendationAction = 'use' | 'compare' | 'clarify' | 'no_match';

export interface RecommendationCandidate {
  id: string;
  name: string;
  kind: CapabilityKind;
  score: number;
  confidence: 'high' | 'medium' | 'low';
  description: string;
  reason: string;
  origin: string;
  compatibility: Platform[];
  filePath?: string;
  discovery: NonNullable<Capability['discovery']>;
  invocationPolicy?: Capability['invocationPolicy'];
  sideEffects?: Capability['sideEffects'];
  callableVerified: false;
  nextStep: string;
  otherSources?: Array<{ id: string; origin: string; filePath?: string; discovery: string }>;
  sourceCount?: number;
}

export interface RecommendationDecision {
  schemaVersion: 2;
  query: string;
  action: RecommendationAction;
  summary: string;
  primary: RecommendationCandidate | null;
  alternatives: RecommendationCandidate[];
  /** Legacy field: workflow composition belongs to the host, not lexical ranking. */
  workflow: Array<{ order: number; name: string; reason: string }>;
  clarifyingQuestion?: string;
  warnings: string[];
  scoreMeaning: 'metadata relevance, not success probability';
  visualization: {
    surface: 'decision';
    fallback: 'markdown';
    choices: Array<{ id: string; label: string; score: number; recommended: boolean }>;
  };
}

export interface RecommendOptions extends Pick<FindOptions, 'history' | 'limit' | 'includeBuiltins' | 'kind'> {
  graph?: Graph;
  platform?: Platform;
}

function candidate(result: FindResult): RecommendationCandidate {
  const source = result.capability;
  const discovery = source.discovery ?? (source.kind === 'mcp' ? 'configured' : 'local-file');
  const nextStep = source.kind === 'skill' && source.filePath
    ? 'Read this SKILL.md if the host catalog does not already provide the appropriate entry.'
    : 'Check this capability in the host tool or plugin catalog before invocation.';
  return {
    id: source.id, name: source.name, kind: source.kind,
    score: result.score,
    confidence: result.score >= 0.85 ? 'high' : result.score >= 0.6 ? 'medium' : 'low',
    description: result.description.slice(0, 360), reason: result.reason,
    origin: source.origin, compatibility: source.compatibility,
    filePath: source.filePath, discovery, invocationPolicy: source.invocationPolicy,
    sideEffects: source.sideEffects, callableVerified: false,
    nextStep: discovery === 'builtin-example' ? 'Example only; not an installed capability.' : nextStep,
  };
}

export function recommend(query: string, options: RecommendOptions = {}): RecommendationDecision {
  const limit = Math.max(1, Math.min(10, Math.floor(options.limit ?? 3)));
  const groups = new Map<string, RecommendationCandidate[]>();
  const ranked = find(query, { ...options, limit: 100, threshold: 0.3 }).map(candidate);
  for (const item of ranked) {
    // Prefer the actionable entry over its plugin's broad directory description.
    if (item.kind === 'plugin' && item.reason !== 'named capability' &&
      ranked.some((other) => other.kind === 'skill' && other.origin === item.origin)) continue;
    const key = item.kind + ':' + item.name;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  const matches = [...groups.values()].map(([item, ...others]) => others.length ? {
    ...item, sourceCount: others.length + 1,
    otherSources: others.slice(0, 3).map(({ id, origin, filePath, discovery }) => ({ id, origin, filePath, discovery })),
    nextStep: 'Several sources share this name. Resolve the current host entry before reading or invoking it.',
  } : item);
  const [primary, second] = matches;
  const vague = searchTerms(query).size === 0;
  const action: RecommendationAction = vague ? 'clarify' : !primary ? 'no_match' :
    ((!second && primary.score >= 0.5) || (primary.score >= 0.7 && primary.score - second!.score > 0.06)) ? 'use' : 'compare';
  const visible = action === 'clarify' ? [] : matches.slice(0, limit);
  const summary = action === 'use' && primary
    ? 'Best metadata match: ' + primary.name
    : action === 'compare' ? 'Several local entries may fit; choose using their scope and source.'
      : action === 'clarify' ? 'A concrete capability search topic is missing.'
        : 'No relevant local entry found. Continue with the host catalog or native tools.';
  return {
    schemaVersion: 2, query: query.trim(), action, summary,
    primary: visible[0] ?? null, alternatives: visible.slice(1), workflow: [],
    ...(action === 'clarify' ? { clarifyingQuestion: 'What task or capability should the local search cover?' } : {}),
    warnings: ['Local files and configuration are discovery evidence. They do not establish that a tool is enabled or callable.'],
    scoreMeaning: 'metadata relevance, not success probability',
    visualization: {
      surface: 'decision', fallback: 'markdown',
      choices: visible.map((item, index) => ({
        id: item.id, label: item.kind + ':' + item.name, score: item.score,
        recommended: index === 0 && action === 'use',
      })),
    },
  };
}

export function formatDecisionMarkdown(decision: RecommendationDecision): string {
  const lines = [decision.summary];
  const candidates = [decision.primary, ...decision.alternatives].filter((item): item is RecommendationCandidate => item !== null);
  for (const item of candidates) {
    lines.push('', '- ' + item.kind + ':' + item.name + ' — ' + item.description,
      '  Source: ' + item.origin + '; evidence: ' + item.discovery,
      '  Match: ' + item.reason);
    if (item.filePath) lines.push('  Path: ' + item.filePath);
    if (item.invocationPolicy) lines.push('  Invocation: ' + item.invocationPolicy);
    if (item.sourceCount) lines.push('  Sources: ' + item.sourceCount + ' entries share this name; resolve the current host entry.');
  }
  if (decision.clarifyingQuestion) lines.push('', decision.clarifyingQuestion);
  if (candidates.length) lines.push('', 'Read the selected entry and use the host’s current capabilities and existing authorization.');
  return lines.join('\n');
}
