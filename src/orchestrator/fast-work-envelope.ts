import type { ComboTemplate } from '../combos/registry.js';
import type { RouteGateDecision } from './route-gate.js';
import type { RecommendationWorkPlan, RouteTarget, WorkEnvelope, WorkRole, WorkflowPhase } from '../types.js';
import { buildReceiptPolicy } from './work-envelope.js';

export interface FastCapabilityHint {
  name: string;
  score?: number;
  reason?: string;
}

const WORKER_PATTERN = /\b(fix failing test|fix bug|implement|add|write|create|build|update|repair)\b|修复|修这个|实现|新增|写一个|做一个|创建|改这个/iu;

function compact(items: Array<string | undefined>): string[] {
  return [...new Set(items.map(item => item?.trim()).filter((item): item is string => Boolean(item)))];
}

function roleForFastWork(query: string, decision: RouteGateDecision, combo?: ComboTemplate): WorkRole {
  if (decision.mode === 'needs_clarification' || decision.category === 'high_risk') return 'judge';
  if (decision.mode === 'no_route_needed') return 'pm';
  if (WORKER_PATTERN.test(query) && combo?.executionMode === 'guided') return 'worker';
  return 'scout';
}

function phaseForRole(role: WorkRole): WorkflowPhase {
  switch (role) {
    case 'worker':
      return 'after_worker';
    case 'pm':
      return 'blocked_task';
    case 'scout':
    case 'judge':
      return 'before_worker';
  }
}

function roleReason(role: WorkRole, decision: RouteGateDecision): string {
  switch (role) {
    case 'judge':
      return decision.mode === 'needs_clarification'
        ? 'Clarify the task before execution.'
        : 'This task touches risky surfaces; decide scope and rollback before writing.';
    case 'worker':
      return 'The task is concrete enough for a bounded implementation pass.';
    case 'scout':
      return 'Collect the missing repo facts before writing.';
    case 'pm':
      return 'No full route is needed; keep the next step small.';
  }
}

function activeStep(role: WorkRole, combo?: ComboTemplate): string {
  if (combo?.workflow[0]?.title) return combo.workflow[0].title;
  switch (role) {
    case 'judge':
      return 'Choose the safe scope and one verification path.';
    case 'worker':
      return 'Make the smallest scoped change.';
    case 'scout':
      return 'Inspect the relevant files, diff, errors, or UI state.';
    case 'pm':
      return 'Handle directly or ask one concise question if blocked.';
  }
}

function verifyFor(combo?: ComboTemplate): string[] {
  const checks = combo?.verification
    .map(item => item.command ?? item.title)
    .filter(Boolean)
    .slice(0, 3) ?? [];
  return checks.length > 0 ? checks : ['Run the smallest relevant check before completion.'];
}

function scopeFor(role: WorkRole, combo?: ComboTemplate, topMatches: FastCapabilityHint[] = []): string[] {
  const capabilities = compact([
    ...(combo?.skillNames.slice(0, 3).map(name => `Capability: ${name}`) ?? []),
    ...topMatches.slice(0, 3).map(match => `Capability: ${match.name}`),
  ]);
  if (role === 'worker') {
    return compact(['Only files required by the active step.', ...capabilities]);
  }
  if (role === 'judge') {
    return compact(['Do not edit until scope, risk, and verification are clear.', ...capabilities]);
  }
  if (role === 'scout') {
    return compact(['Read-only evidence gathering first.', ...(combo?.contextNeeded.slice(0, 3).map(item => `Need: ${item}`) ?? []), ...capabilities]);
  }
  return ['Keep the next action local and reversible.'];
}

function stopIfFor(role: WorkRole): string[] {
  return role === 'worker'
    ? ['Required files or credentials are outside scope.', 'Verification fails twice.', 'The route evidence conflicts with repo facts.']
    : ['Required context is still missing.', 'The task requires broad writes.', 'Route evidence conflicts with repo facts.'];
}

export function buildFastWorkEnvelope(input: {
  query: string;
  target?: RouteTarget;
  decision: RouteGateDecision;
  combo?: ComboTemplate;
  topMatches?: FastCapabilityHint[];
  eventId?: string;
}): WorkEnvelope {
  const role = roleForFastWork(input.query, input.decision, input.combo);
  const verify = verifyFor(input.combo);
  const workPlan: RecommendationWorkPlan = {
    role,
    roleReason: roleReason(role, input.decision),
    activeStep: activeStep(role, input.combo),
    objective: input.combo?.title ?? input.query.slice(0, 240),
    allowedScope: scopeFor(role, input.combo, input.topMatches),
    verify,
    stopIf: stopIfFor(role),
    nextAction: role === 'judge'
      ? 'Decide the smallest safe path, then rerun route if scope changes.'
      : role === 'scout'
        ? 'Gather the missing facts, then proceed only if scope is clear.'
        : role === 'worker'
          ? 'Execute the active step and record receipt evidence.'
          : 'Handle directly without loading extra route context.',
    completionProof: input.combo?.doneWhen.slice(0, 2).join(' | ') || 'A receipt records result and verification state.',
  };
  return {
    schemaVersion: '1.0.0',
    eventId: input.eventId,
    target: input.target ?? 'claude',
    intent: input.combo?.title ?? input.decision.category,
    phase: phaseForRole(role),
    ...workPlan,
    receiptPolicy: buildReceiptPolicy(workPlan, input.eventId),
    degraded: false,
    recoveryAction: 'Run `lazybrain route "<task>" --brief` for the full route if this hook hint is not enough.',
  };
}

export function formatFastWorkEnvelopeForHook(envelope: WorkEnvelope): string {
  return [
    `LazyBrain WorkEnvelope`,
    `Role: ${envelope.role} — ${envelope.roleReason}`,
    `Do next: ${envelope.activeStep}`,
    `Allowed scope: ${envelope.allowedScope.slice(0, 4).join(' | ')}`,
    `Verify: ${envelope.verify.slice(0, 3).join(' | ')}`,
    `Stop if: ${envelope.stopIf.slice(0, 3).join(' | ')}`,
    `Receipt: ${envelope.receiptPolicy.requiredFields.join(', ')}`,
  ].join('\n');
}
