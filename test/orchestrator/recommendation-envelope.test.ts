import { describe, expect, it } from 'vitest';
import { buildDegradedRecommendationEnvelope, buildRecommendationEnvelope, formatRecommendationEnvelope } from '../../src/orchestrator/recommendation-envelope.js';
import type { RouteSpec } from '../../src/types.js';

function routeSpec(): RouteSpec {
  return {
    schemaVersion: '1.5.0',
    query: 'review this PR for regressions',
    target: 'codex',
    mode: 'route_plan',
    intent: 'Review regressions',
    scenario: 'Code review',
    whyRoute: 'The task asks for regression risk review.',
    combo: 'code_review_regression',
    entryCommand: 'lazybrain route "<query>" --target codex',
    executionMode: 'advisory',
    modelStrategy: 'strong reasoning for regression review',
    skills: [{
      id: 'review',
      name: 'code-review',
      kind: 'skill',
      category: 'code-quality',
      origin: 'test',
      available: true,
    }],
    executionPlan: [{ title: 'Review diff' }],
    contextNeeded: ['diff'],
    guardrails: [{ title: 'Do not edit during review' }],
    verification: [{ title: 'Run tests', command: 'npm test', required: true }],
    doneWhen: ['Findings reported'],
    tokenStrategy: {
      topKSkills: 1,
      includeFullSkillBody: false,
      suggestSubagents: false,
      shouldClarifyFirst: false,
      contextBudget: 'focused',
      summary: 'Use focused review context.',
    },
    choices: {
      intent: 'Review regressions',
      recommended: {
        id: 'workflow:code_review_regression',
        kind: 'workflow',
        label: 'Code review regression workflow',
        confidence: 0.86,
        cost: 'medium',
        latency: 'normal',
        risk: 'medium',
        reason: 'Best fit for PR review.',
        command: 'lazybrain prompt "review this PR" --target codex --copy',
      },
      alternatives: [{
        id: 'model:strong-reasoning',
        kind: 'model',
        label: 'Strong reasoning model',
        confidence: 0.8,
        cost: 'high',
        latency: 'slow',
        risk: 'low',
        reason: 'Use for deep review.',
      }],
      conflicts: [],
      policy: { defaultAction: 'auto', askUser: false, reason: 'safe route' },
    },
    adapters: {
      generic: { target: 'generic', prompt: 'Generic route prompt' },
      codex: { target: 'codex', prompt: 'Codex advisory route plan' },
    },
    warnings: [],
    unlockWarnings: [],
  };
}

describe('recommendation envelope', () => {
  it('wraps a route spec into user and agent lanes', () => {
    const envelope = buildRecommendationEnvelope(routeSpec(), { eventId: 'evt-1' });

    expect(envelope.eventId).toBe('evt-1');
    expect(envelope.userLane.title).toBe('Code review regression workflow');
    expect(envelope.agentLane.primaryAction).toBe('Codex advisory route plan');
    expect(envelope.analysis.objective).toBe('Review regressions');
    expect(envelope.analysis.contextReadiness).toBe('partial');
    expect(envelope.analysis.contextGaps).toContain('Needs context: diff');
    expect(envelope.analysis.verification).toContain('npm test');
    expect(envelope.workPlan.role).toBe('scout');
    expect(envelope.workEnvelope.role).toBe('scout');
    expect(envelope.workEnvelope.phase).toBe('before_worker');
    expect(envelope.workEnvelope.receiptPolicy.requiredFields).toContain('evidence');
    expect(envelope.workPlan.allowedScope).toContain('Needs context: diff');
    expect(envelope.workPlan.verify).toContain('npm test');
    expect(envelope.workPlan.stopIf).toContain('Context gaps remain unresolved.');
    expect(envelope.receiptPolicy.requiredFields).toContain('evidence');
    expect(envelope.receiptPolicy.proofSignals).toContain('Route event: evt-1');
    expect(envelope.alternatives[0].id).toBe('model:strong-reasoning');
    expect(envelope.degradeLevel).toBe('none');
    expect(envelope.copyablePrompt).toContain('Codex advisory');
  });

  it('formats degraded hook output with recovery action', () => {
    const envelope = buildDegradedRecommendationEnvelope({
      query: '修这个测试',
      degradeReason: 'slow_recent_avg',
    });

    expect(envelope.degradeLevel).toBe('light');
    expect(envelope.analysis.executionMode).toBe('fail-soft');
    expect(envelope.analysis.risks[0]).toContain('low');
    expect(envelope.workPlan.role).toBe('pm');
    expect(envelope.workEnvelope.degraded).toBe(true);
    expect(envelope.workEnvelope.degradeReason).toBe('slow_recent_avg');
    expect(envelope.receiptPolicy.requiredFields).toContain('state_update');
    expect(envelope.recoveryAction).toContain('lazybrain hook doctor --fix');
    expect(formatRecommendationEnvelope(envelope)).toContain('Degraded: slow_recent_avg');
    expect(formatRecommendationEnvelope(envelope)).toContain('Work: pm');
  });
});
