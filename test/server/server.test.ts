/**
 * LazyBrain — Server Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'node:http';
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
