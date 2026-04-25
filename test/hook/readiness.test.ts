import { describe, expect, it } from 'vitest';
import { evaluateReady } from '../../src/hook/readiness.js';
import type { HookRuntimeSnapshot } from '../../src/hook/types.js';

const runtime: HookRuntimeSnapshot = {
  activeRuns: [],
  hungRuns: [],
  staleRuns: [],
  health: { recentDurationsMs: [], updatedAt: 0 },
};

const base = {
  graphExists: true,
  runtime,
  cwd: '/repo/project',
  config: { engine: 'tag' as const },
  embeddingsIndexExists: false,
  embeddingsBinExists: false,
  scopes: [
    {
      scope: 'project' as const,
      settingsPath: '/repo/project/.claude/settings.json',
      settings: {},
      installState: null,
    },
    {
      scope: 'global' as const,
      settingsPath: '/home/.claude/settings.json',
      settings: {},
      installState: null,
    },
  ],
};

describe('evaluateReady', () => {
  it('reports NOT_READY when graph is missing', () => {
    const report = evaluateReady({ ...base, graphExists: false });
    expect(report.state).toBe('NOT_READY');
    expect(report.blockers.join('\n')).toContain('Graph missing');
  });

  it('reports NOT_READY when LazyBrain remains in Stop', () => {
    const report = evaluateReady({
      ...base,
      scopes: [
        {
          ...base.scopes[0],
          settings: {
            hooks: {
              Stop: [{ hooks: [{ type: 'command', command: 'node /repo/lazybrain/dist/bin/hook.js' }] }],
            },
          },
        },
        base.scopes[1],
      ],
    });
    expect(report.state).toBe('NOT_READY');
    expect(report.blockers.join('\n')).toContain('project settings still contains LazyBrain Stop hook');
  });

  it('warns when project LazyBrain statusline would hide global HUD', () => {
    const report = evaluateReady({
      ...base,
      scopes: [
        {
          ...base.scopes[0],
          settings: { statusLine: { type: 'command', command: 'node /repo/lazybrain/dist/bin/statusline.js' } },
        },
        {
          ...base.scopes[1],
          settings: { statusLine: { type: 'command', command: 'node ~/.claude/plugins/third-party-hud/index.js' } },
        },
      ],
    });
    expect(report.state).toBe('READY');
    expect(report.warnings.join('\n')).toContain('may hide the global HUD');
  });

  it('reports NOT_READY when hook breaker is open', () => {
    const report = evaluateReady({
      ...base,
      now: 1000,
      runtime: {
        ...runtime,
        health: { ...runtime.health, breakerUntil: 2000 },
      },
    });
    expect(report.state).toBe('NOT_READY');
    expect(report.blockers.join('\n')).toContain('Hook breaker is open');
  });

  it('reports NOT_READY when hung hook records exist', () => {
    const report = evaluateReady({
      ...base,
      runtime: {
        ...runtime,
        hungRuns: [{
          runId: 'run-1',
          pid: 123,
          cwd: '/repo/project',
          hookEventName: 'UserPromptSubmit',
          sessionId: 's1',
          startedAt: 1,
          updatedAt: 1,
        }],
      },
    });
    expect(report.state).toBe('NOT_READY');
    expect(report.blockers.join('\n')).toContain('Hung hook records');
  });

  it('reports NOT_READY when current host load would trip hook breaker', () => {
    const report = evaluateReady({
      ...base,
      loadAverage1m: 12,
      config: {
        engine: 'tag',
        hookSafety: {
          maxConcurrentHooks: 3,
          staleHookMs: 15000,
          avgDurationBreakerMs: 3000,
          loadAvgBreaker: 8,
          breakerCooldownMs: 60000,
          recentDurationsWindow: 12,
        },
      },
    });
    expect(report.state).toBe('NOT_READY');
    expect(report.blockers.join('\n')).toContain('Host load average is high');
  });

  it('keeps project and global reports separate', () => {
    const report = evaluateReady({
      ...base,
      scopes: [
        {
          ...base.scopes[0],
          settings: {
            hooks: {
              UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'node /repo/lazybrain/dist/bin/hook.js' }] }],
            },
          },
          installState: {
            scope: 'project',
            workspaceRoot: '/repo/project',
            hookCommand: 'node /repo/lazybrain/dist/bin/hook.js',
            installedAt: '2026-04-25T00:00:00.000Z',
            statuslineMode: 'none',
          },
        },
        base.scopes[1],
      ],
    });
    expect(report.scopes.find((scope) => scope.scope === 'project')?.lazybrainUserPromptSubmit).toBe(true);
    expect(report.scopes.find((scope) => scope.scope === 'global')?.lazybrainUserPromptSubmit).toBe(false);
  });
});
