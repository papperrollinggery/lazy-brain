import { describe, expect, it } from 'vitest';
import {
  isLazyBrainHookCommand,
  removeLazyBrainHookRegistrations,
  upsertLazyBrainUserPromptSubmit,
} from '../../src/hook/settings.js';

describe('hook settings', () => {
  it('recognizes both legacy and built dist hook commands', () => {
    expect(isLazyBrainHookCommand('node /tmp/lazybrain/dist/bin/hook.js')).toBe(true);
    expect(isLazyBrainHookCommand('node /tmp/lazybrain/bin/hook.js')).toBe(true);
    expect(isLazyBrainHookCommand('python3 ~/.claude/hooks/codeisland-state.py')).toBe(false);
  });

  it('installs only UserPromptSubmit and removes stale Stop entries', () => {
    const settings = {
      hooks: {
        UserPromptSubmit: [
          { matcher: '', hooks: [{ type: 'command', command: 'node /old/dist/bin/hook.js' }] },
        ],
        Stop: [
          { hooks: [{ type: 'command', command: 'node /old/dist/bin/hook.js' }] },
          { hooks: [{ type: 'command', command: 'python3 ~/.claude/hooks/codeisland-state.py' }] },
        ],
      },
    };

    const next = upsertLazyBrainUserPromptSubmit(settings, 'node /new/dist/bin/hook.js');
    const ups = next.hooks!.UserPromptSubmit as Array<{ hooks: Array<{ command: string }> }>;
    const stop = next.hooks!.Stop as Array<{ hooks: Array<{ command: string }> }>;

    expect(ups).toHaveLength(1);
    expect(ups[0].hooks[0].command).toBe('node /new/dist/bin/hook.js');
    expect(stop).toHaveLength(1);
    expect(stop[0].hooks[0].command).toContain('codeisland-state.py');
  });

  it('preserves unrelated UserPromptSubmit hooks while replacing stale LazyBrain entries', () => {
    const settings = {
      hooks: {
        UserPromptSubmit: [
          { matcher: '', hooks: [{ type: 'command', command: 'echo keep-user-hook' }] },
          { matcher: '', hooks: [{ type: 'command', command: 'node /old/dist/bin/hook.js' }] },
        ],
      },
    };

    const next = upsertLazyBrainUserPromptSubmit(settings, 'node /new/dist/bin/hook.js');
    const ups = next.hooks!.UserPromptSubmit as Array<{ hooks: Array<{ command: string }> }>;

    expect(ups).toHaveLength(2);
    expect(ups[0].hooks[0].command).toBe('echo keep-user-hook');
    expect(ups[1].hooks[0].command).toBe('node /new/dist/bin/hook.js');
  });

  it('uninstall removes LazyBrain from UserPromptSubmit and Stop', () => {
    const settings = {
      hooks: {
        UserPromptSubmit: [
          { matcher: '', hooks: [{ type: 'command', command: 'node /new/dist/bin/hook.js' }] },
          { matcher: '', hooks: [{ type: 'command', command: 'echo keep' }] },
        ],
        Stop: [
          { hooks: [{ type: 'command', command: 'node /new/dist/bin/hook.js' }] },
          { hooks: [{ type: 'command', command: 'python3 ~/.claude/hooks/codeisland-state.py' }] },
        ],
      },
    };

    const next = removeLazyBrainHookRegistrations(settings);
    const ups = next.hooks!.UserPromptSubmit as Array<{ hooks: Array<{ command: string }> }>;
    const stop = next.hooks!.Stop as Array<{ hooks: Array<{ command: string }> }>;

    expect(ups).toHaveLength(1);
    expect(ups[0].hooks[0].command).toBe('echo keep');
    expect(stop).toHaveLength(1);
    expect(stop[0].hooks[0].command).toContain('codeisland-state.py');
  });

  it('removes top-level legacy command entries too', () => {
    const settings = {
      hooks: {
        UserPromptSubmit: [
          { command: 'node /old/dist/bin/hook.js' },
          { matcher: '', hooks: [{ type: 'command', command: 'echo keep' }] },
        ],
        Stop: [
          { command: 'node /old/dist/bin/hook.js' },
        ],
      },
    };

    const next = removeLazyBrainHookRegistrations(settings);
    const ups = next.hooks!.UserPromptSubmit as Array<{ command?: string; hooks?: Array<{ command: string }> }>;
    const stop = next.hooks!.Stop as Array<{ command?: string }>;

    expect(ups).toHaveLength(1);
    expect(ups[0].hooks?.[0].command).toBe('echo keep');
    expect(stop).toHaveLength(0);
  });
});
