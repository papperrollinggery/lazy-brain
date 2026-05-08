import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { ROUTE_EVENTS_PATH } from '../constants.js';
import type { ChoiceOption, ChoiceOptionKind, ReceiptOutcome, RouteMode, RouteSpec, RouteTarget, WorkRole, WorkflowPhase } from '../types.js';

export type RouteEventSource = 'cli' | 'api' | 'hook-gate' | 'prompt' | 'mcp';
export type RouteEventAdoptionAction = 'copy_prompt' | 'feedback' | 'accept' | 'ignore' | 'mark_wrong';
export type RouteEventFeedbackOutcome = 'accepted' | 'rejected';
export type RouteEventFeedbackReason =
  | 'wrong_skill'
  | 'wrong_model'
  | 'too_broad'
  | 'missed_council'
  | 'bad_copy_prompt'
  | 'other';

export const ROUTE_EVENT_FEEDBACK_REASONS: RouteEventFeedbackReason[] = [
  'wrong_skill',
  'wrong_model',
  'too_broad',
  'missed_council',
  'bad_copy_prompt',
  'other',
];
export const ROUTE_RECEIPT_OUTCOMES: ReceiptOutcome[] = [
  'recommendation_shown',
  'copied',
  'accepted',
  'executed',
  'verified',
  'blocked',
  'wrong',
  'ignored',
];

export interface RouteEventChoiceSummary {
  id: string;
  kind: ChoiceOptionKind;
  label: string;
  confidence: number;
}

export interface RouteEvent {
  eventId: string;
  timestamp: string;
  source: RouteEventSource;
  target?: RouteTarget;
  queryHash: string;
  mode: RouteMode;
  intent?: string;
  combo?: string;
  recommendedChoice?: RouteEventChoiceSummary;
  topModelChoice?: RouteEventChoiceSummary;
  topSkillChoice?: RouteEventChoiceSummary;
  skillIds: string[];
  warningKinds: string[];
  semanticWarning: boolean;
  adopted?: boolean;
  adoptedAt?: string;
  adoptedTarget?: RouteTarget;
  adoptedChoiceId?: string;
  adoptionAction?: RouteEventAdoptionAction;
  feedbackOutcome?: RouteEventFeedbackOutcome;
  feedbackReason?: RouteEventFeedbackReason;
  receiptOutcome?: ReceiptOutcome;
  receiptAt?: string;
  workRole?: WorkRole;
  workflowPhase?: WorkflowPhase;
}

interface RouteAdoptionLog {
  eventType: 'adoption';
  eventId: string;
  timestamp: string;
  target?: RouteTarget;
  choiceId?: string;
  action: RouteEventAdoptionAction;
  outcome?: RouteEventFeedbackOutcome;
  reason?: RouteEventFeedbackReason;
}

interface RouteReceiptLog {
  eventType: 'receipt';
  receiptId: string;
  eventId: string;
  timestamp: string;
  outcome: ReceiptOutcome;
  role?: WorkRole;
  phase?: WorkflowPhase;
  target?: RouteTarget;
  choiceId?: string;
  summary?: string;
  proofSignals: string[];
  verification: string[];
}

export interface RouteStats {
  total: number;
  bySource: Record<string, number>;
  byMode: Record<string, number>;
  topCombos: Array<{ combo: string; count: number }>;
  semanticWarningCount: number;
  adoptedCount: number;
  adoptionActions: Partial<Record<RouteEventAdoptionAction, number>>;
  feedbackReasons: Partial<Record<RouteEventFeedbackReason, number>>;
  receiptCount: number;
  receiptOutcomes: Partial<Record<ReceiptOutcome, number>>;
  verifiedCount: number;
  blockedCount: number;
  wrongCount: number;
  executedCount: number;
  executionRate: number;
  lastReceiptAt?: string;
  lastReceiptOutcome?: ReceiptOutcome;
  lastWorkRole?: WorkRole;
  lastEventAt?: string;
}

export function isRouteEventFeedbackReason(value: unknown): value is RouteEventFeedbackReason {
  return typeof value === 'string' && ROUTE_EVENT_FEEDBACK_REASONS.includes(value as RouteEventFeedbackReason);
}

export function isReceiptOutcome(value: unknown): value is ReceiptOutcome {
  return typeof value === 'string' && ROUTE_RECEIPT_OUTCOMES.includes(value as ReceiptOutcome);
}

export function hashQuery(query: string): string {
  return createHash('sha1').update(query).digest('hex').slice(0, 16);
}

function eventIdFor(input: Pick<RouteEvent, 'timestamp' | 'source' | 'queryHash' | 'mode'>): string {
  return createHash('sha1')
    .update(`${input.timestamp}:${input.source}:${input.queryHash}:${input.mode}:${randomUUID()}`)
    .digest('hex')
    .slice(0, 16);
}

function choiceSummary(choice: ChoiceOption | undefined): RouteEventChoiceSummary | undefined {
  if (!choice) return undefined;
  return {
    id: choice.id,
    kind: choice.kind,
    label: choice.label,
    confidence: choice.confidence,
  };
}

function isWorkRole(value: unknown): value is WorkRole {
  return value === 'scout' || value === 'judge' || value === 'worker' || value === 'pm';
}

function isWorkflowPhase(value: unknown): value is WorkflowPhase {
  return value === 'before_worker' ||
    value === 'after_worker' ||
    value === 'final_audit' ||
    value === 'blocked_task' ||
    value === 'publish_handoff';
}

function sanitizeReceiptText(value: string): string {
  const home = process.env.HOME;
  const trimmed = value.replace(/\s+/g, ' ').trim().slice(0, 240);
  return home ? trimmed.split(home).join('$HOME') : trimmed;
}

function sanitizeReceiptList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map(sanitizeReceiptText)
    .slice(0, 12);
}

function topChoiceOption(spec: RouteSpec, predicate: (choice: ChoiceOption) => boolean): ChoiceOption | undefined {
  if (predicate(spec.choices.recommended)) return spec.choices.recommended;
  return spec.choices.alternatives.find(predicate);
}

function warningKinds(warnings: string[]): string[] {
  return [...new Set(warnings.map((warning) => {
    const lower = warning.toLowerCase();
    if (lower.includes('semantic')) return 'semantic';
    if (lower.includes('embedding')) return 'embedding';
    if (lower.includes('llm')) return 'llm';
    if (lower.includes('missing')) return 'missing';
    return 'general';
  }))];
}

export function recordRouteEvent(input: {
  query: string;
  source: RouteEventSource;
  target?: RouteTarget;
  mode: RouteMode;
  intent?: string;
  combo?: string;
  skillIds?: string[];
  warnings?: string[];
  recommendedChoice?: ChoiceOption;
  topModelChoice?: ChoiceOption;
  topSkillChoice?: ChoiceOption;
  path?: string;
}): RouteEvent | null {
  try {
    const warnings = input.warnings ?? [];
    const timestamp = new Date().toISOString();
    const event: RouteEvent = {
      eventId: eventIdFor({
        timestamp,
        source: input.source,
        queryHash: hashQuery(input.query),
        mode: input.mode,
      }),
      timestamp,
      source: input.source,
      target: input.target,
      queryHash: hashQuery(input.query),
      mode: input.mode,
      intent: input.intent,
      combo: input.combo,
      recommendedChoice: choiceSummary(input.recommendedChoice),
      topModelChoice: choiceSummary(input.topModelChoice),
      topSkillChoice: choiceSummary(input.topSkillChoice),
      skillIds: input.skillIds ?? [],
      warningKinds: warningKinds(warnings),
      semanticWarning: warnings.some((warning) => /semantic|embedding/i.test(warning)),
    };
    ensureParent(input.path);
    appendFileSync(input.path ?? ROUTE_EVENTS_PATH, JSON.stringify(event) + '\n', 'utf-8');
    return event;
  } catch {
    return null;
  }
}

export function recordRouteSpec(spec: RouteSpec, source: RouteEventSource, path?: string): RouteEvent | null {
  return recordRouteEvent({
    query: spec.query,
    source,
    target: spec.target,
    mode: spec.mode,
    intent: spec.intent,
    combo: spec.combo,
    skillIds: spec.skills.map((skill) => skill.id),
    warnings: [...spec.warnings, ...(spec.unlockWarnings ?? [])],
    recommendedChoice: spec.choices.recommended,
    topModelChoice: topChoiceOption(spec, choice => choice.kind === 'model'),
    topSkillChoice: topChoiceOption(spec, choice => ['skill', 'plugin', 'workflow'].includes(choice.kind)),
    path,
  });
}

function ensureParent(path = ROUTE_EVENTS_PATH): void {
  mkdirSync(dirname(path), { recursive: true });
}

function readRouteEventLines(path = ROUTE_EVENTS_PATH): RouteEvent[] {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, 'utf-8').split('\n').filter(Boolean);
  const events: RouteEvent[] = [];
  const adoptions: RouteAdoptionLog[] = [];
  const receipts: RouteReceiptLog[] = [];
  for (const line of lines) {
    try {
      const event = JSON.parse(line) as Partial<RouteEvent> & Partial<RouteAdoptionLog>;
      if (event.eventType === 'adoption') {
        if (!event.eventId || !event.timestamp || !event.action) continue;
        adoptions.push({
          eventType: 'adoption',
          eventId: event.eventId,
          timestamp: event.timestamp,
          target: event.target,
          choiceId: event.choiceId,
          action: event.action,
          outcome: event.outcome,
          reason: isRouteEventFeedbackReason(event.reason) ? event.reason : undefined,
        });
        continue;
      }
      if (event.eventType === 'receipt') {
        const receipt = event as Partial<RouteReceiptLog>;
        if (!receipt.eventId || !receipt.timestamp || !isReceiptOutcome(receipt.outcome) || !receipt.receiptId) continue;
        receipts.push({
          eventType: 'receipt',
          receiptId: receipt.receiptId,
          eventId: receipt.eventId,
          timestamp: receipt.timestamp,
          outcome: receipt.outcome,
          role: isWorkRole(receipt.role) ? receipt.role : undefined,
          phase: isWorkflowPhase(receipt.phase) ? receipt.phase : undefined,
          target: receipt.target,
          choiceId: receipt.choiceId,
          summary: typeof receipt.summary === 'string' ? sanitizeReceiptText(receipt.summary) : undefined,
          proofSignals: sanitizeReceiptList(receipt.proofSignals),
          verification: sanitizeReceiptList(receipt.verification),
        });
        continue;
      }
      if (!event.source || !event.mode || !event.queryHash || !event.timestamp) continue;
      events.push({
        eventId: event.eventId ?? createHash('sha1').update(`${event.timestamp}:${event.source}:${event.queryHash}`).digest('hex').slice(0, 16),
        timestamp: event.timestamp,
        source: event.source,
        target: event.target,
        queryHash: event.queryHash,
        mode: event.mode,
        intent: event.intent,
        combo: event.combo,
        recommendedChoice: event.recommendedChoice,
        topModelChoice: event.topModelChoice,
        topSkillChoice: event.topSkillChoice,
        skillIds: Array.isArray(event.skillIds) ? event.skillIds.filter((id): id is string => typeof id === 'string') : [],
        warningKinds: Array.isArray(event.warningKinds) ? event.warningKinds.filter((kind): kind is string => typeof kind === 'string') : [],
        semanticWarning: Boolean(event.semanticWarning),
        adopted: event.adopted,
        adoptedAt: event.adoptedAt,
        adoptedTarget: event.adoptedTarget,
        adoptedChoiceId: event.adoptedChoiceId,
        adoptionAction: event.adoptionAction,
        feedbackOutcome: event.feedbackOutcome,
        feedbackReason: isRouteEventFeedbackReason(event.feedbackReason) ? event.feedbackReason : undefined,
        receiptOutcome: isReceiptOutcome(event.receiptOutcome) ? event.receiptOutcome : undefined,
        receiptAt: event.receiptAt,
        workRole: isWorkRole(event.workRole) ? event.workRole : undefined,
        workflowPhase: isWorkflowPhase(event.workflowPhase) ? event.workflowPhase : undefined,
      });
    } catch {}
  }
  const byId = new Map(events.map((event, index) => [event.eventId, index]));
  for (const adoption of adoptions) {
    const index = byId.get(adoption.eventId);
    if (index === undefined) continue;
    const previous = events[index];
    events[index] = {
      ...previous,
      adopted: adoption.action === 'copy_prompt' || adoption.action === 'accept' ? true : previous.adopted,
      adoptedAt: adoption.timestamp,
      adoptedTarget: adoption.target ?? previous.adoptedTarget,
      adoptedChoiceId: adoption.choiceId ?? previous.adoptedChoiceId,
      adoptionAction: adoption.action,
      feedbackOutcome: adoption.outcome ?? previous.feedbackOutcome,
      feedbackReason: adoption.reason ?? previous.feedbackReason,
    };
  }
  for (const receipt of receipts) {
    const index = byId.get(receipt.eventId);
    if (index === undefined) continue;
    const previous = events[index];
    events[index] = {
      ...previous,
      adopted: receipt.outcome === 'copied' || receipt.outcome === 'accepted' || previous.adopted,
      adoptedAt: receipt.outcome === 'copied' || receipt.outcome === 'accepted' ? receipt.timestamp : previous.adoptedAt,
      adoptedTarget: receipt.target ?? previous.adoptedTarget,
      adoptedChoiceId: receipt.choiceId ?? previous.adoptedChoiceId,
      receiptOutcome: receipt.outcome,
      receiptAt: receipt.timestamp,
      workRole: receipt.role ?? previous.workRole,
      workflowPhase: receipt.phase ?? previous.workflowPhase,
    };
  }
  return events;
}

function readRouteAdoptionLines(path = ROUTE_EVENTS_PATH): RouteAdoptionLog[] {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, 'utf-8').split('\n').filter(Boolean);
  const adoptions: RouteAdoptionLog[] = [];
  for (const line of lines) {
    try {
      const event = JSON.parse(line) as Partial<RouteAdoptionLog>;
      if (event.eventType !== 'adoption' || !event.eventId || !event.timestamp || !event.action) continue;
      adoptions.push({
        eventType: 'adoption',
        eventId: event.eventId,
        timestamp: event.timestamp,
        target: event.target,
        choiceId: event.choiceId,
        action: event.action,
        outcome: event.outcome,
        reason: isRouteEventFeedbackReason(event.reason) ? event.reason : undefined,
      });
    } catch {}
  }
  return adoptions;
}

function readRouteReceiptLines(path = ROUTE_EVENTS_PATH): RouteReceiptLog[] {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, 'utf-8').split('\n').filter(Boolean);
  const receipts: RouteReceiptLog[] = [];
  for (const line of lines) {
    try {
      const event = JSON.parse(line) as Partial<RouteReceiptLog>;
      if (event.eventType !== 'receipt' || !event.eventId || !event.timestamp || !event.receiptId || !isReceiptOutcome(event.outcome)) continue;
      receipts.push({
        eventType: 'receipt',
        receiptId: event.receiptId,
        eventId: event.eventId,
        timestamp: event.timestamp,
        outcome: event.outcome,
        role: isWorkRole(event.role) ? event.role : undefined,
        phase: isWorkflowPhase(event.phase) ? event.phase : undefined,
        target: event.target,
        choiceId: event.choiceId,
        summary: typeof event.summary === 'string' ? sanitizeReceiptText(event.summary) : undefined,
        proofSignals: sanitizeReceiptList(event.proofSignals),
        verification: sanitizeReceiptList(event.verification),
      });
    } catch {}
  }
  return receipts;
}

export function readRecentRouteEvents(input: { limit?: number; path?: string } = {}): RouteEvent[] {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
  return readRouteEventLines(input.path).slice(-limit).reverse();
}

export function recordRouteAdoption(input: {
  eventId: string;
  target?: RouteTarget;
  choiceId?: string;
  action: RouteEventAdoptionAction;
  outcome?: RouteEventFeedbackOutcome;
  reason?: RouteEventFeedbackReason;
  path?: string;
}): RouteEvent | null {
  const path = input.path ?? ROUTE_EVENTS_PATH;
  const events = readRouteEventLines(path);
  if (!events.some(event => event.eventId === input.eventId)) return null;

  try {
    const adoption: RouteAdoptionLog = {
      eventType: 'adoption',
      eventId: input.eventId,
      timestamp: new Date().toISOString(),
      target: input.target,
      choiceId: input.choiceId,
      action: input.action,
      outcome: input.outcome,
      reason: input.reason,
    };
    ensureParent(path);
    appendFileSync(path, JSON.stringify(adoption) + '\n', 'utf-8');
    return readRouteEventLines(path).find(event => event.eventId === input.eventId) ?? null;
  } catch {
    return null;
  }
}

export function recordRouteReceipt(input: {
  eventId: string;
  outcome: ReceiptOutcome;
  role?: WorkRole;
  phase?: WorkflowPhase;
  target?: RouteTarget;
  choiceId?: string;
  summary?: string;
  proofSignals?: string[];
  verification?: string[];
  path?: string;
}): RouteEvent | null {
  const path = input.path ?? ROUTE_EVENTS_PATH;
  const events = readRouteEventLines(path);
  if (!events.some(event => event.eventId === input.eventId)) return null;

  try {
    const receipt: RouteReceiptLog = {
      eventType: 'receipt',
      receiptId: randomUUID(),
      eventId: input.eventId,
      timestamp: new Date().toISOString(),
      outcome: input.outcome,
      role: input.role,
      phase: input.phase,
      target: input.target,
      choiceId: input.choiceId,
      summary: typeof input.summary === 'string' ? sanitizeReceiptText(input.summary) : undefined,
      proofSignals: sanitizeReceiptList(input.proofSignals),
      verification: sanitizeReceiptList(input.verification),
    };
    ensureParent(path);
    appendFileSync(path, JSON.stringify(receipt) + '\n', 'utf-8');
    return readRouteEventLines(path).find(event => event.eventId === input.eventId) ?? null;
  } catch {
    return null;
  }
}

export function readRouteStats(path?: string): RouteStats {
  const stats: RouteStats = {
    total: 0,
    bySource: {},
    byMode: {},
    topCombos: [],
    semanticWarningCount: 0,
    adoptedCount: 0,
    adoptionActions: {},
    feedbackReasons: {},
    receiptCount: 0,
    receiptOutcomes: {},
    verifiedCount: 0,
    blockedCount: 0,
    wrongCount: 0,
    executedCount: 0,
    executionRate: 0,
  };

  const comboCounts = new Map<string, number>();
  for (const event of readRouteEventLines(path)) {
    stats.total++;
    stats.bySource[event.source] = (stats.bySource[event.source] ?? 0) + 1;
    stats.byMode[event.mode] = (stats.byMode[event.mode] ?? 0) + 1;
    if (event.semanticWarning) stats.semanticWarningCount++;
    if (event.adopted) stats.adoptedCount++;
    if (event.feedbackReason) {
      stats.feedbackReasons[event.feedbackReason] = (stats.feedbackReasons[event.feedbackReason] ?? 0) + 1;
    }
    if (event.combo) comboCounts.set(event.combo, (comboCounts.get(event.combo) ?? 0) + 1);
    stats.lastEventAt = event.timestamp;
  }
  stats.topCombos = [...comboCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([combo, count]) => ({ combo, count }));
  for (const adoption of readRouteAdoptionLines(path)) {
    stats.adoptionActions[adoption.action] = (stats.adoptionActions[adoption.action] ?? 0) + 1;
  }
  for (const receipt of readRouteReceiptLines(path)) {
    stats.receiptCount++;
    stats.receiptOutcomes[receipt.outcome] = (stats.receiptOutcomes[receipt.outcome] ?? 0) + 1;
    if (receipt.outcome === 'verified') stats.verifiedCount++;
    if (receipt.outcome === 'blocked') stats.blockedCount++;
    if (receipt.outcome === 'wrong') stats.wrongCount++;
    if (receipt.outcome === 'executed') stats.executedCount++;
    stats.lastReceiptAt = receipt.timestamp;
    stats.lastReceiptOutcome = receipt.outcome;
    stats.lastWorkRole = receipt.role ?? stats.lastWorkRole;
  }
  stats.executionRate = stats.total > 0
    ? Math.min(100, Math.round(((stats.executedCount + stats.verifiedCount) / stats.total) * 100))
    : 0;
  return stats;
}
