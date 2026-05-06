import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecentRouteEvents, readRouteStats, recordRouteAdoption, recordRouteEvent } from '../../src/orchestrator/route-events.js';

describe('route events', () => {
  it('stores route metadata without raw query or raw warnings', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lazybrain-route-events-'));
    const path = join(dir, 'route-events.jsonl');
    try {
      const event = recordRouteEvent({
        query: 'review this private prompt with /Users/example/path',
        source: 'api',
        target: 'codex',
        mode: 'route_plan',
        intent: 'Review',
        skillIds: ['review'],
        warnings: ['Embedding cache stale for /Users/example/path'],
        recommendedChoice: {
          id: 'mode:review',
          kind: 'mode',
          label: 'Review mode',
          confidence: 0.8,
          cost: 'medium',
          latency: 'normal',
          risk: 'low',
          reason: 'review',
        },
        path,
      });

      expect(event?.queryHash).toMatch(/^[a-f0-9]{16}$/);
      const recent = readRecentRouteEvents({ path });
      expect(recent[0]).not.toHaveProperty('query');
      expect(recent[0]).not.toHaveProperty('warnings');
      expect(recent[0].warningKinds).toEqual(['embedding']);
      expect(JSON.stringify(recent)).not.toContain('private prompt');
      expect(JSON.stringify(recent)).not.toContain('/Users/example/path');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('records adoption as append-only metadata and merges it when reading stats', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lazybrain-route-events-'));
    const path = join(dir, 'route-events.jsonl');
    try {
      const event = recordRouteEvent({
        query: 'review this PR',
        source: 'api',
        target: 'claude',
        mode: 'route_plan',
        intent: 'Review',
        skillIds: ['review'],
        warnings: [],
        path,
      });
      expect(event).toBeTruthy();

      const adopted = recordRouteAdoption({
        eventId: event!.eventId,
        target: 'codex',
        choiceId: 'workflow:code_review_regression',
        action: 'copy_prompt',
        path,
      });

      expect(adopted?.adopted).toBe(true);
      expect(adopted?.adoptedTarget).toBe('codex');
      expect(readFileSync(path, 'utf-8').trim().split('\n')).toHaveLength(2);
      expect(readRouteStats(path).adoptedCount).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('records rejected feedback reasons as append-only metadata', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lazybrain-route-events-'));
    const path = join(dir, 'route-events.jsonl');
    try {
      const event = recordRouteEvent({
        query: '请用议会模式裁决这个架构取舍',
        source: 'api',
        target: 'codex',
        mode: 'route_plan',
        intent: 'Council escalation review',
        combo: 'council_escalation',
        skillIds: ['critic', 'ralplan', 'architect'],
        warnings: [],
        path,
      });
      expect(event).toBeTruthy();

      const rejected = recordRouteAdoption({
        eventId: event!.eventId,
        choiceId: 'workflow:council_escalation',
        action: 'feedback',
        outcome: 'rejected',
        reason: 'missed_council',
        path,
      });

      expect(rejected?.feedbackOutcome).toBe('rejected');
      expect(rejected?.feedbackReason).toBe('missed_council');
      expect(readFileSync(path, 'utf-8').trim().split('\n')).toHaveLength(2);
      expect(readRouteStats(path).feedbackReasons.missed_council).toBe(1);
      expect(JSON.stringify(readRecentRouteEvents({ path }))).not.toContain('议会模式');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
