/**
 * LazyBrain — API Embedding Provider
 *
 * OpenAI-compatible embedding API (SiliconFlow, OpenAI, etc.)
 * No local model download required.
 */

import type { EmbeddingProvider } from '../../types.js';

export interface ApiEmbeddingConfig {
  apiBase: string;
  apiKey: string;
  model: string;
}

export class ApiEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number;
  private config: ApiEmbeddingConfig;

  constructor(config: ApiEmbeddingConfig, dimensions = 1024) {
    this.config = config;
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    const results = await this.embedBatch([text]);
    return results[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const res = await fetch(`${this.config.apiBase}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        input: texts,
        encoding_format: 'float',
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Embedding API error ${res.status}: ${text}`);
    }

    const data = await res.json() as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    return data.data
      .sort((a, b) => a.index - b.index)
      .map(d => d.embedding);
  }
}

export function createEmbeddingProvider(config: ApiEmbeddingConfig): EmbeddingProvider {
  return new ApiEmbeddingProvider(config);
}
