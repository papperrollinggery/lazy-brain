import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { find } from '../../src/matcher/matcher.js';
import { Graph } from '../../src/graph/graph.js';
import { orchestrate } from '../../src/orchestrator/engine.js';
import { signalFromQuery } from '../../src/orchestrator/signals.js';

describe('edge cases', () => {
  test('empty graph does not imply installed built-ins', () => {
    const results = find('review this PR for security issues', { graph: new Graph(), limit: 1 });
    expect(results).toEqual([]);
  });

  test('corrupted graph loads as empty graph', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lazybrain-edge-'));
    const graphPath = join(dir, 'graph.json');
    try {
      writeFileSync(graphPath, '{not-json');
      expect(Graph.load(graphPath).getNodeCount()).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('legacy stale locks do not block pure snapshot reads', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lazybrain-edge-'));
    const graphPath = join(dir, 'graph.json');
    try {
      const graph = new Graph();
      graph.addNode({
        id: 'safe',
        kind: 'skill',
        name: 'safe',
        description: 'Safe write test.',
        origin: 'test',
        status: 'installed',
        compatibility: ['universal'],
        tags: ['test'],
        exampleQueries: [],
        category: 'test',
      });
      graph.save(graphPath);
      appendFileSync(`${graphPath}.lock`, 'stale');
      expect(Graph.load(graphPath).getNode('safe')?.name).toBe('safe');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('long and unicode queries do not throw', () => {
    const query = `${'很长的查询 '.repeat(120)} 🚀 review security`;
    expect(() => find(query)).not.toThrow();
    expect(() => orchestrate(signalFromQuery(query))).not.toThrow();
  });
});
