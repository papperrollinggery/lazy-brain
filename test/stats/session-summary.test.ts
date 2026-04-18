import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildSessionSummary, formatSessionSummary } from '../../src/stats/session-summary.js';
import type { SessionSummary } from '../../src/stats/session-summary.js';
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let tmp: string;
let HISTORY_FILE: string;
let USAGE_FILE: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'lb-summary-test-'));
  HISTORY_FILE = join(tmp, 'history.jsonl');
  USAGE_FILE = join(tmp, 'usage.jsonl');
});

afterEach(() => {
  try { rmSync(tmp, { recursive: true }); } catch {}
});

function makeHistoryEntry(overrides: {
  sessionId?: string;
  query?: string;
  matched?: string;
  accepted?: boolean;
  layer?: string;
  reason?: string;
}) {
  return {
    timestamp: '2025-01-01T00:00:00Z',
    query: '',
    matched: '',
    accepted: false,
    layer: 'tag' as const,
    sessionId: 'test-session',
    ...overrides,
  };
}

function makeUsageEntry(overrides: {
  sessionId?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  model?: string;
  taskType?: string;
}) {
  return {
    sessionId: 'test-session',
    inputTokens: 1000,
    outputTokens: 500,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    model: 'sonnet',
    costUsd: 0.002,
    taskType: 'code-review',
    ...overrides,
  };
}

function appendHistory(entry: ReturnType<typeof makeHistoryEntry>) {
  const line = JSON.stringify(entry);
  writeFileSync(HISTORY_FILE, line + '\n', { flag: 'a', encoding: 'utf-8' });
}

function appendUsage(entry: ReturnType<typeof makeUsageEntry>) {
  const line = JSON.stringify(entry);
  writeFileSync(USAGE_FILE, line + '\n', { flag: 'a', encoding: 'utf-8' });
}

describe('buildSessionSummary', () => {
  it('empty session: no history or usage entries for this sessionId', () => {
    const summary = buildSessionSummary('nonexistent-session', {
      historyPath: HISTORY_FILE,
      usagePath: USAGE_FILE,
    });
    expect(summary.routeCount).toBe(0);
    expect(summary.acceptCount).toBe(0);
    expect(summary.acceptRate).toBe(0);
    expect(summary.avoidCount).toBe(0);
    expect(summary.actualTokens).toBe(0);
    expect(summary.actualCostUSD).toBe(0);
    expect(summary.baselineTokens).toBe(0);
    expect(summary.savedTokens).toBe(0);
    expect(summary.cheapestTask).toBeNull();
  });

  it('no matches: history entries exist but none have query+matched', () => {
    const otherSession = 'other-session';
    appendHistory(makeHistoryEntry({ sessionId: otherSession, query: 'foo', matched: 'some-tool', accepted: true }));
    appendUsage(makeUsageEntry({ sessionId: otherSession }));

    const summary = buildSessionSummary('test-session', {
      historyPath: HISTORY_FILE,
      usagePath: USAGE_FILE,
    });
    expect(summary.routeCount).toBe(0);
    expect(summary.acceptCount).toBe(0);
    expect(summary.acceptRate).toBe(0);
    expect(summary.avoidCount).toBe(0);
  });

  it('all accepted: 3 routes, all accepted, 100% rate', () => {
    appendHistory(makeHistoryEntry({ sessionId: 'test-session', query: 'review code', matched: 'code-reviewer', accepted: true }));
    appendHistory(makeHistoryEntry({ sessionId: 'test-session', query: 'fix bug', matched: 'debugger', accepted: true }));
    appendHistory(makeHistoryEntry({ sessionId: 'test-session', query: 'deploy', matched: 'deploy', accepted: true }));
    appendUsage(makeUsageEntry({ sessionId: 'test-session', inputTokens: 3000, outputTokens: 1500, cacheReadTokens: 500 }));
    appendUsage(makeUsageEntry({ sessionId: 'test-session', inputTokens: 2000, outputTokens: 1000, cacheReadTokens: 300 }));

    const summary = buildSessionSummary('test-session', {
      historyPath: HISTORY_FILE,
      usagePath: USAGE_FILE,
    });
    expect(summary.routeCount).toBe(3);
    expect(summary.acceptCount).toBe(3);
    expect(summary.acceptRate).toBe(100);
    expect(summary.avoidCount).toBe(0);
    // baseline = 3000+1500 + 2000+1000 = 7500
    expect(summary.baselineTokens).toBe(7500);
    // actual = baseline - cacheRead = 7500 - 500 - 300 = 6700
    expect(summary.actualTokens).toBe(6700);
    // saved = baseline - actual = 7500 - 6700 = 800
    expect(summary.savedTokens).toBe(800);
    expect(summary.cheapestTask).not.toBeNull();
  });

  it('all rejected: 2 routes, all rejected, 0% rate', () => {
    appendHistory(makeHistoryEntry({ sessionId: 'test-session', query: 'do something', matched: 'tool-a', accepted: false }));
    appendHistory(makeHistoryEntry({ sessionId: 'test-session', query: 'do other', matched: 'tool-b', accepted: false }));
    appendUsage(makeUsageEntry({ sessionId: 'test-session', inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, taskType: 'simple-task' }));

    const summary = buildSessionSummary('test-session', {
      historyPath: HISTORY_FILE,
      usagePath: USAGE_FILE,
    });
    expect(summary.routeCount).toBe(2);
    expect(summary.acceptCount).toBe(0);
    expect(summary.acceptRate).toBe(0);
    expect(summary.avoidCount).toBe(2);
    // baseline = 1000+500 = 1500, no cache savings
    expect(summary.baselineTokens).toBe(1500);
    expect(summary.actualTokens).toBe(1500);
    expect(summary.savedTokens).toBe(0);
    expect(summary.cheapestTask).not.toBeNull();
    expect(summary.cheapestTask!.taskType).toBe('simple-task');
  });

  it('mixed: partial acceptance', () => {
    appendHistory(makeHistoryEntry({ sessionId: 'test-session', query: 'q1', matched: 't1', accepted: true }));
    appendHistory(makeHistoryEntry({ sessionId: 'test-session', query: 'q2', matched: 't2', accepted: false }));
    appendHistory(makeHistoryEntry({ sessionId: 'test-session', query: 'q3', matched: 't3', accepted: true }));
    appendUsage(makeUsageEntry({ sessionId: 'test-session', inputTokens: 1000, outputTokens: 500, cacheReadTokens: 200 }));

    const summary = buildSessionSummary('test-session', {
      historyPath: HISTORY_FILE,
      usagePath: USAGE_FILE,
    });
    expect(summary.routeCount).toBe(3);
    expect(summary.acceptCount).toBe(2);
    expect(summary.acceptRate).toBe(67);
    expect(summary.avoidCount).toBe(1);
    // baseline = 1500, actual = 1500-200 = 1300, saved = 200
    expect(summary.baselineTokens).toBe(1500);
    expect(summary.actualTokens).toBe(1300);
    expect(summary.savedTokens).toBe(200);
  });

  it('baseline calculation: savedTokens equals cacheReadTokens', () => {
    appendUsage(makeUsageEntry({ sessionId: 'test-session', inputTokens: 5000, outputTokens: 2000, cacheReadTokens: 1000 }));

    const summary = buildSessionSummary('test-session', {
      historyPath: HISTORY_FILE,
      usagePath: USAGE_FILE,
    });
    // baseline = 5000+2000 = 7000
    expect(summary.baselineTokens).toBe(7000);
    // actual = 7000 - 1000 = 6000
    expect(summary.actualTokens).toBe(6000);
    // saved = 7000 - 6000 = 1000 = cacheReadTokens
    expect(summary.savedTokens).toBe(1000);
    expect(summary.savedTokens).toBe(summary.baselineTokens - summary.actualTokens);
  });
});

describe('formatSessionSummary', () => {
  it('renders empty session summary', () => {
    const summary: SessionSummary = {
      routeCount: 0,
      acceptCount: 0,
      acceptRate: 0,
      avoidCount: 0,
      baselineTokens: 0,
      actualTokens: 0,
      savedTokens: 0,
      baselineCostUSD: 0,
      actualCostUSD: 0,
      savedCostUSD: 0,
      cheapestTask: null,
    };
    const output = formatSessionSummary(summary);
    expect(output).toContain('本次会话小结：');
    expect(output).toContain('路由 0 次');
    expect(output).toContain('替你避开过 0 次错选');
    expect(output).not.toContain('最省钱的一次');
  });

  it('renders summary with cheapest task', () => {
    const summary: SessionSummary = {
      routeCount: 5,
      acceptCount: 3,
      acceptRate: 60,
      avoidCount: 2,
      baselineTokens: 12000,
      actualTokens: 10000,
      savedTokens: 2000,
      baselineCostUSD: 0.15,
      actualCostUSD: 0.05,
      savedCostUSD: 0.10,
      cheapestTask: { tokens: 500, model: 'haiku', taskType: 'code-review' },
    };
    const output = formatSessionSummary(summary);
    expect(output).toContain('路由 5 次，你接受了 3 次 (60%)');
    expect(output).toContain('替你避开过 2 次错选');
    expect(output).toContain('~2.0k tokens');
    expect(output).toContain('~$0.1');
    expect(output).toContain('最省钱的一次：~0.5k 用 haiku 做 code-review');
  });

  it('formats small token counts with k suffix', () => {
    const summary: SessionSummary = {
      routeCount: 1,
      acceptCount: 1,
      acceptRate: 100,
      avoidCount: 0,
      baselineTokens: 1000,
      actualTokens: 800,
      savedTokens: 200,
      baselineCostUSD: 0.005,
      actualCostUSD: 0.001,
      savedCostUSD: 0.004,
      cheapestTask: { tokens: 800, model: 'sonnet', taskType: 'debug' },
    };
    const output = formatSessionSummary(summary);
    expect(output).toContain('~0.2k tokens');
    expect(output).toContain('~0.8k 用 sonnet 做 debug');
  });

  it('formats large cost with dollar sign', () => {
    const summary: SessionSummary = {
      routeCount: 10,
      acceptCount: 8,
      acceptRate: 80,
      avoidCount: 2,
      baselineTokens: 120000,
      actualTokens: 100000,
      savedTokens: 20000,
      baselineCostUSD: 2.0,
      actualCostUSD: 1.5,
      savedCostUSD: 0.5,
      cheapestTask: { tokens: 5000, model: 'sonnet', taskType: 'refactor' },
    };
    const output = formatSessionSummary(summary);
    expect(output).toContain('~20.0k tokens');
    expect(output).toContain('~$0.5');
  });

  it('shows real savings when cache read tokens exist', () => {
    const summary: SessionSummary = {
      routeCount: 3,
      acceptCount: 2,
      acceptRate: 67,
      avoidCount: 1,
      baselineTokens: 6000,
      actualTokens: 4500,
      savedTokens: 1500,
      baselineCostUSD: 0.09,
      actualCostUSD: 0.03,
      savedCostUSD: 0.06,
      cheapestTask: null,
    };
    const output = formatSessionSummary(summary);
    expect(output).toContain('~1.5k tokens');
    expect(output).toContain('~$0.06');
  });
});
