import { existsSync, readFileSync, statSync } from 'node:fs';
import { EMBEDDINGS_BIN_PATH, EMBEDDINGS_INDEX_PATH, EMBEDDINGS_STATUS_PATH } from '../constants.js';
import type { Capability } from '../types.js';

export type EmbeddingCacheState = 'missing' | 'ok' | 'stale' | 'invalid';
export type EmbeddingEntryStatus = 'fresh' | 'stale' | 'missing';

export interface EmbeddingCacheEntryMeta {
  contentHash?: string;
  provider?: string;
  model?: string;
  dim?: number;
  updatedAt?: string;
  status?: EmbeddingEntryStatus;
}

export interface EmbeddingStatusFile {
  updatedAt?: string;
  indexed?: number;
  dim?: number;
  provider?: string;
  model?: string;
  entries?: Record<string, EmbeddingCacheEntryMeta>;
}

export interface EmbeddingCacheStatus {
  state: EmbeddingCacheState;
  indexExists: boolean;
  binExists: boolean;
  indexed: number;
  active: number;
  covered: number;
  coverage: number;
  coveragePercent: number;
  missingIds: string[];
  dim: number | null;
  bytes: number;
  provider?: string;
  model?: string;
  updatedAt?: string;
  message: string;
}

export function readEmbeddingStatusFile(): EmbeddingStatusFile | null {
  if (!existsSync(EMBEDDINGS_STATUS_PATH)) return null;
  try {
    const raw = JSON.parse(readFileSync(EMBEDDINGS_STATUS_PATH, 'utf-8')) as EmbeddingStatusFile;
    return raw && typeof raw === 'object' ? raw : null;
  } catch {
    return null;
  }
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
  const status = readEmbeddingStatusFile();
  if (typeof status?.updatedAt === 'string') return status.updatedAt;
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
  const statusFile = readEmbeddingStatusFile();
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
      coveragePercent: 0,
      missingIds: [...activeIds],
      dim: null,
      bytes: 0,
      provider: statusFile?.provider,
      model: statusFile?.model,
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
      coveragePercent: 0,
      missingIds: [...activeIds],
      dim: null,
      bytes: 0,
      provider: statusFile?.provider,
      model: statusFile?.model,
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
      coveragePercent: 0,
      missingIds: [...activeIds],
      dim: null,
      bytes: 0,
      provider: statusFile?.provider,
      model: statusFile?.model,
      updatedAt: readUpdatedAt(),
      message: 'Embedding binary is unreadable.',
    };
  }

  if (ids.length === 0) {
    const coverage = active > 0 ? 0 : 1;
    const state: EmbeddingCacheState = active > 0 ? 'stale' : 'ok';
    return {
      state,
      indexExists,
      binExists,
      indexed: 0,
      active,
      covered: 0,
      coverage,
      coveragePercent: Math.round(coverage * 100),
      missingIds: [...activeIds],
      dim: statusFile?.dim && statusFile.dim > 0 ? statusFile.dim : null,
      bytes,
      provider: statusFile?.provider,
      model: statusFile?.model,
      updatedAt: readUpdatedAt(),
      message: active === 0
        ? 'Embedding cache is empty because there are no active capabilities.'
        : `Embedding cache is stale (0/${active} active capabilities covered).`,
    };
  }

  const dim = bytes / Float32Array.BYTES_PER_ELEMENT / ids.length;
  if (!Number.isInteger(dim) || dim <= 0) {
    return {
      state: 'invalid',
      indexExists,
      binExists,
      indexed: ids.length,
      active,
      covered: 0,
      coverage: 0,
      coveragePercent: 0,
      missingIds: [...activeIds],
      dim: null,
      bytes,
      provider: statusFile?.provider,
      model: statusFile?.model,
      updatedAt: readUpdatedAt(),
      message: 'Embedding binary has invalid dimensions.',
    };
  }

  const covered = ids.filter(id => activeIds.has(id)).length;
  const idSet = new Set(ids);
  const missingIds = [...activeIds].filter(id => !idSet.has(id));
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
    coveragePercent: Math.round(coverage * 100),
    missingIds,
    dim,
    bytes,
    provider: statusFile?.provider,
    model: statusFile?.model,
    updatedAt: readUpdatedAt(),
    message: state === 'ok'
      ? `Embedding cache covers ${covered}/${active} active capabilities.`
      : `Embedding cache is stale (${covered}/${active} active capabilities covered).`,
  };
}
