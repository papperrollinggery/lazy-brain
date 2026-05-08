import type {
  ChoiceOption,
  ConflictNotice,
  RecommendationDegradeLevel,
  RecommendationAnalysis,
  RecommendationEnvelope,
  RecommendationFreshness,
  RouteSpec,
  RouteTarget,
} from '../types.js';
import { buildDegradedWorkEnvelope, buildWorkEnvelope } from './work-envelope.js';

const HELP_PROMPT = 'Use lazybrain route again after the graph and hook runtime are healthy.';

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function targetPrompt(spec: RouteSpec): string {
  return spec.adapters[spec.target]?.prompt ?? spec.adapters.generic.prompt;
}

function topChoice(spec: RouteSpec, kind: ChoiceOption['kind']): ChoiceOption | undefined {
  if (spec.choices.recommended.kind === kind) return spec.choices.recommended;
  return spec.choices.alternatives.find(choice => choice.kind === kind);
}

function freshnessForSpec(spec: RouteSpec): RecommendationFreshness {
  const warnings = [...spec.warnings, ...(spec.unlockWarnings ?? [])];
  const stale = warnings.find(warning => /stale|embedding|compile/i.test(warning));
  return {
    state: stale ? 'stale' : 'fresh',
    source: 'route-spec',
    message: stale ?? 'Route recommendation was generated from the current capability graph.',
  };
}

function laneDetails(spec: RouteSpec): string[] {
  const details: string[] = [];
  if (spec.combo) details.push(`Workflow: ${spec.combo}`);
  if (spec.modelStrategy) details.push(`Model: ${spec.modelStrategy}`);
  if (spec.skills.length > 0) details.push(`Skills: ${spec.skills.slice(0, 4).map(skill => skill.name).join(', ')}`);
  if (spec.verification.length > 0) {
    details.push(`Verify: ${spec.verification.slice(0, 2).map(item => item.command ?? item.title).join(' | ')}`);
  }
  return details;
}

function compact(items: Array<string | undefined>): string[] {
  return [...new Set(items.map(item => item?.trim()).filter((item): item is string => Boolean(item)))];
}

function conflictText(conflict: ConflictNotice): string {
  return `${conflict.severity}: ${conflict.reason}`;
}

function analysisForSpec(spec: RouteSpec, prompt: string, recoveryAction: string): RecommendationAnalysis {
  const recommended = spec.choices.recommended;
  const contextGaps = compact([
    ...(spec.clarificationQuestions ?? []),
    ...spec.contextNeeded.map(item => `Needs context: ${item}`),
  ]).slice(0, 8);
  const contextReadiness = spec.mode === 'needs_clarification'
    ? 'missing'
    : contextGaps.length > 0
      ? 'partial'
      : 'ready';
  const risks = compact([
    ...spec.warnings,
    ...(spec.unlockWarnings ?? []),
    ...spec.choices.conflicts.map(conflictText),
    ...spec.guardrails.map(guardrail => guardrail.detail ? `${guardrail.title}: ${guardrail.detail}` : guardrail.title),
    recommended.risk !== 'low' ? `Route risk: ${recommended.risk}` : undefined,
  ]).slice(0, 8);

  return {
    objective: spec.intent || spec.query,
    taskType: spec.scenario || recommended.kind,
    executionMode: `${spec.mode}${spec.executionMode ? `/${spec.executionMode}` : ''}`,
    contextReadiness,
    contextGaps,
    reasoning: compact([
      spec.whyRoute,
      spec.combo ? `Workflow fit: ${spec.combo}` : undefined,
      spec.modelStrategy ? `Model strategy: ${spec.modelStrategy}` : undefined,
      `Policy: ${spec.choices.policy.defaultAction} (${spec.choices.policy.reason})`,
    ]).slice(0, 6),
    userNextStep: recommended.command ?? spec.entryCommand ?? recoveryAction,
    agentNextStep: prompt,
    risks,
    verification: spec.verification.map(item => item.command ?? item.title).slice(0, 6),
    doneWhen: spec.doneWhen.slice(0, 6),
  };
}

export function buildRecommendationEnvelope(
  spec: RouteSpec,
  options: {
    eventId?: string;
    degradeLevel?: RecommendationDegradeLevel;
    degradeReason?: string;
    recoveryAction?: string;
    freshness?: RecommendationFreshness;
  } = {},
): RecommendationEnvelope {
  const recommended = spec.choices.recommended;
  const modelChoice = topChoice(spec, 'model');
  const prompt = targetPrompt(spec);
  const recoveryAction = options.recoveryAction ??
    (spec.mode === 'needs_clarification'
      ? (spec.clarificationQuestions?.[0] ?? 'Ask one clarifying question before executing.')
      : `Copy the ${spec.target} prompt and run the listed verification.`);
  const analysis = analysisForSpec(spec, prompt, recoveryAction);
  const workEnvelope = buildWorkEnvelope({
    spec,
    analysis,
    recoveryAction,
    eventId: options.eventId,
    degraded: options.degradeLevel !== undefined && options.degradeLevel !== 'none',
    degradeReason: options.degradeReason,
  });

  return {
    schemaVersion: '1.0.0',
    eventId: options.eventId,
    target: spec.target,
    intent: spec.intent,
    analysis,
    workPlan: workEnvelope,
    workEnvelope,
    receiptPolicy: workEnvelope.receiptPolicy,
    userLane: {
      title: recommended.label,
      summary: spec.whyRoute,
      primaryAction: recommended.command ?? spec.entryCommand ?? recoveryAction,
      details: laneDetails(spec),
    },
    agentLane: {
      title: `${spec.target} execution prompt`,
      summary: modelChoice
        ? `Recommended model path: ${modelChoice.label} (${pct(modelChoice.confidence)}).`
        : `Use the ${spec.target} adapter prompt.`,
      primaryAction: prompt,
      details: [
        `Mode: ${spec.mode}${spec.executionMode ? `/${spec.executionMode}` : ''}`,
        `Policy: ${spec.choices.policy.defaultAction} (${spec.choices.policy.reason})`,
      ],
    },
    alternatives: spec.choices.alternatives.slice(0, 8),
    confidence: recommended.confidence,
    freshness: options.freshness ?? freshnessForSpec(spec),
    degradeLevel: options.degradeLevel ?? 'none',
    degradeReason: options.degradeReason,
    recoveryAction,
    copyablePrompt: prompt,
  };
}

export function buildDegradedRecommendationEnvelope(input: {
  query: string;
  target?: RouteTarget;
  degradeReason: string;
  recoveryAction?: string;
}): RecommendationEnvelope {
  const target = input.target ?? 'claude';
  const recoveryAction = input.recoveryAction ?? recoveryActionForDegrade(input.degradeReason);
  const workEnvelope = buildDegradedWorkEnvelope({
    query: input.query,
    target,
    degradeReason: input.degradeReason,
    recoveryAction,
  });
  return {
    schemaVersion: '1.0.0',
    target,
    intent: 'degraded_delivery',
    analysis: {
      objective: input.query.slice(0, 240),
      taskType: 'degraded hook delivery',
      executionMode: 'fail-soft',
      contextReadiness: 'unknown',
      contextGaps: ['Full route analysis was skipped by runtime safety.'],
      reasoning: [
        `Degrade reason: ${input.degradeReason}`,
        'The hook should keep the editor responsive and still provide a conservative next step.',
      ],
      userNextStep: recoveryAction,
      agentNextStep: 'Continue with a small local plan, ask for missing context if needed, and verify before completion.',
      risks: ['Recommendation confidence is low because full routing did not run.'],
      verification: ['Retry route after recovery action succeeds.'],
      doneWhen: ['Full route can be generated again or the conservative plan is verified.'],
    },
    workPlan: workEnvelope,
    workEnvelope,
    receiptPolicy: workEnvelope.receiptPolicy,
    userLane: {
      title: 'LazyBrain degraded recommendation',
      summary: `LazyBrain skipped the full route because ${input.degradeReason}.`,
      primaryAction: recoveryAction,
      details: [
        'Full matching was skipped to keep the editor responsive.',
        'Use this lightweight route hint instead of treating the plugin as dead.',
      ],
    },
    agentLane: {
      title: 'Fail-soft route guidance',
      summary: 'Do not assume LazyBrain is unavailable. Continue with a conservative route plan.',
      primaryAction: 'Use a small local plan, ask one clarifying question if needed, and run verification before completion.',
      details: [
        `User task: ${input.query.slice(0, 240)}`,
        `Degrade reason: ${input.degradeReason}`,
      ],
    },
    alternatives: [],
    confidence: 0.35,
    freshness: {
      state: 'unknown',
      source: 'hook-runtime',
      message: 'Full route was skipped by hook runtime safety.',
    },
    degradeLevel: 'light',
    degradeReason: input.degradeReason,
    recoveryAction,
    copyablePrompt: HELP_PROMPT,
  };
}

export function recoveryActionForDegrade(reason: string): string {
  switch (reason) {
    case 'slow_recent_avg':
      return 'Run `lazybrain hook doctor --fix` to clear the poisoned slow-duration window, then retry the prompt.';
    case 'host_overload':
      return 'Wait for host load to drop or use `lazybrain route "<task>" --target codex --brief` manually.';
    case 'breaker_open':
      return 'Wait for breaker cooldown or run `lazybrain hook doctor --fix` if the breaker is stale.';
    case 'concurrency_limit':
      return 'Wait for the current hook run to finish, then retry the prompt.';
    default:
      return HELP_PROMPT;
  }
}

export function formatRecommendationEnvelope(envelope: RecommendationEnvelope): string {
  const lines = [
    `Recommendation: ${envelope.userLane.title} (${pct(envelope.confidence)})`,
    `User: ${envelope.userLane.summary}`,
    `Action: ${envelope.userLane.primaryAction}`,
    `Analysis: ${envelope.analysis.objective} | context ${envelope.analysis.contextReadiness}`,
    `Work: ${envelope.workPlan.role} | ${envelope.workPlan.activeStep}`,
    `Agent: ${envelope.agentLane.summary}`,
  ];
  if (envelope.degradeLevel !== 'none') {
    lines.push(`Degraded: ${envelope.degradeReason ?? envelope.degradeLevel}`);
  }
  if (envelope.recoveryAction) lines.push(`Recovery: ${envelope.recoveryAction}`);
  if (envelope.userLane.details.length > 0) lines.push(`Details: ${envelope.userLane.details.join(' | ')}`);
  if (envelope.alternatives.length > 0) {
    lines.push(`Alternatives: ${envelope.alternatives.slice(0, 3).map(choice => `${choice.label} (${pct(choice.confidence)})`).join(', ')}`);
  }
  lines.push(`Receipt: ${envelope.receiptPolicy.requiredFields.join(', ')}`);
  lines.push(`Prompt: ${envelope.copyablePrompt}`);
  return lines.join('\n');
}
