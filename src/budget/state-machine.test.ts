import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  determineMode,
  computeDailyCost,
  computeMonthlyCost,
  getDailyBudget,
  getMonthlyBudget,
  loadUsageEntries,
  type UsageEntry,
} from './state-machine.js';

const DAILY_LIMIT = 2.0;
const MONTHLY_LIMIT = 30.0;

function makeEntry(costUsd: number, daysAgo: number = 0, month?: string): UsageEntry {
  const date = new Date('2026-04-18T12:00:00Z');
  date.setDate(date.getDate() - daysAgo);
  const timestamp = month
    ? `${month}-${String(date.getUTCDate()).padStart(2, '0')}T${date.toISOString().split('T')[1]}`
    : date.toISOString();
  return {
    timestamp,
    sessionId: 'test-session',
    costUsd,
    model: 'test-model',
  };
}

describe('state-machine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-18T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('determineMode', () => {
    it('returns normal when daily < 70%', () => {
      expect(determineMode(0, DAILY_LIMIT)).toBe('normal');
      expect(determineMode(0.5, DAILY_LIMIT)).toBe('normal');
      expect(determineMode(1.0, DAILY_LIMIT)).toBe('normal');
      expect(determineMode(1.39, DAILY_LIMIT)).toBe('normal');
    });

    it('returns caution when 70% <= daily < 90%', () => {
      expect(determineMode(1.4, DAILY_LIMIT)).toBe('caution');
      expect(determineMode(1.5, DAILY_LIMIT)).toBe('caution');
      expect(determineMode(1.79, DAILY_LIMIT)).toBe('caution');
    });

    it('returns restricted when 90% <= daily < 100%', () => {
      expect(determineMode(1.8, DAILY_LIMIT)).toBe('restricted');
      expect(determineMode(1.9, DAILY_LIMIT)).toBe('restricted');
      expect(determineMode(1.99, DAILY_LIMIT)).toBe('restricted');
    });

    it('returns survival when daily >= 100%', () => {
      expect(determineMode(2.0, DAILY_LIMIT)).toBe('survival');
      expect(determineMode(2.5, DAILY_LIMIT)).toBe('survival');
      expect(determineMode(3.0, DAILY_LIMIT)).toBe('survival');
    });

    it('returns survival when limit is zero', () => {
      expect(determineMode(1.0, 0)).toBe('survival');
    });

    it('returns survival when limit is negative', () => {
      expect(determineMode(1.0, -5)).toBe('survival');
    });
  });

  describe('computeDailyCost', () => {
    it('sums costs for today', () => {
      const entries: UsageEntry[] = [
        makeEntry(0.5, 0),
        makeEntry(0.3, 0),
        makeEntry(0.2, 0),
      ];
      expect(computeDailyCost(entries)).toBe(1.0);
    });

    it('ignores costs from previous days', () => {
      const entries: UsageEntry[] = [
        makeEntry(1.0, 0),
        makeEntry(5.0, 1),
        makeEntry(10.0, 2),
      ];
      expect(computeDailyCost(entries)).toBe(1.0);
    });

    it('returns 0 for empty entries', () => {
      expect(computeDailyCost([])).toBe(0);
    });
  });

  describe('computeMonthlyCost', () => {
    it('sums costs for current month', () => {
      const entries: UsageEntry[] = [
        makeEntry(5.0, 0, '2026-04'),
        makeEntry(10.0, 5, '2026-04'),
        makeEntry(3.0, 10, '2026-04'),
      ];
      expect(computeMonthlyCost(entries)).toBe(18.0);
    });

    it('ignores costs from previous months', () => {
      const entries: UsageEntry[] = [
        makeEntry(5.0, 0, '2026-04'),
        makeEntry(10.0, 0, '2026-03'),
        makeEntry(3.0, 0, '2026-02'),
      ];
      expect(computeMonthlyCost(entries)).toBe(5.0);
    });

    it('returns 0 for empty entries', () => {
      expect(computeMonthlyCost([])).toBe(0);
    });
  });

  describe('environment variables', () => {
    const originalDaily = process.env.LAZYBRAIN_CLAUDE_DAILY;
    const originalMonthly = process.env.LAZYBRAIN_CLAUDE_MONTHLY;

    afterEach(() => {
      if (originalDaily !== undefined) {
        process.env.LAZYBRAIN_CLAUDE_DAILY = originalDaily;
      } else {
        delete process.env.LAZYBRAIN_CLAUDE_DAILY;
      }
      if (originalMonthly !== undefined) {
        process.env.LAZYBRAIN_CLAUDE_MONTHLY = originalMonthly;
      } else {
        delete process.env.LAZYBRAIN_CLAUDE_MONTHLY;
      }
    });

    it('uses default daily budget when env not set', () => {
      delete process.env.LAZYBRAIN_CLAUDE_DAILY;
      expect(getDailyBudget()).toBe(2.0);
    });

    it('uses env override for daily budget', () => {
      process.env.LAZYBRAIN_CLAUDE_DAILY = '5.0';
      expect(getDailyBudget()).toBe(5.0);
    });

    it('uses default monthly budget when env not set', () => {
      delete process.env.LAZYBRAIN_CLAUDE_MONTHLY;
      expect(getMonthlyBudget()).toBe(30.0);
    });

    it('uses env override for monthly budget', () => {
      process.env.LAZYBRAIN_CLAUDE_MONTHLY = '50.0';
      expect(getMonthlyBudget()).toBe(50.0);
    });

    it('falls back to default for invalid env values', () => {
      process.env.LAZYBRAIN_CLAUDE_DAILY = 'invalid';
      expect(getDailyBudget()).toBe(2.0);

      process.env.LAZYBRAIN_CLAUDE_DAILY = '-5';
      expect(getDailyBudget()).toBe(2.0);

      process.env.LAZYBRAIN_CLAUDE_DAILY = '';
      expect(getDailyBudget()).toBe(2.0);
    });
  });

  describe('loadUsageEntries', () => {
    it('returns empty array when file does not exist', () => {
      vi.mock('node:fs', () => ({
        existsSync: () => false,
      }));
      expect(loadUsageEntries()).toEqual([]);
    });
  });
});

describe('state transitions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-18T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('normal -> caution transition at 70%', () => {
    expect(determineMode(1.39, DAILY_LIMIT)).toBe('normal');
    expect(determineMode(1.4, DAILY_LIMIT)).toBe('caution');
  });

  it('caution -> restricted transition at 90%', () => {
    expect(determineMode(1.79, DAILY_LIMIT)).toBe('caution');
    expect(determineMode(1.8, DAILY_LIMIT)).toBe('restricted');
  });

  it('restricted -> survival transition at 100%', () => {
    expect(determineMode(1.99, DAILY_LIMIT)).toBe('restricted');
    expect(determineMode(2.0, DAILY_LIMIT)).toBe('survival');
  });

  it('survival when daily budget exhausted', () => {
    const entries: UsageEntry[] = [
      makeEntry(1.5, 0),
      makeEntry(0.6, 0),
    ];
    const dailyCost = computeDailyCost(entries);
    expect(dailyCost).toBe(2.1);
    expect(determineMode(dailyCost, DAILY_LIMIT)).toBe('survival');
  });
});

describe('free model down scenario', () => {
  it('survival mode when miniMax is unavailable', async () => {
    const { checkMiniMaxStatus, checkFreeModelsDown } = await import('./state-machine.js');
    const originalKey = process.env.MINIMAX_API_KEY;
    delete process.env.MINIMAX_API_KEY;
    const status = await checkMiniMaxStatus();
    expect(status.available).toBe(false);
    expect(status.reason).toBe('MINIMAX_API_KEY not configured');
    if (originalKey !== undefined) {
      process.env.MINIMAX_API_KEY = originalKey;
    }
  });

  it('nemotron assumed available when not disabled', async () => {
    const { checkNemotronStatus } = await import('./state-machine.js');
    const status = await checkNemotronStatus();
    expect(status.available).toBe(true);
  });
});
