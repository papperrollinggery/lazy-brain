import { describe, expect, test } from 'vitest';
import type { HistoryEntry } from '../../src/history/history.js';
import { orchestrate } from '../../src/orchestrator/engine.js';
import { loadRules } from '../../src/orchestrator/rules.js';
import { signalFromFileChange, signalFromQuery } from '../../src/orchestrator/signals.js';

function entry(recommended: string, index: number): HistoryEntry {
  return {
    timestamp: new Date(Date.now() + index).toISOString(),
    query: recommended,
    recommended,
    used: recommended,
    sessionId: 'test-session',
  };
}

describe('orchestrate', () => {
  test('payment code change recommends security and review', () => {
    const plan = orchestrate(signalFromFileChange(['src/payment/checkout.ts']));
    expect(plan?.enhancements.map((item) => item.name)).toContain('security-review');
    expect(plan?.enhancements.map((item) => item.name)).toContain('code-review');
    expect(plan?.confidence).toBeGreaterThanOrEqual(0.8);
  });

  test('low confidence returns null', () => {
    expect(orchestrate(signalFromQuery('hello'))).toBeNull();
  });

  test('user override is respected', () => {
    expect(orchestrate(signalFromQuery('deploy to production'), { maxEnhancements: 0 })).toBeNull();
  });

  test('auto activate requires threshold', () => {
    const plan = orchestrate(signalFromQuery('deploy new payment feature'), { autoActivate: true, confidenceThreshold: 0.85 });
    expect(plan?.autoActivate).toBe(true);
  });

  test('learned workflow can produce a plan from frequent history', () => {
    const learnedHistory = [
      'plan', 'code-review', 'ship',
      'plan', 'code-review', 'ship',
      'plan', 'code-review', 'ship',
    ].map(entry);

    const plan = orchestrate(signalFromQuery('plan the next sprint'), { maxEnhancements: 2, learnedHistory });

    expect(plan?.reason).toContain('learned frequent workflow');
    expect(plan?.enhancements.map((item) => item.name)).toEqual(['plan', 'code-review']);
    expect(plan?.autoActivate).toBe(false);
  });

  test('learned workflow can beat a lower confidence rule and auto activate', () => {
    const learnedHistory = [
      'plan', 'code-review', 'ship',
      'plan', 'code-review', 'ship',
      'plan', 'code-review', 'ship',
      'plan', 'code-review', 'ship',
    ].map(entry);

    const plan = orchestrate(signalFromQuery('plan architecture changes'), { autoActivate: true, confidenceThreshold: 0.9, learnedHistory });

    expect(plan?.enhancements.map((item) => item.name)).toEqual(['plan', 'code-review', 'ship']);
    expect(plan?.confidence).toBe(0.95);
    expect(plan?.autoActivate).toBe(true);
  });

  test('loads at least eighteen orchestration rules', () => {
    expect(loadRules()).toHaveLength(18);
  });
});
