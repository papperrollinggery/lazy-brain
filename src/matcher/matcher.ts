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
import { semanticMatch, mergeTagAndSemantic } from './semantic-layer.js';

export interface MatchOptions {
  graph: Graph;
  config: UserConfig;
  history?: HistoryEntry[];
  embeddingProvider?: EmbeddingProvider;
}

/**
 * Full matching pipeline: alias → tag → (embedding) → graph enrichment.
 */
export async function match(
  query: string,
  options: MatchOptions,
): Promise<Recommendation> {
  const { graph, config, history, embeddingProvider } = options;
  const allNodes = graph.getAllNodes();
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
    return buildRecommendation([aliasResult], graph, platform);
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
      results = mergeTagAndSemantic(results, semanticResults);
    } else if (config.engine === 'embedding') {
      results = semanticResults.length > 0 ? semanticResults : results;
    }
  }

  // ─── History boost (after merge, so boost survives embedding path) ────
  if (history && history.length > 0) {
    results = applyHistoryBoost(results, history);
  }

  // ─── Build enriched recommendation via graph traversal ────────────────
  return buildRecommendation(results, graph, platform);
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

// ─── Graph Enrichment ─────────────────────────────────────────────────────

function buildRecommendation(
  matches: MatchResult[],
  graph: Graph,
  platform?: Platform,
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

  return {
    matches,
    comparisons,
    compositions,
    upgrades,
    external: external.slice(0, 3),
  };
}
