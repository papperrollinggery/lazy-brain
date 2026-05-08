import { describe, expect, it } from 'vitest';
import { findCombo } from '../../src/combos/registry.js';
import { buildFastWorkEnvelope, formatFastWorkEnvelopeForHook } from '../../src/orchestrator/fast-work-envelope.js';
import { classifyRouteNeed } from '../../src/orchestrator/route-gate.js';

describe('fast work envelope', () => {
  it('builds a low-latency hook work hint without full route spec', () => {
    const query = 'fix failing tests and create a PR';
    const decision = classifyRouteNeed(query);
    const envelope = buildFastWorkEnvelope({
      query,
      decision,
      combo: findCombo(query),
      eventId: 'evt-fast',
    });

    expect(envelope.eventId).toBe('evt-fast');
    expect(envelope.role).toBe('worker');
    expect(envelope.verify).toContain('npm test');
    expect(envelope.receiptPolicy.requiredFields).toContain('changed_files');
    expect(formatFastWorkEnvelopeForHook(envelope).split('\n')).toHaveLength(7);
  });

  it('uses judge role for high-risk hook tasks', () => {
    const query = '检查公开安装 hook 的隐私和回滚风险';
    const decision = classifyRouteNeed(query);
    const envelope = buildFastWorkEnvelope({ query, decision, combo: findCombo(query) });

    expect(decision.category).toBe('high_risk');
    expect(envelope.role).toBe('judge');
    expect(envelope.allowedScope[0]).toContain('Do not edit');
    expect(envelope.stopIf).toContain('Required context is still missing.');
  });
});
