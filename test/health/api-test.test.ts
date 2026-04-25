import { describe, expect, it, vi, afterEach } from 'vitest';
import { runApiTests } from '../../src/health/api-test.js';
import { DEFAULT_CONFIG } from '../../src/constants.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runApiTests', () => {
  it('reports missing config without calling external APIs', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const report = await runApiTests({ ...DEFAULT_CONFIG, compileApiKey: undefined, secretaryApiKey: undefined, embeddingApiKey: undefined });

    expect(report.ok).toBe(false);
    expect(report.results.every(result => result.configured === false)).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reports chat and embedding success without returning keys', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      text: async () => url.includes('/embeddings')
        ? JSON.stringify({ data: [{ embedding: [0.1, 0.2, 0.3] }] })
        : JSON.stringify({ choices: [{ message: { content: 'OK' } }] }),
    })));

    const report = await runApiTests({
      ...DEFAULT_CONFIG,
      compileApiKey: 'private-compile-key',
      secretaryApiKey: 'private-secretary-key',
      embeddingApiKey: 'private-embedding-key',
    });

    expect(report.ok).toBe(true);
    expect(report.results.find(result => result.target === 'embedding')?.dim).toBe(3);
    expect(JSON.stringify(report)).not.toContain('private-compile-key');
    expect(JSON.stringify(report)).not.toContain('private-secretary-key');
    expect(JSON.stringify(report)).not.toContain('private-embedding-key');
  });

  it('summarizes 401 responses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: 'unauthorized token' }),
    })));

    const report = await runApiTests({ ...DEFAULT_CONFIG, compileApiKey: 'fake-key' }, ['compile']);

    expect(report.ok).toBe(false);
    expect(report.results[0].status).toBe(401);
    expect(report.results[0].error).toContain('unauthorized');
  });

  it('reports timeout-style fetch errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('timeout');
    }));

    const report = await runApiTests({ ...DEFAULT_CONFIG, embeddingApiKey: 'fake-key' }, ['embedding']);

    expect(report.ok).toBe(false);
    expect(report.results[0].error).toContain('timeout');
  });

  it('reports bad embedding JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => '{not-json',
    })));

    const report = await runApiTests({ ...DEFAULT_CONFIG, embeddingApiKey: 'fake-key' }, ['embedding']);

    expect(report.ok).toBe(false);
    expect(report.results[0].error).toBe('bad JSON response');
  });
});
