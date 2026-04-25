import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadavg } from 'node:os';
import type { Graph } from '../graph/graph.js';
import type { UserConfig } from '../types.js';
import { EMBEDDINGS_BIN_PATH, EMBEDDINGS_INDEX_PATH, GRAPH_PATH, LAZYBRAIN_DIR, STATUS_PATH, getClaudeConfigDir } from '../constants.js';
import { getPackageVersion } from '../version.js';
import { redactConfig } from '../config/redaction.js';
import { getEmbeddingCacheStatus } from '../embeddings/cache.js';
import { getHookRuntimeSnapshot, getHookRuntimeStats } from '../hook/runtime.js';
import { readHookInstallStateForScope } from '../hook/install-state.js';
import { evaluateReady } from '../hook/readiness.js';
import { getHookLifecycleStatus } from '../hook/status.js';
import type { HookInstallScope } from '../hook/types.js';
import { scanAgentInventory } from '../lab/agent-inventory.js';

const SERVER_RUNNING_FLAG = join(LAZYBRAIN_DIR, '.server-running');
const SERVER_PID_FILE = join(LAZYBRAIN_DIR, 'server.pid');

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

function readSettings(path: string): Record<string, unknown> {
  const json = readJson(path);
  return json ?? {};
}

function apiConfigured(config: UserConfig): { compile: boolean; secretary: boolean; embedding: boolean } {
  return {
    compile: Boolean(config.compileApiBase && config.compileApiKey && config.compileModel),
    secretary: Boolean((config.secretaryApiBase ?? config.compileApiBase) && (config.secretaryApiKey ?? config.compileApiKey) && (config.secretaryModel ?? config.compileModel)),
    embedding: Boolean(config.embeddingApiBase && config.embeddingApiKey && config.embeddingModel),
  };
}

function getServerPort(): number {
  const raw = existsSync(SERVER_RUNNING_FLAG) ? readFileSync(SERVER_RUNNING_FLAG, 'utf-8').trim() : '';
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 18450;
}

function getServerPid(): number | null {
  const raw = existsSync(SERVER_PID_FILE) ? readFileSync(SERVER_PID_FILE, 'utf-8').trim() : '';
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildStatusReport(graph: Graph, config: UserConfig): Record<string, unknown> {
  const nodes = graph.getAllNodes();
  const runtime = getHookRuntimeSnapshot({ config });
  const scopes = (['project', 'global'] as const).map((scope) => {
    const settingsPath = getSettingsPath(scope);
    const settings = readSettings(settingsPath);
    const installState = readHookInstallStateForScope(scope, scope === 'project' ? process.cwd() : undefined);
    const lifecycle = getHookLifecycleStatus(settings, { runtime, installState });
    return { scope, settingsPath, settings, installState, lifecycle };
  });
  const readyScopes = scopes.map(({ scope, settingsPath, settings, installState }) => ({
    scope,
    settingsPath,
    settings,
    installState,
  }));
  const ready = evaluateReady({
    graphExists: existsSync(GRAPH_PATH),
    status: readJson(STATUS_PATH),
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
    routing: {
      engine: config.engine,
      mode: config.mode,
      strategy: config.strategy,
      autoThreshold: config.autoThreshold,
      apiConfigured: apiConfigured(config),
    },
    embedding,
    hook: {
      scopes: scopes.map(({ scope, settingsPath, installState, lifecycle }) => ({
        scope,
        settingsPath,
        installed: lifecycle.lazybrainUserPromptSubmit,
        stopClean: !lifecycle.lazybrainStop,
        sessionStart: lifecycle.lazybrainSessionStart,
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
      running: existsSync(SERVER_RUNNING_FLAG),
      port: getServerPort(),
      pid: getServerPid(),
      url: `http://127.0.0.1:${getServerPort()}`,
    },
    config: redactConfig(config),
  };
}
