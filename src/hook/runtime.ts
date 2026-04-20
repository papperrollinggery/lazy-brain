import { createHash, randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { dirname, join } from 'node:path';
import {
  DEFAULT_HOOK_RUNTIME_CONFIG,
  HOOK_ACTIVE_PATH,
  HOOK_EVENTS_PATH,
  HOOK_HEALTH_PATH,
  HOOK_RUNS_DIR,
} from '../constants.js';
import type { UserConfig } from '../types.js';
import { readHookInstallState, isWithinWorkspaceScope } from './install-state.js';
import type { HookRunRecord, HookRuntimeHealth, HookRuntimeSnapshot } from './types.js';

type HookRuntimeConfig = {
  maxConcurrentHooks: number;
  staleHookMs: number;
  avgDurationBreakerMs: number;
  loadAvgBreaker: number;
  breakerCooldownMs: number;
  recentDurationsWindow: number;
};

type BeginHookRunInput = {
  cwd?: string;
  hookEventName: string;
  sessionId?: string;
  prompt?: string;
};

type BeginHookRunResult =
  | { allowed: true; run: HookRunRecord }
  | { allowed: false; reason: string };

type RuntimeOptions = {
  now?: number;
  loadAverage1m?: number;
  pidExists?: (pid: number) => boolean;
  config?: UserConfig;
};

type RuntimeEvent = {
  timestamp: string;
  type: 'start' | 'finish' | 'skip' | 'clean';
  runId?: string;
  hookEventName?: string;
  reason?: string;
  durationMs?: number;
  cwd?: string;
};

function ensureDir(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function ensureRunsDir(): void {
  if (!existsSync(HOOK_RUNS_DIR)) {
    mkdirSync(HOOK_RUNS_DIR, { recursive: true });
  }
}

function getRuntimeConfig(config?: UserConfig): HookRuntimeConfig {
  const override = config?.hookSafety;
  return {
    maxConcurrentHooks: override?.maxConcurrentHooks ?? DEFAULT_HOOK_RUNTIME_CONFIG.maxConcurrentHooks,
    staleHookMs: override?.staleHookMs ?? DEFAULT_HOOK_RUNTIME_CONFIG.staleHookMs,
    avgDurationBreakerMs: override?.avgDurationBreakerMs ?? DEFAULT_HOOK_RUNTIME_CONFIG.avgDurationBreakerMs,
    loadAvgBreaker: override?.loadAvgBreaker ?? DEFAULT_HOOK_RUNTIME_CONFIG.loadAvgBreaker,
    breakerCooldownMs: override?.breakerCooldownMs ?? DEFAULT_HOOK_RUNTIME_CONFIG.breakerCooldownMs,
    recentDurationsWindow: override?.recentDurationsWindow ?? DEFAULT_HOOK_RUNTIME_CONFIG.recentDurationsWindow,
  };
}

function defaultPidExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readJsonFile<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function writeJsonFile(path: string, value: unknown): void {
  ensureDir(path);
  writeFileSync(path, JSON.stringify(value, null, 2), 'utf-8');
}

function appendRuntimeEvent(event: RuntimeEvent): void {
  try {
    ensureDir(HOOK_EVENTS_PATH);
    appendFileSync(HOOK_EVENTS_PATH, `${JSON.stringify(event)}\n`, 'utf-8');
  } catch {}
}

export function readHookRuntimeHealth(): HookRuntimeHealth {
  const raw = readJsonFile<Partial<HookRuntimeHealth>>(HOOK_HEALTH_PATH);
  if (!raw) {
    return {
      recentDurationsMs: [],
      updatedAt: Date.now(),
    };
  }
  return {
    breakerUntil: typeof raw.breakerUntil === 'number' ? raw.breakerUntil : undefined,
    lastSkipReason: typeof raw.lastSkipReason === 'string' ? raw.lastSkipReason : undefined,
    lastError: typeof raw.lastError === 'string' ? raw.lastError : undefined,
    lastDurationMs: typeof raw.lastDurationMs === 'number' ? raw.lastDurationMs : undefined,
    recentDurationsMs: Array.isArray(raw.recentDurationsMs)
      ? raw.recentDurationsMs.filter((value): value is number => typeof value === 'number')
      : [],
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  };
}

function writeHookRuntimeHealth(health: HookRuntimeHealth): void {
  writeJsonFile(HOOK_HEALTH_PATH, health);
}

function writeHookRun(record: HookRunRecord): void {
  ensureRunsDir();
  writeJsonFile(join(HOOK_RUNS_DIR, `${record.runId}.json`), record);
}

function deleteHookRun(runId: string): void {
  try {
    unlinkSync(join(HOOK_RUNS_DIR, `${runId}.json`));
  } catch {}
}

function listRecordedRuns(): HookRunRecord[] {
  if (!existsSync(HOOK_RUNS_DIR)) return [];
  return readdirSync(HOOK_RUNS_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => readJsonFile<HookRunRecord>(join(HOOK_RUNS_DIR, name)))
    .filter((record): record is HookRunRecord => Boolean(record && typeof record.runId === 'string' && typeof record.pid === 'number'));
}

function updateSkipReason(reason: string, now: number): void {
  const health = readHookRuntimeHealth();
  health.lastSkipReason = reason;
  health.updatedAt = now;
  writeHookRuntimeHealth(health);
}

function openBreaker(reason: string, now: number, cooldownMs: number): void {
  const health = readHookRuntimeHealth();
  health.breakerUntil = now + cooldownMs;
  health.lastSkipReason = reason;
  health.updatedAt = now;
  writeHookRuntimeHealth(health);
}

export function cleanHookRuntimeRecords(options: RuntimeOptions = {}): HookRuntimeSnapshot {
  const now = options.now ?? Date.now();
  const pidExists = options.pidExists ?? defaultPidExists;
  const config = getRuntimeConfig(options.config);
  const staleRuns: HookRunRecord[] = [];
  const activeRuns: HookRunRecord[] = [];
  const hungRuns: HookRunRecord[] = [];

  for (const run of listRecordedRuns()) {
    const ageMs = now - run.startedAt;
    if (!pidExists(run.pid)) {
      staleRuns.push(run);
      deleteHookRun(run.runId);
      continue;
    }
    if (ageMs > config.staleHookMs) {
      hungRuns.push(run);
    }
    activeRuns.push(run);
  }

  if (activeRuns.length === 0) {
    try {
      unlinkSync(HOOK_ACTIVE_PATH);
    } catch {}
  }

  if (staleRuns.length > 0) {
    appendRuntimeEvent({
      timestamp: new Date(now).toISOString(),
      type: 'clean',
      reason: `removed:${staleRuns.length}`,
    });
  }

  return {
    activeRuns,
    hungRuns,
    staleRuns,
    health: readHookRuntimeHealth(),
  };
}

export function beginHookRun(input: BeginHookRunInput, options: RuntimeOptions = {}): BeginHookRunResult {
  const now = options.now ?? Date.now();
  const snapshot = cleanHookRuntimeRecords(options);
  const installState = readHookInstallState();
  const config = getRuntimeConfig(options.config);
  const effectiveLoad = options.loadAverage1m ?? loadavg()[0];

  if (!isWithinWorkspaceScope(input.cwd, installState)) {
    const skipReason = installState ? 'outside_scope' : 'install_state_missing';
    updateSkipReason(skipReason, now);
    appendRuntimeEvent({
      timestamp: new Date(now).toISOString(),
      type: 'skip',
      hookEventName: input.hookEventName,
      reason: skipReason,
      cwd: input.cwd,
    });
    return { allowed: false, reason: skipReason };
  }

  if ((snapshot.health.breakerUntil ?? 0) > now) {
    updateSkipReason('breaker_open', now);
    appendRuntimeEvent({
      timestamp: new Date(now).toISOString(),
      type: 'skip',
      hookEventName: input.hookEventName,
      reason: 'breaker_open',
      cwd: input.cwd,
    });
    return { allowed: false, reason: 'breaker_open' };
  }

  if (snapshot.activeRuns.length >= config.maxConcurrentHooks) {
    updateSkipReason('concurrency_limit', now);
    appendRuntimeEvent({
      timestamp: new Date(now).toISOString(),
      type: 'skip',
      hookEventName: input.hookEventName,
      reason: 'concurrency_limit',
      cwd: input.cwd,
    });
    return { allowed: false, reason: 'concurrency_limit' };
  }

  const recentDurations = snapshot.health.recentDurationsMs;
  if (recentDurations.length >= 3) {
    const avgDuration = recentDurations.reduce((sum, value) => sum + value, 0) / recentDurations.length;
    if (avgDuration > config.avgDurationBreakerMs) {
      openBreaker('slow_recent_avg', now, config.breakerCooldownMs);
      appendRuntimeEvent({
        timestamp: new Date(now).toISOString(),
        type: 'skip',
        hookEventName: input.hookEventName,
        reason: 'slow_recent_avg',
        cwd: input.cwd,
      });
      return { allowed: false, reason: 'slow_recent_avg' };
    }
  }

  if (effectiveLoad > config.loadAvgBreaker) {
    openBreaker('host_overload', now, config.breakerCooldownMs);
    appendRuntimeEvent({
      timestamp: new Date(now).toISOString(),
      type: 'skip',
      hookEventName: input.hookEventName,
      reason: 'host_overload',
      cwd: input.cwd,
    });
    return { allowed: false, reason: 'host_overload' };
  }

  const run: HookRunRecord = {
    runId: randomUUID(),
    pid: process.pid,
    hookEventName: input.hookEventName,
    sessionId: input.sessionId,
    cwd: input.cwd,
    promptHash: input.prompt
      ? createHash('sha1').update(input.prompt).digest('hex').slice(0, 12)
      : undefined,
    startedAt: now,
  };

  writeHookRun(run);
  try {
    writeFileSync(HOOK_ACTIVE_PATH, String(process.pid), 'utf-8');
  } catch {}
  appendRuntimeEvent({
    timestamp: new Date(now).toISOString(),
    type: 'start',
    runId: run.runId,
    hookEventName: run.hookEventName,
    cwd: run.cwd,
  });

  return { allowed: true, run };
}

export function finishHookRun(
  run: HookRunRecord | null,
  result: { status: 'ok' | 'error'; durationMs: number; errorMessage?: string },
  options: RuntimeOptions = {},
): void {
  if (!run) return;

  deleteHookRun(run.runId);
  const health = readHookRuntimeHealth();
  const nextDurations = [...health.recentDurationsMs, result.durationMs];
  const config = getRuntimeConfig(options.config);
  health.recentDurationsMs = nextDurations.slice(-config.recentDurationsWindow);
  health.lastDurationMs = result.durationMs;
  health.lastError = result.errorMessage;
  health.updatedAt = Date.now();
  if ((health.breakerUntil ?? 0) <= Date.now()) {
    delete health.breakerUntil;
  }
  writeHookRuntimeHealth(health);

  const snapshot = cleanHookRuntimeRecords(options);
  if (snapshot.activeRuns.length === 0) {
    try {
      unlinkSync(HOOK_ACTIVE_PATH);
    } catch {}
  }

  appendRuntimeEvent({
    timestamp: new Date().toISOString(),
    type: 'finish',
    runId: run.runId,
    hookEventName: run.hookEventName,
    durationMs: result.durationMs,
    reason: result.status === 'error' ? 'error' : 'ok',
    cwd: run.cwd,
  });
}

export function getHookRuntimeSnapshot(options: RuntimeOptions = {}): HookRuntimeSnapshot {
  return cleanHookRuntimeRecords(options);
}

export function getHookRuntimeStats(snapshot: HookRuntimeSnapshot, now = Date.now()): {
  avgDurationMs: number;
  p95DurationMs: number;
  breakerOpen: boolean;
} {
  const durations = [...snapshot.health.recentDurationsMs].sort((a, b) => a - b);
  const avgDurationMs = durations.length === 0
    ? 0
    : Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length);
  const p95DurationMs = durations.length === 0
    ? 0
    : durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))];
  return {
    avgDurationMs,
    p95DurationMs,
    breakerOpen: (snapshot.health.breakerUntil ?? 0) > now,
  };
}

export function resetHookRuntimeHealth(): void {
  try {
    rmSync(HOOK_RUNS_DIR, { recursive: true, force: true });
  } catch {}
  try {
    unlinkSync(HOOK_HEALTH_PATH);
  } catch {}
  try {
    unlinkSync(HOOK_ACTIVE_PATH);
  } catch {}
}

export function clearHookBreaker(): void {
  const health = readHookRuntimeHealth();
  delete health.breakerUntil;
  delete health.lastSkipReason;
  health.updatedAt = Date.now();
  writeHookRuntimeHealth(health);
}
