/**
 * LazyBrain — Matching Quality Benchmark
 *
 * Measures top-K hit rate against a golden set of queries.
 * Target: top-3 hit rate ≥ 80% (from PLAN.md success criteria).
 *
 * Run: vitest run test/benchmark/match-quality.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Graph } from '../../src/graph/graph.js';
import { tagMatch } from '../../src/matcher/tag-layer.js';
import { GRAPH_PATH } from '../../src/constants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

interface GoldenCase {
  query: string;
  expected: string[];
  topK: number;
  note: string;
}

// ─── Load golden set ──────────────────────────────────────────────────────────

const goldenSet: GoldenCase[] = JSON.parse(
  readFileSync(join(__dirname, 'golden-set.json'), 'utf-8'),
);

// ─── Load graph ───────────────────────────────────────────────────────────────

let graph: Graph;

beforeAll(() => {
  try {
    graph = Graph.load(GRAPH_PATH);
  } catch {
    throw new Error(
      `Graph not found at ${GRAPH_PATH}. Run 'lazybrain compile' first.`,
    );
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hits(results: { capability: { name: string } }[], expected: string[]): boolean {
  const names = results.map(r => r.capability.name.toLowerCase());
  return expected.some(e => names.includes(e.toLowerCase()));
}

// ─── Individual test cases ────────────────────────────────────────────────────

describe('matching quality — individual cases', () => {
  for (const c of goldenSet) {
    it(`[${c.note}] "${c.query}"`, () => {
      const nodes = graph.getAllNodes();
      const results = tagMatch(c.query, nodes, 'claude-code', c.topK);
      const matched = hits(results, c.expected);

      if (!matched) {
        const got = results.map(r => `${r.capability.name} (${Math.round(r.score * 100)}%)`).join(', ');
        const want = c.expected.join(' | ');
        console.warn(`  MISS: got [${got}], want one of [${want}]`);
      }

      expect(matched).toBe(true);
    });
  }
});

// ─── Aggregate hit rate ───────────────────────────────────────────────────────

describe('matching quality — aggregate', () => {
  it('top-3 hit rate ≥ 80% (PLAN.md target)', () => {
    const nodes = graph.getAllNodes();
    let passed = 0;

    for (const c of goldenSet) {
      const results = tagMatch(c.query, nodes, 'claude-code', c.topK);
      if (hits(results, c.expected)) passed++;
    }

    const rate = passed / goldenSet.length;
    console.log(`\nHit rate: ${passed}/${goldenSet.length} = ${(rate * 100).toFixed(1)}%`);

    // Print misses for debugging
    if (rate < 1) {
      console.log('\nMisses:');
      for (const c of goldenSet) {
        const results = tagMatch(c.query, nodes, 'claude-code', c.topK);
        if (!hits(results, c.expected)) {
          const got = results.map(r => r.capability.name).join(', ');
          console.log(`  "${c.query}" → [${got}] (want: ${c.expected.join(' | ')})`);
        }
      }
    }

    expect(rate).toBeGreaterThanOrEqual(0.8);
  });

  it('Chinese query hit rate ≥ 75% (PLAN.md target)', () => {
    const nodes = graph.getAllNodes();
    const chineseCases = goldenSet.filter(c => /[\u4e00-\u9fff]/.test(c.query));
    let passed = 0;

    for (const c of chineseCases) {
      const results = tagMatch(c.query, nodes, 'claude-code', c.topK);
      if (hits(results, c.expected)) passed++;
    }

    const rate = passed / chineseCases.length;
    console.log(`\nChinese hit rate: ${passed}/${chineseCases.length} = ${(rate * 100).toFixed(1)}%`);
    expect(rate).toBeGreaterThanOrEqual(0.75);
  });
});
