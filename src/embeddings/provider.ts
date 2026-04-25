import type { UserConfig } from '../types.js';

export interface EmbeddingProviderConfig {
  apiBase?: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
}

type EmbeddingResponse = {
  data?: Array<{ embedding?: number[] }>;
};

export function getEmbeddingProviderConfig(config: UserConfig): EmbeddingProviderConfig {
  return {
    apiBase: config.embeddingApiBase,
    apiKey: config.embeddingApiKey,
    model: config.embeddingModel,
    timeoutMs: 30_000,
  };
}

export async function embedTexts(input: string[], config: EmbeddingProviderConfig): Promise<number[][]> {
  const apiBase = config.apiBase?.replace(/\/$/, '');
  if (!apiBase || !config.apiKey || !config.model) {
    throw new Error('embedding API is not configured');
  }
  const res = await fetch(`${apiBase}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      input,
    }),
    signal: AbortSignal.timeout(config.timeoutMs ?? 30_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`embedding API failed: ${res.status}${text ? ` ${text.slice(0, 160)}` : ''}`);
  }
  const json = await res.json() as EmbeddingResponse;
  const vectors = json.data?.map(item => item.embedding).filter((v): v is number[] => Array.isArray(v)) ?? [];
  if (vectors.length !== input.length || vectors.some(v => v.length === 0)) {
    throw new Error(`embedding API returned ${vectors.length}/${input.length} vectors`);
  }
  const dim = vectors[0].length;
  if (vectors.some(v => v.length !== dim)) {
    throw new Error('embedding API returned inconsistent vector dimensions');
  }
  return vectors;
}
