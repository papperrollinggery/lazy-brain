import type {
  RecommendationAnalysis,
  RecommendationReceiptPolicy,
  RecommendationWorkPlan,
  RouteSpec,
  RouteTarget,
  WorkEnvelope,
  WorkRole,
  WorkflowPhase,
} from '../types.js';

function compact(items: Array<string | undefined>): string[] {
  return [...new Set(items.map(item => item?.trim()).filter((item): item is string => Boolean(item)))];
}

function roleForSpec(spec: RouteSpec, analysis: RecommendationAnalysis): WorkRole {
  if (spec.mode === 'needs_clarification' || spec.tokenStrategy.shouldClarifyFirst) return 'judge';
  if (analysis.contextReadiness === 'missing' || analysis.contextReadiness === 'partial') return 'scout';
  if (spec.mode === 'no_route_needed') return 'pm';
  if (spec.executionMode === 'advisory' || spec.choices.recommended.kind === 'model') return 'judge';
  return 'worker';
}

function phaseForRole(role: WorkRole): WorkflowPhase {
  switch (role) {
    case 'scout':
    case 'judge':
      return 'before_worker';
    case 'worker':
      return 'after_worker';
    case 'pm':
      return 'blocked_task';
  }
}

function receiptFieldsForRole(role: WorkRole): string[] {
  switch (role) {
    case 'scout':
      return ['result', 'summary', 'evidence', 'ambiguity_or_next_tasks'];
    case 'judge':
      return ['result', 'decision', 'evidence', 'next_allowed_task'];
    case 'worker':
      return ['result', 'changed_files', 'commands', 'summary'];
    case 'pm':
      return ['result', 'state_update', 'verification_status', 'next_action'];
  }
}

export function buildReceiptPolicy(workPlan: RecommendationWorkPlan, eventId?: string): RecommendationReceiptPolicy {
  return {
    requiredFields: receiptFieldsForRole(workPlan.role),
    recordWhen: [
      'After the recommendation is accepted, copied, ignored, or marked wrong.',
      'After the active step completes, blocks, or changes route.',
    ],
    proofSignals: compact([
      eventId ? `Route event: ${eventId}` : undefined,
      `Role: ${workPlan.role}`,
      `Verify: ${workPlan.verify.slice(0, 2).join(' | ')}`,
      `Completion: ${workPlan.completionProof}`,
    ]),
  };
}

export function buildWorkEnvelope(input: {
  spec: RouteSpec;
  analysis: RecommendationAnalysis;
  recoveryAction: string;
  eventId?: string;
  degraded?: boolean;
  degradeReason?: string;
  recoveryActionOverride?: string;
}): WorkEnvelope {
  const { spec, analysis, eventId } = input;
  const role = roleForSpec(spec, analysis);
  const verify = analysis.verification.length > 0
    ? analysis.verification
    : ['Run the smallest command that proves the recommended route worked.'];
  const allowedScope = role === 'worker'
    ? compact([
      'Only files required by the selected task.',
      ...spec.skills.slice(0, 4).map(skill => `Capability: ${skill.name}`),
    ])
    : compact([
      'Read-only evidence gathering.',
      ...analysis.contextGaps,
      ...spec.skills.slice(0, 4).map(skill => `Capability: ${skill.name}`),
    ]);
  const stopIf = compact([
    'Need files or credentials outside the recommended scope.',
    'Route evidence conflicts with repo facts.',
    'Verification fails twice.',
    analysis.contextReadiness === 'missing' ? 'Required context is still missing.' : undefined,
    analysis.contextReadiness === 'partial' ? 'Context gaps remain unresolved.' : undefined,
    spec.choices.recommended.confidence < 0.5 ? 'Route confidence is below 50%.' : undefined,
  ]);

  const workPlan: RecommendationWorkPlan = {
    role,
    roleReason: role === 'scout'
      ? 'Context is not complete enough for direct execution.'
      : role === 'judge'
        ? 'The route needs a decision, clarification, or advisory review before execution.'
        : role === 'worker'
          ? 'The task is bounded enough to execute with verification.'
          : 'The next step is coordination, recovery, or no-route handling.',
    activeStep: spec.executionPlan[0]?.title ?? analysis.userNextStep,
    objective: analysis.objective,
    allowedScope,
    verify,
    stopIf,
    nextAction: role === 'scout'
      ? 'Collect the missing evidence, then rerun LazyBrain route before writing.'
      : role === 'judge'
        ? 'Make the smallest route decision and produce the next bounded worker task if needed.'
        : role === 'worker'
          ? analysis.agentNextStep
          : input.recoveryAction,
    completionProof: analysis.doneWhen.length > 0
      ? analysis.doneWhen.join(' | ')
      : 'A receipt records the result and current verification state.',
  };

  return {
    schemaVersion: '1.0.0',
    eventId,
    target: spec.target,
    intent: spec.intent,
    phase: phaseForRole(role),
    ...workPlan,
    receiptPolicy: buildReceiptPolicy(workPlan, eventId),
    degraded: input.degraded,
    degradeReason: input.degradeReason,
    recoveryAction: input.recoveryActionOverride ?? input.recoveryAction,
  };
}

export function buildDegradedWorkEnvelope(input: {
  query: string;
  target?: RouteTarget;
  degradeReason: string;
  recoveryAction: string;
  eventId?: string;
}): WorkEnvelope {
  const workPlan: RecommendationWorkPlan = {
    role: 'pm',
    roleReason: 'Hook runtime skipped full routing, so the safe work is recovery and conservative coordination.',
    activeStep: 'Recover route delivery and continue with a conservative local plan.',
    objective: input.query.slice(0, 240),
    allowedScope: [
      'Do not start broad execution from a degraded hook result.',
      'Use local context already available to the agent.',
    ],
    verify: [
      'Run `lazybrain hook doctor --fix` when applicable.',
      'Retry `lazybrain route` after recovery.',
    ],
    stopIf: [
      'Host remains overloaded.',
      'Breaker immediately reopens.',
      'The task requires high-confidence route selection.',
    ],
    nextAction: input.recoveryAction,
    completionProof: 'Full route delivery recovers or the conservative fallback is explicitly verified.',
  };
  return {
    schemaVersion: '1.0.0',
    eventId: input.eventId,
    target: input.target ?? 'claude',
    intent: 'degraded_delivery',
    phase: 'blocked_task',
    ...workPlan,
    receiptPolicy: buildReceiptPolicy(workPlan, input.eventId),
    degraded: true,
    degradeReason: input.degradeReason,
    recoveryAction: input.recoveryAction,
  };
}

export function formatWorkEnvelopeForAgent(envelope: WorkEnvelope): string {
  return [
    `Work role: ${envelope.role}`,
    `Active step: ${envelope.activeStep}`,
    `Objective: ${envelope.objective}`,
    `Allowed scope: ${envelope.allowedScope.join(' | ')}`,
    `Verify: ${envelope.verify.join(' | ')}`,
    `Stop if: ${envelope.stopIf.join(' | ')}`,
    `Receipt required: ${envelope.receiptPolicy.requiredFields.join(', ')}`,
    `Completion proof: ${envelope.completionProof}`,
  ].join('\n');
}
