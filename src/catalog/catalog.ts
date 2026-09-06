import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { delimiter, resolve } from 'node:path';
import type { Capability, Platform, RawCapability } from '../types.js';
import { Graph } from '../graph/graph.js';
import { scan, type ScanOptions } from '../scanner/scanner.js';
import { searchTerms } from '../matcher/terms.js';

export interface CatalogSnapshot {
  graph: Graph;
  scannedAt: string;
  cwd: string;
  platform: Platform;
  scannedFiles: number;
  errors: string[];
  cached: boolean;
}

export interface CatalogOptions extends ScanOptions {
  refresh?: boolean;
}

const CACHE_TTL_MS = 15_000;
const snapshots = new Map<string, { expires: number; snapshot: CatalogSnapshot }>();

export function rawToCapability(raw: RawCapability): Capability {
  const identity = [raw.kind, raw.origin, raw.filePath, raw.name].join('\0');
  return {
    ...raw,
    id: createHash('sha256').update(identity).digest('hex').slice(0, 20),
    status: raw.disabled ? 'disabled' : raw.discovery === 'catalog-entry' ? 'available' : 'installed',
    discovery: raw.discovery ?? 'local-file',
    tags: [...searchTerms(raw.name)],
    exampleQueries: raw.triggers ?? [],
    category: raw.kind,
  };
}

export function readCatalog(options: CatalogOptions = {}): CatalogSnapshot {
  if (process.env.LAZYBRAIN_SCAN_PATHS && options.includeDefaults !== false && !options.extraPaths) {
    options = { ...options, includeDefaults: false, extraPaths: process.env.LAZYBRAIN_SCAN_PATHS.split(delimiter).filter(Boolean) };
  }
  const cwd = resolve(options.cwd ?? process.cwd());
  const platform = options.platform ?? 'codex';
  // Isolated/custom scans never reuse a user-scope snapshot.
  const canCache = options.includeDefaults !== false && !options.extraPaths && !options.sources && !options.platforms;
  const key = JSON.stringify([cwd, platform, homedir(), process.env.CODEX_HOME, process.env.CLAUDE_CONFIG_DIR]);
  const existing = canCache ? snapshots.get(key) : undefined;
  if (!options.refresh && existing && existing.expires > Date.now()) {
    return { ...existing.snapshot, cached: true };
  }
  const result = scan({ ...options, cwd, platform });
  const graph = new Graph();
  for (const raw of result.capabilities) graph.addNode(rawToCapability(raw));
  const snapshot: CatalogSnapshot = {
    graph, cwd, platform, scannedAt: new Date().toISOString(),
    scannedFiles: result.scannedFiles, errors: result.errors, cached: false,
  };
  if (canCache) {
    if (snapshots.size >= 4) snapshots.delete(snapshots.keys().next().value!);
    snapshots.set(key, { expires: Date.now() + CACHE_TTL_MS, snapshot });
  }
  return snapshot;
}

export function catalogEvidence(snapshot: CatalogSnapshot) {
  return {
    source: 'local-metadata' as const,
    cwd: snapshot.cwd,
    platform: snapshot.platform,
    scannedAt: snapshot.scannedAt,
    cached: snapshot.cached,
    maxCacheAgeSeconds: CACHE_TTL_MS / 1000,
    total: snapshot.graph.getNodeCount(),
    scanErrors: snapshot.errors,
    callableVerified: false as const,
  };
}
