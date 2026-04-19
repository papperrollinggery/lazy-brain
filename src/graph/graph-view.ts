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

export function buildGraphView(graph: Graph, limit = 80): GraphView {
  const rankedNodes = graph.getAllNodes()
    .map(node => ({ node, score: graph.getLinks(node.id).length }))
    .sort((a, b) => b.score - a.score || a.node.name.localeCompare(b.node.name))
    .slice(0, Math.max(1, limit));

  const allowedIds = new Set(rankedNodes.map(entry => entry.node.id));

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

