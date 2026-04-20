import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('hook runtime safety', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'lazybrain-runtime-'));
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    vi.resetModules();
  });

  async function loadRuntimeModule(scope: 'project' | 'global' = 'global', workspaceRoot = '/repo/lazy_user', missingInstallState = false) {
    vi.doMock('../../src/constants.js', async () => {
      const actual = await vi.importActual<any>('../../src/constants.js');
      return {
        ...actual,
        HOOK_ACTIVE_PATH: join(tempDir, '.hook-pid'),
        HOOK_INSTALL_STATE_PATH: join(tempDir, 'hook-install.json'),
        HOOK_EVENTS_PATH: join(tempDir, 'hook-events.jsonl'),
        HOOK_HEALTH_PATH: join(tempDir, 'hook-health.json'),
        HOOK_RUNS_DIR: join(tempDir, 'hook-runs'),
      };
    });

    if (!missingInstallState) {
      writeFileSync(join(tempDir, 'hook-install.json'), JSON.stringify({
        scope,
        workspaceRoot,
        hookCommand: 'node /repo/dist/bin/hook.js',
        installedAt: '2026-04-20T00:00:00.000Z',
        statuslineMode: 'none',
      }), 'utf-8');
    }

    return import('../../src/hook/runtime.js');
  }

  it('skips execution outside project scope', async () => {
    const runtime = await loadRuntimeModule('project', '/repo/lazy_user');
    const result = runtime.beginHookRun({
      cwd: '/repo/other',
      hookEventName: 'UserPromptSubmit',
      prompt: 'hello',
    }, { now: 1000 });

    expect(result).toEqual({ allowed: false, reason: 'outside_scope' });
  });

  it('fails closed when install metadata is missing', async () => {
    const runtime = await loadRuntimeModule('project', '/repo/lazy_user', true);
    const result = runtime.beginHookRun({
      cwd: '/repo/lazy_user',
      hookEventName: 'UserPromptSubmit',
      prompt: 'hello',
    }, { now: 1000 });

    expect(result).toEqual({ allowed: false, reason: 'install_state_missing' });
  });

  it('registers and finishes active runs', async () => {
    const runtime = await loadRuntimeModule();
    const begin = runtime.beginHookRun({
      cwd: '/repo/lazy_user',
      hookEventName: 'UserPromptSubmit',
      sessionId: 's1',
      prompt: 'hello',
    }, { now: 1000, pidExists: () => true, loadAverage1m: 0 });

    expect(begin.allowed).toBe(true);
    if (!begin.allowed) throw new Error('expected active run');

    let snapshot = runtime.getHookRuntimeSnapshot({ now: 1100, pidExists: () => true });
    expect(snapshot.activeRuns).toHaveLength(1);

    runtime.finishHookRun(begin.run, { status: 'ok', durationMs: 250 });
    snapshot = runtime.getHookRuntimeSnapshot({ now: 1200, pidExists: () => false });
    expect(snapshot.activeRuns).toHaveLength(0);
    expect(snapshot.health.lastDurationMs).toBe(250);
  });

  it('opens breaker when recent durations are too slow', async () => {
    const runtime = await loadRuntimeModule();
    writeFileSync(join(tempDir, 'hook-health.json'), JSON.stringify({
      recentDurationsMs: [4000, 4200, 4600],
      updatedAt: 1000,
    }), 'utf-8');

    const result = runtime.beginHookRun({
      cwd: '/repo/lazy_user',
      hookEventName: 'UserPromptSubmit',
      prompt: 'hello',
    }, { now: 2000, loadAverage1m: 0 });

    expect(result).toEqual({ allowed: false, reason: 'slow_recent_avg' });
    const health = JSON.parse(readFileSync(join(tempDir, 'hook-health.json'), 'utf-8')) as { breakerUntil?: number };
    expect(health.breakerUntil).toBeGreaterThan(2000);
  });

  it('retains hung live runs instead of deleting them as stale', async () => {
    const runtime = await loadRuntimeModule();
    const begin = runtime.beginHookRun({
      cwd: '/repo/lazy_user',
      hookEventName: 'UserPromptSubmit',
      prompt: 'long task',
    }, {
      now: 1000,
      pidExists: () => true,
      loadAverage1m: 0,
      config: { hookSafety: { staleHookMs: 100 } } as any,
    });

    expect(begin.allowed).toBe(true);
    if (!begin.allowed) throw new Error('expected active run');

    const snapshot = runtime.getHookRuntimeSnapshot({
      now: 1400,
      pidExists: () => true,
      config: { hookSafety: { staleHookMs: 100 } } as any,
    });

    expect(snapshot.activeRuns).toHaveLength(1);
    expect(snapshot.hungRuns).toHaveLength(1);
    expect(snapshot.staleRuns).toHaveLength(0);
  });
});
