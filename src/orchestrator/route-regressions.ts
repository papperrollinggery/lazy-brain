import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { ROUTE_REGRESSIONS_PATH } from '../constants.js';
import type { ChoiceOptionKind, RouteMode, RouteTarget } from '../types.js';
import {
  hashQuery,
  isRouteEventFeedbackReason,
  readRecentRouteEvents,
  type RouteEventFeedbackReason,
} from './route-events.js';

export type RouteRegressionStatus = 'ready' | 'pending_query';

export interface RouteRegressionCase {
  version: 1;
  createdAt: string;
  eventId: string;
  queryHash: string;
  status: RouteRegressionStatus;
  query?: string;
  queryPlaceholder?: string;
  target?: RouteTarget;
  expectedChoiceId?: string;
  expectedChoiceKind?: ChoiceOptionKind;
  expectedChoiceLabel?: string;
  expectedCombo?: string;
  expectedMode: RouteMode;
  feedbackReason?: RouteEventFeedbackReason;
}

export class RouteRegressionError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
  }
}

export function recordRouteRegressionCase(input: {
  eventId: string;
  query?: string;
  expectedChoiceId?: string;
  reason?: RouteEventFeedbackReason;
  routeEventsPath?: string;
  path?: string;
}): RouteRegressionCase {
  const event = readRecentRouteEvents({ limit: 100, path: input.routeEventsPath })
    .find(candidate => candidate.eventId === input.eventId);
  if (!event) {
    throw new RouteRegressionError(`Route event not found: ${input.eventId}`, 404);
  }

  const query = input.query?.trim();
  if (query && hashQuery(query) !== event.queryHash) {
    throw new RouteRegressionError('Provided query does not match the route event hash.', 400);
  }

  const feedbackReason = isRouteEventFeedbackReason(input.reason) ? input.reason : event.feedbackReason;
  const expectedChoiceId = input.expectedChoiceId
    ?? event.recommendedChoice?.id
    ?? (event.combo ? `workflow:${event.combo}` : undefined);
  const regressionCase: RouteRegressionCase = {
    version: 1,
    createdAt: new Date().toISOString(),
    eventId: event.eventId,
    queryHash: event.queryHash,
    status: query ? 'ready' : 'pending_query',
    query: query || undefined,
    queryPlaceholder: query ? undefined : `TODO_REPLACE_QUERY_${event.queryHash}`,
    target: event.target,
    expectedChoiceId,
    expectedChoiceKind: event.recommendedChoice?.kind,
    expectedChoiceLabel: event.recommendedChoice?.label,
    expectedCombo: event.combo,
    expectedMode: event.mode,
    feedbackReason,
  };

  const path = input.path ?? ROUTE_REGRESSIONS_PATH;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(regressionCase) + '\n', 'utf-8');
  return regressionCase;
}
