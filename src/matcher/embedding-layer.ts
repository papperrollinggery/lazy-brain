import { existsSync, readFileSync } from 'node:fs';
import { EMBEDDINGS_BIN_PATH, EMBEDDINGS_INDEX_PATH } from '../constants.js';
import type { Capability, MatchResult, Platform, UserConfig } from '../types.js';

type EmbeddingSearchResult = {
  results: MatchResult[];
  warnings: string[];
};

type EmbeddingResponse = {
  data?: Array<{ embedding?: number[] }>;
};

function platformCompatible(cap: Capability, platform?: Platform): boolean {
  return !platform || cap.compatibility.includes(platform) || cap.compatibility.includes('universal');
}

function dotProduct(a: number[], matrix: Float32Array, offset: number, dim: number): number {
  let dot = 0;
  let aNorm = 0;
  let bNorm = 0;
  for (let i = 0; i < dim; i++) {
    const av = a[i] ?? 0;
    const bv = matrix[offset + i] ?? 0;
    dot += av * bv;
    aNorm += av * av;
    bNorm += bv * bv;
  }
  if (aNorm === 0 || bNorm === 0) return 0;
  return dot / (Math.sqrt(aNorm) * Math.sqrt(bNorm));
}

async function embedQuery(query: string, config: UserConfig): Promise<number[]> {
  const apiBase = config.embeddingApiBase?.replace(/\/$/, '');
  if (!apiBase || !config.embeddingApiKey || !config.embeddingModel) {
    throw new Error('embedding API is not configured');
  }

  const res = await fetch(`${apiBase}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.embeddingApiKey}`,
    },
    body: JSON.stringify({
      model: config.embeddingModel,
      input: query,
    }),
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) {
    throw new Error(`embedding API failed: ${res.status}`);
  }
  const json = await res.json() as EmbeddingResponse;
  const embedding = json.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error('embedding API returned no vector');
  }
  return embedding;
}

function readEmbeddingIndex(): string[] {
  const raw = JSON.parse(readFileSync(EMBEDDINGS_INDEX_PATH, 'utf-8')) as unknown;
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
}

export async function semanticMatch(
  query: string,
  nodes: Capability[],
  config: UserConfig,
  platform?: Platform,
  maxResults = 5,
): Promise<EmbeddingSearchResult> {
  const warnings: string[] = [];
  if (!existsSync(EMBEDDINGS_INDEX_PATH) || !existsSync(EMBEDDINGS_BIN_PATH)) {
    return { results: [], warnings: ['Semantic engine requested but embedding cache is missing. Run compile after embedding support is configured.'] };
  }

  let ids: string[];
  try {
    ids = readEmbeddingIndex();
  } catch {
    return { results: [], warnings: ['Semantic engine requested but embedding index is unreadable.'] };
  }
  if (ids.length === 0) return { results: [], warnings: ['Semantic engine requested but embedding index is empty.'] };

  const activeNodeIds = new Set(nodes.map((n) => n.id));
  const covered = ids.filter((id) => activeNodeIds.has(id)).length;
  if (covered / Math.max(1, activeNodeIds.size) < 0.8) {
    return {
      results: [],
      warnings: [`Semantic engine requested but embedding cache is stale (${covered}/${activeNodeIds.size} active nodes covered).`],
    };
  }

  const bin = readFileSync(EMBEDDINGS_BIN_PATH);
  const dim = bin.byteLength / Float32Array.BYTES_PER_ELEMENT / ids.length;
  if (!Number.isInteger(dim) || dim <= 0) {
    return { results: [], warnings: ['Semantic engine requested but embedding binary has invalid dimensions.'] };
  }
  const arrayBuffer = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
  const matrix = new Float32Array(arrayBuffer);

  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedQuery(query, config);
  } catch (err) {
    return { results: [], warnings: [err instanceof Error ? err.message : String(err)] };
  }
  if (queryEmbedding.length !== dim) {
    return {
      results: [],
      warnings: [`Semantic engine vector dimension mismatch: query=${queryEmbedding.length}, cache=${dim}.`],
    };
  }

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const results: MatchResult[] = [];
  for (let i = 0; i < ids.length; i++) {
    const cap = byId.get(ids[i]);
    if (!cap || cap.status === 'disabled' || !platformCompatible(cap, platform)) continue;
    const cosine = dotProduct(queryEmbedding, matrix, i * dim, dim);
    if (cosine < 0.25) continue;
    const score = Math.max(0, Math.min(1, (cosine + 1) / 2));
    results.push({
      capability: cap,
      score,
      layer: 'semantic',
      confidence: score >= 0.75 ? 'high' : score >= 0.55 ? 'medium' : 'low',
    });
  }

  return {
    results: results.sort((a, b) => b.score - a.score).slice(0, maxResults),
    warnings,
  };
}
