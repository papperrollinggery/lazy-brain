import { describe, expect, test } from 'vitest';
import { detectPatterns, unusedHighValue } from '../../src/insights/patterns.js';
import type { HistoryEntry } from '../../src/history/history.js';

function entry(skill: string, offset: number, sessionId = 'test', used: string | null = skill): HistoryEntry {
  return {
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, offset)).toISOString(),
    query: skill,
    recommended: skill,
    used,
    sessionId,
  };
}

describe('patterns', () => {
  test('detects repeated three-step sequences', () => {
    const history = [
      entry('plan', 1), entry('code-review', 2), entry('ship', 3),
      entry('plan', 4), entry('code-review', 5), entry('ship', 6),
    ];
    const patterns = detectPatterns(history);
    expect(patterns[0]?.sequence).toEqual(['plan', 'code-review', 'ship']);
    expect(patterns[0]?.count).toBe(2);
  });

  test('returns unused high value skills', () => {
    const unused = unusedHighValue([entry('plan', 1)], ['plan', 'security-review']);
    expect(unused).toEqual(['security-review']);
  });

  test('learns only explicit uses within one session', () => {
    const history = [
      entry('plan', 1, 'one'), entry('code-review', 2, 'two'), entry('ship', 3, 'one'),
      entry('plan', 4, 'one', null), entry('code-review', 5, 'one', null), entry('ship', 6, 'one', null),
      entry('plan', 7, 'three'), entry('code-review', 8, 'three'), entry('ship', 9, 'three'),
      entry('plan', 10, 'three'), entry('code-review', 11, 'three'), entry('ship', 12, 'three'),
    ];
    const patterns = detectPatterns(history);
    expect(patterns).toHaveLength(1);
    expect(patterns[0]).toMatchObject({
      sequence: ['plan', 'code-review', 'ship'],
      count: 2,
      suggestion: 'Try a combo for plan + code-review + ship',
    });
    expect(unusedHighValue([entry('security-review', 1, 'one', null)], ['security-review'])).toEqual(['security-review']);
  });
});
