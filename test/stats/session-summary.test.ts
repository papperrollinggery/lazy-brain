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
    expect(summary.tokenDelta).toBe(0);
    expect(summary.lowestCostTask).toBeNull();
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
    // baseline includes cache reads as full-price input: 3000+1500+500 + 2000+1000+300 = 8300
    expect(summary.baselineTokens).toBe(8300);
    // actual excludes cache reads from full token usage: 3000+1500 + 2000+1000 = 7500
    expect(summary.actualTokens).toBe(7500);
    // saved = baseline - actual = 8300 - 7500 = 800
    expect(summary.tokenDelta).toBe(800);
    expect(summary.costDeltaUSD).toBeGreaterThanOrEqual(0);
    expect(summary.lowestCostTask).not.toBeNull();
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
    expect(summary.tokenDelta).toBe(0);
    expect(summary.lowestCostTask).not.toBeNull();
    expect(summary.lowestCostTask!.taskType).toBe('simple-task');
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
    // baseline = 1500 + 200 cache reads, actual = 1500, saved = 200
    expect(summary.baselineTokens).toBe(1700);
    expect(summary.actualTokens).toBe(1500);
    expect(summary.tokenDelta).toBe(200);
  });

  it('baseline calculation: tokenDelta equals cacheReadTokens', () => {
    appendUsage(makeUsageEntry({ sessionId: 'test-session', inputTokens: 5000, outputTokens: 2000, cacheReadTokens: 1000 }));

    const summary = buildSessionSummary('test-session', {
      historyPath: HISTORY_FILE,
      usagePath: USAGE_FILE,
    });
    // baseline = 5000+2000+1000 cache reads = 8000
    expect(summary.baselineTokens).toBe(8000);
    // actual = non-cache tokens only = 7000
    expect(summary.actualTokens).toBe(7000);
    // saved = 8000 - 7000 = 1000 = cacheReadTokens
    expect(summary.tokenDelta).toBe(1000);
    expect(summary.tokenDelta).toBe(summary.baselineTokens - summary.actualTokens);
    expect(summary.costDeltaUSD).toBeGreaterThanOrEqual(0);
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
      tokenDelta: 0,
      baselineCostUSD: 0,
      actualCostUSD: 0,
      costDeltaUSD: 0,
      lowestCostTask: null,
    };
    const output = formatSessionSummary(summary);
    expect(output).toContain('本次会话审计：');
    expect(output).toContain('路由 0 次');
    expect(output).toContain('跳过/拒绝 0 次推荐');
    expect(output).not.toContain('最低成本任务');
  });

  it('renders summary with cheapest task', () => {
    const summary: SessionSummary = {
      routeCount: 5,
      acceptCount: 3,
      acceptRate: 60,
      avoidCount: 2,
      baselineTokens: 12000,
      actualTokens: 10000,
      tokenDelta: 2000,
      baselineCostUSD: 0.15,
      actualCostUSD: 0.05,
      costDeltaUSD: 0.10,
      lowestCostTask: { tokens: 500, model: 'haiku', taskType: 'code-review' },
    };
    const output = formatSessionSummary(summary);
    expect(output).toContain('路由 5 次，你接受了 3 次 (60%)');
    expect(output).toContain('跳过/拒绝 2 次推荐');
    expect(output).toContain('基线 ~12.0k / 实际 ~10.0k / 差值 -~2.0k');
    expect(output).toContain('差值 -$0.1');
    expect(output).toContain('最低成本任务：~0.5k 用 haiku 做 code-review');
  });

  it('formats small token counts with k suffix', () => {
    const summary: SessionSummary = {
      routeCount: 1,
      acceptCount: 1,
      acceptRate: 100,
      avoidCount: 0,
      baselineTokens: 1000,
      actualTokens: 800,
      tokenDelta: 200,
      baselineCostUSD: 0.005,
      actualCostUSD: 0.001,
      costDeltaUSD: 0.004,
      lowestCostTask: { tokens: 800, model: 'sonnet', taskType: 'debug' },
    };
    const output = formatSessionSummary(summary);
    expect(output).toContain('差值 -~0.2k');
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
      tokenDelta: 20000,
      baselineCostUSD: 2.0,
      actualCostUSD: 1.5,
      costDeltaUSD: 0.5,
      lowestCostTask: { tokens: 5000, model: 'sonnet', taskType: 'refactor' },
    };
    const output = formatSessionSummary(summary);
    expect(output).toContain('差值 -~20.0k');
    expect(output).toContain('差值 -$0.5');
  });

  it('shows audited delta when cache read tokens exist', () => {
    const summary: SessionSummary = {
      routeCount: 3,
      acceptCount: 2,
      acceptRate: 67,
      avoidCount: 1,
      baselineTokens: 6000,
      actualTokens: 4500,
      tokenDelta: 1500,
      baselineCostUSD: 0.09,
      actualCostUSD: 0.03,
      costDeltaUSD: 0.06,
      lowestCostTask: null,
    };
    const output = formatSessionSummary(summary);
    expect(output).toContain('差值 -~1.5k');
    expect(output).toContain('差值 -$0.06');
  });
});
