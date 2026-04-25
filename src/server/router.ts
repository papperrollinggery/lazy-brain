/**
 * LazyBrain — HTTP Router
 *
 * Route dispatch for the local API server.
 * Each route is an independent function; no large switch blocks.
 */

import type * as http from 'node:http';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
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
import { runApiTests, type ApiTestTarget } from '../health/api-test.js';
import { getEmbeddingCacheStatus } from '../embeddings/cache.js';
import { rebuildEmbeddingCache } from '../embeddings/rebuild.js';
import { EMBEDDINGS_INDEX_PATH } from '../constants.js';
import { buildRouteSpec, isRouteTarget } from '../orchestrator/route.js';

// ─── Rate Limiter ────────────────────────────────────────────────────────────

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 100; // per second per IP

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

async function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
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
): Promise<void> {
  let body: { query?: string; target?: RouteTarget };
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return err(res, 400, 'Invalid JSON body');
  }
  if (!body.query || typeof body.query !== 'string') {
    return err(res, 400, 'Missing required field: query');
  }
  if (body.target !== undefined && (typeof body.target !== 'string' || !isRouteTarget(body.target))) {
    return err(res, 400, 'Invalid target. Use generic, claude, codex, or cursor.');
  }
  const result = await buildRouteSpec(body.query, {
    graph,
    config,
    target: body.target ?? 'generic',
  });
  json(res, 200, result);
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
  if (!q && !hasFilter) return json(res, 200, []);

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
  let body: { confirm?: string };
  try {
    body = JSON.parse(await readBody(req)) as { confirm?: string };
  } catch {
    return err(res, 400, 'Invalid JSON body');
  }
  if (body.confirm !== 'rebuild') {
    return err(res, 400, 'Embedding rebuild requires {"confirm":"rebuild"}.');
  }
  const result = await rebuildEmbeddingCache(graph.getAllNodes(), config);
  json(res, result.ok ? 200 : 500, result);
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

// ─── Router Factory ──────────────────────────────────────────────────────────

export interface RouterOptions {
  getGraph: () => Graph;
  config: UserConfig;
  version: string;
  onReload: () => void;
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
      return handleRoute(req, res, graph, opts.config);
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
