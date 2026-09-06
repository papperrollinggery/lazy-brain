import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { find } from '../../src/matcher/matcher.js';
import { orchestrate } from '../../src/orchestrator/engine.js';
import { signalFromQuery } from '../../src/orchestrator/signals.js';
import { localCapability, workflowGraph } from '../helpers/capabilities.js';
import { Graph } from '../../src/graph/graph.js';

function avgMs(iterations: number, fn: () => void): number {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  return (performance.now() - start) / iterations;
}

describe('performance benchmarks', () => {
  test('search returns a real match among 1000 local entries under 200ms on average', () => {
    const graph = workflowGraph();
    for (let i = 0; i < 990; i++) graph.addNode(localCapability('helper-' + i, 'A local utility for file formats and text transformations.'));
    const query = '中文剧本转成Seedance分镜提示词';
    expect(find(query, { graph, limit: 1 })[0]?.skill).toBe('convert-script-to-seedance');
    expect(avgMs(10, () => { find(query, { graph, limit: 3 }); })).toBeLessThan(200);
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
