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
    expect(summary.totalTokens).toBe(0);
    expect(summary.totalCostUSD).toBe(0);
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
    appendUsage(makeUsageEntry({ sessionId: 'test-session', inputTokens: 3000, outputTokens: 1500, costUsd: 0.006 }));
    appendUsage(makeUsageEntry({ sessionId: 'test-session', inputTokens: 2000, outputTokens: 1000, costUsd: 0.004 }));

    const summary = buildSessionSummary('test-session', {
      historyPath: HISTORY_FILE,
      usagePath: USAGE_FILE,
    });
    expect(summary.routeCount).toBe(3);
    expect(summary.acceptCount).toBe(3);
    expect(summary.acceptRate).toBe(100);
    expect(summary.avoidCount).toBe(0);
    expect(summary.totalTokens).toBe(7500);
    expect(summary.totalCostUSD).toBeCloseTo(0.01);
    expect(summary.cheapestTask).not.toBeNull();
  });

  it('all rejected: 2 routes, all rejected, 0% rate', () => {
    appendHistory(makeHistoryEntry({ sessionId: 'test-session', query: 'do something', matched: 'tool-a', accepted: false }));
    appendHistory(makeHistoryEntry({ sessionId: 'test-session', query: 'do other', matched: 'tool-b', accepted: false }));
    appendUsage(makeUsageEntry({ sessionId: 'test-session', costUsd: 0.001, taskType: 'simple-task' }));

    const summary = buildSessionSummary('test-session', {
      historyPath: HISTORY_FILE,
      usagePath: USAGE_FILE,
    });
    expect(summary.routeCount).toBe(2);
    expect(summary.acceptCount).toBe(0);
    expect(summary.acceptRate).toBe(0);
    expect(summary.avoidCount).toBe(2);
    expect(summary.totalTokens).toBe(1500);
    expect(summary.cheapestTask).not.toBeNull();
    expect(summary.cheapestTask!.taskType).toBe('simple-task');
  });

  it('mixed: partial acceptance', () => {
    appendHistory(makeHistoryEntry({ sessionId: 'test-session', query: 'q1', matched: 't1', accepted: true }));
    appendHistory(makeHistoryEntry({ sessionId: 'test-session', query: 'q2', matched: 't2', accepted: false }));
    appendHistory(makeHistoryEntry({ sessionId: 'test-session', query: 'q3', matched: 't3', accepted: true }));
    appendUsage(makeUsageEntry({ sessionId: 'test-session', inputTokens: 1000, outputTokens: 500, costUsd: 0.002 }));

    const summary = buildSessionSummary('test-session', {
      historyPath: HISTORY_FILE,
      usagePath: USAGE_FILE,
    });
    expect(summary.routeCount).toBe(3);
    expect(summary.acceptCount).toBe(2);
    expect(summary.acceptRate).toBe(67);
    expect(summary.avoidCount).toBe(1);
  });
});

describe('formatSessionSummary', () => {
  it('renders empty session summary', () => {
    const summary: SessionSummary = {
      routeCount: 0,
      acceptCount: 0,
      acceptRate: 0,
      avoidCount: 0,
      totalTokens: 0,
      totalCostUSD: 0,
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
      totalTokens: 10000,
      totalCostUSD: 0.05,
      cheapestTask: { tokens: 500, model: 'haiku', taskType: 'code-review' },
    };
    const output = formatSessionSummary(summary);
    expect(output).toContain('路由 5 次，你接受了 3 次 (60%)');
    expect(output).toContain('替你避开过 2 次错选');
    expect(output).toContain('~10.0k tokens');
    expect(output).toContain('最省钱的一次：~0.5k 用 haiku 做 code-review');
  });

  it('formats small token counts with k suffix', () => {
    const summary: SessionSummary = {
      routeCount: 1,
      acceptCount: 1,
      acceptRate: 100,
      avoidCount: 0,
      totalTokens: 800,
      totalCostUSD: 0.001,
      cheapestTask: { tokens: 800, model: 'sonnet', taskType: 'debug' },
    };
    const output = formatSessionSummary(summary);
    expect(output).toContain('~0.8k tokens');
    expect(output).toContain('~0.8k 用 sonnet 做 debug');
  });

  it('formats large cost with dollar sign', () => {
    const summary: SessionSummary = {
      routeCount: 10,
      acceptCount: 8,
      acceptRate: 80,
      avoidCount: 2,
      totalTokens: 100000,
      totalCostUSD: 1.5,
      cheapestTask: { tokens: 5000, model: 'sonnet', taskType: 'refactor' },
    };
    const output = formatSessionSummary(summary);
    expect(output).toContain('~100.0k tokens');
    expect(output).toContain('~$1.5');
  });
});
