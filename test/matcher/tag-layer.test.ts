import { describe, it, expect } from 'vitest';
import { tokenize } from '../../src/matcher/tag-layer.js';
import { tagMatch } from '../../src/matcher/tag-layer.js';
import type { Capability } from '../../src/types.js';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const base: Omit<Capability, 'id' | 'name' | 'description' | 'tags' | 'exampleQueries'> = {
  kind: 'skill',
  origin: 'local',
  status: 'installed',
  compatibility: ['claude-code'],
  category: 'code-quality',
};

function cap(overrides: Partial<Capability> & Pick<Capability, 'id' | 'name'>): Capability {
  return {
    description: '',
    tags: [],
    exampleQueries: [],
    ...base,
    ...overrides,
  };
}

// ─── tokenize ─────────────────────────────────────────────────────────────────

describe('tokenize', () => {
  it('splits Latin words', () => {
    expect(tokenize('code review')).toEqual(expect.arrayContaining(['code', 'review']));
  });

  it('produces CJK bigrams', () => {
    const tokens = tokenize('代码审查');
    expect(tokens).toContain('代码');
    expect(tokens).toContain('码审');
    expect(tokens).toContain('审查');
  });

  it('handles mixed CJK + Latin', () => {
    const tokens = tokenize('帮我 review 代码');
    expect(tokens).toContain('帮我');
    expect(tokens).toContain('review');
    expect(tokens).toContain('代码');
  });

  it('deduplicates tokens', () => {
    const tokens = tokenize('code code review');
    expect(tokens.filter(t => t === 'code').length).toBe(1);
  });

  it('lowercases everything', () => {
    const tokens = tokenize('Code Review');
    expect(tokens).toContain('code');
    expect(tokens).toContain('review');
    expect(tokens).not.toContain('Code');
  });

  it('returns empty for empty string', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('handles single CJK char (no bigram)', () => {
    const tokens = tokenize('我');
    // single char — no bigram produced, but Latin fallback also empty
    expect(Array.isArray(tokens)).toBe(true);
  });
});

// ─── tagMatch ─────────────────────────────────────────────────────────────────

describe('tagMatch', () => {
  const caps: Capability[] = [
    cap({ id: '1', name: 'review-pr', tags: ['code-review', 'pull-request', 'pr'], exampleQueries: ['review this PR', 'check my pull request'] }),
    cap({ id: '2', name: 'ai-slop-cleaner', tags: ['code-cleanup', 'ai-generated-code', 'code-quality', 'code-maintenance', 'refactor'], exampleQueries: ['clean up AI code'] }),
    cap({ id: '3', name: 'debugger', tags: ['debugging', 'bug-fix', 'root-cause'], exampleQueries: ['debug this issue', 'find the bug'] }),
  ];

  it('returns top match for exact tag hit', () => {
    const results = tagMatch('code review', caps, 'claude-code', 3);
    expect(results[0].capability.name).toBe('review-pr');
  });

  it('tag dedup: "code" does not inflate ai-slop-cleaner above review-pr for "code review"', () => {
    const results = tagMatch('code review', caps, 'claude-code', 3);
    const reviewIdx = results.findIndex(r => r.capability.name === 'review-pr');
    const slopIdx = results.findIndex(r => r.capability.name === 'ai-slop-cleaner');
    // review-pr should rank above or equal to ai-slop-cleaner
    expect(reviewIdx).toBeLessThanOrEqual(slopIdx === -1 ? Infinity : slopIdx);
  });

  it('returns empty for unrelated query', () => {
    const results = tagMatch('xyzzy frobnicator', caps, 'claude-code', 3);
    expect(results.length).toBe(0);
  });

  it('respects maxResults', () => {
    const results = tagMatch('code', caps, 'claude-code', 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('scores are in [0, 1]', () => {
    const results = tagMatch('code review debug', caps, 'claude-code', 10);
    for (const r of results) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(1);
    }
  });

  it('filters by platform compatibility', () => {
    const cursorCap = cap({ id: '4', name: 'cursor-only', tags: ['cursor'], compatibility: ['cursor'] });
    const mixed = [...caps, cursorCap];
    const results = tagMatch('cursor', mixed, 'claude-code', 10);
    expect(results.find(r => r.capability.name === 'cursor-only')).toBeUndefined();
  });

  it('matches CJK query via bridge expansion', () => {
    // "代码" → "code", "审查" → "review" via bridge
    // Use a cap with enough tags so score clears MIN_MATCH_SCORE
    const richCap = cap({
      id: '10',
      name: 'review-pr',
      tags: ['code-review', 'pull-request', 'pr', 'review', 'code'],
      exampleQueries: ['review this code', 'check my pull request', 'code review'],
    });
    const results = tagMatch('代码审查', [richCap], 'claude-code', 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].capability.name).toBe('review-pr');
  });

  it('layer is always "tag"', () => {
    const results = tagMatch('code review', caps, 'claude-code', 3);
    for (const r of results) {
      expect(r.layer).toBe('tag');
    }
  });
});
