import { describe, it, expect } from 'vitest';
import { mergeTagAndSemantic, reciprocalRankFusion } from '../../src/matcher/semantic-layer.js';
import type { MatchResult } from '../../src/types.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function result(name: string, score: number, layer: 'tag' | 'semantic' = 'tag'): MatchResult {
  return {
    capability: {
      id: name,
      name,
      kind: 'skill',
      description: '',
      origin: 'local',
      status: 'installed',
      compatibility: ['claude-code'],
      tags: [],
      exampleQueries: [],
      category: 'other',
    },
    score,
    layer,
    confidence: score >= 0.8 ? 'high' : score >= 0.5 ? 'medium' : 'low',
  };
}

// ─── mergeTagAndSemantic ──────────────────────────────────────────────────────

describe('mergeTagAndSemantic', () => {
  it('combines scores with default weights (0.6 tag + 0.4 semantic)', () => {
    const tag = [result('a', 1.0)];
    const sem = [result('a', 1.0, 'semantic')];
    const merged = mergeTagAndSemantic(tag, sem);
    expect(merged[0].score).toBeCloseTo(1.0);
  });

  it('includes semantic-only results', () => {
    const tag = [result('a', 0.8)];
    const sem = [result('b', 0.9, 'semantic')];
    const merged = mergeTagAndSemantic(tag, sem);
    const names = merged.map(r => r.capability.name);
    expect(names).toContain('b');
  });

  it('sorts by descending score', () => {
    const tag = [result('low', 0.3), result('high', 0.9)];
    const sem = [result('mid', 0.6, 'semantic')];
    const merged = mergeTagAndSemantic(tag, sem);
    for (let i = 1; i < merged.length; i++) {
      expect(merged[i - 1].score).toBeGreaterThanOrEqual(merged[i].score);
    }
  });

  it('caps score at 1.0', () => {
    const tag = [result('a', 1.0)];
    const sem = [result('a', 1.0, 'semantic')];
    const merged = mergeTagAndSemantic(tag, sem);
    expect(merged[0].score).toBeLessThanOrEqual(1.0);
  });

  it('returns empty when both inputs are empty', () => {
    expect(mergeTagAndSemantic([], [])).toEqual([]);
  });
});

// ─── reciprocalRankFusion ─────────────────────────────────────────────────────

describe('reciprocalRankFusion', () => {
  it('top result appears in both layers gets highest score', () => {
    const tag = [result('a', 0.9), result('b', 0.5)];
    const sem = [result('a', 0.8, 'semantic'), result('c', 0.7, 'semantic')];
    const fused = reciprocalRankFusion(tag, sem);
    expect(fused[0].capability.name).toBe('a');
  });

  it('normalizes scores to [0, 1]', () => {
    const tag = [result('a', 0.9), result('b', 0.5)];
    const sem = [result('b', 0.8, 'semantic'), result('c', 0.6, 'semantic')];
    const fused = reciprocalRankFusion(tag, sem);
    for (const r of fused) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  it('top result has score = 1.0 after normalization', () => {
    const tag = [result('a', 0.9)];
    const sem = [result('b', 0.8, 'semantic')];
    const fused = reciprocalRankFusion(tag, sem);
    expect(fused[0].score).toBeCloseTo(1.0);
  });

  it('includes results from both layers', () => {
    const tag = [result('a', 0.9)];
    const sem = [result('b', 0.8, 'semantic')];
    const fused = reciprocalRankFusion(tag, sem);
    const names = fused.map(r => r.capability.name);
    expect(names).toContain('a');
    expect(names).toContain('b');
  });

  it('returns empty when both inputs are empty', () => {
    expect(reciprocalRankFusion([], [])).toEqual([]);
  });

  it('sorts by descending score', () => {
    const tag = [result('a', 0.9), result('b', 0.5), result('c', 0.3)];
    const sem = [result('b', 0.8, 'semantic'), result('d', 0.7, 'semantic')];
    const fused = reciprocalRankFusion(tag, sem);
    for (let i = 1; i < fused.length; i++) {
      expect(fused[i - 1].score).toBeGreaterThanOrEqual(fused[i].score);
    }
  });

  it('rank matters more than score — lower-ranked high-score loses to higher-ranked low-score', () => {
    // 'a' is rank 1 in tag, rank 1 in semantic → should beat 'b' (rank 2 in tag only)
    const tag = [result('a', 0.5), result('b', 0.99)];
    const sem = [result('a', 0.5, 'semantic')];
    const fused = reciprocalRankFusion(tag, sem);
    expect(fused[0].capability.name).toBe('a');
  });
});
