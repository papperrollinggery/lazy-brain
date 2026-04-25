import { describe, expect, it } from 'vitest';
import { getHookLifecycleStatus } from '../../src/hook/status.js';

describe('hook lifecycle status', () => {
  it('reports LazyBrain only on UserPromptSubmit when Stop has no LazyBrain hook', () => {
    const status = getHookLifecycleStatus({
      hooks: {
        UserPromptSubmit: [
          { matcher: '', hooks: [{ type: 'command', command: 'node /tmp/lazybrain/dist/bin/hook.js' }] },
          { matcher: '', hooks: [{ type: 'command', command: 'python3 ~/.claude/hooks/codeisland-state.py' }] },
        ],
        Stop: [
          { hooks: [{ type: 'command', command: 'python3 ~/.claude/hooks/codeisland-state.py' }] },
          { hooks: [{ type: 'command', command: 'node /plugin/claude-mem summarize' }] },
        ],
      },
    }, {
      installState: null,
      runtime: {
        activeRuns: [],
        hungRuns: [],
        staleRuns: [],
        health: { recentDurationsMs: [100, 200], updatedAt: 1000 },
      },
      now: 1000,
    });

    expect(status.lazybrainUserPromptSubmit).toBe(true);
    expect(status.lazybrainStop).toBe(false);
    expect(status.stopCommands).toHaveLength(2);
    expect(status.avgDurationMs).toBe(150);
  });

  it('detects stale LazyBrain Stop registration', () => {
    const status = getHookLifecycleStatus({
      hooks: {
        Stop: [
          { hooks: [{ type: 'command', command: 'node /tmp/lazybrain/dist/bin/hook.js' }] },
        ],
      },
    }, {
      installState: {
        scope: 'project',
        workspaceRoot: '/repo/lazybrain',
        hookCommand: 'node /tmp/lazybrain/dist/bin/hook.js',
        installedAt: '2026-04-20T00:00:00.000Z',
        statuslineMode: 'none',
      },
      runtime: {
        activeRuns: [],
        hungRuns: [],
        staleRuns: [],
        health: { recentDurationsMs: [], updatedAt: 1000 },
      },
      now: 1000,
    });

    expect(status.lazybrainStop).toBe(true);
    expect(status.lazybrainUserPromptSubmit).toBe(false);
    expect(status.installState?.scope).toBe('project');
  });
});
