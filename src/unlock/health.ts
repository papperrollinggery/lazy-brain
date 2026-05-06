import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Graph } from '../graph/graph.js';
import type { UserConfig } from '../types.js';
import { GRAPH_PATH, LAZYBRAIN_DIR, STATUS_PATH } from '../constants.js';
import { getEmbeddingCacheStatus } from '../embeddings/cache.js';

export interface UnlockHealth {
  lastScanAt?: string;
  lastCompileAt?: string;
  lastEmbeddingAt?: string;
  activeNodes: number;
  embeddedNodes: number;
  missingEmbeddings: number;
  embeddingCoveragePercent: number;
  recentNewCapabilities: string[];
  scanState?: string;
  compileState?: string;
  embeddingState: string;
}

export interface ModelHealth {
  compile: { configured: boolean; model?: string; apiBase?: string };
  secretary: { configured: boolean; model?: string; apiBase?: string };
  embedding: { configured: boolean; model?: string; apiBase?: string; dim?: number | null; coveragePercent: number };
}

function readJson(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isoFromMs(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? new Date(value).toISOString()
    : typeof value === 'string'
      ? value
      : undefined;
}

function publicBase(apiBase?: string): string | undefined {
  return apiBase?.replace(/\/$/, '').replace(/\/v\d+.*$/, '/v*');
}

function graphCompiledAt(): string | undefined {
  const raw = readJson(GRAPH_PATH);
  if (typeof raw?.compiledAt === 'string') return raw.compiledAt;
  try {
    return statSync(GRAPH_PATH).mtime.toISOString();
  } catch {
    return undefined;
  }
}

export function buildUnlockHealth(graph: Graph): UnlockHealth {
  const nodes = graph.getAllNodes();
  const activeById = new Map(nodes.filter(node => node.status !== 'disabled').map(node => [node.id, node]));
  const embedding = getEmbeddingCacheStatus(nodes);
  const status = readJson(STATUS_PATH);
  const scanCachePath = join(LAZYBRAIN_DIR, 'scan-cache.json');
  const missingNames = embedding.missingIds
    .map(id => activeById.get(id)?.name)
    .filter((name): name is string => Boolean(name))
    .slice(0, 10);
  const statusNew = Array.isArray(status?.newCapabilities)
    ? status.newCapabilities.filter((name): name is string => typeof name === 'string').slice(0, 10)
    : [];
  const scanState = typeof status?.state === 'string' && status.state === 'scanning' ? status.state : undefined;
  const compileState = typeof status?.state === 'string' && status.state === 'compiling' ? status.state : undefined;
  let lastScanAt = isoFromMs(status?.lastScanAt);
  if (!lastScanAt && existsSync(scanCachePath)) {
    try { lastScanAt = statSync(scanCachePath).mtime.toISOString(); } catch {}
  }

  return {
    lastScanAt,
    lastCompileAt: isoFromMs(status?.lastCompileAt) ?? graphCompiledAt(),
    lastEmbeddingAt: embedding.updatedAt,
    activeNodes: embedding.active,
    embeddedNodes: embedding.covered,
    missingEmbeddings: embedding.missingIds.length,
    embeddingCoveragePercent: embedding.coveragePercent,
    recentNewCapabilities: missingNames.length > 0 ? missingNames : statusNew,
    scanState,
    compileState,
    embeddingState: embedding.state,
  };
}

export function buildModelHealth(config: UserConfig, graph: Graph): ModelHealth {
  const embedding = getEmbeddingCacheStatus(graph.getAllNodes());
  return {
    compile: {
      configured: Boolean(config.compileApiBase && config.compileApiKey && config.compileModel),
      model: config.compileModel,
      apiBase: publicBase(config.compileApiBase),
    },
    secretary: {
      configured: Boolean((config.secretaryApiBase ?? config.compileApiBase) && (config.secretaryApiKey ?? config.compileApiKey) && (config.secretaryModel ?? config.compileModel)),
      model: config.secretaryModel ?? config.compileModel,
      apiBase: publicBase(config.secretaryApiBase ?? config.compileApiBase),
    },
    embedding: {
      configured: Boolean(config.embeddingApiBase && config.embeddingApiKey && config.embeddingModel),
      model: config.embeddingModel,
      apiBase: publicBase(config.embeddingApiBase),
      dim: embedding.dim,
      coveragePercent: embedding.coveragePercent,
    },
  };
}
