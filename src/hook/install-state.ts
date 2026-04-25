import { existsSync, mkdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { HOOK_INSTALL_STATE_MAP_PATH, HOOK_INSTALL_STATE_PATH } from '../constants.js';
import type { HookInstallScope, HookInstallState } from './types.js';

type HookInstallStateMap = {
  global?: HookInstallState;
  projects?: Record<string, HookInstallState>;
};

function ensureDir(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function canonicalPath(path: string): string {
  const resolved = resolve(path);
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

export function readHookInstallState(cwd?: string): HookInstallState | null {
  const map = readHookInstallStateMap();
  if (map) {
    if (cwd) {
      const project = findProjectInstallState(map, cwd);
      if (project) return project;
      if (map.global) return map.global;
    } else if (map.global) {
      return map.global;
    } else {
      const firstProject = Object.values(map.projects ?? {})[0];
      if (firstProject) return firstProject;
    }
  }

  return readLegacyHookInstallState(cwd);
}

export function readHookInstallStateForScope(scope: HookInstallScope, cwd?: string): HookInstallState | null {
  const map = readHookInstallStateMap();
  if (map) {
    if (scope === 'global') return map.global ?? readLegacyHookInstallStateForScope('global');
    if (cwd) return findProjectInstallState(map, cwd) ?? readLegacyHookInstallStateForScope('project', cwd);
    const firstProject = Object.values(map.projects ?? {})[0];
    return firstProject ?? readLegacyHookInstallStateForScope('project');
  }

  return readLegacyHookInstallStateForScope(scope, cwd);
}

function readLegacyHookInstallState(cwd?: string): HookInstallState | null {
  if (!existsSync(HOOK_INSTALL_STATE_PATH)) return null;
  try {
    const raw = JSON.parse(readFileSync(HOOK_INSTALL_STATE_PATH, 'utf-8')) as Partial<HookInstallState>;
    const state = normalizeHookInstallState(raw);
    if (!state) return null;
    if (cwd && state.scope === 'project' && !isWithinWorkspaceScope(cwd, state)) return null;
    return state;
  } catch {
    return null;
  }
}

function readLegacyHookInstallStateForScope(scope: HookInstallScope, cwd?: string): HookInstallState | null {
  const state = readLegacyHookInstallState(cwd);
  return state?.scope === scope ? state : null;
}

export function writeHookInstallState(state: HookInstallState): void {
  const normalized = normalizeHookInstallState(state);
  if (!normalized) return;
  const map = readHookInstallStateMap() ?? {};
  if (normalized.scope === 'global') {
    map.global = normalized;
  } else if (normalized.workspaceRoot) {
    normalized.workspaceRoot = canonicalPath(normalized.workspaceRoot);
    map.projects = map.projects ?? {};
    map.projects[normalized.workspaceRoot] = normalized;
  }
  writeHookInstallStateMap(map);
}

export function clearHookInstallState(scope?: HookInstallScope, workspaceRoot?: string): void {
  if (!scope) {
    try {
      if (existsSync(HOOK_INSTALL_STATE_MAP_PATH)) unlinkSync(HOOK_INSTALL_STATE_MAP_PATH);
    } catch {}
    try {
      if (existsSync(HOOK_INSTALL_STATE_PATH)) unlinkSync(HOOK_INSTALL_STATE_PATH);
    } catch {}
    return;
  }

  const map = readHookInstallStateMap() ?? {};
  if (scope === 'global') {
    delete map.global;
  } else if (workspaceRoot) {
    const root = canonicalPath(workspaceRoot);
    if (map.projects) delete map.projects[root];
  }
  writeHookInstallStateMap(map);

  const legacy = readLegacyHookInstallState();
  if (legacy?.scope === scope && (scope === 'global' || !workspaceRoot || legacy.workspaceRoot === resolve(workspaceRoot))) {
    try {
      if (existsSync(HOOK_INSTALL_STATE_PATH)) unlinkSync(HOOK_INSTALL_STATE_PATH);
    } catch {}
  }
}

export function isWithinWorkspaceScope(cwd: string | undefined, state: HookInstallState | null): boolean {
  if (!state) return false;
  if (state.scope !== 'project') return true;
  if (!cwd || !state.workspaceRoot) return false;
  const workspaceRoot = canonicalPath(state.workspaceRoot);
  const target = canonicalPath(cwd);
  return target === workspaceRoot || target.startsWith(`${workspaceRoot}/`);
}

function normalizeHookInstallState(raw: Partial<HookInstallState>): HookInstallState | null {
  if (raw.scope !== 'project' && raw.scope !== 'global') return null;
  if (typeof raw.hookCommand !== 'string' || typeof raw.installedAt !== 'string') return null;
  return {
    scope: raw.scope,
    workspaceRoot: typeof raw.workspaceRoot === 'string' ? canonicalPath(raw.workspaceRoot) : undefined,
    hookCommand: raw.hookCommand,
    installedAt: raw.installedAt,
    statuslineMode: raw.statuslineMode === 'lazybrain'
      || raw.statuslineMode === 'combined'
      || raw.statuslineMode === 'skipped'
      ? raw.statuslineMode
      : 'none',
  };
}

function readHookInstallStateMap(): HookInstallStateMap | null {
  if (!existsSync(HOOK_INSTALL_STATE_MAP_PATH)) return null;
  try {
    const raw = JSON.parse(readFileSync(HOOK_INSTALL_STATE_MAP_PATH, 'utf-8')) as HookInstallStateMap;
    const map: HookInstallStateMap = {};
    const global = raw.global ? normalizeHookInstallState(raw.global) : null;
    if (global) map.global = global;
    for (const [root, state] of Object.entries(raw.projects ?? {})) {
      const normalized = normalizeHookInstallState(state);
      if (!normalized?.workspaceRoot) continue;
      map.projects = map.projects ?? {};
      map.projects[canonicalPath(root)] = normalized;
    }
    return map;
  } catch {
    return null;
  }
}

function writeHookInstallStateMap(map: HookInstallStateMap): void {
  const projects = map.projects
    ? Object.fromEntries(Object.entries(map.projects).filter(([, state]) => Boolean(state)))
    : undefined;
  const next: HookInstallStateMap = {};
  if (map.global) next.global = map.global;
  if (projects && Object.keys(projects).length > 0) next.projects = projects;

  if (!next.global && !next.projects) {
    try {
      if (existsSync(HOOK_INSTALL_STATE_MAP_PATH)) unlinkSync(HOOK_INSTALL_STATE_MAP_PATH);
    } catch {}
    return;
  }

  ensureDir(HOOK_INSTALL_STATE_MAP_PATH);
  writeFileSync(HOOK_INSTALL_STATE_MAP_PATH, JSON.stringify(next, null, 2), 'utf-8');
}

function findProjectInstallState(map: HookInstallStateMap, cwd: string): HookInstallState | null {
  const states = Object.values(map.projects ?? {})
    .filter((state) => state.scope === 'project' && isWithinWorkspaceScope(cwd, state))
    .sort((a, b) => (b.workspaceRoot?.length ?? 0) - (a.workspaceRoot?.length ?? 0));
  return states[0] ?? null;
}
