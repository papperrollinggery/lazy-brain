import { existsSync, readFileSync, statSync } from 'node:fs';
import { EMBEDDINGS_BIN_PATH, EMBEDDINGS_INDEX_PATH, EMBEDDINGS_STATUS_PATH } from '../constants.js';
import type { Capability } from '../types.js';

export type EmbeddingCacheState = 'missing' | 'ok' | 'stale' | 'invalid';

export interface EmbeddingCacheStatus {
  state: EmbeddingCacheState;
  indexExists: boolean;
  binExists: boolean;
  indexed: number;
  active: number;
  covered: number;
  coverage: number;
  dim: number | null;
  bytes: number;
  updatedAt?: string;
  message: string;
}

function readIndex(): string[] | null {
  try {
    const raw = JSON.parse(readFileSync(EMBEDDINGS_INDEX_PATH, 'utf-8')) as unknown;
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : null;
  } catch {
    return null;
  }
}

function readUpdatedAt(): string | undefined {
  if (existsSync(EMBEDDINGS_STATUS_PATH)) {
    try {
      const raw = JSON.parse(readFileSync(EMBEDDINGS_STATUS_PATH, 'utf-8')) as { updatedAt?: unknown };
      if (typeof raw.updatedAt === 'string') return raw.updatedAt;
    } catch {}
  }
  if (existsSync(EMBEDDINGS_BIN_PATH)) {
    try {
      return statSync(EMBEDDINGS_BIN_PATH).mtime.toISOString();
    } catch {}
  }
  return undefined;
}

export function getEmbeddingCacheStatus(nodes: Capability[], staleThreshold = 0.8): EmbeddingCacheStatus {
  const indexExists = existsSync(EMBEDDINGS_INDEX_PATH);
  const binExists = existsSync(EMBEDDINGS_BIN_PATH);
  const activeIds = new Set(nodes.filter(n => n.status !== 'disabled').map(n => n.id));
  const active = activeIds.size;

  if (!indexExists || !binExists) {
    return {
      state: 'missing',
      indexExists,
      binExists,
      indexed: 0,
      active,
      covered: 0,
      coverage: 0,
      dim: null,
      bytes: 0,
      updatedAt: readUpdatedAt(),
      message: 'Embedding cache is missing.',
    };
  }

  const ids = readIndex();
  if (!ids) {
    return {
      state: 'invalid',
      indexExists,
      binExists,
      indexed: 0,
      active,
      covered: 0,
      coverage: 0,
      dim: null,
      bytes: 0,
      updatedAt: readUpdatedAt(),
      message: 'Embedding index is unreadable.',
    };
  }

  let bytes = 0;
  try {
    bytes = statSync(EMBEDDINGS_BIN_PATH).size;
  } catch {
    return {
      state: 'invalid',
      indexExists,
      binExists,
      indexed: ids.length,
      active,
      covered: 0,
      coverage: 0,
      dim: null,
      bytes: 0,
      updatedAt: readUpdatedAt(),
      message: 'Embedding binary is unreadable.',
    };
  }

  const dim = ids.length > 0 ? bytes / Float32Array.BYTES_PER_ELEMENT / ids.length : 0;
  if (!Number.isInteger(dim) || dim <= 0) {
    return {
      state: 'invalid',
      indexExists,
      binExists,
      indexed: ids.length,
      active,
      covered: 0,
      coverage: 0,
      dim: null,
      bytes,
      updatedAt: readUpdatedAt(),
      message: 'Embedding binary has invalid dimensions.',
    };
  }

  const covered = ids.filter(id => activeIds.has(id)).length;
  const coverage = active > 0 ? covered / active : 1;
  const state: EmbeddingCacheState = coverage >= staleThreshold ? 'ok' : 'stale';
  return {
    state,
    indexExists,
    binExists,
    indexed: ids.length,
    active,
    covered,
    coverage,
    dim,
    bytes,
    updatedAt: readUpdatedAt(),
    message: state === 'ok'
      ? `Embedding cache covers ${covered}/${active} active capabilities.`
      : `Embedding cache is stale (${covered}/${active} active capabilities covered).`,
  };
}
