import { describe, expect, it } from 'vitest';
import { getHookLifecycleStatus } from '../../src/hook/status.js';

describe('hook lifecycle status', () => {
  it('reports LazyBrain only on UserPromptSubmit when Stop has no LazyBrain hook', () => {
    const status = getHookLifecycleStatus({
      hooks: {
        UserPromptSubmit: [
          { matcher: '', hooks: [{ type: 'command', command: 'node /tmp/dist/bin/hook.js' }] },
          { matcher: '', hooks: [{ type: 'command', command: 'python3 ~/.claude/hooks/codeisland-state.py' }] },
        ],
        Stop: [
          { hooks: [{ type: 'command', command: 'python3 ~/.claude/hooks/codeisland-state.py' }] },
          { hooks: [{ type: 'command', command: 'node /plugin/claude-mem summarize' }] },
        ],
      },
    });

    expect(status.lazybrainUserPromptSubmit).toBe(true);
    expect(status.lazybrainStop).toBe(false);
    expect(status.stopCommands).toHaveLength(2);
  });

  it('detects stale LazyBrain Stop registration', () => {
    const status = getHookLifecycleStatus({
      hooks: {
        Stop: [
          { hooks: [{ type: 'command', command: 'node /tmp/dist/bin/hook.js' }] },
        ],
      },
    });

    expect(status.lazybrainStop).toBe(true);
    expect(status.lazybrainUserPromptSubmit).toBe(false);
  });
});
