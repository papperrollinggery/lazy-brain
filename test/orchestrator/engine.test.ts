import { describe, expect, test } from 'vitest';
import { orchestrate } from '../../src/orchestrator/engine.js';
import { signalFromFileChange, signalFromQuery } from '../../src/orchestrator/signals.js';

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
});
