import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Capability, UserConfig } from '../../src/types.js';

function cap(id: string, status: Capability['status'] = 'installed'): Capability {
  return {
    id,
    kind: 'skill',
    name: id,
    description: `${id} description`,
    origin: 'test',
    status,
    compatibility: ['universal'],
    tags: [id],
    exampleQueries: [id],
    category: 'test',
  };
}

async function importWithTempConstants(tempDir: string) {
  const indexPath = join(tempDir, 'graph.embeddings.index.json');
  const binPath = join(tempDir, 'graph.embeddings.bin');
  const statusPath = join(tempDir, 'graph.embeddings.status.json');
  const lockPath = join(tempDir, 'graph.embeddings.lock');

  vi.doMock('../../src/constants.js', async () => {
    const actual = await vi.importActual<any>('../../src/constants.js');
    return {
      ...actual,
      EMBEDDINGS_INDEX_PATH: indexPath,
      EMBEDDINGS_BIN_PATH: binPath,
      EMBEDDINGS_STATUS_PATH: statusPath,
      EMBEDDINGS_LOCK_PATH: lockPath,
    };
  });

  return {
    paths: { indexPath, binPath, statusPath, lockPath },
    cache: await import('../../src/embeddings/cache.js'),
    rebuild: await import('../../src/embeddings/rebuild.js'),
  };
}

describe('embedding cache status and rebuild', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'lazybrain-embeddings-'));
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('reports missing cache', async () => {
    const { cache } = await importWithTempConstants(tempDir);
    const status = cache.getEmbeddingCacheStatus([cap('a')]);

    expect(status.state).toBe('missing');
    expect(status.covered).toBe(0);
    expect(status.active).toBe(1);
  });

  it('marks cache stale below 80 percent coverage', async () => {
    const { paths, cache } = await importWithTempConstants(tempDir);
    mkdirSync(dirname(paths.indexPath), { recursive: true });
    writeFileSync(paths.indexPath, JSON.stringify(['a']), 'utf-8');
    writeFileSync(paths.binPath, Buffer.from(new Float32Array([1, 0]).buffer));

    const status = cache.getEmbeddingCacheStatus([cap('a'), cap('b')]);

    expect(status.state).toBe('stale');
    expect(status.covered).toBe(1);
    expect(status.active).toBe(2);
    expect(status.coveragePercent).toBe(50);
    expect(status.missingIds).toEqual(['b']);
  });

  it('treats an empty cache as ok when there are no active capabilities', async () => {
    const { paths, cache } = await importWithTempConstants(tempDir);
    mkdirSync(dirname(paths.indexPath), { recursive: true });
    writeFileSync(paths.indexPath, JSON.stringify([]), 'utf-8');
    writeFileSync(paths.binPath, Buffer.from(new Float32Array([]).buffer));
    writeFileSync(paths.statusPath, JSON.stringify({ indexed: 0, dim: 0 }), 'utf-8');

    const status = cache.getEmbeddingCacheStatus([cap('disabled', 'disabled')]);

    expect(status.state).toBe('ok');
    expect(status.active).toBe(0);
    expect(status.coveragePercent).toBe(100);
  });

  it('rebuilds with temp files and atomic final cache', async () => {
    vi.doMock('../../src/embeddings/provider.js', () => ({
      getEmbeddingProviderConfig: (config: UserConfig) => ({
        apiBase: config.embeddingApiBase,
        apiKey: config.embeddingApiKey,
        model: config.embeddingModel,
      }),
      embedTexts: vi.fn(async (texts: string[]) => texts.map((_, index) => [index + 1, 0])),
    }));
    const { paths, rebuild } = await importWithTempConstants(tempDir);

    const result = await rebuild.rebuildEmbeddingCache([cap('a'), cap('b')], {
      compileModel: 'x',
      aliases: {},
      scanPaths: [],
      mode: 'ask',
      autoThreshold: 0.85,
      engine: 'tag',
      strategy: 'ask',
      externalDiscovery: false,
      platform: 'claude-code',
      language: 'auto',
      embeddingApiBase: 'https://example.test/v1',
      embeddingApiKey: 'fake-key',
      embeddingModel: 'fake-model',
    });

    expect(result.ok).toBe(true);
    expect(result.indexed).toBe(2);
    expect(result.embedded).toBe(2);
    expect(result.reused).toBe(0);
    expect(JSON.parse(readFileSync(paths.indexPath, 'utf-8'))).toEqual(['a', 'b']);
    const statusFile = JSON.parse(readFileSync(paths.statusPath, 'utf-8')) as { entries?: Record<string, unknown>; provider?: string; model?: string };
    expect(statusFile.provider).toBe('https://example.test/v*');
    expect(statusFile.model).toBe('fake-model');
    expect(statusFile.entries).toHaveProperty('a');
    expect(existsSync(paths.lockPath)).toBe(false);
  });

  it('embeds only new or changed nodes during incremental rebuild', async () => {
    const embedTexts = vi.fn(async (texts: string[]) => texts.map((_, index) => [embedTexts.mock.calls.length, index + 1]));
    vi.doMock('../../src/embeddings/provider.js', () => ({
      getEmbeddingProviderConfig: (config: UserConfig) => ({
        apiBase: config.embeddingApiBase,
        apiKey: config.embeddingApiKey,
        model: config.embeddingModel,
      }),
      embedTexts,
    }));
    const { paths, rebuild } = await importWithTempConstants(tempDir);
    const config: UserConfig = {
      compileModel: 'x',
      aliases: {},
      scanPaths: [],
      mode: 'ask',
      autoThreshold: 0.85,
      engine: 'tag',
      strategy: 'ask',
      externalDiscovery: false,
      platform: 'claude-code',
      language: 'auto',
      embeddingApiBase: 'https://example.test/v1',
      embeddingApiKey: 'fake-key',
      embeddingModel: 'fake-model',
    };

    const first = await rebuild.rebuildEmbeddingCache([cap('a'), cap('b')], config);
    const second = await rebuild.rebuildEmbeddingCache([cap('a'), cap('b'), cap('c')], config);

    expect(first.embedded).toBe(2);
    expect(second.ok).toBe(true);
    expect(second.embedded).toBe(1);
    expect(second.reused).toBe(2);
    expect(second.removed).toBe(0);
    expect(JSON.parse(readFileSync(paths.indexPath, 'utf-8'))).toEqual(['a', 'b', 'c']);
    expect(embedTexts).toHaveBeenCalledTimes(2);
  });

  it('removes all vectors when every capability is disabled', async () => {
    const embedTexts = vi.fn(async (texts: string[]) => texts.map((_, index) => [index + 1, 0]));
    vi.doMock('../../src/embeddings/provider.js', () => ({
      getEmbeddingProviderConfig: (config: UserConfig) => ({
        apiBase: config.embeddingApiBase,
        apiKey: config.embeddingApiKey,
        model: config.embeddingModel,
      }),
      embedTexts,
    }));
    const { paths, rebuild } = await importWithTempConstants(tempDir);
    const config: UserConfig = {
      compileModel: 'x',
      aliases: {},
      scanPaths: [],
      mode: 'ask',
      autoThreshold: 0.85,
      engine: 'tag',
      strategy: 'ask',
      externalDiscovery: false,
      platform: 'claude-code',
      language: 'auto',
      embeddingApiBase: 'https://example.test/v1',
      embeddingApiKey: 'fake-key',
      embeddingModel: 'fake-model',
    };

    await rebuild.rebuildEmbeddingCache([cap('a'), cap('b')], config);
    const removed = await rebuild.rebuildEmbeddingCache([cap('a', 'disabled'), cap('b', 'disabled')], config);

    expect(removed.ok).toBe(true);
    expect(removed.removed).toBe(2);
    expect(removed.indexed).toBe(0);
    expect(removed.status.state).toBe('ok');
    expect(JSON.parse(readFileSync(paths.indexPath, 'utf-8'))).toEqual([]);
  });

  it('keeps the old cache when rebuild fails', async () => {
    vi.doMock('../../src/embeddings/provider.js', () => ({
      getEmbeddingProviderConfig: (config: UserConfig) => ({
        apiBase: config.embeddingApiBase,
        apiKey: config.embeddingApiKey,
        model: config.embeddingModel,
      }),
      embedTexts: vi.fn(async () => {
        throw new Error('provider failed');
      }),
    }));
    const { paths, rebuild } = await importWithTempConstants(tempDir);
    mkdirSync(dirname(paths.indexPath), { recursive: true });
    writeFileSync(paths.indexPath, JSON.stringify(['old']), 'utf-8');
    writeFileSync(paths.binPath, Buffer.from(new Float32Array([0.5, 0.5]).buffer));

    const result = await rebuild.rebuildEmbeddingCache([cap('old'), cap('new')], {
      compileModel: 'x',
      aliases: {},
      scanPaths: [],
      mode: 'ask',
      autoThreshold: 0.85,
      engine: 'tag',
      strategy: 'ask',
      externalDiscovery: false,
      platform: 'claude-code',
      language: 'auto',
      embeddingApiBase: 'https://example.test/v1',
      embeddingApiKey: 'fake-key',
      embeddingModel: 'fake-model',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('provider failed');
    expect(JSON.parse(readFileSync(paths.indexPath, 'utf-8'))).toEqual(['old']);
  });
});
