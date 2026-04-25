import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  EMBEDDINGS_BIN_PATH,
  EMBEDDINGS_INDEX_PATH,
  EMBEDDINGS_LOCK_PATH,
  EMBEDDINGS_STATUS_PATH,
} from '../constants.js';
import type { Capability, UserConfig } from '../types.js';
import { embedTexts, getEmbeddingProviderConfig } from './provider.js';
import { getEmbeddingCacheStatus, type EmbeddingCacheStatus } from './cache.js';

export interface EmbeddingRebuildResult {
  ok: boolean;
  indexed: number;
  dim: number;
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

function writeAtomic(indexIds: string[], vectors: number[][]): void {
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
  }, null, 2), 'utf-8');
  renameSync(indexTmp, EMBEDDINGS_INDEX_PATH);
  renameSync(binTmp, EMBEDDINGS_BIN_PATH);
  renameSync(statusTmp, EMBEDDINGS_STATUS_PATH);
}

export async function rebuildEmbeddingCache(
  nodes: Capability[],
  config: UserConfig,
  options: { batchSize?: number } = {},
): Promise<EmbeddingRebuildResult> {
  if (!acquireLock()) {
    const status = getEmbeddingCacheStatus(nodes);
    return { ok: false, indexed: status.indexed, dim: status.dim ?? 0, status, error: 'embedding rebuild is already running' };
  }

  try {
    const active = nodes.filter(node => node.status !== 'disabled');
    if (active.length === 0) {
      const status = getEmbeddingCacheStatus(nodes);
      return { ok: false, indexed: 0, dim: 0, status, error: 'graph has no active capabilities' };
    }

    const batchSize = Math.max(1, Math.min(options.batchSize ?? 32, 128));
    const vectors: number[][] = [];
    const ids: string[] = [];
    const provider = getEmbeddingProviderConfig(config);

    for (let i = 0; i < active.length; i += batchSize) {
      const batch = active.slice(i, i + batchSize);
      const embedded = await embedTexts(batch.map(capabilityText), provider);
      vectors.push(...embedded);
      ids.push(...batch.map(cap => cap.id));
    }

    writeAtomic(ids, vectors);
    const status = getEmbeddingCacheStatus(nodes);
    return { ok: true, indexed: ids.length, dim: vectors[0]?.length ?? 0, status };
  } catch (err) {
    const status = getEmbeddingCacheStatus(nodes);
    return {
      ok: false,
      indexed: status.indexed,
      dim: status.dim ?? 0,
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
