/**
 * LazyBrain — Server Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'node:http';
import { homedir } from 'node:os';
import { createRouter } from '../../src/server/router.js';
import { Graph } from '../../src/graph/graph.js';
import type { UserConfig } from '../../src/types.js';
import { DEFAULT_CONFIG } from '../../src/constants.js';

// ─── Mock Graph ───────────────────────────────────────────────────────────────

function makeMockGraph(): Graph {
  const g = new Graph();
  g.addNode({
    id: 'cap-1',
    kind: 'skill',
    name: 'python-patterns',
    description: 'Python coding patterns and best practices',
    origin: 'test',
    status: 'installed',
    compatibility: ['claude-code'],
    tags: ['python', 'patterns', 'coding'],
    exampleQueries: ['how to write python code', 'python best practices'],
    category: 'development',
  });
  g.addNode({
    id: 'cap-2',
    kind: 'agent',
    name: 'code-reviewer',
    description: 'Reviews code for quality and security',
    origin: 'test',
    status: 'installed',
    compatibility: ['claude-code'],
    tags: ['review', 'quality', 'security'],
    exampleQueries: ['review my code', 'check code quality'],
    category: 'code-quality',
  });
  return g;
}

// ─── Test Server Setup ────────────────────────────────────────────────────────

let server: http.Server;
let baseUrl: string;
let graph: Graph;

beforeAll(async () => {
  graph = makeMockGraph();
  const config: UserConfig = { ...DEFAULT_CONFIG };

  const router = createRouter({
    getGraph: () => graph,
    config,
    version: '0.1.0-test',
    onReload: () => { graph = makeMockGraph(); },
  });

  server = http.createServer(router);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close(err => (err ? reject(err) : resolve())),
  );
});

// ─── Helper ───────────────────────────────────────────────────────────────────

async function req(method: string, path: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  return { status: res.status, body: json };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns ok with version and graphSize', async () => {
    const { status, body } = await req('GET', '/health');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.version).toBe('0.1.0-test');
    expect(body.graphSize).toBe(2);
  });

  it('keeps /api/health compatible', async () => {
    const { status, body } = await req('GET', '/api/health');
    expect(status).toBe(200);
    expect(body.version).toBe('0.1.0-test');
  });
});

describe('GUI routes', () => {
  it('serves the Overview UI at / and /ui', async () => {
    for (const path of ['/', '/ui']) {
      const res = await fetch(`${baseUrl}${path}`);
      const text = await res.text();
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      expect(text).toContain('LazyBrain');
      expect(text).toContain('Try Router');
    }
  });

  it('returns stable /api/status schema', async () => {
    const { status, body } = await req('GET', '/api/status');
    expect(status).toBe(200);
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('readiness');
    expect(body).toHaveProperty('graph');
    expect(body).toHaveProperty('routing');
    expect(body).toHaveProperty('embedding');
    expect(body).toHaveProperty('hook');
    expect(body).toHaveProperty('agents');
    expect(body).toHaveProperty('server');
    expect(body.config).not.toHaveProperty('compileApiKey');
  });

  it('reports embedding status through the GUI API', async () => {
    const { status, body } = await req('GET', '/api/embeddings/status');
    expect(status).toBe(200);
    expect(body).toHaveProperty('state');
    expect(body).toHaveProperty('coverage');
  });

  it('requires explicit confirmation for GUI embedding rebuild', async () => {
    const { status, body } = await req('POST', '/api/embeddings/rebuild', {});
    expect(status).toBe(400);
    expect(body.error).toContain('confirm');
  });

  it('runs API tests only when explicitly requested', async () => {
    const { status, body } = await req('POST', '/api/test', { targets: ['compile'] });
    expect(status).toBe(200);
    expect(body).toHaveProperty('results');
    expect(body.results[0].target).toBe('compile');
  });
});

describe('Lab routes', () => {
  it('serves the Lab HTML page', async () => {
    const res = await fetch(`${baseUrl}/lab`);
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(text).toContain('LazyBrain Lab');
  });

  it('returns built-in Lab fixtures', async () => {
    const { status, body } = await req('GET', '/lab/fixtures');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]).toHaveProperty('query');
  });

  it('returns sanitized agent inventory metadata', async () => {
    const { status, body } = await req('GET', '/lab/agents');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(JSON.stringify(body)).not.toContain(homedir());
    expect(JSON.stringify(body)).not.toContain('PRIVATE BODY SHOULD NOT LEAK');
  });

  it('evaluates Lab queries with stable schema', async () => {
    const { status, body } = await req('POST', '/lab/evaluate', { queries: ['审查这次改动有没有回归风险'] });
    expect(status).toBe(200);
    expect(Array.isArray(body.evaluations)).toBe(true);
    expect(body.evaluations[0]).toHaveProperty('match');
    expect(body.evaluations[0]).toHaveProperty('team');
    expect(body.evaluations[0]).toHaveProperty('modeDecision');
    expect(body.evaluations[0]).toHaveProperty('agentMappings');
    expect(body.evaluations[0]).toHaveProperty('hookReadiness');
    expect(body.evaluations[0].hookReadiness.safeForLab).toBe(true);
  });
});

describe('POST /match', () => {
  it('returns recommendation for valid query', async () => {
    const { status, body } = await req('POST', '/match', { query: 'python code review' });
    expect(status).toBe(200);
    expect(body).toHaveProperty('matches');
    expect(Array.isArray(body.matches)).toBe(true);
  });

  it('returns 400 for missing query', async () => {
    const { status, body } = await req('POST', '/match', {});
    expect(status).toBe(400);
    expect(body.error).toBeTruthy();
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await fetch(`${baseUrl}/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    });
    expect(res.status).toBe(400);
  });
});

describe('API aliases', () => {
  it('keeps /api/match and /api/team compatible', async () => {
    const matchRes = await req('POST', '/api/match', { query: 'python code review' });
    const teamRes = await req('POST', '/api/team', { query: 'build a web app' });
    expect(matchRes.status).toBe(200);
    expect(Array.isArray(matchRes.body.matches)).toBe(true);
    expect(teamRes.status).toBe(200);
    expect(Array.isArray(teamRes.body.members)).toBe(true);
  });
});

describe('POST /team', () => {
  it('returns team composition for valid query', async () => {
    const { status, body } = await req('POST', '/team', { query: 'build a web app' });
    expect(status).toBe(200);
    expect(body).toHaveProperty('members');
    expect(Array.isArray(body.members)).toBe(true);
  });

  it('returns 400 for missing query', async () => {
    const { status } = await req('POST', '/team', {});
    expect(status).toBe(400);
  });
});

describe('GET /stats', () => {
  it('returns graph statistics', async () => {
    const { status, body } = await req('GET', '/stats');
    expect(status).toBe(200);
    expect(body.total).toBe(2);
    expect(body.byKind).toHaveProperty('skill');
    expect(body.byKind).toHaveProperty('agent');
  });
});

describe('GET /graph', () => {
  it('returns graph view JSON', async () => {
    const { status, body } = await req('GET', '/graph?limit=10');
    expect(status).toBe(200);
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(Array.isArray(body.edges)).toBe(true);
    expect(body.nodes.length).toBe(2);
  });

  it('returns graph view Mermaid text', async () => {
    const res = await fetch(`${baseUrl}/graph?format=mermaid&limit=10`);
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).toContain('graph LR');
    expect(body).toContain('python-patterns');
  });

  it('supports graph filters via query params', async () => {
    const { status, body } = await req('GET', '/graph?kind=agent&origin=test&limit=10');
    expect(status).toBe(200);
    expect(body.nodes).toHaveLength(1);
    expect(body.nodes[0].name).toBe('code-reviewer');
  });
});

describe('GET /dups', () => {
  it('returns array of duplicate pairs', async () => {
    const { status, body } = await req('GET', '/dups');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });
});

describe('GET /search', () => {
  it('returns matching capabilities for query', async () => {
    const { status, body } = await req('GET', '/search?q=python');
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0].name).toBe('python-patterns');
  });

  it('returns empty array for empty query', async () => {
    const { status, body } = await req('GET', '/search');
    expect(status).toBe(200);
    expect(body).toEqual([]);
  });
});

describe('GET /api/search', () => {
  it('keeps search API alias compatible', async () => {
    const { status, body } = await req('GET', '/api/search?q=python');
    expect(status).toBe(200);
    expect(body[0].name).toBe('python-patterns');
    expect(body[0]).toHaveProperty('embeddingCovered');
  });

  it('supports Skill DB filters', async () => {
    const { status, body } = await req('GET', '/api/search?kind=agent&category=code-quality');
    expect(status).toBe(200);
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe('code-reviewer');
  });
});

describe('GET /capability/:id', () => {
  it('returns wiki card for existing capability', async () => {
    const { status, body } = await req('GET', '/capability/cap-1');
    expect(status).toBe(200);
    expect(body).toHaveProperty('name');
  });

  it('returns 404 for unknown capability', async () => {
    const { status, body } = await req('GET', '/capability/nonexistent');
    expect(status).toBe(404);
    expect(body.error).toBeTruthy();
  });
});

describe('POST /reload', () => {
  it('reloads graph and returns ok', async () => {
    const { status, body } = await req('POST', '/reload');
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
  });
});

describe('404 for unknown routes', () => {
  it('returns 404 for unknown path', async () => {
    const { status } = await req('GET', '/unknown-route');
    expect(status).toBe(404);
  });
});
