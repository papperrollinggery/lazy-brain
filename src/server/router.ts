/**
 * LazyBrain — HTTP Router
 *
 * Route dispatch for the local API server.
 * Each route is an independent function; no large switch blocks.
 */

import type * as http from 'node:http';
import type { Graph } from '../graph/graph.js';
import type { UserConfig } from '../types.js';
import { match } from '../matcher/matcher.js';
import { recommendTeam } from '../matcher/team-recommender.js';
import { detectDuplicates } from '../graph/duplicate-detector.js';

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
  if (!q) return json(res, 200, []);
  const lower = q.toLowerCase();
  const results = graph.getAllNodes().filter(n =>
    n.name.toLowerCase().includes(lower) ||
    n.tags.some(t => t.toLowerCase().includes(lower)) ||
    n.description.toLowerCase().includes(lower),
  ).slice(0, 20);
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

async function handleReload(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  onReload: () => void,
): Promise<void> {
  onReload();
  json(res, 200, { ok: true });
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

    // POST /match
    if (method === 'POST' && pathname === '/match') {
      return handleMatch(req, res, graph, opts.config);
    }
    // POST /team
    if (method === 'POST' && pathname === '/team') {
      return handleTeam(req, res, graph);
    }
    // GET /stats
    if (method === 'GET' && pathname === '/stats') {
      return handleStats(req, res, graph);
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
    if (method === 'GET' && pathname === '/search') {
      return handleSearch(req, res, graph);
    }
    // GET /health
    if (method === 'GET' && pathname === '/health') {
      return handleHealth(req, res, graph, opts.version);
    }
    // POST /reload
    if (method === 'POST' && pathname === '/reload') {
      return handleReload(req, res, opts.onReload);
    }

    err(res, 404, `Not found: ${method} ${pathname}`);
  };
}
