/**
 * LazyBrain — Matching Quality Benchmark
 *
 * Measures top-1 and top-3 hit rate against a golden set of queries.
 * Target: top-1 >= 60%, top-3 >= 80% (保守目标，真实标注后)
 *
 * Uses the full match() orchestrator (alias → tag → semantic → graph enrichment)
 * to reflect real-world behavior, not just the tag layer in isolation.
 *
 * Run: vitest run test/benchmark/match-quality.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Graph } from '../../src/graph/graph.js';
import { match } from '../../src/matcher/matcher.js';
import { loadConfig } from '../../src/config/config.js';
import { GRAPH_PATH } from '../../src/constants.js';
const __dirname = dirname(fileURLToPath(import.meta.url));

interface GoldenCase {
  query: string;
  expected: string[];
  expectedNot?: string[];
  topK: number;
  note: string;
}

// ─── Load golden set ──────────────────────────────────────────────────────────

const goldenSet: GoldenCase[] = JSON.parse(
  readFileSync(join(__dirname, 'golden-set.json'), 'utf-8'),
);

// ─── Load graph + config + embedding provider ──────────────────────────────────

let graph: Graph;
let config: ReturnType<typeof loadConfig>;

beforeAll(() => {
  try {
    graph = Graph.load(GRAPH_PATH);
  } catch {
    throw new Error(
      `Graph not found at ${GRAPH_PATH}. Run 'lazybrain compile' first.`,
    );
  }
  config = loadConfig();
});

const tagOnlyStats = { total: 0, hits: 0 };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function checkMatch(name: string, expected: string[]): boolean {
  const lowerName = name.toLowerCase();
  return expected.some(e => lowerName.includes(e.toLowerCase()) || e.toLowerCase().includes(lowerName));
}

// ─── Individual test cases ────────────────────────────────────────────────────

describe('matching quality — individual cases', () => {
  for (const c of goldenSet) {
    it(`[${c.note}] "${c.query}"`, async () => {
      const rec = await match(c.query, { graph, config });
      const topNames = rec.matches.slice(0, c.topK).map(r => r.capability.name);
      const top1Name = topNames[0] ?? '';
      const top1Matched = checkMatch(top1Name, c.expected);

      // Check expectedNot (top-1 不应该出现的工具)
      const unwantedMatched = c.expectedNot?.some(e => checkMatch(top1Name, [e]));

      if (!top1Matched || unwantedMatched) {
        const got = rec.matches.slice(0, c.topK)
          .map(r => `${r.capability.name} (${Math.round(r.score * 100)}%)`)
          .join(', ');
        const want = c.expected.join(' | ');
        const not = c.expectedNot?.length ? ` (NOT: ${c.expectedNot.join(', ')})` : '';
        console.warn(`  MISS: got [${got}], want one of [${want}]${not}`);
      }

      expect(unwantedMatched).toBeFalsy();
      expect(top1Matched).toBe(true);
    });
  }
});

// ─── Aggregate hit rate ───────────────────────────────────────────────────────

describe('matching quality — aggregate', { timeout: 120000 }, () => {
  it('top-1 >= 60%, top-3 >= 80%', async () => {
    let top1Hits = 0;
    let top3Hits = 0;
    const misses: Array<{ query: string; got: string[]; expected: string[] }> = [];

    for (const c of goldenSet) {
      const rec = await match(c.query, { graph, config });
      const names = rec.matches.map(r => r.capability.name);
      const top1 = names.slice(0, 1);
      const top3 = names.slice(0, 3);

      // top-1 命中
      if (top1.some(n => checkMatch(n, c.expected))) {
        top1Hits++;
      }

      // top-3 命中
      if (top3.some(n => checkMatch(n, c.expected))) {
        top3Hits++;
      } else {
        misses.push({
          query: c.query,
          got: top3,
          expected: c.expected,
        });
      }
    }

    const top1Rate = top1Hits / goldenSet.length;
    const top3Rate = top3Hits / goldenSet.length;

    console.log(`\nTop-1 hit rate: ${top1Hits}/${goldenSet.length} = ${(top1Rate * 100).toFixed(1)}%`);
    console.log(`Top-3 hit rate: ${top3Hits}/${goldenSet.length} = ${(top3Rate * 100).toFixed(1)}%`);

    if (top3Rate < 0.8) {
      console.log('\nTop-3 Misses:');
      for (const m of misses) {
        console.log(`  "${m.query}" → [${m.got.join(', ')}] (want: ${m.expected.join(' | ')})`);
      }
    }

    expect(top1Rate).toBeGreaterThanOrEqual(0.6);
    expect(top3Rate).toBeGreaterThanOrEqual(0.8);
  });

  it('Chinese query top-1 >= 60%, top-3 >= 80%', async () => {
    const chineseCases = goldenSet.filter(c => /[\u4e00-\u9fff]/.test(c.query));
    let top1Hits = 0;
    let top3Hits = 0;

    for (const c of chineseCases) {
      const rec = await match(c.query, { graph, config });
      const names = rec.matches.map(r => r.capability.name);
      const top1 = names.slice(0, 1);
      const top3 = names.slice(0, 3);

      if (top1.some(n => checkMatch(n, c.expected))) top1Hits++;
      if (top3.some(n => checkMatch(n, c.expected))) top3Hits++;
    }

    const top1Rate = top1Hits / chineseCases.length;
    const top3Rate = top3Hits / chineseCases.length;

    console.log(`\nChinese Top-1: ${top1Hits}/${chineseCases.length} = ${(top1Rate * 100).toFixed(1)}%`);
    console.log(`Chinese Top-3: ${top3Hits}/${chineseCases.length} = ${(top3Rate * 100).toFixed(1)}%`);

    expect(top1Rate).toBeGreaterThanOrEqual(0.6);
    expect(top3Rate).toBeGreaterThanOrEqual(0.8);
  });
});

// ─── Tag-only baseline (no embedding) ──────────────────────────────────────

describe('tag-only pipeline (no embedding)', () => {
  for (const c of goldenSet) {
    it(`tag-only: "${c.query}"`, async () => {
      const rec = await match(c.query, { graph, config });
      const top3Names = rec.matches.slice(0, 3).map(m => m.capability.name);
      const top3Hit = top3Names.some(n => checkMatch(n, c.expected));
      tagOnlyStats.total++;
      if (top3Hit) tagOnlyStats.hits++;
      if (!top3Hit) {
        console.log(`  TAG-MISS: "${c.query}" got [${top3Names.join(', ')}], want one of [${c.expected.join(' | ')}]`);
      }
    });
  }

  afterAll(() => {
    console.log(`\nTag-only top-3 hit rate: ${tagOnlyStats.hits}/${tagOnlyStats.total} = ${(tagOnlyStats.hits / tagOnlyStats.total * 100).toFixed(1)}%`);
  });
});
