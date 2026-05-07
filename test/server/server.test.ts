/**
 * LazyBrain — Server Tests
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as http from 'node:http';
import { homedir, tmpdir } from 'node:os';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { buildCompileArgs, createRouter } from '../../src/server/router.js';
import { sanitizeConfigUpdate } from '../../src/config/schema.js';
import { getJob } from '../../src/runtime/jobs.js';
import { Graph } from '../../src/graph/graph.js';
import type { UserConfig } from '../../src/types.js';
import { DEFAULT_CONFIG, STATUS_PATH } from '../../src/constants.js';
import { UI_HTML } from '../../src/ui/html.js';

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
let tempDir: string;

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'lazybrain-server-'));
  graph = makeMockGraph();
  const config: UserConfig = { ...DEFAULT_CONFIG };

  const router = createRouter({
    getGraph: () => graph,
    config,
    version: '0.1.0-test',
    onReload: () => { graph = makeMockGraph(); },
    routeEventsPath: join(tempDir, 'route-events.jsonl'),
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
  rmSync(tempDir, { recursive: true, force: true });
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

async function waitForJobTerminal(jobId: string): Promise<void> {
  for (let i = 0; i < 30; i++) {
    const state = getJob(jobId)?.state;
    if (state && state !== 'queued' && state !== 'running') return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
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

describe('compile job options', () => {
  it('keeps relation inference out of default compile args', () => {
    expect(buildCompileArgs({})).toEqual(['compile']);
    expect(buildCompileArgs({ withRelations: true })).toEqual(['compile', '--with-relations']);
    expect(buildCompileArgs({ withRelations: true, forceRelations: true })).toEqual(['compile', '--with-relations', '--force-relations']);
  });
});

describe('GUI routes', () => {
  it('serves the Workbench UI at / and /ui', async () => {
    for (const path of ['/', '/ui']) {
      const res = await fetch(`${baseUrl}${path}`);
      const text = await res.text();
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/html');
      expect(text).toContain('LazyBrain');
      expect(text).toContain('LazyBrain Workbench');
      expect(text).toContain('/api/route');
      expect(text).toContain('/api/compile/status');
      expect(text).not.toContain('cytoscape');
      expect(text).not.toContain('/api/choices');
      expect(text).not.toContain('/api/jobs');
      expect(text).not.toContain('/api/repairs');
    }
  });

  it('returns stable /api/status schema', async () => {
    const { status, body } = await req('GET', '/api/status');
    expect(status).toBe(200);
    expect(body).toHaveProperty('version');
    expect(body).toHaveProperty('product');
    expect(body.product).toHaveProperty('state');
    expect(body).toHaveProperty('readiness');
    expect(body).toHaveProperty('graph');
    expect(body).toHaveProperty('gitNexus');
    expect(body.gitNexus).toHaveProperty('available');
    expect(body.gitNexus).toHaveProperty('mcpRequired', false);
    expect(body.gitNexus).toHaveProperty('state');
    expect(body.gitNexus).toHaveProperty('artifactWarnings');
    expect(body).toHaveProperty('routing');
    expect(body).toHaveProperty('embedding');
    expect(body).toHaveProperty('unlock');
    expect(body).toHaveProperty('modelHealth');
    expect(body).toHaveProperty('runtimeStatus');
    expect(body).toHaveProperty('hook');
    expect(body).toHaveProperty('agents');
    expect(body).toHaveProperty('server');
    expect(body.config).not.toHaveProperty('compileApiKey');
    expect(JSON.stringify(body.modelHealth)).not.toContain('ApiKey');
    expect(JSON.stringify(body.runtimeStatus)).not.toContain('ApiKey');
  });

  it('reports persisted graph compile errors through /api/status', async () => {
    graph.setCompileInfo('test-model', ['relation_invalid_type:source->target: blocks']);
    try {
      const { status, body } = await req('GET', '/api/status');
      expect(status).toBe(200);
      expect(body.ok).toBe(false);
      expect(body.product.state).toBe('NOT_READY');
      expect(body.product.blockers.join('\n')).toContain('Graph has 1 compile errors');
      expect(body.readiness.blockers.join('\n')).toContain('Graph has 1 compile errors');
    } finally {
      graph.setCompileInfo('test-model', []);
    }
  });

  it('marks stale persisted compile status without keeping readiness blocked', async () => {
    const hadStatus = existsSync(STATUS_PATH);
    const previousStatus = hadStatus ? readFileSync(STATUS_PATH, 'utf-8') : null;
    mkdirSync(dirname(STATUS_PATH), { recursive: true });
    writeFileSync(STATUS_PATH, JSON.stringify({ state: 'compiling', progress: '292/859', updatedAt: Date.now() }), 'utf-8');
    try {
      const { status, body } = await req('GET', '/api/status');
      expect(status).toBe(200);
      expect(body.runtimeStatus.stale).toBe(true);
      expect(body.runtimeStatus.staleReason).toContain('no active compile process');
      expect(body.readiness.blockers.join('\n')).not.toContain('Compile state is still compiling');
    } finally {
      if (previousStatus !== null) {
        writeFileSync(STATUS_PATH, previousStatus, 'utf-8');
      } else {
        unlinkSync(STATUS_PATH);
      }
    }
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

  it('accepts both boolean and string embedding rebuild confirmations and returns jobs', async () => {
    const hadStatus = existsSync(STATUS_PATH);
    const previousStatus = hadStatus ? readFileSync(STATUS_PATH, 'utf-8') : null;
    try {
      const first = await req('POST', '/api/embeddings/rebuild', { confirm: true });
      expect(first.status).toBe(200);
      expect(first.body).toHaveProperty('jobId');

      expect(getJob(first.body.jobId)?.kind).toBe('embedding');
      await waitForJobTerminal(first.body.jobId);

      const second = await req('POST', '/api/embeddings/rebuild', { confirm: 'rebuild' });
      expect(second.status).toBe(200);
      expect(second.body).toHaveProperty('jobId');
      await waitForJobTerminal(second.body.jobId);
    } finally {
      if (previousStatus !== null) {
        writeFileSync(STATUS_PATH, previousStatus, 'utf-8');
      } else if (!hadStatus) {
        unlinkSync(STATUS_PATH);
      }
    }
  });

  it('serves redacted config only', async () => {
    const configRes = await req('GET', '/api/config');
    expect(configRes.status).toBe(200);
    expect(JSON.stringify(configRes.body)).not.toContain('sk-');
  });

  it('runs API tests only when explicitly requested', async () => {
    const { status, body } = await req('POST', '/api/test', { targets: ['compile'] });
    expect(status).toBe(200);
    expect(body).toHaveProperty('results');
    expect(body.results[0].target).toBe('compile');
  });

  it('keeps blank secret config fields as no-ops', () => {
    const result = sanitizeConfigUpdate({
      compileApiKey: '',
      compileApiBase: 'https://api.example.test/v1',
    });
    expect(result.patch).toEqual({ compileApiBase: 'https://api.example.test/v1' });
    expect(result.ignoredKeys).toEqual(['compileApiKey']);
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

describe('POST /api/route', () => {
  it('returns stable RouteSpec schema', async () => {
    const { status, body } = await req('POST', '/api/route', { query: 'review code for regressions', target: 'codex' });
    expect(status).toBe(200);
    expect(body).toHaveProperty('query');
    expect(body).toHaveProperty('schemaVersion', '1.5.0');
    expect(body).toHaveProperty('mode');
    expect(body).toHaveProperty('intent');
    expect(body).toHaveProperty('whyRoute');
    expect(body).toHaveProperty('choices');
    expect(body.choices).toHaveProperty('recommended');
    expect(body.choices.alternatives.some((choice: { kind: string }) => choice.kind === 'model')).toBe(true);
    expect(body).toHaveProperty('skills');
    expect(body).toHaveProperty('tokenStrategy');
    expect(body.tokenStrategy.includeFullSkillBody).toBe(false);
    expect(body).toHaveProperty('executionPlan');
    expect(body).toHaveProperty('contextNeeded');
    expect(body).toHaveProperty('guardrails');
    expect(body).toHaveProperty('verification');
    expect(body).toHaveProperty('doneWhen');
    expect(body).toHaveProperty('adapters');
    expect(body).toHaveProperty('routeEventId');
    expect(body).toHaveProperty('unlockWarnings');
    expect(body.adapters.codex.prompt).toContain('Codex advisory route plan');
    expect(JSON.stringify(body)).not.toContain(homedir());
  });

  it('rejects invalid route target', async () => {
    const { status, body } = await req('POST', '/api/route', { query: 'review code', target: 'bad' });
    expect(status).toBe(400);
    expect(body.error).toContain('Invalid target');
  });

  it('rejects oversized route queries', async () => {
    const { status, body } = await req('POST', '/api/route', { query: 'x'.repeat(2001) });
    expect(status).toBe(413);
    expect(body.error).toContain('too long');
  });
});

describe('GET/POST /api/route-events', () => {
  it('returns privacy-preserving route events', async () => {
    const route = await req('POST', '/api/route', { query: 'review code for regressions', target: 'claude' });
    expect(route.status).toBe(200);
    expect(route.body.routeEventId).toBeTruthy();

    const events = await req('GET', '/api/route-events?limit=5');
    expect(events.status).toBe(200);
    expect(events.body.events[0]).toHaveProperty('queryHash');
    expect(events.body.events[0]).toHaveProperty('recommendedChoice');
    expect(events.body.events[0]).toHaveProperty('topModelChoice');
    expect(events.body.events[0]).not.toHaveProperty('query');
    expect(JSON.stringify(events.body)).not.toContain('review code for regressions');
  });
});

describe('UI HTML', () => {
  it('ships executable inline scripts', () => {
    const scripts = [...UI_HTML.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
      .map(match => match[1])
      .filter(script => script.trim().length > 0);
    expect(scripts.length).toBeGreaterThan(0);

    const mainScript = scripts.sort((a, b) => b.length - a.length)[0];
    expect(mainScript).toContain('async function load');
    expect(() => new Function(mainScript)).not.toThrow();
  });

  it('renders the compact workbench without unfinished provider branding', () => {
    expect(UI_HTML).toContain('LazyBrain Workbench');
    expect(UI_HTML).toContain('status.product');
    expect(UI_HTML).toContain('/api/status');
    expect(UI_HTML).toContain('/api/diagnostics');
    expect(UI_HTML).not.toContain('GitNexus 索引');
  });
});

describe('GET /api/diagnostics privacy', () => {
  it('returns sanitized route events from the configured event store', async () => {
    const routeEventsPath = join(tempDir, 'route-events.jsonl');
    const route = await req('POST', '/api/route', { query: 'private route query should not leak', target: 'claude' });
    expect(route.status).toBe(200);
    expect(readFileSync(routeEventsPath, 'utf-8')).not.toContain('private route query should not leak');
    appendFileSync(routeEventsPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      source: 'api',
      queryHash: 'legacybadqueryhash',
      query: 'legacy raw query should not leak',
      mode: 'route_plan',
      skillIds: [],
      warningKinds: [],
    }) + '\n', 'utf-8');

    const diagnostics = await req('GET', '/api/diagnostics');
    expect(diagnostics.status).toBe(200);
    expect(diagnostics.body).toHaveProperty('gitNexus');
    expect(diagnostics.body.gitNexus).toHaveProperty('mcpRequired', false);
    expect(diagnostics.body.recentEvents[0]).toHaveProperty('queryHash');
    expect(JSON.stringify(diagnostics.body)).not.toContain('private route query should not leak');
    expect(JSON.stringify(diagnostics.body)).not.toContain('legacy raw query should not leak');
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

  it('returns all nodes when no filter or query', async () => {
    const { status, body } = await req('GET', '/search');
    expect(status).toBe(200);
    expect(body.length).toBe(2);
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
