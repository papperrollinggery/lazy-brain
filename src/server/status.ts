import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadavg } from 'node:os';
import type { Graph } from '../graph/graph.js';
import type { UserConfig } from '../types.js';
import { EMBEDDINGS_BIN_PATH, EMBEDDINGS_INDEX_PATH, GRAPH_PATH, STATUS_PATH, getClaudeConfigDir } from '../constants.js';
import { getPackageVersion } from '../version.js';
import { redactConfig } from '../config/redaction.js';
import { getEmbeddingCacheStatus } from '../embeddings/cache.js';
import { getHookRuntimeSnapshot, getHookRuntimeStats } from '../hook/runtime.js';
import { readHookInstallStateForScope } from '../hook/install-state.js';
import { evaluateReady } from '../hook/readiness.js';
import { getHookLifecycleStatus } from '../hook/status.js';
import type { HookInstallScope } from '../hook/types.js';
import { scanAgentInventory } from '../lab/agent-inventory.js';
import { buildModelHealth, buildUnlockHealth } from '../unlock/health.js';
import { getGitNexusStatus } from '../integrations/gitnexus.js';
import { hasLocalActiveJob } from '../runtime/jobs.js';
import { getServerRuntimeState } from './liveness.js';

function readJson(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }
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

function readSettings(path: string): Record<string, unknown> {
  const json = readJson(path);
  return json ?? {};
}

function readHooks(path: string): Record<string, unknown> {
  const json = readJson(path);
  return ((json?.hooks as Record<string, unknown> | undefined) ?? json) ?? {};
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

function apiConfigured(config: UserConfig): { compile: boolean; secretary: boolean; embedding: boolean } {
  return {
    compile: Boolean(config.compileApiBase && config.compileApiKey && config.compileModel),
    secretary: Boolean((config.secretaryApiBase ?? config.compileApiBase) && (config.secretaryApiKey ?? config.compileApiKey) && (config.secretaryModel ?? config.compileModel)),
    embedding: Boolean(config.embeddingApiBase && config.embeddingApiKey && config.embeddingModel),
  };
}

function hasLocalRuntimeJob(state: unknown): boolean {
  if (state === 'compiling' || state === 'scanning') {
    return hasLocalActiveJob('compile') || hasLocalActiveJob('scan');
  }
  if (state === 'embedding') return hasLocalActiveJob('embedding');
  return true;
}

function publicRuntimeStatus(status: Record<string, unknown> | null): Record<string, unknown> {
  const allowed = new Set([
    'state',
    'progress',
    'updatedAt',
    'lastScanAt',
    'lastCompileAt',
    'lastEmbeddingAt',
    'lastEmbeddingResult',
    'scannedFiles',
    'scannedPaths',
    'capabilitiesFound',
    'newCapabilities',
  ]);
  const out: Record<string, unknown> = {};
  if (!status) return out;
  for (const key of allowed) {
    const value = status[key];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') out[key] = value;
    if (Array.isArray(value)) out[key] = value.filter(item => typeof item === 'string').slice(0, 20);
  }
  if (
    (status.state === 'compiling' || status.state === 'scanning' || status.state === 'embedding') &&
    !hasLocalRuntimeJob(status.state)
  ) {
    out.stale = true;
    out.staleReason = status.state === 'embedding' ? 'no active embedding process' : 'no active compile process';
  }
  return out;
}

export function buildStatusReport(graph: Graph, config: UserConfig): Record<string, unknown> {
  const nodes = graph.getAllNodes();
  const runtime = getHookRuntimeSnapshot({ config });
  const status = readJson(STATUS_PATH);
  const runtimeStatus = publicRuntimeStatus(status);
  const statusForReady = runtimeStatus.stale === true ? { ...(status ?? {}), state: 'idle' } : status;
  const scopes = (['project', 'global'] as const).map((scope) => {
    const settingsPath = getSettingsPath(scope);
    const hooksPath = getHooksPath(scope);
    const settings = settingsWithMergedHooks(readSettings(settingsPath), readHooks(hooksPath));
    const installState = readHookInstallStateForScope(scope, scope === 'project' ? process.cwd() : undefined);
    const lifecycle = getHookLifecycleStatus(settings, { runtime, installState });
    return { scope, settingsPath, hooksPath, settings, installState, lifecycle };
  });
  const readyScopes = scopes.map(({ scope, settingsPath, hooksPath, settings, installState }) => ({
    scope,
    settingsPath,
    hooksPath,
    settings,
    installState,
  }));
  const ready = evaluateReady({
    graphExists: existsSync(GRAPH_PATH),
    compileErrors: graph.getCompileErrors(),
    status: statusForReady,
    runtime,
    scopes: readyScopes,
    cwd: process.cwd(),
    config,
    embeddingsIndexExists: existsSync(EMBEDDINGS_INDEX_PATH),
    embeddingsBinExists: existsSync(EMBEDDINGS_BIN_PATH),
    loadAverage1m: loadavg()[0],
  });
  const runtimeStats = getHookRuntimeStats(runtime);
  const embedding = getEmbeddingCacheStatus(nodes);
  const agents = scanAgentInventory();
  const unlock = buildUnlockHealth(graph);
  const modelHealth = buildModelHealth(config, graph);
  const gitNexus = getGitNexusStatus();
  const serverState = getServerRuntimeState();

  return {
    ok: ready.state === 'READY',
    version: getPackageVersion(),
    readiness: ready,
    graph: {
      exists: existsSync(GRAPH_PATH),
      nodes: nodes.length,
      byKind: nodes.reduce<Record<string, number>>((acc, node) => {
        acc[node.kind] = (acc[node.kind] ?? 0) + 1;
        return acc;
      }, {}),
      byCategory: nodes.reduce<Record<string, number>>((acc, node) => {
        acc[node.category] = (acc[node.category] ?? 0) + 1;
        return acc;
      }, {}),
    },
    gitNexus,
    routing: {
      engine: config.engine,
      mode: config.mode,
      strategy: config.strategy,
      autoThreshold: config.autoThreshold,
      apiConfigured: apiConfigured(config),
    },
    embedding,
    unlock,
    modelHealth,
    runtimeStatus,
    hook: {
      scopes: scopes.map(({ scope, settingsPath, hooksPath, installState, lifecycle }) => ({
        scope,
        settingsPath,
        hooksPath,
        installed: lifecycle.lazybrainUserPromptSubmit,
        stopClean: !lifecycle.lazybrainStop,
        sessionStart: lifecycle.lazybrainSessionStart,
        userPromptSubmitCount: lifecycle.lazybrainUserPromptSubmitCount,
        duplicateUserPromptSubmit: lifecycle.duplicateLazyBrainUserPromptSubmit,
        installState: installState ? {
          scope: installState.scope,
          workspaceRoot: installState.workspaceRoot,
          installedAt: installState.installedAt,
          statuslineMode: installState.statuslineMode,
        } : null,
      })),
      activeRuns: runtime.activeRuns.length,
      hungRuns: runtime.hungRuns.length,
      staleRuns: runtime.staleRuns.length,
      breakerOpen: runtimeStats.breakerOpen,
      avgDurationMs: runtimeStats.avgDurationMs,
      p95DurationMs: runtimeStats.p95DurationMs,
      lastSkipReason: runtime.health.lastSkipReason ?? null,
      lastError: runtime.health.lastError ?? null,
    },
    agents: {
      total: agents.length,
      available: agents.filter(agent => agent.available).length,
      byScope: agents.reduce<Record<string, number>>((acc, agent) => {
        acc[agent.scope] = (acc[agent.scope] ?? 0) + 1;
        return acc;
      }, {}),
    },
    server: {
      running: serverState.running,
      port: serverState.port,
      pid: serverState.pid,
      url: `http://127.0.0.1:${serverState.port}`,
    },
    config: redactConfig(config),
  };
}
