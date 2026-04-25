import { describe, expect, it } from 'vitest';
import {
  hasLazyBrainHookRegistration,
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
          { matcher: '', hooks: [{ type: 'command', command: 'node /old/lazybrain/dist/bin/hook.js' }] },
        ],
        Stop: [
          { hooks: [{ type: 'command', command: 'node /old/lazybrain/dist/bin/hook.js' }] },
          { hooks: [{ type: 'command', command: 'python3 ~/.claude/hooks/codeisland-state.py' }] },
        ],
      },
    };

    const next = upsertLazyBrainUserPromptSubmit(settings, 'node /new/lazybrain/dist/bin/hook.js');
    const ups = next.hooks!.UserPromptSubmit as Array<{ hooks: Array<{ command: string; timeout?: number }> }>;
    const stop = next.hooks!.Stop as Array<{ hooks: Array<{ command: string }> }>;

    expect(ups).toHaveLength(1);
    expect(ups[0].hooks[0].command).toBe('node /new/lazybrain/dist/bin/hook.js');
    expect(ups[0].hooks[0].timeout).toBe(5);
    expect(stop).toHaveLength(1);
    expect(stop[0].hooks[0].command).toContain('codeisland-state.py');
  });

  it('preserves unrelated UserPromptSubmit hooks while replacing stale LazyBrain entries', () => {
    const settings = {
      hooks: {
        UserPromptSubmit: [
          { matcher: '', hooks: [{ type: 'command', command: 'echo keep-user-hook' }] },
          { matcher: '', hooks: [{ type: 'command', command: 'node /old/lazybrain/dist/bin/hook.js' }] },
        ],
      },
    };

    const next = upsertLazyBrainUserPromptSubmit(settings, 'node /new/lazybrain/dist/bin/hook.js');
    const ups = next.hooks!.UserPromptSubmit as Array<{ hooks: Array<{ command: string }> }>;

    expect(ups).toHaveLength(2);
    expect(ups[0].hooks[0].command).toBe('echo keep-user-hook');
    expect(ups[1].hooks[0].command).toBe('node /new/lazybrain/dist/bin/hook.js');
  });

  it('uninstall removes LazyBrain from UserPromptSubmit and Stop', () => {
    const settings = {
      hooks: {
        UserPromptSubmit: [
          { matcher: '', hooks: [{ type: 'command', command: 'node /new/lazybrain/dist/bin/hook.js' }] },
          { matcher: '', hooks: [{ type: 'command', command: 'echo keep' }] },
        ],
        Stop: [
          { hooks: [{ type: 'command', command: 'node /new/lazybrain/dist/bin/hook.js' }] },
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

  it('preserves third-party hooks in mixed entries while removing LazyBrain commands', () => {
    const settings = {
      hooks: {
        UserPromptSubmit: [
          {
            matcher: '',
            hooks: [
              { type: 'command', command: 'node /repo/lazybrain/dist/bin/hook.js' },
              { type: 'command', command: 'python3 ~/.claude/hooks/codeisland-state.py' },
            ],
          },
        ],
      },
    };

    const next = removeLazyBrainHookRegistrations(settings);
    const ups = next.hooks!.UserPromptSubmit as Array<{ hooks: Array<{ command: string }> }>;

    expect(ups).toHaveLength(1);
    expect(ups[0].hooks).toHaveLength(1);
    expect(ups[0].hooks[0].command).toContain('codeisland-state.py');
  });

  it('removes legacy LazyBrain registrations from SessionStart too', () => {
    const settings = {
      hooks: {
        SessionStart: [
          { hooks: [{ type: 'command', command: 'node /repo/lazybrain/dist/bin/hook.js' }] },
          { hooks: [{ type: 'command', command: 'echo keep-session-start' }] },
        ],
      },
    };

    const next = removeLazyBrainHookRegistrations(settings);
    const sessionStart = next.hooks!.SessionStart as Array<{ hooks: Array<{ command: string }> }>;

    expect(sessionStart).toHaveLength(1);
    expect(sessionStart[0].hooks[0].command).toBe('echo keep-session-start');
  });

  it('removes top-level legacy command entries too', () => {
    const settings = {
      hooks: {
        UserPromptSubmit: [
          { command: 'node /old/lazybrain/dist/bin/hook.js' },
          { matcher: '', hooks: [{ type: 'command', command: 'echo keep' }] },
        ],
        Stop: [
          { command: 'node /old/lazybrain/dist/bin/hook.js' },
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

  it('detects whether any LazyBrain hook registration exists', () => {
    expect(hasLazyBrainHookRegistration({
      hooks: {
        UserPromptSubmit: [{ matcher: '', hooks: [{ type: 'command', command: 'node /old/lazybrain/dist/bin/hook.js' }] }],
      },
    })).toBe(true);

    expect(hasLazyBrainHookRegistration({
      hooks: {
        UserPromptSubmit: [{ matcher: '', hooks: [{ type: 'command', command: 'echo keep' }] }],
      },
    })).toBe(false);
  });
});
