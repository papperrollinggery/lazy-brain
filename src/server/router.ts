/**
 * LazyBrain — HTTP Router
 *
 * Route dispatch for the local API server.
 * Each route is an independent function; no large switch blocks.
 */

import type * as http from 'node:http';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { Graph } from '../graph/graph.js';
import type { Platform, RouteTarget, UserConfig } from '../types.js';
import { buildGraphView, formatGraphMermaid } from '../graph/graph-view.js';
import { match } from '../matcher/matcher.js';
import { recommendTeam } from '../matcher/team-recommender.js';
import { detectDuplicates } from '../graph/duplicate-detector.js';
import { generateReport, computeWeeklyStats } from '../history/accuracy-report.js';
import { loadRecommendations } from '../history/tool-usage-tracker.js';
import { LAB_HTML } from '../lab/html.js';
import { LAB_FIXTURES, type LabCase } from '../lab/fixtures.js';
import { evaluateLab } from '../lab/evaluator.js';
import { scanAgentInventory } from '../lab/agent-inventory.js';
import { UI_HTML } from '../ui/html.js';
import { buildStatusReport } from './status.js';
import { redactConfig } from '../config/redaction.js';
import { loadConfig, saveConfig } from '../config/config.js';
import {
  CONFIG_ALLOWED_KEYS,
  validateConfigUpdate,
} from '../config/schema.js';
import { getHookRuntimeSnapshot, getHookRuntimeStats } from '../hook/runtime.js';
import { runApiTests, type ApiTestTarget } from '../health/api-test.js';
import { getEmbeddingCacheStatus } from '../embeddings/cache.js';
import { rebuildEmbeddingCache } from '../embeddings/rebuild.js';
import { EMBEDDINGS_INDEX_PATH, GRAPH_PATH, LAZYBRAIN_DIR } from '../constants.js';
import { buildRouteSpec, isRouteTarget } from '../orchestrator/route.js';
import { loadRecentHistory } from '../history/history.js';
import { loadProfile } from '../history/profile.js';
import { readRecentRouteEvents, recordRouteSpec } from '../orchestrator/route-events.js';
import { mergeRuntimeStatus } from '../runtime/status.js';
import { getGitNexusStatus } from '../integrations/gitnexus.js';
import { cloneHttpRoutes, defineHttpRoutes } from './routes.js';
import {
  appendJobLog,
  clearJobCanceller,
  createJob,
  getJob,
  listActiveJobs,
  listJobs,
  registerJobCanceller,
  updateJob,
} from '../runtime/jobs.js';

// ─── Rate Limiter ────────────────────────────────────────────────────────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 100; // per second per IP
const ROUTER_DIR = dirname(fileURLToPath(import.meta.url));
const LAZYBRAIN_CLI_CANDIDATES = [
  join(ROUTER_DIR, 'bin', 'lazybrain.js'),
  join(ROUTER_DIR, '..', 'dist', 'bin', 'lazybrain.js'),
  join(ROUTER_DIR, '..', '..', 'dist', 'bin', 'lazybrain.js'),
];

export const HTTP_ROUTES = defineHttpRoutes((router) => {
  router.get('/', 'handleUiPage', 'Serve the local Workbench UI.', 'ui');
  router.get('/ui', 'handleUiPage', 'Serve the local Workbench UI.', 'ui');
  router.get('/health', 'handleHealth', 'Return liveness and graph size.');
  router.get('/api/health', 'handleHealth', 'Return liveness and graph size.', 'api');
  router.get('/api/status', 'handleStatus', 'Return product, runtime, hook, graph, embedding, and GitNexus status.', 'api');
  router.get('/api/diagnostics', 'handleDiagnostics', 'Return privacy-preserving local diagnostics.', 'api');
  router.get('/api/routes', 'handleRoutesMetadata', 'Return the active HTTP route registry.', 'api');
  router.post('/api/route', 'handleRoute', 'Build a RouteSpec for a user task.', 'api');
  router.get('/api/route-events', 'handleRouteEvents', 'Return recent privacy-preserving route events.', 'api');
  router.post('/api/compile', 'handleCompileStart', 'Start a compile job.', 'api');
  router.get('/api/compile/status', 'handleCompileStatus', 'Return compile job status.', 'api');
  router.get('/api/embedding/discover', 'handleEmbeddingDiscover', 'Probe local embedding services.', 'api');
  router.get('/api/embeddings/status', 'handleEmbeddingStatus', 'Return embedding cache status.', 'api');
  router.post('/api/embeddings/rebuild', 'handleEmbeddingRebuild', 'Start an embedding rebuild job.', 'api');
  router.get('/api/config', 'handleGetConfig', 'Return redacted local config.', 'api');
  router.post('/api/config', 'handleUpdateConfig', 'Persist validated local config.', 'api');
  router.post('/api/test', 'handleApiTest', 'Run explicitly requested local API checks.', 'api');
  router.get('/api/search', 'handleSearch', 'Search the local capability graph.', 'api');
  router.post('/api/match', 'handleMatch', 'Return capability matches for a query.', 'api');
  router.post('/api/team', 'handleTeam', 'Recommend a capability team for a query.', 'api');
  router.get('/api/stats', 'handleStats', 'Return graph statistics.', 'api');
  router.get('/api/graph', 'handleGraphView', 'Return graph view data.', 'api');
  router.get('/route-events', 'handleRouteEvents', 'Legacy alias for route events.');
  router.post('/route', 'handleRoute', 'Legacy alias for route planning.');
  router.post('/match', 'handleMatch', 'Legacy alias for capability matching.');
  router.post('/team', 'handleTeam', 'Legacy alias for team recommendation.');
  router.get('/stats', 'handleStats', 'Legacy alias for graph statistics.');
  router.get('/graph', 'handleGraphView', 'Legacy alias for graph view data.');
  router.get('/dups', 'handleDups', 'Return duplicate capability candidates.');
  router.get('/search', 'handleSearch', 'Legacy alias for capability search.');
  router.get('/capability/:id', 'handleCapability', 'Return one capability card.');
  router.get('/lab', 'handleLabPage', 'Serve the route evaluation lab.', 'lab');
  router.get('/lab/fixtures', 'handleLabFixtures', 'Return built-in lab fixtures.', 'lab');
  router.get('/api/lab/fixtures', 'handleLabFixtures', 'Return built-in lab fixtures.', 'api');
  router.get('/lab/agents', 'handleLabAgents', 'Return sanitized agent inventory metadata.', 'lab');
  router.get('/api/lab/agents', 'handleLabAgents', 'Return sanitized agent inventory metadata.', 'api');
  router.post('/lab/evaluate', 'handleLabEvaluate', 'Evaluate lab queries.', 'lab');
  router.post('/api/lab/evaluate', 'handleLabEvaluate', 'Evaluate lab queries.', 'api');
  router.post('/reload', 'handleReload', 'Reload the local graph.');
  router.get('/report/summary', 'handleReportSummary', 'Return local recommendation summary.', 'report');
  router.get('/report/sessions', 'handleReportSessions', 'Return local session report index.', 'report');
  router.get('/report/session/:id', 'handleReportSession', 'Return one local session report.', 'report');
});

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now >= entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 1000 });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function html(res: http.ServerResponse, status: number, body: string): void {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

function err(res: http.ServerResponse, code: number, message: string): void {
  json(res, code, { error: message, code });
}

function resolveLazyBrainCliPath(): string | null {
  for (const path of LAZYBRAIN_CLI_CANDIDATES) {
    if (existsSync(path)) return path;
  }
  return null;
}

async function readBody(req: http.IncomingMessage, maxBytes = 64 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (c: Buffer) => {
      total += c.length;
      if (total > maxBytes) {
        req.destroy();
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function isLocalRequest(req: http.IncomingMessage): boolean {
  const address = req.socket.remoteAddress ?? '';
  const localAddress = address === '' ||
    address === '127.0.0.1' ||
    address === '::1' ||
    address === '::ffff:127.0.0.1';
  if (!localAddress) return false;
  const origin = req.headers.origin ?? req.headers.referer ?? '';
  return !origin || origin.startsWith('http://127.0.0.1') || origin.startsWith('http://localhost');
}

// ─── Route Handlers ──────────────────────────────────────────────────────────

async function handleMatch(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  graph: Graph,
  config: UserConfig,
): Promise<void> {
  let body: { query?: string };
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return err(res, 400, 'Invalid JSON body');
  }
  if (!body.query || typeof body.query !== 'string') {
    return err(res, 400, 'Missing required field: query');
  }
  const result = await match(body.query, { graph, config });
  json(res, 200, result);
}

async function handleRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  graph: Graph,
  config: UserConfig,
  routeEventsPath?: string,
): Promise<void> {
  let body: { query?: string; target?: RouteTarget };
  try {
    body = JSON.parse(await readBody(req));
  } catch (error) {
    return err(res, error instanceof Error && error.message.includes('large') ? 413 : 400, 'Invalid JSON body');
  }
  if (!body.query || typeof body.query !== 'string') {
    return err(res, 400, 'Missing required field: query');
  }
  if (body.query.length > 2000) {
    return err(res, 413, 'Query is too long. Limit: 2000 characters.');
  }
  if (body.target !== undefined && (typeof body.target !== 'string' || !isRouteTarget(body.target))) {
    return err(res, 400, 'Invalid target. Use generic, claude, codex, or cursor.');
  }
  const result = await buildRouteSpec(body.query, {
    graph,
    config,
    history: loadRecentHistory(50),
    profile: loadProfile() ?? undefined,
    target: body.target ?? 'generic',
  });
  const event = recordRouteSpec(result, 'api', routeEventsPath);
  json(res, 200, event ? { ...result, routeEventId: event.eventId } : result);
}

function handleRouteEvents(req: http.IncomingMessage, res: http.ServerResponse, routeEventsPath?: string): void {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const limitRaw = parseInt(url.searchParams.get('limit') ?? '20', 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20;
  json(res, 200, { events: readRecentRouteEvents({ limit, path: routeEventsPath }) });
}

async function handleTeam(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  graph: Graph,
): Promise<void> {
  let body: { query?: string; maxMembers?: number };
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return err(res, 400, 'Invalid JSON body');
  }
  if (!body.query || typeof body.query !== 'string') {
    return err(res, 400, 'Missing required field: query');
  }
  const result = recommendTeam(body.query, graph, body.maxMembers ?? 4);
  json(res, 200, result ?? { members: [], overallReason: 'No agents found', suggestedCommand: '' });
}

function handleStats(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  graph: Graph,
): void {
  const nodes = graph.getAllNodes();
  const byKind: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  for (const n of nodes) {
    byKind[n.kind] = (byKind[n.kind] ?? 0) + 1;
    byCategory[n.category] = (byCategory[n.category] ?? 0) + 1;
  }
  json(res, 200, { total: nodes.length, byKind, byCategory });
}

function handleGraphView(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  graph: Graph,
): void {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const format = (url.searchParams.get('format') ?? 'json').toLowerCase();
  const limitRaw = parseInt(url.searchParams.get('limit') ?? '80', 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 80;
  const kind = url.searchParams.get('kind') ?? undefined;
  const origin = url.searchParams.get('origin') ?? undefined;
  const category = url.searchParams.get('category') ?? undefined;
  const view = buildGraphView(graph, { limit, kind, origin, category });

  if (format === 'mermaid') {
    const payload = formatGraphMermaid(view);
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Length': Buffer.byteLength(payload),
    });
    res.end(payload);
    return;
  }

  json(res, 200, view);
}

function handleDups(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  graph: Graph,
): void {
  const pairs = detectDuplicates(graph);
  json(res, 200, pairs);
}

function handleCapability(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  graph: Graph,
  id: string,
): void {
  const node = graph.getNode(id);
  if (!node) return err(res, 404, `Capability not found: ${id}`);
  const links = graph.getLinks(id);
  json(res, 200, { ...node, links });
}

function handleSearch(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  graph: Graph,
): void {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const q = url.searchParams.get('q') ?? '';
  const kind = url.searchParams.get('kind') ?? '';
  const platform = url.searchParams.get('platform') ?? '';
  const category = url.searchParams.get('category') ?? '';
  const origin = url.searchParams.get('origin') ?? '';
  const status = url.searchParams.get('status') ?? '';
  const semanticMissing = url.searchParams.get('semanticMissing') === 'true';
  const duplicatesOnly = url.searchParams.get('duplicatesOnly') === 'true';
  const hasFilter = Boolean(kind || platform || category || origin || status || semanticMissing || duplicatesOnly);

  let embeddedIds = new Set<string>();
  if (existsSync(EMBEDDINGS_INDEX_PATH)) {
    try {
      const raw = JSON.parse(readFileSync(EMBEDDINGS_INDEX_PATH, 'utf-8')) as unknown;
      if (Array.isArray(raw)) embeddedIds = new Set(raw.filter((id): id is string => typeof id === 'string'));
    } catch {}
  }

  let duplicateIds = new Set<string>();
  if (duplicatesOnly) {
    const pairs = detectDuplicates(graph);
    duplicateIds = new Set(pairs.flatMap(pair => [pair.a.id, pair.b.id]));
  }

  const lower = q.toLowerCase();
  const limitRaw = parseInt(url.searchParams.get('limit') ?? '100', 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 100;
  const results = graph.getAllNodes().filter((n) => {
    if (q && !(
      n.name.toLowerCase().includes(lower) ||
      n.tags.some(t => t.toLowerCase().includes(lower)) ||
      n.description.toLowerCase().includes(lower)
    )) return false;
    if (kind && n.kind !== kind) return false;
    if (category && n.category !== category) return false;
    if (origin && n.origin !== origin) return false;
    if (status && n.status !== status) return false;
    if (platform && !n.compatibility.includes(platform as Platform)) return false;
    if (semanticMissing && embeddedIds.has(n.id)) return false;
    if (duplicatesOnly && !duplicateIds.has(n.id)) return false;
    return true;
  }).slice(0, limit).map(node => ({
    ...node,
    embeddingCovered: embeddedIds.has(node.id),
  }));
  json(res, 200, results);
}

function handleHealth(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  graph: Graph,
  version: string,
): void {
  json(res, 200, { ok: true, version, graphSize: graph.getAllNodes().length });
}

function handleUiPage(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
): void {
  html(res, 200, UI_HTML);
}

function handleStatus(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  graph: Graph,
  config: UserConfig,
): void {
  json(res, 200, buildStatusReport(graph, config));
}

function handleRoutesMetadata(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
): void {
  json(res, 200, { routes: cloneHttpRoutes(HTTP_ROUTES) });
}

async function handleApiTest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  config: UserConfig,
): Promise<void> {
  let body: { targets?: ApiTestTarget[] } = {};
  try {
    const raw = await readBody(req);
    body = raw.trim() ? JSON.parse(raw) as { targets?: ApiTestTarget[] } : {};
  } catch {
    return err(res, 400, 'Invalid JSON body');
  }
  const allowed = new Set<ApiTestTarget>(['compile', 'secretary', 'embedding']);
  const targets = Array.isArray(body.targets)
    ? body.targets.filter((target): target is ApiTestTarget => allowed.has(target))
    : undefined;
  json(res, 200, await runApiTests(config, targets));
}

function handleEmbeddingStatus(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  graph: Graph,
): void {
  json(res, 200, getEmbeddingCacheStatus(graph.getAllNodes()));
}

async function handleEmbeddingRebuild(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  graph: Graph,
  config: UserConfig,
): Promise<void> {
  let body: { confirm?: string | boolean; force?: boolean };
  try {
    body = JSON.parse(await readBody(req)) as { confirm?: string | boolean; force?: boolean };
  } catch {
    return err(res, 400, 'Invalid JSON body');
  }
  if (body.confirm !== 'rebuild' && body.confirm !== true) {
    return err(res, 400, 'Embedding rebuild requires {"confirm":"rebuild"}.');
  }
  const result = startEmbeddingJob(graph, config, body.force === true);
  json(res, result.status, result.body);
}

function startEmbeddingJob(
  graph: Graph,
  config: UserConfig,
  force: boolean,
): { status: number; body: Record<string, unknown> } {
  const active = listActiveJobs({ kind: 'embedding', localOnly: true })[0];
  if (active) return { status: 409, body: { ok: false, error: 'Embedding rebuild is already running', jobId: active.id } };

  const job = createJob('embedding', { progress: force ? 'queued full rebuild' : 'queued incremental rebuild' });
  let cancelled = false;
  registerJobCanceller(job.id, 'embedding', () => {
    cancelled = true;
    return true;
  });
  updateJob(job.id, {
    state: 'running',
    startedAt: new Date().toISOString(),
    progress: force ? 'full rebuild running' : 'incremental rebuild running',
  });
  mergeRuntimeStatus({ state: 'embedding', progress: force ? 'full' : 'incremental' });

  void (async () => {
    try {
      appendJobLog(job.id, [`embedding rebuild started (${force ? 'full' : 'incremental'})`]);
      const result = await rebuildEmbeddingCache(graph.getAllNodes(), config, { force });
      if (cancelled || getJob(job.id)?.state === 'cancelled') return;
      appendJobLog(job.id, [result.ok ? `embedding rebuild indexed ${result.indexed}` : `embedding rebuild failed: ${result.error ?? 'unknown error'}`]);
      mergeRuntimeStatus({
        state: 'idle',
        lastEmbeddingAt: Date.now(),
        lastEmbeddingResult: result.ok ? 'ok' : 'failed',
      });
      updateJob(job.id, {
        state: result.ok ? 'succeeded' : 'failed',
        progress: result.ok ? 'completed' : 'failed',
        exitCode: result.ok ? 0 : 1,
        error: result.ok ? undefined : result.error ?? 'embedding rebuild failed',
        result,
      });
    } catch (error) {
      if (cancelled || getJob(job.id)?.state === 'cancelled') return;
      const message = error instanceof Error ? error.message : String(error);
      mergeRuntimeStatus({ state: 'idle', lastEmbeddingAt: Date.now(), lastEmbeddingResult: 'failed' });
      appendJobLog(job.id, [`embedding rebuild failed: ${message}`]);
      updateJob(job.id, { state: 'failed', progress: 'failed', exitCode: 1, error: message });
    } finally {
      clearJobCanceller(job.id);
    }
  })();

  return { status: 200, body: { ok: true, jobId: job.id } };
}

function handleLabPage(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
): void {
  html(res, 200, LAB_HTML);
}

function handleLabFixtures(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
): void {
  json(res, 200, LAB_FIXTURES);
}

function handleLabAgents(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
): void {
  json(res, 200, scanAgentInventory());
}

async function handleLabEvaluate(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  graph: Graph,
  config: UserConfig,
): Promise<void> {
  let body: { query?: string; queries?: string[]; cases?: LabCase[]; maxMembers?: number };
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return err(res, 400, 'Invalid JSON body');
  }
  const hasQuery = typeof body.query === 'string' && body.query.trim().length > 0;
  const hasQueries = Array.isArray(body.queries) && body.queries.some(q => typeof q === 'string' && q.trim().length > 0);
  const hasCases = Array.isArray(body.cases) && body.cases.some(c => c && typeof c.query === 'string' && c.query.trim().length > 0);
  if (!hasQuery && !hasQueries && !hasCases) {
    return err(res, 400, 'Missing required field: query, queries, or cases');
  }
  const cases = hasCases
    ? body.cases!.filter(c => c && typeof c.query === 'string' && c.query.trim().length > 0)
    : undefined;
  const queries = hasQuery
    ? [body.query!.trim()]
    : body.queries?.filter((q): q is string => typeof q === 'string' && q.trim().length > 0).map(q => q.trim());
  const evaluations = await evaluateLab({
    graph,
    config,
    cases,
    queries,
    maxMembers: body.maxMembers,
  });
  json(res, 200, { evaluations });
}

async function handleReload(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  onReload: () => void,
): Promise<void> {
  onReload();
  json(res, 200, { ok: true });
}

function handleReportSummary(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): void {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const days = parseInt(url.searchParams.get('days') ?? '7', 10);
  const stats = computeWeeklyStats(days);
  json(res, 200, stats);
}

function handleReportSessions(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): void {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const limit = parseInt(url.searchParams.get('limit') ?? '20', 10);

  const sessionsDir = join(homedir(), '.claude', 'sessions');
  let sessionIds: string[] = [];
  try {
    if (existsSync(sessionsDir)) {
      sessionIds = readdirSync(sessionsDir).filter(s => existsSync(join(sessionsDir, s, 'transcript.jsonl')));
    }
  } catch {
    sessionIds = [];
  }

  sessionIds.sort().reverse();
  const recent = sessionIds.slice(0, limit);

  const recommendations = loadRecommendations();
  const bySession = new Map<string, number>();
  for (const rec of recommendations) {
    bySession.set(rec.sessionId, (bySession.get(rec.sessionId) ?? 0) + 1);
  }

  const sessions = recent.map(id => ({
    sessionId: id,
    recommendationCount: bySession.get(id) ?? 0,
  }));

  json(res, 200, { sessions, total: sessionIds.length });
}

function handleReportSession(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  id: string,
): void {
  const report = generateReport(id);
  json(res, 200, report);
}

// ─── Config /api/config ───────────────────────────────────────────────────────

function handleGetConfig(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  liveConfig: UserConfig,
): void {
  json(res, 200, { ok: true, config: redactConfig({ ...loadConfig(), ...liveConfig }) });
}

function configFieldError(message: string): Record<string, string> {
  const match = message.match(/(?:Unknown config key:|Invalid|^)(?:\s+config key)?\s*"?([A-Za-z][A-Za-z0-9]*)"?/);
  const key = match?.[1];
  return key && CONFIG_ALLOWED_KEYS.has(key) ? { [key]: message } : { _global: message };
}

async function handleUpdateConfig(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  liveConfig: UserConfig,
): Promise<void> {
  // Only accept requests from local origin (defense-in-depth)
  if (!isLocalRequest(req)) {
    return json(res, 403, { ok: false, error: 'Forbidden: config writes only allowed from localhost' });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await readBody(req)) as Record<string, unknown>;
  } catch {
    return json(res, 400, { ok: false, error: 'Invalid JSON body' });
  }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return json(res, 400, { ok: false, error: 'Body must be a JSON object' });
  }

  const validation = validateConfigUpdate(body);
  if (!validation.ok) {
    return json(res, 400, { ok: false, error: validation.error, fieldErrors: configFieldError(validation.error) });
  }

  try {
    const { patch, ignoredKeys } = validation;
    const config = loadConfig();
    Object.assign(config, patch);
    saveConfig(config);
    // Also update the live config so /api/status reflects changes immediately
    Object.assign(liveConfig, patch);
    json(res, 200, { ok: true, ignoredKeys });
  } catch (error) {
    json(res, 500, {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to save config',
    });
  }
}

// ─── Compile /api/compile ────────────────────────────────────────────────────

let _compileProcess: ReturnType<typeof spawn> | null = null;
let _compileLog: string[] = [];
let _compilePhase = '';
let _compileExitCode: number | null = null;
let _compileTimedOut = false;
let _compileJobId: string | null = null;

type CompileJobOptions = {
  scanFirst: boolean;
  withRelations?: boolean;
  forceRelations?: boolean;
};

function explicitFlag(url: URL, ...keys: string[]): boolean {
  return keys.some(key => {
    const value = url.searchParams.get(key);
    if (value === null) return false;
    return value === '' || value === '1' || value === 'true' || value === 'yes';
  });
}

export function buildCompileArgs(options: Pick<CompileJobOptions, 'withRelations' | 'forceRelations'>): string[] {
  const args = ['compile'];
  if (options.withRelations) args.push('--with-relations');
  if (options.forceRelations) args.push('--force-relations');
  return args;
}

function startCompileJob(
  onReload: () => void,
  options: CompileJobOptions,
): { status: number; body: Record<string, unknown> } {
  if (_compileProcess && _compileProcess.exitCode === null) {
    return { status: 409, body: { ok: false, error: 'Compilation is already running', jobId: _compileJobId } };
  }
  _compileLog = [];
  _compilePhase = 'starting';
  _compileExitCode = null;
  _compileTimedOut = false;

  const compileArgs = buildCompileArgs(options);
  
  try {
    const COMPILE_TIMEOUT_MS = parseInt(process.env.LAZYBRAIN_COMPILE_TIMEOUT || '1200000', 10); // default 20 min
    const cliPath = resolveLazyBrainCliPath();
    if (!cliPath) {
      return { status: 500, body: { ok: false, error: 'LazyBrain CLI build not found. Run `npm run build` first.' } };
    }

    const job = createJob('compile', { progress: options.scanFirst ? 'queued scan' : options.withRelations ? 'queued relation compile' : 'queued compile' });
    _compileJobId = job.id;
    let activeChild: ReturnType<typeof spawn> | null = null;
    registerJobCanceller(job.id, 'compile', () => {
      if (activeChild && activeChild.exitCode === null) return activeChild.kill();
      return false;
    });

    const startTask = (taskArgs: string[], kind: 'scan' | 'compile', onSuccess?: () => void): void => {
      _compilePhase = kind === 'scan' ? 'scanning' : 'starting';
      mergeRuntimeStatus({ state: kind === 'scan' ? 'scanning' : 'compiling', progress: _compilePhase });
      updateJob(job.id, {
        state: 'running',
        startedAt: getJob(job.id)?.startedAt ?? new Date().toISOString(),
        progress: _compilePhase,
      });
      const child = spawn(process.execPath, [cliPath, ...taskArgs], {
        cwd: process.cwd(),
        env: { ...process.env, FORCE_COLOR: '0' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      activeChild = child;
      _compileProcess = child;

      child.stdout.on('data', (data: Buffer) => {
        const lines = data.toString().split('\n').filter(Boolean);
        _compileLog.push(...lines);
        if (_compileLog.length > 100) _compileLog = _compileLog.slice(-100);
        appendJobLog(job.id, lines);
        for (const line of lines) {
          if (kind === 'scan') {
            if (line.includes('Scan complete')) _compilePhase = 'scan completed';
          } else {
            if (line.includes('Phase 1')) _compilePhase = 'Phase 1/2: 标签生成中...';
            if (line.includes('Phase 2')) _compilePhase = 'Phase 2/2: 关系推理中...';
            if (line.includes('complete') || line.includes('Graph saved')) _compilePhase = '完成';
          }
        }
        updateJob(job.id, { progress: _compilePhase });
      });

      child.stderr.on('data', (data: Buffer) => {
        const line = '[err] ' + data.toString().trim();
        _compileLog.push(line);
        if (_compileLog.length > 100) _compileLog = _compileLog.slice(-100);
        appendJobLog(job.id, [line]);
      });

      child.on('error', (error) => {
        _compileLog.push(`[err] ${error.message}`);
        _compileExitCode = 1;
        _compilePhase = 'failed';
        _compileProcess = null;
        activeChild = null;
        clearJobCanceller(job.id);
        mergeRuntimeStatus({ state: 'idle', progress: 'failed' });
        updateJob(job.id, { state: 'failed', progress: 'failed', exitCode: 1, error: error.message });
      });

      const compileTimer = setTimeout(() => {
        if (child.exitCode === null) {
          _compileTimedOut = true;
          _compilePhase = 'timeout';
          child.kill();
        }
      }, COMPILE_TIMEOUT_MS);

      child.on('close', (code, signal) => {
        clearTimeout(compileTimer);
        const exitCode = code ?? (_compileTimedOut ? 124 : signal ? 1 : null);
        if (!_compileTimedOut && exitCode === 0 && onSuccess) {
          onSuccess();
          return;
        }
        if (!_compileTimedOut && exitCode === 0 && kind === 'compile') {
          try {
            onReload();
          } catch (error) {
            _compileLog.push(`[err] reload failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        _compileExitCode = exitCode;
        _compilePhase = _compileTimedOut ? 'timeout' : exitCode === 0 ? 'completed' : 'failed';
        _compileProcess = null;
        activeChild = null;
        clearJobCanceller(job.id);
        mergeRuntimeStatus({
          state: 'idle',
          progress: _compilePhase,
          ...(kind === 'compile' && exitCode === 0 ? { lastCompileAt: Date.now() } : {}),
        });
        updateJob(job.id, {
          state: exitCode === 0 ? 'succeeded' : 'failed',
          progress: _compilePhase,
          exitCode,
          error: exitCode === 0 ? undefined : _compileTimedOut ? 'compile timed out' : `compile exited with code ${exitCode}`,
        });
      });
    };

    if (options.scanFirst) {
      startTask(['scan'], 'scan', () => startTask(compileArgs, 'compile'));
    } else {
      startTask(compileArgs, 'compile');
    }

    return { status: 200, body: { ok: true, jobId: job.id, phase: _compilePhase, mode: options.withRelations ? 'relations' : 'fast' } };
  } catch (err) {
    return { status: 500, body: { ok: false, error: err instanceof Error ? err.message : 'Failed to start compile' } };
  }
}

function handleCompileStart(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  onReload: () => void,
): void {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const result = startCompileJob(onReload, {
    scanFirst: explicitFlag(url, 'scan'),
    withRelations: explicitFlag(url, 'relations', 'withRelations'),
    forceRelations: explicitFlag(url, 'forceRelations'),
  });
  json(res, result.status, result.body);
}

function handleCompileStatus(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
): void {
  const running = _compileProcess !== null && _compileProcess.exitCode === null;
  const job = _compileJobId ? getJob(_compileJobId) : listJobs({ limit: 1 }).find(item => item.kind === 'compile') ?? null;
  json(res, 200, {
    jobId: job?.id ?? null,
    state: job?.state ?? (running ? 'running' : 'idle'),
    running,
    phase: job?.progress ?? (_compilePhase || (running ? 'running' : 'idle')),
    recentLog: (job?.recentLog ?? _compileLog).slice(-20),
    exitCode: running ? null : job?.exitCode ?? _compileExitCode,
  });
}

// ─── Diagnostics /api/diagnostics ────────────────────────────────────────────

function handleDiagnostics(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  graph: Graph,
  config: UserConfig,
  routeEventsPath?: string,
): void {
  // Hook runtime stats
  const runtime = getHookRuntimeSnapshot({ config });
  const runtimeStats = getHookRuntimeStats(runtime);

  const recentEvents = readRecentRouteEvents({ limit: 10, path: routeEventsPath });

  // Recent matches from last-match.json
  const lastMatchPath = join(LAZYBRAIN_DIR, 'last-match.json');
  let recentMatches: Record<string, unknown> | null = null;
  if (existsSync(lastMatchPath)) {
    try {
      recentMatches = JSON.parse(readFileSync(lastMatchPath, 'utf-8')) as Record<string, unknown>;
    } catch {}
  }

  // Graph metadata from graph.json
  let lastCompiled: string | null = null;
  if (existsSync(GRAPH_PATH)) {
    try {
      const raw = JSON.parse(readFileSync(GRAPH_PATH, 'utf-8')) as { compiledAt?: string };
      lastCompiled = raw.compiledAt ?? null;
    } catch {}
  }

  // Embedding status
  const embedding = getEmbeddingCacheStatus(graph.getAllNodes());

  json(res, 200, {
    hook: {
      activeRuns: runtime.activeRuns.length,
      hungRuns: runtime.hungRuns.length,
      breakerOpen: runtimeStats.breakerOpen,
      p95DurationMs: runtimeStats.p95DurationMs,
    },
    recentEvents,
    recentMatches,
    graphStatus: {
      nodes: graph.getAllNodes().length,
      lastCompiled,
    },
    gitNexus: getGitNexusStatus(),
    embeddingStatus: embedding.state,
  });
}

// ─── Router Factory ──────────────────────────────────────────────────────────

export interface RouterOptions {
  getGraph: () => Graph;
  config: UserConfig;
  version: string;
  onReload: () => void;
  routeEventsPath?: string;
}


// ─── Embedding Discovery /api/embedding/discover ───────────────────────────────

async function handleEmbeddingDiscover(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const { request } = await import('node:http');
  
  const candidates = [
    { label: 'Ollama', url: 'http://127.0.0.1:11434/api/embeddings', model: 'nomic-embed-text' },
    { label: 'Ollama (bge-m3)', url: 'http://127.0.0.1:11434/api/embeddings', model: 'bge-m3' },
    { label: 'LM Studio', url: 'http://127.0.0.1:1234/v1/embeddings', model: '' },
    { label: 'LocalAI', url: 'http://127.0.0.1:8080/v1/embeddings', model: '' },
    { label: 'text-embeddings-inference', url: 'http://127.0.0.1:3000/embed', model: '' },
  ];

  const results: Array<{ label: string; url: string; model: string; reachable: boolean; error?: string }> = [];
  
  const probes = candidates.map(async (c) => {
    try {
      await new Promise<void>((resolve) => {
        const req = request(c.url, { method: 'GET', timeout: 2000 }, (resp) => {
          results.push({ ...c, reachable: resp.statusCode !== undefined && resp.statusCode < 500 });
          resp.resume(); resolve();
        });
        req.on('error', (err: Error) => { results.push({ ...c, reachable: false, error: err.message }); resolve(); });
        req.end();
      });
    } catch { results.push({ ...c, reachable: false, error: 'timeout' }); }
  });
  await Promise.all(probes);
  
  json(res, 200, { services: results });
}


export function createRouter(opts: RouterOptions): http.RequestListener {
  return async (req, res) => {
    const ip = req.socket.remoteAddress ?? '127.0.0.1';
    if (isRateLimited(ip)) {
      return err(res, 429, 'Rate limit exceeded');
    }

    const method = req.method ?? 'GET';
    const rawUrl = req.url ?? '/';
    const pathname = rawUrl.split('?')[0];
    const graph = opts.getGraph();

    if (method === 'GET' && (pathname === '/' || pathname === '/ui')) {
      return handleUiPage(req, res);
    }
    // POST /match
    if (method === 'POST' && (pathname === '/match' || pathname === '/api/match')) {
      return handleMatch(req, res, graph, opts.config);
    }
    if (method === 'POST' && (pathname === '/route' || pathname === '/api/route')) {
      return handleRoute(req, res, graph, opts.config, opts.routeEventsPath);
    }
    if (method === 'GET' && (pathname === '/route-events' || pathname === '/api/route-events')) {
      return handleRouteEvents(req, res, opts.routeEventsPath);
    }
    // POST /team
    if (method === 'POST' && (pathname === '/team' || pathname === '/api/team')) {
      return handleTeam(req, res, graph);
    }
    // GET /stats
    if (method === 'GET' && (pathname === '/stats' || pathname === '/api/stats')) {
      return handleStats(req, res, graph);
    }
    // GET /graph
    if (method === 'GET' && (pathname === '/graph' || pathname === '/api/graph')) {
      return handleGraphView(req, res, graph);
    }
    // GET /dups
    if (method === 'GET' && pathname === '/dups') {
      return handleDups(req, res, graph);
    }
    // GET /capability/:id
    const capMatch = pathname.match(/^\/capability\/(.+)$/);
    if (method === 'GET' && capMatch) {
      return handleCapability(req, res, graph, decodeURIComponent(capMatch[1]));
    }
    // GET /search?q=xxx
    if (method === 'GET' && (pathname === '/search' || pathname === '/api/search')) {
      return handleSearch(req, res, graph);
    }
    // GET /health
    if (method === 'GET' && (pathname === '/health' || pathname === '/api/health')) {
      return handleHealth(req, res, graph, opts.version);
    }
    if (method === 'GET' && pathname === '/api/status') {
      return handleStatus(req, res, graph, opts.config);
    }
    if (method === 'GET' && pathname === '/api/routes') {
      return handleRoutesMetadata(req, res);
    }
    if (method === 'GET' && pathname === '/api/diagnostics') {
      return handleDiagnostics(req, res, graph, opts.config, opts.routeEventsPath);
    }
    if (method === 'POST' && pathname === '/api/compile') {
      return handleCompileStart(req, res, opts.onReload);
    }
    if (method === 'GET' && pathname === '/api/embedding/discover') {
      return handleEmbeddingDiscover(req, res);
    }
    if (method === 'GET' && pathname === '/api/compile/status') {
      return handleCompileStatus(req, res);
    }
    if (method === 'GET' && pathname === '/api/config') {
      return handleGetConfig(req, res, opts.config);
    }
    if (method === 'POST' && pathname === '/api/config') {
      return handleUpdateConfig(req, res, opts.config);
    }
    if (method === 'POST' && pathname === '/api/test') {
      return handleApiTest(req, res, opts.config);
    }
    if (method === 'GET' && pathname === '/api/embeddings/status') {
      return handleEmbeddingStatus(req, res, graph);
    }
    if (method === 'POST' && pathname === '/api/embeddings/rebuild') {
      return handleEmbeddingRebuild(req, res, graph, opts.config);
    }
    if (method === 'GET' && pathname === '/lab') {
      return handleLabPage(req, res);
    }
    if (method === 'GET' && (pathname === '/lab/fixtures' || pathname === '/api/lab/fixtures')) {
      return handleLabFixtures(req, res);
    }
    if (method === 'GET' && (pathname === '/lab/agents' || pathname === '/api/lab/agents')) {
      return handleLabAgents(req, res);
    }
    if (method === 'POST' && (pathname === '/lab/evaluate' || pathname === '/api/lab/evaluate')) {
      return handleLabEvaluate(req, res, graph, opts.config);
    }
    // POST /reload
    if (method === 'POST' && pathname === '/reload') {
      return handleReload(req, res, opts.onReload);
    }
    if (method === 'GET' && pathname === '/report/summary') {
      return handleReportSummary(req, res);
    }
    if (method === 'GET' && pathname === '/report/sessions') {
      return handleReportSessions(req, res);
    }
    const sessionReportMatch = pathname.match(/^\/report\/session\/(.+)$/);
    if (method === 'GET' && sessionReportMatch) {
      return handleReportSession(req, res, decodeURIComponent(sessionReportMatch[1]));
    }

    err(res, 404, `Not found: ${method} ${pathname}`);
  };
}
