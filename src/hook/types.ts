export type HookInstallScope = 'project' | 'global';

export type HookStatuslineMode = 'none' | 'lazybrain' | 'combined' | 'skipped';

export interface HookInstallState {
  scope: HookInstallScope;
  workspaceRoot?: string;
  hookCommand: string;
  installedAt: string;
  statuslineMode: HookStatuslineMode;
}

export interface HookRunRecord {
  runId: string;
  pid: number;
  hookEventName: string;
  sessionId?: string;
  cwd?: string;
  promptHash?: string;
  startedAt: number;
}

export interface HookRuntimeHealth {
  breakerUntil?: number;
  lastSkipReason?: string;
  lastError?: string;
  lastDurationMs?: number;
  recentDurationsMs: number[];
  updatedAt: number;
}

export interface HookRuntimeSnapshot {
  activeRuns: HookRunRecord[];
  hungRuns: HookRunRecord[];
  staleRuns: HookRunRecord[];
  health: HookRuntimeHealth;
}
