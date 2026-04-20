import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readHookInstallState } from './install-state.js';
import { getHookRuntimeSnapshot, getHookRuntimeStats } from './runtime.js';
import { isLazyBrainHookCommand } from './settings.js';
import type { HookInstallState, HookRuntimeSnapshot } from './types.js';

type HookCommand = {
  type?: string;
  command?: unknown;
  timeout?: unknown;
};

type HookEntry = {
  matcher?: unknown;
  hooks?: HookCommand[];
  command?: unknown;
};

type SettingsObject = Record<string, unknown> & {
  hooks?: Record<string, unknown>;
};

export interface HookLifecycleStatus {
  lazybrainUserPromptSubmit: boolean;
  lazybrainStop: boolean;
  lazybrainSessionStart: boolean;
  userPromptSubmitCommands: string[];
  stopCommands: string[];
  sessionStartCommands: string[];
  installState: HookInstallState | null;
  runtime: HookRuntimeSnapshot;
  avgDurationMs: number;
  p95DurationMs: number;
  breakerOpen: boolean;
}

export interface StopHookAuditEntry {
  command: string;
  durationMs: number;
}

export interface StopHookAudit {
  sessionFile: string;
  timestamp: string;
  entries: StopHookAuditEntry[];
}

type HookLifecycleOptions = {
  installState?: HookInstallState | null;
  runtime?: HookRuntimeSnapshot;
  now?: number;
};

function flattenCommands(entries: HookEntry[]): string[] {
  const commands: string[] = [];
  for (const entry of entries) {
    if (typeof entry.command === 'string') commands.push(entry.command);
    if (Array.isArray(entry.hooks)) {
      for (const hook of entry.hooks) {
        if (typeof hook.command === 'string') commands.push(hook.command);
      }
    }
  }
  return commands;
}

function normalizeEntries(value: unknown): HookEntry[] {
  return Array.isArray(value) ? value as HookEntry[] : [];
}

export function getHookLifecycleStatus(settings: SettingsObject, options: HookLifecycleOptions = {}): HookLifecycleStatus {
  const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
  const userPromptSubmit = normalizeEntries(hooks.UserPromptSubmit);
  const stop = normalizeEntries(hooks.Stop);
  const sessionStart = normalizeEntries(hooks.SessionStart);

  const userPromptSubmitCommands = flattenCommands(userPromptSubmit);
  const stopCommands = flattenCommands(stop);
  const sessionStartCommands = flattenCommands(sessionStart);
  const runtime = options.runtime ?? getHookRuntimeSnapshot();
  const runtimeStats = getHookRuntimeStats(runtime, options.now);

  return {
    lazybrainUserPromptSubmit: userPromptSubmitCommands.some(isLazyBrainHookCommand),
    lazybrainStop: stopCommands.some(isLazyBrainHookCommand),
    lazybrainSessionStart: sessionStartCommands.some(isLazyBrainHookCommand),
    userPromptSubmitCommands,
    stopCommands,
    sessionStartCommands,
    installState: options.installState ?? readHookInstallState(),
    runtime,
    avgDurationMs: runtimeStats.avgDurationMs,
    p95DurationMs: runtimeStats.p95DurationMs,
    breakerOpen: runtimeStats.breakerOpen,
  };
}

function workspaceSessionDir(cwd: string): string {
  return join(
    process.env.CLAUDE_CONFIG_DIR ?? join(process.env.HOME ?? '~', '.claude'),
    'projects',
    cwd.replace(/[^A-Za-z0-9]/g, '-'),
  );
}

export function loadLatestStopHookAudit(cwd: string): StopHookAudit | null {
  const dir = workspaceSessionDir(cwd);
  if (!existsSync(dir)) return null;

  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.jsonl'))
    .map((name) => ({
      name,
      path: join(dir, name),
      mtimeMs: statSync(join(dir, name)).mtimeMs,
    }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const file of files) {
    const lines = readFileSync(file.path, 'utf-8').trim().split('\n').filter(Boolean).reverse();
    for (const line of lines) {
      try {
        const obj = JSON.parse(line) as {
          type?: string;
          subtype?: string;
          timestamp?: string;
          hookInfos?: Array<{ command?: string; durationMs?: number }>;
        };
        if (obj.type !== 'system' || obj.subtype !== 'stop_hook_summary' || !Array.isArray(obj.hookInfos)) continue;
        return {
          sessionFile: file.name,
          timestamp: obj.timestamp ?? '',
          entries: obj.hookInfos
            .filter((entry) => typeof entry.command === 'string' && typeof entry.durationMs === 'number')
            .map((entry) => ({
              command: entry.command as string,
              durationMs: entry.durationMs as number,
            })),
        };
      } catch {
        continue;
      }
    }
  }

  return null;
}
