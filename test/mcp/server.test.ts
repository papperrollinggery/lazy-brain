import { describe, expect, it } from 'vitest';
import { Graph } from '../../src/graph/graph.js';
import { DEFAULT_CONFIG } from '../../src/constants.js';
import { handleMcpRequest } from '../../src/mcp/server.js';
import type { Capability } from '../../src/types.js';

function cap(overrides: Partial<Capability> & Pick<Capability, 'id' | 'name'>): Capability {
  return {
    kind: 'skill',
    description: '',
    origin: 'test',
    status: 'installed',
    compatibility: ['claude-code'],
    tags: [],
    exampleQueries: [],
    category: 'other',
    ...overrides,
  };
}

function makeGraph(): Graph {
  const graph = new Graph();
  graph.addNode(cap({
    id: 'review',
    name: 'code-review',
    description: 'Review code for regressions and missing tests.',
    tags: ['review', 'regression', 'test'],
    exampleQueries: ['review code'],
    category: 'code-quality',
    filePath: '/tmp/example-agent/private.md',
  }));
  return graph;
}

const ctx = () => ({ graph: makeGraph(), config: { ...DEFAULT_CONFIG } });

function resultOf(response: unknown): Record<string, unknown> {
  expect(response).toBeTruthy();
  return response as Record<string, unknown>;
}

function toolContentText(response: Record<string, unknown>): string {
  const result = response.result as { content?: Array<{ text?: string }> };
  return result.content?.[0]?.text ?? '';
}

describe('MCP server', () => {
  it('initializes and lists LazyBrain tools', async () => {
    const init = resultOf(await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'initialize' }, ctx()));
    expect(JSON.stringify(init)).toContain('lazybrain');

    const list = resultOf(await handleMcpRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, ctx()));
    expect(JSON.stringify(list)).toContain('lazybrain.route');
    expect(JSON.stringify(list)).toContain('Call lazybrain.route before non-trivial coding');
  });

  it('returns RouteSpec through lazybrain.route', async () => {
    const response = resultOf(await handleMcpRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'lazybrain.route', arguments: { query: 'review code for regressions', target: 'codex' } },
    }, ctx()));
    const text = toolContentText(response);
    expect(text).toContain('"schemaVersion": "1.4.5"');
    expect(text).toContain('"target": "codex"');
    expect(text).not.toContain('/tmp/example-agent');
  });

  it('returns compact skill cards without local file paths', async () => {
    const response = resultOf(await handleMcpRequest({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'lazybrain.skill_card', arguments: { name: 'code-review' } },
    }, ctx()));
    const text = toolContentText(response);
    expect(text).toContain('code-review');
    expect(text).not.toContain('/tmp/example-agent');
    expect(text).not.toContain('filePath');
  });

  it('rejects oversized route queries', async () => {
    const response = resultOf(await handleMcpRequest({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'lazybrain.route', arguments: { query: 'x'.repeat(2001) } },
    }, ctx()));
    expect(JSON.stringify(response)).toContain('Query is too long');
  });
});
