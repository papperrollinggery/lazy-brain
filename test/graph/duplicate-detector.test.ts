import { describe, it, expect } from 'vitest';
import { Graph } from '../../src/graph/graph.js';
import { detectDuplicates, findCapabilityByNameOrId, compareCapabilities } from '../../src/graph/duplicate-detector.js';
import type { Capability } from '../../src/types.js';

const base: Omit<Capability, 'id' | 'name' | 'description' | 'tags' | 'exampleQueries' | 'category'> = {
  kind: 'skill',
  origin: 'ECC',
  status: 'installed',
  compatibility: ['claude-code'],
};

function makeCap(overrides: Partial<Capability> & Pick<Capability, 'id' | 'name'>): Capability {
  return {
    description: '',
    tags: [],
    exampleQueries: [],
    category: 'other',
    ...base,
    ...overrides,
  };
}

describe('detectDuplicates', () => {
  it('跨 origin 同名 → 1 对', () => {
    const graph = new Graph();
    graph.addNode(makeCap({ id: 'ecc-cr', name: 'code-reviewer', origin: 'ECC' }));
    graph.addNode(makeCap({ id: 'omc-cr', name: 'code-reviewer', origin: 'OMC' }));

    const pairs = detectDuplicates(graph);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].similarity).toBeCloseTo(0.9, 1);
  });

  it('同 origin 不同名 → 0 对', () => {
    const graph = new Graph();
    graph.addNode(makeCap({ id: 'ecc-crcr', name: 'code-review', origin: 'ECC' }));
    graph.addNode(makeCap({ id: 'ecc-crr', name: 'code-reviewer', origin: 'ECC' }));

    const pairs = detectDuplicates(graph);
    expect(pairs).toHaveLength(0);
  });

  it('名字相似 + 同 category → 1 对', () => {
    const graph = new Graph();
    graph.addNode(makeCap({ id: 'cs', name: 'code-review', origin: 'ECC', category: 'review' }));
    graph.addNode(makeCap({ id: 'cc', name: 'code-reviewer', origin: 'OMC', category: 'review' }));

    const pairs = detectDuplicates(graph);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].similarity).toBeGreaterThanOrEqual(0.5);
  });

  it('完全不相关 → 0 对', () => {
    const graph = new Graph();
    graph.addNode(makeCap({ id: 'cr', name: 'code-reviewer', origin: 'ECC', category: 'review' }));
    graph.addNode(makeCap({ id: 'pa', name: 'performance-analyzer', origin: 'ECC', category: 'performance' }));

    const pairs = detectDuplicates(graph);
    expect(pairs).toHaveLength(0);
  });

  it('跨 kind 同名（agent:foo vs skill:foo）→ 0 对', () => {
    const graph = new Graph();
    graph.addNode(makeCap({ id: 'agent-foo', name: 'foo', kind: 'agent', origin: 'ECC' }));
    graph.addNode(makeCap({ id: 'skill-foo', name: 'foo', kind: 'skill', origin: 'OMC' }));

    const pairs = detectDuplicates(graph);
    expect(pairs).toHaveLength(0);
  });

  it('名字完全相同跨 origin → similarity ≥ 0.9', () => {
    const graph = new Graph();
    graph.addNode(makeCap({ id: 'ecc-x', name: 'code-reviewer', origin: 'ECC', category: 'review' }));
    graph.addNode(makeCap({ id: 'omc-x', name: 'code-reviewer', origin: 'OMC', category: 'review' }));
    graph.addNode(makeCap({ id: 'ecc-x2', name: 'code-reviewer', origin: 'ECC', category: 'review', tags: ['review', 'quality'] }));

    const pairs = detectDuplicates(graph);
    expect(pairs.length).toBeGreaterThan(0);
    const pair = pairs.find(p => p.a.name === 'code-reviewer' && p.b.name === 'code-reviewer');
    expect(pair?.similarity).toBeCloseTo(0.9, 1);
  });
});

describe('findCapabilityByNameOrId', () => {
  it('finds by exact name', () => {
    const graph = new Graph();
    graph.addNode(makeCap({ id: 'cr', name: 'code-reviewer', origin: 'ECC' }));

    const result = findCapabilityByNameOrId(graph, 'code-reviewer');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('code-reviewer');
  });

  it('finds by origin:name format', () => {
    const graph = new Graph();
    graph.addNode(makeCap({ id: 'cr', name: 'code-reviewer', origin: 'ECC' }));

    const result = findCapabilityByNameOrId(graph, 'ECC:code-reviewer');
    expect(result).not.toBeNull();
    expect(result!.origin).toBe('ECC');
  });

  it('returns null when not found', () => {
    const graph = new Graph();
    const result = findCapabilityByNameOrId(graph, 'nonexistent');
    expect(result).toBeNull();
  });
});

describe('compareCapabilities', () => {
  it('formats comparison correctly', () => {
    const a = makeCap({ id: 'a', name: 'code-reviewer', origin: 'ECC', description: 'Review code', category: 'review', tags: ['review'] });
    const b = makeCap({ id: 'b', name: 'code-review', origin: 'OMC', description: 'Simple review', category: 'review', tags: ['review', 'quality'] });

    const output = compareCapabilities(a, b);
    expect(output).toContain('## Capability Comparison');
    expect(output).toContain('code-reviewer');
    expect(output).toContain('code-review');
    expect(output).toContain('ECC');
    expect(output).toContain('OMC');
    expect(output).toContain('Tags');
    expect(output).toContain('Example Queries');
  });
});
