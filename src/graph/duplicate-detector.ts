/**
 * LazyBrain — Duplicate Tool Detection
 *
 * Detects potentially duplicate capabilities across plugin boundaries
 * by computing similarity scores based on name, category, and tags.
 */

import type { Capability } from '../types.js';
import type { Graph } from './graph.js';

export interface DuplicatePair {
  a: Capability;
  b: Capability;
  similarity: number;
  reason: string;
}

function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

function nameContains(a: string, b: string): boolean {
  return a.includes(b) || b.includes(a);
}

function tagOverlap(a: Capability, b: Capability): number {
  if (a.tags.length === 0 || b.tags.length === 0) return 0;
  const aSet = new Set(a.tags.map(t => t.toLowerCase()));
  const bSet = new Set(b.tags.map(t => t.toLowerCase()));
  let overlap = 0;
  for (const tag of aSet) {
    if (bSet.has(tag)) overlap++;
  }
  return overlap / Math.max(aSet.size, bSet.size);
}

function computeSimilarity(a: Capability, b: Capability): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const dist = levenshteinDistance(a.name, b.name);
  if (dist <= 3) {
    score += 0.4;
    reasons.push(`name similar (distance=${dist})`);
  }

  if (nameContains(a.name, b.name)) {
    score += 0.3;
    reasons.push('name contains');
  }

  if (a.category === b.category && a.category !== '') {
    score += 0.2;
    reasons.push('same category');
  }

  const overlap = tagOverlap(a, b);
  if (overlap > 0.5) {
    score += 0.1;
    reasons.push(`tag overlap (${Math.round(overlap * 100)}%)`);
  }

  return { score, reasons };
}

export function detectDuplicates(graph: Graph): DuplicatePair[] {
  const nodes = graph.getAllNodes();
  const pairs: DuplicatePair[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];

      if (a.kind !== b.kind) continue;
      if (a.origin === b.origin) continue;

      const key = [a.id, b.id].sort().join('::');
      if (seen.has(key)) continue;
      seen.add(key);

      const { score, reasons } = computeSimilarity(a, b);

      if (score >= 0.5) {
        pairs.push({
          a,
          b,
          similarity: score,
          reason: reasons.join(', '),
        });
      }
    }
  }

  return pairs;
}

export function buildDuplicateIndex(pairs: DuplicatePair[]): Map<string, DuplicatePair[]> {
  const index = new Map<string, DuplicatePair[]>();

  for (const pair of pairs) {
    for (const id of [pair.a.id, pair.b.id]) {
      if (!index.has(id)) {
        index.set(id, []);
      }
      index.get(id)!.push(pair);
    }
  }

  return index;
}

export function formatDuplicatePairs(pairs: DuplicatePair[]): string {
  if (pairs.length === 0) {
    return '✓ 未检测到重复工具';
  }

  const lines: string[] = [];
  lines.push(`重复工具检测：`);
  lines.push(`  发现 ${pairs.length} 对疑似重复：`);

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    const { a, b, reason } = pair;
    lines.push(`    ${i + 1}. [${a.kind}] ${a.name} (${a.origin}) ⚠ ${b.name} (${b.origin}) — ${reason}`);
  }

  return lines.join('\n');
}

export function findCapabilityByNameOrId(graph: Graph, query: string): Capability | null {
  const lower = query.toLowerCase();

  // Try exact name match first
  for (const node of graph.getAllNodes()) {
    if (node.name.toLowerCase() === lower) {
      return node;
    }
  }

  // Try origin:name format
  if (query.includes(':')) {
    const [origin, name] = query.split(':', 2);
    for (const node of graph.getAllNodes()) {
      if (node.origin.toLowerCase() === origin.toLowerCase() && node.name.toLowerCase() === name.toLowerCase()) {
        return node;
      }
    }
  }

  // Try partial name match
  for (const node of graph.getAllNodes()) {
    if (node.name.toLowerCase().includes(lower)) {
      return node;
    }
  }

  return null;
}

export function compareCapabilities(a: Capability, b: Capability): string {
  const lines: string[] = [];

  lines.push('## Capability Comparison');
  lines.push('');
  lines.push('| Field | Capability A | Capability B |');
  lines.push('|-------|---------------|---------------|');

  const fields: Array<keyof Capability> = ['name', 'origin', 'kind', 'category', 'description'];
  for (const field of fields) {
    const aVal = String(a[field] ?? '-');
    const bVal = String(b[field] ?? '-');
    lines.push(`| ${field} | ${aVal} | ${bVal} |`);
  }

  lines.push('');
  lines.push('**Tags**');
  lines.push(`- A: ${a.tags.length > 0 ? a.tags.join(', ') : '(none)'}`);
  lines.push(`- B: ${b.tags.length > 0 ? b.tags.join(', ') : '(none)'}`);

  lines.push('');
  lines.push('**Example Queries**');
  lines.push(`- A: ${a.exampleQueries.length > 0 ? a.exampleQueries.slice(0, 3).join('; ') : '(none)'}`);
  lines.push(`- B: ${b.exampleQueries.length > 0 ? b.exampleQueries.slice(0, 3).join('; ') : '(none)'}`);

  return lines.join('\n');
}
