import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isLazyBrainHookCommand } from './settings.js';

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

export function getHookLifecycleStatus(settings: SettingsObject): HookLifecycleStatus {
  const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
  const userPromptSubmit = normalizeEntries(hooks.UserPromptSubmit);
  const stop = normalizeEntries(hooks.Stop);
  const sessionStart = normalizeEntries(hooks.SessionStart);

  const userPromptSubmitCommands = flattenCommands(userPromptSubmit);
  const stopCommands = flattenCommands(stop);
  const sessionStartCommands = flattenCommands(sessionStart);

  return {
    lazybrainUserPromptSubmit: userPromptSubmitCommands.some(isLazyBrainHookCommand),
    lazybrainStop: stopCommands.some(isLazyBrainHookCommand),
    lazybrainSessionStart: sessionStartCommands.some(isLazyBrainHookCommand),
    userPromptSubmitCommands,
    stopCommands,
    sessionStartCommands,
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
