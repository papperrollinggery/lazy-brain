import { describe, expect, it } from 'vitest';
import { buildDegradedWorkEnvelope, buildWorkEnvelope, formatWorkEnvelopeForAgent } from '../../src/orchestrator/work-envelope.js';
import type { RecommendationAnalysis, RouteSpec } from '../../src/types.js';

function routeSpec(overrides: Partial<RouteSpec> = {}): RouteSpec {
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
    executionPlan: [{ title: 'Inspect changed files' }],
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
      },
      alternatives: [],
      conflicts: [],
      policy: { defaultAction: 'auto', askUser: false, reason: 'safe route' },
    },
    adapters: {
      generic: { target: 'generic', prompt: 'Generic route prompt' },
      codex: { target: 'codex', prompt: 'Codex advisory route plan' },
    },
    warnings: [],
    unlockWarnings: [],
    ...overrides,
  };
}

function analysis(overrides: Partial<RecommendationAnalysis> = {}): RecommendationAnalysis {
  return {
    objective: 'Review regressions',
    userNextStep: 'Inspect the diff.',
    agentNextStep: 'Run the regression review workflow.',
    contextReadiness: 'partial',
    contextGaps: ['Needs context: diff'],
    executionMode: 'advisory',
    verification: ['npm test'],
    doneWhen: ['Findings reported'],
    risks: [],
    ...overrides,
  };
}

describe('work envelope', () => {
  it('builds a stable shared work contract from a route spec', () => {
    const envelope = buildWorkEnvelope({
      spec: routeSpec(),
      analysis: analysis(),
      recoveryAction: 'Run lazybrain route again.',
      eventId: 'evt-1',
    });

    expect(envelope.schemaVersion).toBe('1.0.0');
    expect(envelope.eventId).toBe('evt-1');
    expect(envelope.role).toBe('scout');
    expect(envelope.phase).toBe('before_worker');
    expect(envelope.allowedScope).toContain('Needs context: diff');
    expect(envelope.verify).toContain('npm test');
    expect(envelope.stopIf).toContain('Context gaps remain unresolved.');
    expect(envelope.receiptPolicy.requiredFields).toContain('evidence');
    expect(envelope.receiptPolicy.proofSignals).toContain('Route event: evt-1');
    expect(formatWorkEnvelopeForAgent(envelope)).toContain('Work role: scout');
  });

  it('returns a conservative degraded work envelope for overloaded hook contexts', () => {
    const envelope = buildDegradedWorkEnvelope({
      query: 'fix this failing test',
      degradeReason: 'host_overload',
      recoveryAction: 'Wait for host load to drop.',
      eventId: 'evt-degraded',
    });

    expect(envelope.role).toBe('pm');
    expect(envelope.phase).toBe('blocked_task');
    expect(envelope.degraded).toBe(true);
    expect(envelope.degradeReason).toBe('host_overload');
    expect(envelope.nextAction).toBe('Wait for host load to drop.');
    expect(envelope.receiptPolicy.requiredFields).toContain('state_update');
  });
});
