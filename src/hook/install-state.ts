import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { HOOK_INSTALL_STATE_PATH } from '../constants.js';
import type { HookInstallState } from './types.js';

function ensureDir(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function readHookInstallState(): HookInstallState | null {
  if (!existsSync(HOOK_INSTALL_STATE_PATH)) return null;
  try {
    const raw = JSON.parse(readFileSync(HOOK_INSTALL_STATE_PATH, 'utf-8')) as Partial<HookInstallState>;
    if (raw.scope !== 'project' && raw.scope !== 'global') return null;
    if (typeof raw.hookCommand !== 'string' || typeof raw.installedAt !== 'string') return null;
    return {
      scope: raw.scope,
      workspaceRoot: typeof raw.workspaceRoot === 'string' ? resolve(raw.workspaceRoot) : undefined,
      hookCommand: raw.hookCommand,
      installedAt: raw.installedAt,
      statuslineMode: raw.statuslineMode === 'lazybrain'
        || raw.statuslineMode === 'combined'
        || raw.statuslineMode === 'skipped'
        ? raw.statuslineMode
        : 'none',
    };
  } catch {
    return null;
  }
}

export function writeHookInstallState(state: HookInstallState): void {
  ensureDir(HOOK_INSTALL_STATE_PATH);
  writeFileSync(HOOK_INSTALL_STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
}

export function clearHookInstallState(): void {
  try {
    if (existsSync(HOOK_INSTALL_STATE_PATH)) unlinkSync(HOOK_INSTALL_STATE_PATH);
  } catch {}
}

export function isWithinWorkspaceScope(cwd: string | undefined, state: HookInstallState | null): boolean {
  if (!state) return false;
  if (state.scope !== 'project') return true;
  if (!cwd || !state.workspaceRoot) return false;
  const workspaceRoot = resolve(state.workspaceRoot);
  const target = resolve(cwd);
  return target === workspaceRoot || target.startsWith(`${workspaceRoot}/`);
}
