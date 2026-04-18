import { describe, it, expect } from 'vitest';
import { Graph } from '../../src/graph/graph.js';
import { buildSessionStats } from '../../src/stats/session-stats.js';
import type { Capability } from '../../src/types.js';
import type { DuplicatePair } from '../../src/graph/duplicate-detector.js';

function makeCap(overrides: Partial<Capability> & Pick<Capability, 'id' | 'name'>): Capability {
  return {
    description: 'test',
    tags: ['test'],
    exampleQueries: [],
    category: 'other',
    kind: 'skill',
    origin: 'test',
    status: 'installed',
    compatibility: ['universal'],
    ...overrides,
  };
}

describe('buildSessionStats', () => {
  it('returns stats structure with capabilities from graph', () => {
    const graph = new Graph();
    graph.addNode(makeCap({ id: 'cap1', name: 'cap-a' }));
    graph.addNode(makeCap({ id: 'cap2', name: 'cap-b' }));
    graph.addNode(makeCap({ id: 'cap3', name: 'cap-c' }));
    const stats = buildSessionStats(graph);
    expect(stats.totalCapabilities).toBe(3);
    expect(typeof stats.totalMatches).toBe('number');
    expect(typeof stats.hitRate).toBe('number');
    expect(typeof stats.savedTokens).toBe('number');
    expect(typeof stats.savedCostUSD).toBe('number');
    expect(typeof stats.baselineTokens).toBe('number');
    expect(typeof stats.actualTokens).toBe('number');
    expect(Array.isArray(stats.recentMatches)).toBe(true);
    expect(typeof stats.newCapsThisWeek).toBe('number');
    expect(typeof stats.duplicatePairs).toBe('number');
  });

  it('counts capabilities from graph', () => {
    const graph = new Graph();
    graph.addNode(makeCap({ id: 'cap1', name: 'cap-a' }));
    graph.addNode(makeCap({ id: 'cap2', name: 'cap-b' }));
    const stats = buildSessionStats(graph);
    expect(stats.totalCapabilities).toBe(2);
  });

  it('accepts duplicatePairs parameter and reports count', () => {
    const graph = new Graph();
    graph.addNode(makeCap({ id: 'cap1', name: 'cap-a' }));
    graph.addNode(makeCap({ id: 'cap2', name: 'cap-b' }));
    const dupPairs: DuplicatePair[] = [];
    const stats = buildSessionStats(graph, dupPairs);
    expect(stats.duplicatePairs).toBe(0);
  });

  it('reports correct duplicate count when pairs provided', () => {
    const graph = new Graph();
    graph.addNode(makeCap({ id: 'cap1', name: 'cap-a' }));
    graph.addNode(makeCap({ id: 'cap2', name: 'cap-b' }));
    graph.addNode(makeCap({ id: 'cap3', name: 'cap-c' }));
    const dupPairs: DuplicatePair[] = [
      {
        a: graph.getNode('cap1')!,
        b: graph.getNode('cap2')!,
        similarity: 0.8,
        reason: 'similar names',
      },
    ];
    const stats = buildSessionStats(graph, dupPairs);
    expect(stats.duplicatePairs).toBe(1);
  });
});
