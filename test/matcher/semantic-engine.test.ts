import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Capability, UserConfig } from '../../src/types.js';

function makeCap(id: string, name: string): Capability {
  return {
    id,
    name,
    description: `${name} capability`,
    origin: 'test',
    kind: 'skill',
    status: 'installed',
    compatibility: ['universal'],
    tags: [name],
    exampleQueries: [name],
    category: 'other',
    tier: 0,
  };
}

describe('semantic match engine', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'lazybrain-semantic-'));
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(tempDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it('uses embedding cache when engine=semantic', async () => {
    const indexPath = join(tempDir, 'graph.embeddings.index.json');
    const binPath = join(tempDir, 'graph.embeddings.bin');
    writeFileSync(indexPath, JSON.stringify(['cap-a', 'cap-b']), 'utf-8');
    writeFileSync(binPath, Buffer.from(new Float32Array([1, 0, 0, 1]).buffer));

    vi.doMock('../../src/constants.js', async () => {
      const actual = await vi.importActual<any>('../../src/constants.js');
      return {
        ...actual,
        EMBEDDINGS_INDEX_PATH: indexPath,
        EMBEDDINGS_BIN_PATH: binPath,
      };
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ embedding: [1, 0] }] }),
    })));

    const { Graph } = await import('../../src/graph/graph.js');
    const { match } = await import('../../src/matcher/matcher.js');
    const graph = new Graph();
    graph.addNode(makeCap('cap-a', 'alpha'));
    graph.addNode(makeCap('cap-b', 'beta'));

    const config: UserConfig = {
      aliases: {},
      scanPaths: [],
      mode: 'ask',
      autoThreshold: 0.85,
      engine: 'semantic',
      strategy: 'ask',
      embeddingApiBase: 'https://example.test/v1',
      embeddingApiKey: 'test-key',
      embeddingModel: 'test-embedding',
      platform: 'claude-code',
      platforms: {},
    };

    const result = await match('find alpha', { graph, config });

    expect(result.matches[0].capability.name).toBe('alpha');
    expect(result.matches[0].layer).toBe('semantic');
    expect(result.warnings).toBeUndefined();
  });

  it('blocks semantic results when query vector dimension differs from cache', async () => {
    const indexPath = join(tempDir, 'graph.embeddings.index.json');
    const binPath = join(tempDir, 'graph.embeddings.bin');
    writeFileSync(indexPath, JSON.stringify(['cap-a']), 'utf-8');
    writeFileSync(binPath, Buffer.from(new Float32Array([1, 0]).buffer));

    vi.doMock('../../src/constants.js', async () => {
      const actual = await vi.importActual<any>('../../src/constants.js');
      return {
        ...actual,
        EMBEDDINGS_INDEX_PATH: indexPath,
        EMBEDDINGS_BIN_PATH: binPath,
      };
    });
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ embedding: [1, 0, 0] }] }),
    })));

    const { Graph } = await import('../../src/graph/graph.js');
    const { match } = await import('../../src/matcher/matcher.js');
    const graph = new Graph();
    graph.addNode(makeCap('cap-a', 'alpha'));

    const config: UserConfig = {
      aliases: {},
      scanPaths: [],
      mode: 'ask',
      autoThreshold: 0.85,
      engine: 'semantic',
      strategy: 'ask',
      embeddingApiBase: 'https://example.test/v1',
      embeddingApiKey: 'test-key',
      embeddingModel: 'test-embedding',
      platform: 'claude-code',
      platforms: {},
    };

    const result = await match('find alpha', { graph, config });

    expect(result.matches).toHaveLength(0);
    expect(result.warnings?.join('\n')).toContain('dimension mismatch');
  });
});
