import type { Capability, HistoryEntry, MatchResult, Recommendation, UserConfig } from '../types.js';
import { Graph } from '../graph/graph.js';
import { BUILTIN_SKILLS, type BuiltinSkill } from '../knowledge/builtin.js';

export interface FindResult {
  skill: string;
  score: number;
  reason: string;
  description: string;
  category: string;
  composesWell: string[];
}

export interface FindOptions {
  graph?: Graph;
  limit?: number;
  threshold?: number;
  history?: Array<{ recommended?: string; used?: string | null; matched?: string; accepted?: boolean }>;
}

export interface MatchOptions {
  graph: Graph;
  config: UserConfig;
  history?: HistoryEntry[];
  profile?: unknown;
}

const TOKEN_RE = /[\p{L}\p{N}][\p{L}\p{N}-]*/gu;

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function tokens(text: string): Set<string> {
  return new Set(normalize(text).match(TOKEN_RE) ?? []);
}

function tokenList(text: string): string[] {
  return normalize(text).match(TOKEN_RE) ?? [];
}

function phraseMatch(query: string, phrase: string): boolean {
  const q = normalize(query);
  const p = normalize(phrase);
  if (!p) return false;
  if (/[\u4e00-\u9fff]/.test(p)) return q.includes(p);
  const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(q);
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let hits = 0;
  for (const item of a) if (b.has(item)) hits++;
  return hits / Math.min(a.size, b.size);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let hits = 0;
  for (const item of a) if (b.has(item)) hits++;
  return hits / (a.size + b.size - hits);
}

function graphSkills(graph?: Graph): BuiltinSkill[] {
  if (!graph) return [];
  return graph.getAllNodes()
    .filter((cap) => cap.status !== 'disabled')
    .map((cap) => ({
      name: cap.name,
      category: cap.category || 'local',
      description: cap.description || cap.scenario || 'Local capability.',
      triggers: [...(cap.triggers ?? []), ...cap.tags, cap.name],
      negatives: [],
      examples: cap.exampleQueries,
      composesWell: graph.getLinks(cap.id).slice(0, 4).map((link) => {
        const otherId = link.source === cap.id ? link.target : link.source;
        return graph.getNode(otherId)?.name ?? otherId;
      }),
    }));
}

function historyBoost(skillName: string, history?: FindOptions['history']): number {
  if (!history?.length) return 0;
  const normalizedName = normalize(skillName);
  const uses = history.filter((entry) => {
    const name = entry.used ?? entry.recommended ?? entry.matched ?? '';
    return normalize(name) === normalizedName && entry.accepted !== false;
  }).length;
  return Math.min(0.12, uses * 0.03);
}

function scoreSkill(query: string, queryTokens: Set<string>, item: BuiltinSkill): FindResult | null {
  const q = normalize(query);
  let best = 0;
  let reason = '';

  for (const trigger of item.triggers) {
    const t = normalize(trigger);
    if (!t) continue;
    if (phraseMatch(q, t)) {
      const tokenCount = tokenList(t).length;
      const score = t === q ? 0.98 : tokenCount <= 1 ? 0.68 : 0.95;
      if (score > best) {
        best = score;
        reason = `trigger "${trigger}"`;
      }
      continue;
    }
    const ratio = overlap(queryTokens, tokens(trigger));
    if (ratio >= 0.6 && 0.8 > best) {
      best = 0.8;
      reason = `partial trigger "${trigger}"`;
    }
  }

  for (const example of item.examples) {
    const ratio = jaccard(queryTokens, tokens(example));
    if (ratio >= 0.35) {
      const score = 0.7 + Math.min(0.12, ratio * 0.2);
      if (score > best) {
        best = score;
        reason = `example "${example}"`;
      }
    }
  }

  const categoryTokens = tokens(`${item.category} ${item.name} ${item.description}`);
  const categoryOverlap = overlap(queryTokens, categoryTokens);
  if (categoryOverlap >= 0.35 && 0.55 > best) {
    best = 0.55;
    reason = `category ${item.category}`;
  }

  const negativeHit = item.negatives.some((negative) => q.includes(normalize(negative)));
  if (negativeHit) best *= 0.3;
  if (best <= 0) return null;

  return {
    skill: item.name,
    score: Math.min(1, Number(best.toFixed(4))),
    reason,
    description: item.description,
    category: item.category,
    composesWell: item.composesWell,
  };
}

function uniqueSkills(skills: BuiltinSkill[]): BuiltinSkill[] {
  const seen = new Set<string>();
  const out: BuiltinSkill[] = [];
  for (const item of skills) {
    const key = normalize(item.name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function find(query: string, options: FindOptions = {}): FindResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const queryTokens = tokens(trimmed);
  const threshold = options.threshold ?? 0.5;
  const limit = options.limit ?? 5;
  const skills = uniqueSkills([...BUILTIN_SKILLS, ...graphSkills(options.graph)]);

  return skills
    .map((item) => {
      const result = scoreSkill(trimmed, queryTokens, item);
      if (!result) return null;
      const boost = result.score >= 0.9 ? 0 : historyBoost(result.skill, options.history);
      const score = Math.min(1, result.score + boost);
      return { ...result, score: Number(score.toFixed(4)) };
    })
    .filter((result): result is FindResult => result !== null && result.score >= threshold)
    .sort((a, b) => b.score - a.score || a.skill.localeCompare(b.skill))
    .slice(0, limit);
}

function resultToCapability(result: FindResult): Capability {
  return {
    id: `builtin:${result.skill}`,
    kind: 'skill',
    name: result.skill,
    description: result.description,
    origin: 'builtin',
    status: 'installed',
    compatibility: ['universal'],
    tags: [result.category, ...tokens(result.skill)],
    exampleQueries: [],
    category: result.category,
    scenario: result.reason,
  };
}

function toMatchResult(result: FindResult): MatchResult {
  return {
    capability: resultToCapability(result),
    score: result.score,
    layer: 'tag',
    confidence: result.score >= 0.8 ? 'high' : result.score >= 0.6 ? 'medium' : 'low',
    explanation: result.reason,
  };
}

export async function match(query: string, options: MatchOptions): Promise<Recommendation> {
  const results = find(query, {
    graph: options.graph,
    limit: 5,
    threshold: 0.3,
    history: options.history,
  });
  return {
    matches: results.map(toMatchResult),
    comparisons: [],
    compositions: [],
    upgrades: [],
    external: [],
    warnings: options.graph.getNodeCount() === 0 ? ['Graph is empty; using built-in knowledge.'] : [],
  };
}
