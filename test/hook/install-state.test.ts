import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('hook install state', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'lazybrain-install-state-'));
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it('writes and reads scoped install metadata', async () => {
    vi.doMock('../../src/constants.js', async () => {
      const actual = await vi.importActual<any>('../../src/constants.js');
      return {
        ...actual,
        HOOK_INSTALL_STATE_PATH: join(tempDir, 'hook-install.json'),
      };
    });

    const mod = await import('../../src/hook/install-state.js');

    mod.writeHookInstallState({
      scope: 'project',
      workspaceRoot: '/repo/lazy_user',
      hookCommand: 'node /repo/dist/bin/hook.js',
      installedAt: '2026-04-20T00:00:00.000Z',
      statuslineMode: 'combined',
    });

    const state = mod.readHookInstallState();
    expect(state?.scope).toBe('project');
    expect(state?.workspaceRoot).toBe('/repo/lazy_user');
    expect(state?.statuslineMode).toBe('combined');
  });

  it('checks cwd against project scope', async () => {
    const mod = await import('../../src/hook/install-state.js');

    expect(mod.isWithinWorkspaceScope('/repo/lazy_user/src', {
      scope: 'project',
      workspaceRoot: '/repo/lazy_user',
      hookCommand: 'node hook.js',
      installedAt: '2026-04-20T00:00:00.000Z',
      statuslineMode: 'none',
    })).toBe(true);

    expect(mod.isWithinWorkspaceScope('/repo/other', {
      scope: 'project',
      workspaceRoot: '/repo/lazy_user',
      hookCommand: 'node hook.js',
      installedAt: '2026-04-20T00:00:00.000Z',
      statuslineMode: 'none',
    })).toBe(false);

    expect(mod.isWithinWorkspaceScope('/repo/lazy_user', null)).toBe(false);
  });
});
