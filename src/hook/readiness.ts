import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import type { UserConfig } from '../types.js';
import { getStatusLineCommand, isLazyBrainStatuslineCommand } from './plan.js';
import { getHookLifecycleStatus } from './status.js';
import type { HookInstallScope, HookInstallState, HookRuntimeSnapshot } from './types.js';

type SettingsObject = Record<string, unknown>;

export interface ReadyScopeInput {
  scope: HookInstallScope;
  settingsPath: string;
  settings: SettingsObject;
  installState: HookInstallState | null;
}

export interface ReadyScopeReport {
  scope: HookInstallScope;
  settingsPath: string;
  lazybrainUserPromptSubmit: boolean;
  lazybrainStop: boolean;
  lazybrainSessionStart: boolean;
  installStateScope: HookInstallScope | 'missing';
}

export interface ReadyReport {
  state: 'READY' | 'NOT_READY';
  blockers: string[];
  warnings: string[];
  scopes: ReadyScopeReport[];
}

export interface EvaluateReadyOptions {
  graphExists: boolean;
  status?: Record<string, unknown> | null;
  runtime: HookRuntimeSnapshot;
  scopes: ReadyScopeInput[];
  cwd: string;
  config: Pick<UserConfig, 'engine' | 'embeddingApiBase' | 'embeddingApiKey' | 'embeddingModel' | 'hookSafety'>;
  embeddingsIndexExists: boolean;
  embeddingsBinExists: boolean;
  now?: number;
  loadAverage1m?: number;
  initialBlockers?: string[];
}

function isRecentActiveStatus(status: Record<string, unknown> | null | undefined, now: number): boolean {
  if (status?.state !== 'compiling' && status?.state !== 'scanning') return false;
  const updatedAt = typeof status.updatedAt === 'number' ? status.updatedAt : 0;
  return now - updatedAt < 5 * 60 * 1000;
}

function canonicalPath(path: string): string {
  const resolved = resolve(path);
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

export function evaluateReady(options: EvaluateReadyOptions): ReadyReport {
  const now = options.now ?? Date.now();
  const blockers = [...(options.initialBlockers ?? [])];
  const warnings: string[] = [];
  const scopes: ReadyScopeReport[] = [];

  if (!options.graphExists) {
    blockers.push('Graph missing. Run `lazybrain scan && lazybrain compile --offline` first.');
  }

  if (isRecentActiveStatus(options.status, now)) {
    blockers.push(`Compile state is still ${options.status?.state}. Wait for it to finish.`);
  }

  if ((options.runtime.health.breakerUntil ?? 0) > now) {
    blockers.push('Hook breaker is open. Run `lazybrain doctor --fix` or wait for the cooldown before installing or relying on the hook.');
  }

  const loadAvgBreaker = options.config.hookSafety?.loadAvgBreaker;
  if (typeof options.loadAverage1m === 'number' && typeof loadAvgBreaker === 'number' && options.loadAverage1m > loadAvgBreaker) {
    blockers.push(`Host load average is high (${options.loadAverage1m.toFixed(2)} > ${loadAvgBreaker}); LazyBrain hook would fail closed until load drops.`);
  }

  if (options.runtime.hungRuns.length > 0) {
    blockers.push(`Hung hook records: ${options.runtime.hungRuns.length}. Run \`lazybrain hook clean --force\` if they are stale.`);
  }

  for (const scopeInput of options.scopes) {
    const lifecycle = getHookLifecycleStatus(scopeInput.settings, {
      runtime: options.runtime,
      installState: scopeInput.installState,
    });
    scopes.push({
      scope: scopeInput.scope,
      settingsPath: scopeInput.settingsPath,
      lazybrainUserPromptSubmit: lifecycle.lazybrainUserPromptSubmit,
      lazybrainStop: lifecycle.lazybrainStop,
      lazybrainSessionStart: lifecycle.lazybrainSessionStart,
      installStateScope: scopeInput.installState?.scope ?? 'missing',
    });

    if (lifecycle.lazybrainStop) {
      blockers.push(`${scopeInput.scope} settings still contains LazyBrain Stop hook.`);
    }
    if (lifecycle.lazybrainSessionStart) {
      warnings.push(`${scopeInput.scope} settings contains legacy LazyBrain SessionStart hook.`);
    }
    if (lifecycle.lazybrainUserPromptSubmit && !scopeInput.installState) {
      blockers.push(`${scopeInput.scope} LazyBrain hook exists but install metadata is missing.`);
    }
    if (
      scopeInput.scope === 'project' &&
      lifecycle.lazybrainUserPromptSubmit &&
      scopeInput.installState?.scope === 'project' &&
      scopeInput.installState.workspaceRoot
    ) {
      const root = canonicalPath(scopeInput.installState.workspaceRoot);
      const cwd = canonicalPath(options.cwd);
      if (cwd !== root && !cwd.startsWith(`${root}/`)) {
        blockers.push(`Project hook install state points to another workspace: ${root}`);
      }
    }
  }

  const project = options.scopes.find((scope) => scope.scope === 'project');
  const global = options.scopes.find((scope) => scope.scope === 'global');
  const projectStatusline = getStatusLineCommand(project?.settings.statusLine);
  const globalStatusline = getStatusLineCommand(global?.settings.statusLine);
  if (
    projectStatusline &&
    globalStatusline &&
    isLazyBrainStatuslineCommand(projectStatusline) &&
    !projectStatusline.includes('statusline-combined.js') &&
    !isLazyBrainStatuslineCommand(globalStatusline)
  ) {
    warnings.push('Project LazyBrain statusLine may hide the global HUD; use `lazybrain hook install --statusline` to combine.');
  }

  if (options.config.engine === 'semantic' || options.config.engine === 'hybrid') {
    if (!options.config.embeddingApiBase || !options.config.embeddingApiKey || !options.config.embeddingModel) {
      warnings.push('Semantic/hybrid engine is selected but embedding config is incomplete.');
    } else if (!options.embeddingsIndexExists || !options.embeddingsBinExists) {
      warnings.push('Semantic/hybrid engine is selected but embedding cache is missing.');
    }
  }

  return {
    state: blockers.length > 0 ? 'NOT_READY' : 'READY',
    blockers,
    warnings,
    scopes,
  };
}
