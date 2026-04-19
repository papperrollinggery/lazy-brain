import { describe, expect, it } from 'vitest';
import { Graph } from '../../src/graph/graph.js';
import { buildGraphView, formatGraphMermaid } from '../../src/graph/graph-view.js';

function makeGraph(): Graph {
  const graph = new Graph();

  graph.addNode({
    id: 'a',
    kind: 'skill',
    name: 'alpha',
    description: 'Alpha tool',
    origin: 'local',
    status: 'installed',
    compatibility: ['claude-code'],
    tags: [],
    exampleQueries: [],
    category: 'development',
  });

  graph.addNode({
    id: 'b',
    kind: 'agent',
    name: 'beta',
    description: 'Beta agent',
    origin: 'ECC',
    status: 'installed',
    compatibility: ['claude-code'],
    tags: [],
    exampleQueries: [],
    category: 'operations',
  });

  graph.addNode({
    id: 'c',
    kind: 'command',
    name: 'gamma',
    description: 'Gamma command',
    origin: 'OMC',
    status: 'installed',
    compatibility: ['claude-code'],
    tags: [],
    exampleQueries: [],
    category: 'operations',
  });

  return graph;
}

describe('buildGraphView', () => {
  it('filters self loops and low-confidence noisy edges', () => {
    const graph = makeGraph();

    graph.addLink({ source: 'a', target: 'a', type: 'similar_to', confidence: 0.95 });
    graph.addLink({ source: 'a', target: 'b', type: 'similar_to', confidence: 0.4 });
    graph.addLink({ source: 'b', target: 'c', type: 'depends_on', confidence: 0.9 });

    const view = buildGraphView(graph, 10);

    expect(view.edges).toHaveLength(1);
    expect(view.edges[0]).toMatchObject({ source: 'b', target: 'c', type: 'depends_on' });
  });

  it('deduplicates mirrored similar_to edges', () => {
    const graph = makeGraph();

    graph.addLink({ source: 'a', target: 'b', type: 'similar_to', confidence: 0.8 });
    graph.addLink({ source: 'b', target: 'a', type: 'similar_to', confidence: 0.82 });
    graph.addLink({ source: 'a', target: 'c', type: 'composes_with', confidence: 0.7 });

    const view = buildGraphView(graph, 10);
    const similarEdges = view.edges.filter((edge) => edge.type === 'similar_to');

    expect(similarEdges).toHaveLength(1);
    expect(view.edges.some((edge) => edge.type === 'composes_with')).toBe(true);
  });
});

describe('formatGraphMermaid', () => {
  it('renders denoised graph edges', () => {
    const graph = makeGraph();
    graph.addLink({ source: 'a', target: 'b', type: 'similar_to', confidence: 0.8 });

    const mermaid = formatGraphMermaid(buildGraphView(graph, 10));
    expect(mermaid).toContain('graph LR');
    expect(mermaid).toContain('similar_to');
    expect(mermaid).toContain('alpha (skill)');
  });
});
