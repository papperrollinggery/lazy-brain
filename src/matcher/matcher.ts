import type { Capability, HistoryEntry, Recommendation, UserConfig, Platform, CapabilityKind } from '../types.js';
import { Graph } from '../graph/graph.js';
import { BUILTIN_SKILLS, type BuiltinSkill } from '../knowledge/builtin.js';
import { normalizeName, positiveSearchText, searchTerms } from './terms.js';

export interface FindResult {
  skill: string;
  score: number;
  reason: string;
  description: string;
  category: string;
  composesWell: string[];
  capability: Capability;
}

export interface FindOptions {
  graph?: Graph;
  limit?: number;
  threshold?: number;
  platform?: Platform;
  kind?: CapabilityKind;
  /** Illustrative recipes, never evidence of an installed capability. */
  includeBuiltins?: boolean;
  /** Catalog audits can inspect disabled/listed entries; recommendations cannot. */
  includeUnavailable?: boolean;
  history?: Array<{ recommended?: string; used?: string | null; matched?: string; accepted?: boolean }>;
}

export interface MatchOptions {
  graph: Graph;
  config: UserConfig;
  history?: HistoryEntry[];
  profile?: unknown;
}

// The old phrase matcher is retained only for the explicit demonstration mode.
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function tokens(text: string): Set<string> {
  return new Set(normalize(text).match(/[\p{L}\p{N}][\p{L}\p{N}-]*/gu) ?? []);
}

function phraseMatch(query: string, phrase: string): boolean {
  const q = normalize(query);
  const p = normalize(phrase);
  if (!p) return false;
  if (/[\u4e00-\u9fff]/.test(p)) return q.includes(p);
  return (' ' + q + ' ').includes(' ' + p + ' ');
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  return [...a].filter((item) => b.has(item)).length / Math.min(a.size, b.size);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const hits = [...a].filter((item) => b.has(item)).length;
  return hits / (a.size + b.size - hits || 1);
}

function historyBoost(skillName: string, history?: FindOptions['history']): number {
  const uses = (history ?? []).filter((entry) => {
    const name = entry.used || (entry.accepted === true ? entry.matched : '') || '';
    return normalize(name) === normalize(skillName) && entry.accepted !== false;
  }).length;
  return Math.min(0.12, uses * 0.03);
}

function builtinCapability(item: BuiltinSkill): Capability {
  return {
    id: 'builtin:' + item.name, kind: 'skill', name: item.name,
    description: item.description, origin: 'builtin', status: 'available',
    discovery: 'builtin-example', compatibility: ['universal'],
    tags: [item.category], exampleQueries: item.examples,
    category: item.category, triggers: item.triggers,
  };
}

function scoreSkill(query: string, queryTokens: Set<string>, item: BuiltinSkill): FindResult | null {
  const q = normalize(query);
  let best = 0;
  let reason = '';
  for (const trigger of item.triggers) {
    const t = normalize(trigger);
    if (!t) continue;
    if (phraseMatch(q, t)) {
      const score = t === q ? 0.98 : tokens(t).size <= 1 ? 0.68 : 0.95;
      if (score > best) { best = score; reason = 'trigger "' + trigger + '"'; }
    } else if (overlap(queryTokens, tokens(trigger)) >= 0.6 && best < 0.8) {
      best = 0.8; reason = 'partial trigger "' + trigger + '"';
    }
  }
  for (const example of item.examples) {
    const ratio = jaccard(queryTokens, tokens(example));
    const score = 0.7 + Math.min(0.12, ratio * 0.2);
    if (ratio >= 0.35 && score > best) { best = score; reason = 'example "' + example + '"'; }
  }
  if (overlap(queryTokens, tokens(item.category + ' ' + item.name + ' ' + item.description)) >= 0.35 && best < 0.55) {
    best = 0.55; reason = 'category ' + item.category;
  }
  if (item.negatives.some((negative) => q.includes(normalize(negative)))) best *= 0.3;
  return best > 0 ? {
    skill: item.name, score: Number(best.toFixed(4)), reason,
    description: item.description, category: item.category, composesWell: item.composesWell,
    capability: builtinCapability(item),
  } : null;
}

interface SearchDocument {
  capability: Capability;
  name: Set<string>;
  triggers: Set<string>;
  all: Set<string>;
}

const documentCache = new WeakMap<Capability, { signature: string; document: SearchDocument }>();

function documentFor(capability: Capability): SearchDocument {
  const signature = JSON.stringify([capability.name, capability.description, capability.triggers,
    capability.exampleQueries, capability.tags]);
  const cached = documentCache.get(capability);
  if (cached?.signature === signature) return cached.document;
  const document = {
    capability,
    name: searchTerms(capability.name, true),
    triggers: searchTerms((capability.triggers ?? []).join(' '), true),
    all: searchTerms([capability.name, capability.description, ...(capability.triggers ?? []),
      ...capability.exampleQueries, ...capability.tags].join(' '), true),
  };
  documentCache.set(capability, { signature, document });
  return document;
}

function localMatches(query: string, capabilities: Capability[]): FindResult[] {
  const positive = positiveSearchText(query);
  const queryTerms = searchTerms(positive, true);
  if (!queryTerms.size) return [];
  const documents = capabilities.map(documentFor);
  const frequencies = new Map<string, number>();
  for (const doc of documents) for (const term of doc.all) {
    frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
  }
  const weights = [...queryTerms].filter((term) => frequencies.has(term)).map((term) => ({
    term, weight: 1 + Math.log(1 + capabilities.length / (1 + frequencies.get(term)!)),
  }));
  if (!weights.length) return [];
  const total = weights.reduce((sum, item) => sum + item.weight, 0);
  const coverage = (terms: Set<string>) => weights.reduce((sum, item) =>
    sum + (terms.has(item.term) ? item.weight : 0), 0) / total;
  const normalizedQuery = ' ' + normalizeName(positive) + ' ';
  return documents.flatMap(({ capability, name, triggers, all }) => {
    if (Array.isArray(capability.schema?.avoidWhen) &&
      capability.schema.avoidWhen.some((phrase) => typeof phrase === 'string' && phraseMatch(query, phrase))) return [];
    const hits = weights.filter((item) => all.has(item.term)).map((item) => item.term);
    if (!hits.length) return [];
    const exactName = normalizeName(positive) === normalizeName(capability.name);
    const named = name.size > 0 && normalizedQuery.includes(' ' + normalizeName(capability.name) + ' ');
    const score = exactName ? 1 : named ? 0.98 :
      Math.min(0.94, coverage(all) * 0.76 + coverage(name) * 0.16 + coverage(triggers) * 0.08);
    return [{
      skill: capability.name, capability, score: Number(score.toFixed(4)),
      reason: exactName || named ? 'named capability' : 'metadata: ' + hits.slice(0, 8).join(', '),
      description: capability.description, category: capability.category, composesWell: [],
    }];
  });
}

export function find(query: string, options: FindOptions = {}): FindResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const threshold = options.threshold ?? 0.3;
  const limit = Math.max(0, Math.min(100, Math.floor(options.limit ?? 5)));
  const capabilities = (options.graph?.getAllNodes() ?? []).filter((cap) =>
    (options.includeUnavailable || (cap.status !== 'disabled' && cap.status !== 'available' && !cap.hiddenByDefault)) &&
    cap.origin !== 'builtin' && cap.discovery !== 'builtin-example' &&
    (!options.kind || cap.kind === options.kind) &&
    (!options.platform || cap.compatibility.includes(options.platform) || cap.compatibility.includes('universal')));
  const results = localMatches(trimmed, capabilities);
  if (options.includeBuiltins) {
    for (const item of BUILTIN_SKILLS) {
      if (capabilities.some((cap) => cap.name === item.name)) continue;
      const result = scoreSkill(trimmed, tokens(trimmed), item);
      if (result) results.push(result);
    }
  }
  return results.map((result) => ({
    ...result,
    score: Number(Math.min(1, result.score + (result.score >= 0.9 ? 0 : historyBoost(result.skill, options.history))).toFixed(4)),
  })).filter((result) => result.score >= threshold)
    .sort((a, b) => b.score - a.score ||
      Number(b.capability.discovery === 'local-file') - Number(a.capability.discovery === 'local-file') ||
      a.skill.localeCompare(b.skill) || a.capability.id.localeCompare(b.capability.id))
    .slice(0, limit);
}

export async function match(query: string, options: MatchOptions): Promise<Recommendation> {
  const results = find(query, { graph: options.graph, limit: 5, threshold: 0.3,
    history: options.history, platform: options.config.platform });
  return {
    matches: results.map((result) => ({
      capability: result.capability, score: result.score, layer: 'tag',
      confidence: result.score >= 0.8 ? 'high' : result.score >= 0.6 ? 'medium' : 'low',
      explanation: result.reason,
    })),
    comparisons: [], compositions: [], upgrades: [], external: [],
    warnings: options.graph.getNodeCount() === 0 ? ['No local metadata. Use the host capability catalog or scan local sources.'] : [],
  };
}
