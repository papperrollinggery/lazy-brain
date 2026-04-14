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
} from '../types.js';
import { MAX_RESULTS, HISTORY_BOOST_CAP } from '../constants.js';
import { Graph } from '../graph/graph.js';
import { tagMatch } from './tag-layer.js';

export interface MatchOptions {
  graph: Graph;
  config: UserConfig;
  history?: HistoryEntry[];
}

/**
 * Full matching pipeline: alias → tag → (embedding) → graph enrichment.
 */
export function match(query: string, options: MatchOptions): Recommendation {
  const { graph, config, history } = options;
  const allNodes = graph.getAllNodes();
  const platform = config.platform;

  // ─── Layer 0: Alias exact match ───────────────────────────────────────
  const aliasResult = matchAlias(query, config.aliases, allNodes);
  if (aliasResult) {
    return buildRecommendation([aliasResult], graph, platform);
  }

  // ─── Layer 1: Tag + example query match ───────────────────────────────
  let results = tagMatch(query, allNodes, platform, MAX_RESULTS);

  // ─── History boost ────────────────────────────────────────────────────
  if (history && history.length > 0) {
    results = applyHistoryBoost(results, history);
  }

  // ─── Layer 2: Embedding fallback (if enabled and tag results weak) ────
  // TODO: implement when embedding module is added
  // if (config.engine === 'embedding' || config.engine === 'hybrid') {
  //   if (results.length === 0 || results[0].score < 0.5) {
  //     const embeddingResults = semanticMatch(query, allNodes, platform);
  //     results = mergeResults(results, embeddingResults);
  //   }
  // }

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
  // Count accepted matches per capability
  const freq: Record<string, number> = {};
  for (const entry of history) {
    if (entry.accepted) {
      freq[entry.matched] = (freq[entry.matched] ?? 0) + 1;
    }
  }

  const maxFreq = Math.max(1, ...Object.values(freq));

  return results.map(r => {
    const f = freq[r.capability.name] ?? 0;
    const boost = (f / maxFreq) * HISTORY_BOOST_CAP;
    return {
      ...r,
      score: Math.min(1, r.score + boost),
    };
  }).sort((a, b) => b.score - a.score);
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
