/**
 * LazyBrain — Matcher (Multi-Layer Orchestrator)
 *
 * Orchestrates matching across layers:
 *   Layer 0: Alias exact match
 *   Layer 1: Tag + example query match (primary)
 *   Layer 2: Embedding cosine similarity (optional fallback)
 *   Layer 3: LLM real-time rerank (optional, paid)
 *
 * Then enriches results via graph traversal.
 */

import type {
  Capability,
  MatchResult,
  Recommendation,
  UserConfig,
  Platform,
  HistoryEntry,
  EmbeddingProvider,
} from '../types.js';
import { MAX_RESULTS, HISTORY_BOOST_CAP } from '../constants.js';
import { Graph } from '../graph/graph.js';
import { tagMatch } from './tag-layer.js';
import { semanticMatch, mergeTagAndSemantic, reciprocalRankFusion } from './semantic-layer.js';

/**
 * Language/framework keywords that make a capability specialized.
 * When the top result is lang-specialized on a generic query, it is demoted
 * below non-specialized candidates in the post-merge step.
 */
const LANG_KEYWORDS = new Set([
  'cpp', 'c++', 'c#', 'kotlin', 'python', 'go', 'golang', 'rust',
  'flutter', 'dart', 'swift', 'java', 'ruby', 'php', 'scala',
  'django', 'spring', 'springboot', 'laravel', 'rails', 'react', 'vue',
  'angular', 'svelte', 'nextjs', 'nuxt', 'fastapi', 'flask', 'express',
  'kubernetes', 'docker', 'terraform', 'android', 'ios', 'macos', 'windows',
  'linux', 'webassembly', 'wasm', 'solidity', 'blockchain', 'mcp',
  'postgres', 'mysql', 'mongodb', 'redis', 'clickhouse',
  'gradle', 'maven', 'webpack', 'vite', 'bun', 'deno',
  'nestjs', 'pytorch', 'wechat', 'supabase', 'planetscale',
]);

/**
 * Check if a capability is language/framework-specialized.
 * Returns the matching language keyword, or undefined if generic.
 */
function getLangSpecialty(cap: Capability): string | undefined {
  const nameLower = cap.name.toLowerCase();
  const tagsLower = cap.tags.map(t => t.toLowerCase());
  for (const kw of LANG_KEYWORDS) {
    if (nameLower.includes(kw) || tagsLower.some(t => t.includes(kw))) return kw;
  }
  return undefined;
}

export interface MatchOptions {
  graph: Graph;
  config: UserConfig;
  history?: HistoryEntry[];
  embeddingProvider?: EmbeddingProvider;
  profile?: import('../types.js').UserProfile;
}

/**
 * Full matching pipeline: alias → tag → (embedding) → graph enrichment.
 */
export async function match(
  query: string,
  options: MatchOptions,
): Promise<Recommendation> {
  const { graph, config, history, embeddingProvider, profile } = options;
  const allNodes = graph.getAllNodes().filter(n => n.status !== 'disabled');
  const platform = config.platform;

  // Empty graph check
  if (allNodes.length === 0) {
    return {
      matches: [],
      comparisons: [],
      compositions: [],
      upgrades: [],
      external: [],
      warnings: ['Graph is empty. Run `lazybrain scan && lazybrain compile` first.'],
    };
  }

  // ─── Layer 0: Alias exact match ───────────────────────────────────────
  const aliasResult = matchAlias(query, config.aliases, allNodes);
  if (aliasResult) {
    return buildRecommendation([aliasResult], graph, platform, history);
  }

  // ─── Layer 1: Tag + example query match ───────────────────────────────
  // Prefer tier 0+1 (current platform + universal), fallback to tier 2
  const primaryNodes = allNodes.filter(n => n.tier === undefined || n.tier <= 1);
  let results = tagMatch(query, primaryNodes, platform, MAX_RESULTS);

  // Fallback: if < 3 results, search tier 2 as well
  if (results.length < 3) {
    const tier2Nodes = allNodes.filter(n => n.tier === 2);
    if (tier2Nodes.length > 0) {
      const tier2Results = tagMatch(query, tier2Nodes, platform, MAX_RESULTS);
      // Mark tier 2 results with lower confidence
      for (const r of tier2Results) {
        r.confidence = 'low';
      }
      results = [...results, ...tier2Results].slice(0, MAX_RESULTS);
    }
  }

  // ─── Layer 2: Embedding (if enabled) ─────────────────────────────────
  if (
    (config.engine === 'embedding' || config.engine === 'hybrid') &&
    embeddingProvider
  ) {
    const semanticResults = await semanticMatch(query, allNodes, {
      provider: embeddingProvider,
      topK: MAX_RESULTS,
    });

    if (config.engine === 'hybrid' && semanticResults.length > 0) {
      results = reciprocalRankFusion(results, semanticResults);
    } else if (config.engine === 'embedding') {
      results = semanticResults.length > 0 ? semanticResults : results;
    }
  }

  // ─── Post-merge lang-specialty penalty ─────────────────────────────────
  // If the top result is a language/framework-specialized cap and the second
  // is generic, demote it to just below the second candidate.  This corrects
  // cases where a framework-specific cap scores slightly above a generic one
  // due to example-query inflation but the query itself has no lang hint.
  if (results.length >= 2) {
    const topSpec = getLangSpecialty(results[0].capability);
    const secondSpec = getLangSpecialty(results[1].capability);
    if (topSpec && !secondSpec) {
      const secondScore = results[1].score;
      results[0] = { ...results[0], score: Math.max(0.01, secondScore - 0.01) };
      results.sort((a, b) => b.score - a.score);
    }
  }

  // ─── History boost (after merge, so boost survives embedding path) ────
  if (history && history.length > 0) {
    results = applyHistoryBoost(results, history);
  }

  // ─── Correction penalty ──────────────────────────────────────────────
  if (profile?.corrections && profile.corrections.length > 0) {
    results = applyCorrectionPenalty(results, profile.corrections);
  }

  // ─── Build enriched recommendation via graph traversal ────────────────
  const sessionId = process.env.CLAUDE_SESSION_ID ?? 'unknown';
  return buildRecommendation(results, graph, platform, history, sessionId);
}

// ─── Alias Matching ───────────────────────────────────────────────────────

function matchAlias(
  query: string,
  aliases: Record<string, string>,
  allNodes: Capability[],
): MatchResult | null {
  const lower = query.toLowerCase().trim();

  for (const [alias, targetName] of Object.entries(aliases)) {
    if (lower.includes(alias.toLowerCase())) {
      const cap = allNodes.find(n => n.name === targetName);
      if (cap) {
        return { capability: cap, score: 1.0, layer: 'alias', confidence: 'high' };
      }
    }
  }
  return null;
}

// ─── History Boost ────────────────────────────────────────────────────────

function applyHistoryBoost(
  results: MatchResult[],
  history: HistoryEntry[],
): MatchResult[] {
  // Count accepted matches per capability (prefer id over name for stability)
  const freq: Record<string, number> = {};
  for (const entry of history) {
    if (entry.accepted) {
      // Use id if available, fall back to matched (name)
      const key = entry.id ?? entry.matched;
      freq[key] = (freq[key] ?? 0) + 1;
    }
  }

  const maxFreq = Math.max(1, ...Object.values(freq));

  const boosted = results.map(r => {
    const f = freq[r.capability.id] ?? freq[r.capability.name] ?? 0;
    if (f === 0) return r;

    const boost = HISTORY_BOOST_CAP * (f / maxFreq);
    return {
      ...r,
      score: Math.min(1, r.score + boost),
      historyBoost: boost,
    };
  });

  return boosted.sort((a, b) => b.score - a.score);
}

/** 对被拒工具降权 0.8x（基于纠正信号） */
const CORRECTION_PENALTY = 0.8;

function applyCorrectionPenalty(
  results: MatchResult[],
  corrections: import('../types.js').CorrectionSignal[],
): MatchResult[] {
  const rejectedTools = new Set<string>();
  for (const c of corrections) {
    if (c.count >= 3) rejectedTools.add(c.rejected);
  }

  if (rejectedTools.size === 0) return results;

  return results.map(r => {
    const name = r.capability.name;
    const id = r.capability.id;
    if (rejectedTools.has(name) || rejectedTools.has(id)) {
      return { ...r, score: r.score * CORRECTION_PENALTY };
    }
    return r;
  });
}

// ─── Graph Enrichment ─────────────────────────────────────────────────────

function buildRecommendation(
  matches: MatchResult[],
  graph: Graph,
  platform?: Platform,
  history?: HistoryEntry[],
  sessionId?: string,
): Recommendation {
  const comparisons: Recommendation['comparisons'] = [];
  const compositions: Recommendation['compositions'] = [];
  const upgrades: Recommendation['upgrades'] = [];
  const external: MatchResult[] = [];

  for (const m of matches) {
    const nodeId = m.capability.id;

    // Find similar capabilities with diff
    const similarLinks = graph.getLinksByType(nodeId, 'similar_to');
    for (const link of similarLinks) {
      const other = graph.getNode(link.target);
      if (!other) continue;
      if (platform && !other.compatibility.includes(platform) && !other.compatibility.includes('universal')) continue;
      comparisons.push({
        a: m.capability,
        b: other,
        diff: link.diff ?? link.description ?? '',
      });
    }

    // Find composable capabilities
    const composeLinks = graph.getLinksByType(nodeId, 'composes_with');
    if (composeLinks.length > 0) {
      const companions = composeLinks
        .map(l => graph.getNode(l.target))
        .filter((n): n is Capability => n !== undefined);
      if (companions.length > 0) {
        compositions.push({
          capabilities: [m.capability, ...companions],
          reason: composeLinks[0].description ?? 'Recommended combination',
        });
      }
    }

    // Find version upgrades
    const supersedesLinks = graph.getLinksByType(nodeId, 'supersedes');
    for (const link of supersedesLinks) {
      const newer = graph.getNode(link.target);
      if (newer) {
        upgrades.push({ old: m.capability, new: newer });
      }
    }
  }

  // Collect external (available but not installed) from graph traversal
  const matchIds = matches.map(m => m.capability.id);
  if (matchIds.length > 0) {
    const { nodeIds } = graph.bfs(matchIds, 2);
    for (const nid of nodeIds) {
      if (matchIds.includes(nid)) continue;
      const node = graph.getNode(nid);
      if (node?.status === 'available') {
        external.push({
          capability: node,
          score: 0.5,
          layer: 'tag',
          confidence: 'low',
        });
      }
    }
  }

  // ─── Next steps prediction (from current session) ───────────────────
  const nextSteps = getNextSteps(matches, history, sessionId);

  return {
    matches,
    comparisons,
    compositions,
    upgrades,
    external: external.slice(0, 3),
    ...(nextSteps.length > 0 ? { nextSteps } : {}),
  };
}

function getNextSteps(matches: MatchResult[], history?: HistoryEntry[], sessionId?: string): string[] {
  if (!history || history.length === 0 || !sessionId) return [];
  if (matches.length === 0) return [];

  const topTool = matches[0].capability.name;
  const sessionHistory = history
    .filter(e => e.sessionId === sessionId && e.accepted)
    .map(e => e.matched);

  if (sessionHistory.length === 0) return [];

  // Find where topTool appears and get the next tool in sequence
  for (let i = 0; i < sessionHistory.length - 1; i++) {
    if (sessionHistory[i] === topTool) {
      return sessionHistory.slice(i + 1, i + 3);
    }
  }

  return [];
}
