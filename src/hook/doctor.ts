import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { UserConfig } from '../types.js';
import {
  HOOK_INSTALL_STATE_MAP_PATH,
  HOOK_INSTALL_STATE_PATH,
  getClaudeConfigDir,
  getStatuslineChainPath,
} from '../constants.js';
import { createHookBackup, type HookBackupManifest } from './backup.js';
import {
  hasLazyBrainHookRegistration,
  removeLazyBrainHookRegistrations,
  upsertLazyBrainUserPromptSubmit,
} from './settings.js';
import { getHookLifecycleStatus } from './status.js';
import { clearHookBreaker, cleanHookRuntimeRecords, getHookRuntimeSnapshot, getHookRuntimeStats } from './runtime.js';
import { readHookInstallStateForScope, writeHookInstallState } from './install-state.js';
import type { HookInstallScope } from './types.js';

export interface DoctorHookConflict {
  group: string;
  winner: string;
  suppressed: string[];
  severity: 'info' | 'warn' | 'blocker';
  reason: string;
  suggestedAction?: string;
}

export interface DoctorReport {
  scope: HookInstallScope;
  mode: 'diagnose' | 'diagnose+fix';
  paths: {
    settings: string;
    hooks: string;
  };
  backup?: HookBackupManifest;
  installState: {
    present: boolean;
    scope: string;
    workspaceRoot?: string;
  };
  lifecycle: {
    userPromptSubmitInstalled: boolean;
    userPromptSubmitCount: number;
    stopClean: boolean;
  };
  runtime: {
    activeHooks: number;
    hungHooks: number;
    staleHooksCleaned: number;
    breakerOpen: boolean;
    avgDurationMs: number;
    p95DurationMs: number;
    lastSkipReason?: string;
    lastError?: string;
  };
  repairs: string[];
  conflicts: {
    hooks: DoctorHookConflict[];
    capabilities: unknown[];
  };
}

function getSettingsPath(scope: HookInstallScope): string {
  return scope === 'project'
    ? join(resolve(process.cwd(), '.claude'), 'settings.json')
    : join(getClaudeConfigDir(), 'settings.json');
}

function getHooksPath(scope: HookInstallScope): string {
  return scope === 'project'
    ? join(resolve(process.cwd(), '.claude'), 'hooks', 'hooks.json')
    : join(getClaudeConfigDir(), 'hooks', 'hooks.json');
}

function getScopedStatuslineChainPath(scope: HookInstallScope, settingsPath: string): string {
  return scope === 'project' ? join(dirname(settingsPath), 'lazybrain-statusline-chain.json') : getStatuslineChainPath();
}

function readJsonObject(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function readHooksFile(path: string): Record<string, unknown> {
  const raw = readJsonObject(path);
  return (raw.hooks as Record<string, unknown> | undefined) ?? raw;
}

function writeHooksFile(path: string, hooks: Record<string, unknown>): void {
  mkdirSync(dirname(path), { recursive: true });
  const existing = readJsonObject(path);
  existing.hooks = hooks;
  if (existing.$schema === undefined) {
    existing.$schema = 'https://json.schemastore.org/claude-code-settings.json';
  }
  writeFileSync(path, JSON.stringify(existing, null, 2), 'utf-8');
}

function mergeHookMaps(...hookMaps: Array<Record<string, unknown> | undefined>): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const hookMap of hookMaps) {
    if (!hookMap) continue;
    for (const [eventName, eventHooks] of Object.entries(hookMap)) {
      if (Array.isArray(eventHooks)) {
        const existing = merged[eventName];
        merged[eventName] = Array.isArray(existing)
          ? [...existing, ...eventHooks]
          : [...eventHooks];
      } else if (eventHooks !== undefined) {
        merged[eventName] = eventHooks;
      }
    }
  }
  return merged;
}

function settingsWithMergedHooks(settings: Record<string, unknown>, hooks: Record<string, unknown>): Record<string, unknown> {
  return {
    ...settings,
    hooks: mergeHookMaps(settings.hooks as Record<string, unknown> | undefined, hooks),
  };
}

function hookCommand(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  return `node ${resolve(moduleDir, '..', '..', 'bin', 'hook.js')}`;
}

function hookConflictDiagnostics(lifecycle: ReturnType<typeof getHookLifecycleStatus>): DoctorHookConflict[] {
  const conflicts: DoctorHookConflict[] = [];
  if (lifecycle.lazybrainUserPromptSubmitCount > 1) {
    conflicts.push({
      group: 'hook:user-prompt-submit',
      winner: 'lazybrain:user-prompt-submit',
      suppressed: Array.from({ length: lifecycle.lazybrainUserPromptSubmitCount - 1 }, (_, index) => `duplicate:${index + 1}`),
      severity: 'warn',
      reason: 'Multiple LazyBrain UserPromptSubmit registrations are present; only one should own the event.',
      suggestedAction: 'Run lazybrain doctor --fix for this scope to normalize LazyBrain-owned hook entries.',
    });
  }
  if (lifecycle.lazybrainStop) {
    conflicts.push({
      group: 'hook:stop',
      winner: 'none',
      suppressed: ['lazybrain:stop'],
      severity: 'warn',
      reason: 'LazyBrain should not own Stop; Stop registrations are legacy and should be removed by doctor --fix.',
      suggestedAction: 'Run lazybrain doctor --fix for this scope; it removes LazyBrain-owned legacy Stop entries without editing third-party hooks.',
    });
  }
  return conflicts;
}

export function runHookDoctor(
  scope: HookInstallScope,
  shouldFix: boolean,
  config: UserConfig,
): DoctorReport {
  const settingsPath = getSettingsPath(scope);
  const hooksPath = getHooksPath(scope);
  const statuslineChainPath = getScopedStatuslineChainPath(scope, settingsPath);
  let settings = readJsonObject(settingsPath);
  let hooks = readHooksFile(hooksPath);
  const repairs: string[] = [];
  let backup: HookBackupManifest | undefined;

  if (shouldFix) {
    backup = createHookBackup({
      scope,
      settingsPath,
      hooksPath,
      statuslineChainPath,
      installStateMapPath: HOOK_INSTALL_STATE_MAP_PATH,
      legacyInstallStatePath: HOOK_INSTALL_STATE_PATH,
    });

    const existingState = readHookInstallStateForScope(scope, scope === 'project' ? process.cwd() : undefined);
    if (existingState) {
      settings = removeLazyBrainHookRegistrations(settings);
      mkdirSync(dirname(settingsPath), { recursive: true });
      writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

      const hooksSettings = upsertLazyBrainUserPromptSubmit(
        removeLazyBrainHookRegistrations({ hooks } as Record<string, unknown>),
        hookCommand(),
      );
      hooks = (hooksSettings.hooks ?? hooksSettings) as Record<string, unknown>;
      writeHooksFile(hooksPath, hooks);

      writeHookInstallState({
        scope: existingState.scope,
        workspaceRoot: existingState.scope === 'project'
          ? resolve(existingState.workspaceRoot ?? process.cwd())
          : undefined,
        hookCommand: hookCommand(),
        installedAt: existingState.installedAt,
        statuslineMode: existingState.statuslineMode,
      });
      repairs.push('normalized_hooks_json_registration');
    } else if (hasLazyBrainHookRegistration(settingsWithMergedHooks(settings, hooks))) {
      repairs.push('metadata_missing_manual_reinstall_required');
    }

    const cleaned = cleanHookRuntimeRecords({ config });
    if (cleaned.staleRuns.length > 0) repairs.push(`cleaned_stale_runs:${cleaned.staleRuns.length}`);

    const runtimeBeforeReset = getHookRuntimeSnapshot({ config });
    if (runtimeBeforeReset.health.breakerUntil || runtimeBeforeReset.health.lastSkipReason === 'breaker_open') {
      clearHookBreaker();
      repairs.push('cleared_breaker');
    }
  }

  const installState = readHookInstallStateForScope(scope, scope === 'project' ? process.cwd() : undefined);
  const runtime = getHookRuntimeSnapshot({ config });
  const runtimeStats = getHookRuntimeStats(runtime);
  const lifecycle = getHookLifecycleStatus(settingsWithMergedHooks(settings, hooks), { runtime, installState });

  return {
    scope,
    mode: shouldFix ? 'diagnose+fix' : 'diagnose',
    paths: {
      settings: settingsPath,
      hooks: hooksPath,
    },
    ...(backup ? { backup } : {}),
    installState: {
      present: Boolean(installState),
      scope: installState?.scope ?? 'unknown',
      ...(installState?.workspaceRoot ? { workspaceRoot: installState.workspaceRoot } : {}),
    },
    lifecycle: {
      userPromptSubmitInstalled: lifecycle.lazybrainUserPromptSubmit,
      userPromptSubmitCount: lifecycle.lazybrainUserPromptSubmitCount,
      stopClean: !lifecycle.lazybrainStop,
    },
    runtime: {
      activeHooks: runtime.activeRuns.length,
      hungHooks: runtime.hungRuns.length,
      staleHooksCleaned: runtime.staleRuns.length,
      breakerOpen: runtimeStats.breakerOpen,
      avgDurationMs: runtimeStats.avgDurationMs,
      p95DurationMs: runtimeStats.p95DurationMs,
      ...(runtime.health.lastSkipReason ? { lastSkipReason: runtime.health.lastSkipReason } : {}),
      ...(runtime.health.lastError ? { lastError: runtime.health.lastError } : {}),
    },
    repairs,
    conflicts: {
      hooks: hookConflictDiagnostics(lifecycle),
      capabilities: [],
    },
  };
}
