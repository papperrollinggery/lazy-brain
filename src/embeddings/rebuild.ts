import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  EMBEDDINGS_BIN_PATH,
  EMBEDDINGS_INDEX_PATH,
  EMBEDDINGS_LOCK_PATH,
  EMBEDDINGS_STATUS_PATH,
} from '../constants.js';
import type { Capability, UserConfig } from '../types.js';
import { embedTexts, getEmbeddingProviderConfig } from './provider.js';
import {
  getEmbeddingCacheStatus,
  readEmbeddingStatusFile,
  type EmbeddingCacheEntryMeta,
  type EmbeddingCacheStatus,
} from './cache.js';

export interface EmbeddingRebuildResult {
  ok: boolean;
  indexed: number;
  dim: number;
  embedded: number;
  reused: number;
  removed: number;
  mode: 'incremental' | 'full';
  provider?: string;
  model?: string;
  status: EmbeddingCacheStatus;
  error?: string;
}

function capabilityText(cap: Capability): string {
  return [
    cap.name,
    cap.kind,
    cap.category,
    cap.description,
    cap.scenario ?? '',
    cap.tags.join(' '),
    cap.exampleQueries.join(' '),
  ].filter(Boolean).join('\n');
}

function capabilityContentHash(cap: Capability): string {
  return createHash('sha1').update(capabilityText(cap)).digest('hex');
}

function publicProvider(apiBase?: string): string | undefined {
  return apiBase?.replace(/\/$/, '').replace(/\/v\d+.*$/, '/v*');
}

function acquireLock(): boolean {
  try {
    mkdirSync(dirname(EMBEDDINGS_LOCK_PATH), { recursive: true });
    writeFileSync(EMBEDDINGS_LOCK_PATH, String(process.pid), { flag: 'wx' });
    return true;
  } catch {
    return false;
  }
}

function releaseLock(): void {
  try { rmSync(EMBEDDINGS_LOCK_PATH, { force: true }); } catch {}
}

function readIndex(): string[] {
  try {
    const raw = JSON.parse(readFileSync(EMBEDDINGS_INDEX_PATH, 'utf-8')) as unknown;
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function readExistingVectors(): { ids: string[]; dim: number; vectorsById: Map<string, number[]> } {
  if (!existsSync(EMBEDDINGS_INDEX_PATH) || !existsSync(EMBEDDINGS_BIN_PATH)) {
    return { ids: [], dim: 0, vectorsById: new Map() };
  }
  const ids = readIndex();
  if (ids.length === 0) return { ids: [], dim: 0, vectorsById: new Map() };
  const bin = readFileSync(EMBEDDINGS_BIN_PATH);
  const dim = bin.byteLength / Float32Array.BYTES_PER_ELEMENT / ids.length;
  if (!Number.isInteger(dim) || dim <= 0) return { ids: [], dim: 0, vectorsById: new Map() };
  const arrayBuffer = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
  const matrix = new Float32Array(arrayBuffer);
  const vectorsById = new Map<string, number[]>();
  for (let row = 0; row < ids.length; row++) {
    const start = row * dim;
    vectorsById.set(ids[row], Array.from(matrix.slice(start, start + dim)));
  }
  return { ids, dim, vectorsById };
}

function writeAtomic(
  indexIds: string[],
  vectors: number[][],
  metadata: {
    provider?: string;
    model?: string;
    entries: Record<string, EmbeddingCacheEntryMeta>;
  },
): void {
  const dim = vectors[0]?.length ?? 0;
  const flat = new Float32Array(indexIds.length * dim);
  for (let row = 0; row < vectors.length; row++) {
    flat.set(vectors[row], row * dim);
  }

  const indexTmp = `${EMBEDDINGS_INDEX_PATH}.tmp-${process.pid}`;
  const binTmp = `${EMBEDDINGS_BIN_PATH}.tmp-${process.pid}`;
  const statusTmp = `${EMBEDDINGS_STATUS_PATH}.tmp-${process.pid}`;
  mkdirSync(dirname(EMBEDDINGS_INDEX_PATH), { recursive: true });
  writeFileSync(indexTmp, JSON.stringify(indexIds, null, 2), 'utf-8');
  writeFileSync(binTmp, Buffer.from(flat.buffer));
  writeFileSync(statusTmp, JSON.stringify({
    updatedAt: new Date().toISOString(),
    indexed: indexIds.length,
    dim,
    provider: metadata.provider,
    model: metadata.model,
    entries: metadata.entries,
  }, null, 2), 'utf-8');
  renameSync(indexTmp, EMBEDDINGS_INDEX_PATH);
  renameSync(binTmp, EMBEDDINGS_BIN_PATH);
  renameSync(statusTmp, EMBEDDINGS_STATUS_PATH);
}

export async function rebuildEmbeddingCache(
  nodes: Capability[],
  config: UserConfig,
  options: { batchSize?: number; force?: boolean } = {},
): Promise<EmbeddingRebuildResult> {
  if (!acquireLock()) {
    const status = getEmbeddingCacheStatus(nodes);
    return { ok: false, indexed: status.indexed, dim: status.dim ?? 0, embedded: 0, reused: 0, removed: 0, mode: options.force ? 'full' : 'incremental', status, error: 'embedding rebuild is already running' };
  }

  try {
    const active = nodes.filter(node => node.status !== 'disabled');
    if (active.length === 0) {
      const provider = getEmbeddingProviderConfig(config);
      const providerName = publicProvider(provider.apiBase);
      const existing = options.force ? { ids: [], dim: 0, vectorsById: new Map<string, number[]>() } : readExistingVectors();
      writeAtomic([], [], { provider: providerName, model: provider.model, entries: {} });
      const status = getEmbeddingCacheStatus(nodes);
      return {
        ok: true,
        indexed: 0,
        dim: 0,
        embedded: 0,
        reused: 0,
        removed: existing.ids.length,
        mode: options.force ? 'full' : 'incremental',
        provider: providerName,
        model: provider.model,
        status,
      };
    }

    const batchSize = Math.max(1, Math.min(options.batchSize ?? 32, 128));
    const provider = getEmbeddingProviderConfig(config);
    const providerName = publicProvider(provider.apiBase);
    const model = provider.model;
    const existing = options.force ? { ids: [], dim: 0, vectorsById: new Map<string, number[]>() } : readExistingVectors();
    const existingStatus = options.force ? null : readEmbeddingStatusFile();
    const existingEntries = existingStatus?.entries ?? {};
    const activeIds = new Set(active.map(cap => cap.id));
    const removed = existing.ids.filter(id => !activeIds.has(id)).length;

    const planned = active.map(cap => {
      const contentHash = capabilityContentHash(cap);
      const entry = existingEntries[cap.id];
      const vector = existing.vectorsById.get(cap.id);
      const canReuse = Boolean(
        !options.force &&
        vector &&
        entry?.contentHash === contentHash &&
        entry?.provider === providerName &&
        entry?.model === model &&
        entry?.dim === existing.dim,
      );
      return { cap, contentHash, vector: canReuse ? vector : undefined };
    });

    const toEmbed = planned.filter(item => !item.vector);
    const embeddedById = new Map<string, number[]>();

    for (let i = 0; i < toEmbed.length; i += batchSize) {
      const batch = toEmbed.slice(i, i + batchSize);
      const embedded = await embedTexts(batch.map(item => capabilityText(item.cap)), provider);
      for (let j = 0; j < batch.length; j++) {
        embeddedById.set(batch[j].cap.id, embedded[j]);
      }
    }

    const vectors: number[][] = [];
    const ids: string[] = [];
    const entries: Record<string, EmbeddingCacheEntryMeta> = {};
    const now = new Date().toISOString();
    for (const item of planned) {
      const vector = item.vector ?? embeddedById.get(item.cap.id);
      if (!vector) throw new Error(`embedding vector missing for ${item.cap.id}`);
      vectors.push(vector);
      ids.push(item.cap.id);
      entries[item.cap.id] = {
        contentHash: item.contentHash,
        provider: providerName,
        model,
        dim: vector.length,
        updatedAt: item.vector ? existingEntries[item.cap.id]?.updatedAt ?? now : now,
        status: 'fresh',
      };
    }

    const dim = vectors[0]?.length ?? 0;
    if (dim <= 0 || vectors.some(vector => vector.length !== dim)) {
      throw new Error('embedding vectors have inconsistent dimensions');
    }

    writeAtomic(ids, vectors, { provider: providerName, model, entries });
    const status = getEmbeddingCacheStatus(nodes);
    return {
      ok: true,
      indexed: ids.length,
      dim,
      embedded: toEmbed.length,
      reused: planned.length - toEmbed.length,
      removed,
      mode: options.force ? 'full' : 'incremental',
      provider: providerName,
      model,
      status,
    };
  } catch (err) {
    const status = getEmbeddingCacheStatus(nodes);
    return {
      ok: false,
      indexed: status.indexed,
      dim: status.dim ?? 0,
      embedded: 0,
      reused: 0,
      removed: 0,
      mode: options.force ? 'full' : 'incremental',
      provider: status.provider,
      model: status.model,
      status,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    releaseLock();
    if (existsSync(`${EMBEDDINGS_INDEX_PATH}.tmp-${process.pid}`)) rmSync(`${EMBEDDINGS_INDEX_PATH}.tmp-${process.pid}`, { force: true });
    if (existsSync(`${EMBEDDINGS_BIN_PATH}.tmp-${process.pid}`)) rmSync(`${EMBEDDINGS_BIN_PATH}.tmp-${process.pid}`, { force: true });
    if (existsSync(`${EMBEDDINGS_STATUS_PATH}.tmp-${process.pid}`)) rmSync(`${EMBEDDINGS_STATUS_PATH}.tmp-${process.pid}`, { force: true });
  }
}
