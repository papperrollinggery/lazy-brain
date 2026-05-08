import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRecentRouteEvents, readRouteStats, recordRouteAdoption, recordRouteEvent, recordRouteReceipt } from '../../src/orchestrator/route-events.js';

describe('route events', () => {
  it('stores route metadata without raw query or raw warnings', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lazybrain-route-events-'));
    const path = join(dir, 'route-events.jsonl');
    const privatePath = ['', 'Users', 'example', 'path'].join('/');
    try {
      const event = recordRouteEvent({
        query: `review this private prompt with ${privatePath}`,
        source: 'api',
        target: 'codex',
        mode: 'route_plan',
        intent: 'Review',
        skillIds: ['review'],
        warnings: [`Embedding cache stale for ${privatePath}`],
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
      expect(JSON.stringify(recent)).not.toContain(privatePath);
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
      expect(readRouteStats(path).adoptionActions.copy_prompt).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('records accept, ignore, and wrong actions distinctly', () => {
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

      recordRouteAdoption({ eventId: event!.eventId, action: 'accept', path });
      recordRouteAdoption({ eventId: event!.eventId, action: 'ignore', outcome: 'rejected', reason: 'other', path });
      recordRouteAdoption({ eventId: event!.eventId, action: 'mark_wrong', outcome: 'rejected', reason: 'wrong_skill', path });

      const stats = readRouteStats(path);
      expect(stats.adoptionActions.accept).toBe(1);
      expect(stats.adoptionActions.ignore).toBe(1);
      expect(stats.adoptionActions.mark_wrong).toBe(1);
      expect(stats.feedbackReasons.wrong_skill).toBe(1);
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

  it('records receipt outcomes as append-only execution evidence', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lazybrain-route-events-'));
    const path = join(dir, 'route-events.jsonl');
    try {
      const event = recordRouteEvent({
        query: 'review this PR',
        source: 'api',
        target: 'codex',
        mode: 'route_plan',
        intent: 'Review',
        skillIds: ['review'],
        warnings: [],
        path,
      });
      expect(event).toBeTruthy();

      const executed = recordRouteReceipt({
        eventId: event!.eventId,
        outcome: 'executed',
        role: 'scout',
        phase: 'before_worker',
        verification: ['npm test'],
        proofSignals: ['Role: scout'],
        path,
      });
      const verified = recordRouteReceipt({
        eventId: event!.eventId,
        outcome: 'verified',
        role: 'scout',
        phase: 'before_worker',
        verification: ['npm test'],
        proofSignals: ['verified'],
        path,
      });

      expect(executed?.receiptOutcome).toBe('executed');
      expect(verified?.receiptOutcome).toBe('verified');
      expect(verified?.workRole).toBe('scout');
      const stats = readRouteStats(path);
      expect(stats.receiptOutcomes.executed).toBe(1);
      expect(stats.receiptOutcomes.verified).toBe(1);
      expect(stats.executedCount).toBe(1);
      expect(stats.verifiedCount).toBe(1);
      expect(stats.executionRate).toBe(100);
      expect(stats.lastReceiptOutcome).toBe('verified');
      expect(JSON.stringify(readRecentRouteEvents({ path }))).not.toContain('review this PR');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
