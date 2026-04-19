import type { Link } from '../types.js';
import type { Graph } from './graph.js';

export interface GraphViewNode {
  id: string;
  name: string;
  kind: string;
  category: string;
  origin: string;
}

export interface GraphViewEdge {
  source: string;
  target: string;
  type: Link['type'];
  confidence: number;
}

export interface GraphView {
  nodes: GraphViewNode[];
  edges: GraphViewEdge[];
}

function edgeThreshold(type: Link['type']): number {
  switch (type) {
    case 'similar_to':
      return 0.6;
    case 'composes_with':
      return 0.45;
    case 'depends_on':
    case 'supersedes':
    case 'belongs_to':
    default:
      return 0.35;
  }
}

function canonicalPair(source: string, target: string): string {
  return [source, target].sort().join('::');
}

export function buildGraphView(graph: Graph, limit = 80): GraphView {
  const rankedNodes = graph.getAllNodes()
    .map(node => ({ node, score: graph.getLinks(node.id).length }))
    .sort((a, b) => b.score - a.score || a.node.name.localeCompare(b.node.name))
    .slice(0, Math.max(1, limit));

  const allowedIds = new Set(rankedNodes.map(entry => entry.node.id));

  const seenSymmetricEdges = new Set<string>();

  return {
    nodes: rankedNodes.map(({ node }) => ({
      id: node.id,
      name: node.name,
      kind: node.kind,
      category: node.category,
      origin: node.origin,
    })),
    edges: graph.getAllLinks()
      .filter(link => allowedIds.has(link.source) && allowedIds.has(link.target))
      .filter(link => link.source !== link.target)
      .filter(link => (link.confidence ?? 0) >= edgeThreshold(link.type))
      .filter((link) => {
        if (link.type !== 'similar_to') {
          return true;
        }

        const key = canonicalPair(link.source, link.target);
        if (seenSymmetricEdges.has(key)) {
          return false;
        }
        seenSymmetricEdges.add(key);
        return true;
      })
      .map(link => ({
        source: link.source,
        target: link.target,
        type: link.type,
        confidence: link.confidence,
      })),
  };
}

function edgeArrow(type: Link['type']): string {
  switch (type) {
    case 'depends_on':
      return '-->';
    case 'supersedes':
      return '-.->';
    case 'composes_with':
      return '==>';
    case 'belongs_to':
      return '-->';
    case 'similar_to':
    default:
      return '---';
  }
}

function sanitizeLabel(value: string): string {
  return value.replace(/"/g, '\'');
}

export function formatGraphMermaid(view: GraphView): string {
  const lines = ['graph LR'];

  for (const node of view.nodes) {
    lines.push(`  ${node.id}["${sanitizeLabel(`${node.name} (${node.kind})`)}"]`);
  }

  for (const edge of view.edges) {
    lines.push(`  ${edge.source} ${edgeArrow(edge.type)}|${edge.type}| ${edge.target}`);
  }

  return lines.join('\n');
}
