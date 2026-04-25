import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
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
        HOOK_INSTALL_STATE_MAP_PATH: join(tempDir, 'hook-install-map.json'),
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

  it('keeps project install metadata isolated by workspace root', async () => {
    vi.doMock('../../src/constants.js', async () => {
      const actual = await vi.importActual<any>('../../src/constants.js');
      return {
        ...actual,
        HOOK_INSTALL_STATE_PATH: join(tempDir, 'hook-install.json'),
        HOOK_INSTALL_STATE_MAP_PATH: join(tempDir, 'hook-install-map.json'),
      };
    });

    const mod = await import('../../src/hook/install-state.js');

    mod.writeHookInstallState({
      scope: 'project',
      workspaceRoot: '/repo/a',
      hookCommand: 'node /repo/a/dist/bin/hook.js',
      installedAt: '2026-04-20T00:00:00.000Z',
      statuslineMode: 'none',
    });
    mod.writeHookInstallState({
      scope: 'project',
      workspaceRoot: '/repo/b',
      hookCommand: 'node /repo/b/dist/bin/hook.js',
      installedAt: '2026-04-20T00:00:00.000Z',
      statuslineMode: 'combined',
    });

    expect(mod.readHookInstallState('/repo/a/src')?.workspaceRoot).toBe('/repo/a');
    expect(mod.readHookInstallState('/repo/b/src')?.workspaceRoot).toBe('/repo/b');

    mod.clearHookInstallState('project', '/repo/a');

    expect(mod.readHookInstallState('/repo/a/src')).toBeNull();
    expect(mod.readHookInstallState('/repo/b/src')?.workspaceRoot).toBe('/repo/b');
  });

  it('reads exact scope without treating project metadata as global', async () => {
    vi.doMock('../../src/constants.js', async () => {
      const actual = await vi.importActual<any>('../../src/constants.js');
      return {
        ...actual,
        HOOK_INSTALL_STATE_PATH: join(tempDir, 'hook-install.json'),
        HOOK_INSTALL_STATE_MAP_PATH: join(tempDir, 'hook-install-map.json'),
      };
    });

    const mod = await import('../../src/hook/install-state.js');

    mod.writeHookInstallState({
      scope: 'project',
      workspaceRoot: '/repo/a',
      hookCommand: 'node /repo/a/dist/bin/hook.js',
      installedAt: '2026-04-20T00:00:00.000Z',
      statuslineMode: 'none',
    });

    expect(mod.readHookInstallStateForScope('global')).toBeNull();
    expect(mod.readHookInstallStateForScope('project', '/repo/a/src')?.workspaceRoot).toBe('/repo/a');
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

  it('treats symlinked workspace paths as the same project', async () => {
    const root = mkdtempSync(join(tempDir, 'real-'));
    const project = join(root, 'project');
    const link = join(tempDir, 'project-link');
    mkdirSync(join(project, 'src'), { recursive: true });
    symlinkSync(project, link, 'dir');

    const mod = await import('../../src/hook/install-state.js');

    expect(mod.isWithinWorkspaceScope(join(link, 'src'), {
      scope: 'project',
      workspaceRoot: project,
      hookCommand: 'node hook.js',
      installedAt: '2026-04-20T00:00:00.000Z',
      statuslineMode: 'none',
    })).toBe(true);
  });
});
