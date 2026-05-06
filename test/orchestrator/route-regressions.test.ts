import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { recordRouteEvent } from '../../src/orchestrator/route-events.js';
import { recordRouteRegressionCase, RouteRegressionError } from '../../src/orchestrator/route-regressions.js';

describe('route regression fixtures', () => {
  it('writes a ready regression case when the provided query matches the event hash', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lazybrain-route-regressions-'));
    const routeEventsPath = join(dir, 'route-events.jsonl');
    const routeRegressionPath = join(dir, 'route-regressions.jsonl');
    try {
      const query = 'fix failing tests and create a PR';
      const event = recordRouteEvent({
        query,
        source: 'api',
        target: 'codex',
        mode: 'route_plan',
        combo: 'test_pr_repair',
        path: routeEventsPath,
      });

      const regressionCase = recordRouteRegressionCase({
        eventId: event!.eventId,
        query,
        expectedChoiceId: 'workflow:test_pr_repair',
        reason: 'wrong_skill',
        routeEventsPath,
        path: routeRegressionPath,
      });

      expect(regressionCase.status).toBe('ready');
      expect(regressionCase.query).toBe(query);
      expect(regressionCase.queryPlaceholder).toBeUndefined();
      expect(regressionCase.feedbackReason).toBe('wrong_skill');
      expect(readFileSync(routeRegressionPath, 'utf-8')).toContain('"expectedChoiceId":"workflow:test_pr_repair"');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes a pending case without raw query when no query is supplied', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lazybrain-route-regressions-'));
    const routeEventsPath = join(dir, 'route-events.jsonl');
    const routeRegressionPath = join(dir, 'route-regressions.jsonl');
    try {
      const event = recordRouteEvent({
        query: '帮我重新规划产品方向',
        source: 'api',
        mode: 'route_plan',
        combo: 'product_direction_planning',
        path: routeEventsPath,
      });

      const regressionCase = recordRouteRegressionCase({
        eventId: event!.eventId,
        routeEventsPath,
        path: routeRegressionPath,
      });

      expect(regressionCase.status).toBe('pending_query');
      expect(regressionCase.query).toBeUndefined();
      expect(regressionCase.queryPlaceholder).toBe(`TODO_REPLACE_QUERY_${event!.queryHash}`);
      expect(readFileSync(routeRegressionPath, 'utf-8')).not.toContain('产品方向');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a provided query that does not match the route event hash', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lazybrain-route-regressions-'));
    const routeEventsPath = join(dir, 'route-events.jsonl');
    const routeRegressionPath = join(dir, 'route-regressions.jsonl');
    try {
      const event = recordRouteEvent({
        query: 'review this PR for regressions',
        source: 'api',
        mode: 'route_plan',
        combo: 'code_review_regression',
        path: routeEventsPath,
      });

      expect(() => recordRouteRegressionCase({
        eventId: event!.eventId,
        query: 'different prompt',
        routeEventsPath,
        path: routeRegressionPath,
      })).toThrow(RouteRegressionError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
