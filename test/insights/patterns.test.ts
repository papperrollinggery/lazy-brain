import { describe, expect, test } from 'vitest';
import { detectPatterns, unusedHighValue } from '../../src/insights/patterns.js';
import type { HistoryEntry } from '../../src/history/history.js';

function entry(skill: string, offset: number): HistoryEntry {
  return {
    timestamp: new Date(Date.UTC(2026, 0, 1, 0, offset)).toISOString(),
    query: skill,
    recommended: skill,
    used: skill,
    sessionId: 'test',
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
});
