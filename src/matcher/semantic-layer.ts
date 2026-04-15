/**
 * LazyBrain — Semantic Layer
 *
 * Embedding-based matching using cosine similarity.
 * Used as fallback when tag matching yields weak results.
 */

import type { Capability, MatchResult, EmbeddingProvider } from '../types.js';

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10);
}

export interface SemanticOptions {
  provider: EmbeddingProvider;
  topK?: number;
  threshold?: number;
}

export async function semanticMatch(
  query: string,
  capabilities: Capability[],
  options: SemanticOptions,
): Promise<MatchResult[]> {
  const { provider, topK = 10, threshold = 0.4 } = options;

  // Only match capabilities that have pre-computed embeddings
  const withEmbeddings = capabilities.filter(c => c.embedding && c.embedding.length > 0);
  if (withEmbeddings.length === 0) return [];

  const queryEmbedding = await provider.embed(query);

  const scored = withEmbeddings.map(cap => ({
    capability: cap,
    similarity: cosineSimilarity(queryEmbedding, cap.embedding!),
  }));

  const filtered = scored
    .filter((s) => s.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  return filtered.map((s) => ({
    capability: s.capability,
    score: s.similarity,
    layer: 'semantic' as const,
    confidence: s.similarity >= 0.7 ? 'high' : s.similarity >= 0.55 ? 'medium' : 'low',
  }));
}

export function mergeTagAndSemantic(
  tagResults: MatchResult[],
  semanticResults: MatchResult[],
  tagWeight = 0.6,
  semanticWeight = 0.4,
): MatchResult[] {
  const scoreMap = new Map<string, number>();
  const layerMap = new Map<string, MatchResult>();

  for (const r of tagResults) {
    scoreMap.set(r.capability.id, (scoreMap.get(r.capability.id) ?? 0) + r.score * tagWeight);
    layerMap.set(r.capability.id, r);
  }

  for (const r of semanticResults) {
    const existing = scoreMap.get(r.capability.id) ?? 0;
    scoreMap.set(r.capability.id, existing + r.score * semanticWeight);
    if (!layerMap.has(r.capability.id)) {
      layerMap.set(r.capability.id, r);
    }
  }

  const merged = Array.from(scoreMap.entries())
    .map(([id, score]) => ({
      capability: layerMap.get(id)!.capability,
      score: Math.min(1, score),
      layer: layerMap.get(id)!.layer,
      confidence: layerMap.get(id)!.confidence,
    }))
    .sort((a, b) => b.score - a.score);

  return merged;
}

/**
 * Reciprocal Rank Fusion — merges tag and semantic results by rank, not score.
 * Prevents score distribution mismatch between layers.
 * k=60 is the standard constant from the original RRF paper.
 */
export function reciprocalRankFusion(
  tagResults: MatchResult[],
  semanticResults: MatchResult[],
  k = 60,
): MatchResult[] {
  const scoreMap = new Map<string, number>();
  const capMap = new Map<string, MatchResult>();

  tagResults.forEach((r, i) => {
    const id = r.capability.id;
    scoreMap.set(id, (scoreMap.get(id) ?? 0) + 1 / (k + i + 1));
    capMap.set(id, r);
  });

  semanticResults.forEach((r, i) => {
    const id = r.capability.id;
    scoreMap.set(id, (scoreMap.get(id) ?? 0) + 1 / (k + i + 1));
    if (!capMap.has(id)) capMap.set(id, r);
  });

  const entries = Array.from(scoreMap.entries());
  const maxScore = Math.max(...entries.map(([, s]) => s));

  return entries
    .map(([id, score]) => ({
      ...capMap.get(id)!,
      score: maxScore > 0 ? score / maxScore : 0,
    }))
    .sort((a, b) => b.score - a.score);
}
