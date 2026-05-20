import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { find } from '../../src/matcher/matcher.js';
import { orchestrate } from '../../src/orchestrator/engine.js';
import { signalFromQuery } from '../../src/orchestrator/signals.js';
import { Graph } from '../../src/graph/graph.js';

function avgMs(iterations: number, fn: () => void): number {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  return (performance.now() - start) / iterations;
}

describe('performance benchmarks', () => {
  test('find averages under 50ms', () => {
    expect(avgMs(100, () => { find('review this PR for security issues'); })).toBeLessThan(50);
  });

  test('orchestrate averages under 10ms', () => {
    expect(avgMs(100, () => { orchestrate(signalFromQuery('deploy payment feature')); })).toBeLessThan(10);
  });

  test('Graph.load handles 1000 nodes under 100ms', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lazybrain-perf-'));
    const graphPath = join(dir, 'graph.json');
    try {
      const graph = new Graph();
      for (let i = 0; i < 1000; i++) {
        graph.addNode({
          id: `skill-${i}`,
          kind: 'skill',
          name: `skill-${i}`,
          description: 'Synthetic benchmark skill.',
          origin: 'test',
          status: 'installed',
          compatibility: ['universal'],
          tags: ['benchmark'],
          exampleQueries: [],
          category: 'test',
        });
      }
      graph.save(graphPath);
      const start = performance.now();
      expect(Graph.load(graphPath).getNodeCount()).toBe(1000);
      expect(performance.now() - start).toBeLessThan(100);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
