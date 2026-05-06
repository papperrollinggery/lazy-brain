import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { ROUTE_EVENTS_PATH } from '../constants.js';
import type { ChoiceOption, ChoiceOptionKind, RouteMode, RouteSpec, RouteTarget } from '../types.js';

export type RouteEventSource = 'cli' | 'api' | 'hook-gate' | 'prompt' | 'mcp';
export type RouteEventAdoptionAction = 'copy_prompt' | 'feedback';
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

export interface RouteStats {
  total: number;
  bySource: Record<string, number>;
  byMode: Record<string, number>;
  topCombos: Array<{ combo: string; count: number }>;
  semanticWarningCount: number;
  adoptedCount: number;
  feedbackReasons: Partial<Record<RouteEventFeedbackReason, number>>;
  lastEventAt?: string;
}

export function isRouteEventFeedbackReason(value: unknown): value is RouteEventFeedbackReason {
  return typeof value === 'string' && ROUTE_EVENT_FEEDBACK_REASONS.includes(value as RouteEventFeedbackReason);
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
      adopted: adoption.action === 'copy_prompt' ? true : previous.adopted,
      adoptedAt: adoption.timestamp,
      adoptedTarget: adoption.target ?? previous.adoptedTarget,
      adoptedChoiceId: adoption.choiceId ?? previous.adoptedChoiceId,
      adoptionAction: adoption.action,
      feedbackOutcome: adoption.outcome ?? previous.feedbackOutcome,
      feedbackReason: adoption.reason ?? previous.feedbackReason,
    };
  }
  return events;
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

export function readRouteStats(path?: string): RouteStats {
  const stats: RouteStats = {
    total: 0,
    bySource: {},
    byMode: {},
    topCombos: [],
    semanticWarningCount: 0,
    adoptedCount: 0,
    feedbackReasons: {},
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
  return stats;
}
