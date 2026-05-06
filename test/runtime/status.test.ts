import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mergeRuntimeStatus } from '../../src/runtime/status.js';

describe('runtime status merge', () => {
  it('preserves previous unlock timestamps when writing transient state', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lazybrain-runtime-status-'));
    const path = join(dir, 'status.json');
    try {
      writeFileSync(path, JSON.stringify({
        state: 'idle',
        lastScanAt: 111,
        lastCompileAt: 222,
        newCapabilities: ['fresh-plugin-router'],
      }), 'utf-8');

      mergeRuntimeStatus({ state: 'embedding', progress: 'incremental' }, path);
      mergeRuntimeStatus({ state: 'idle', lastEmbeddingAt: 333 }, path);

      const status = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
      expect(status.lastScanAt).toBe(111);
      expect(status.lastCompileAt).toBe(222);
      expect(status.lastEmbeddingAt).toBe(333);
      expect(status.newCapabilities).toEqual(['fresh-plugin-router']);
      expect(status.updatedAt).toEqual(expect.any(Number));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
