import { describe, expect, it } from 'vitest';
import { Graph } from '../../src/graph/graph.js';
import { DEFAULT_CONFIG } from '../../src/constants.js';
import { formatMcpWireResponse, handleMcpRequest } from '../../src/mcp/server.js';
import { MCP_TOOL_DEFINITIONS } from '../../src/mcp/tools.js';
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

function toolPayload(response: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(toolContentText(response)) as Record<string, unknown>;
}

describe('MCP server', () => {
  it('mirrors newline JSON transport for Claude Code health checks', () => {
    const response = formatMcpWireResponse({ jsonrpc: '2.0', id: 1, result: { ok: true } }, false);
    expect(response).toBe('{"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n');
    expect(response).not.toContain('Content-Length');
  });

  it('keeps Content-Length framing for framed MCP clients', () => {
    const response = formatMcpWireResponse({ jsonrpc: '2.0', id: 1, result: { ok: true } }, true);
    expect(response).toMatch(/^Content-Length: \d+\r\n\r\n/);
    expect(response).toContain('{"jsonrpc":"2.0","id":1,"result":{"ok":true}}');
  });

  it('initializes and lists LazyBrain tools', async () => {
    const init = resultOf(await handleMcpRequest({ jsonrpc: '2.0', id: 1, method: 'initialize' }, ctx()));
    expect(JSON.stringify(init)).toContain('lazybrain');

    const list = resultOf(await handleMcpRequest({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, ctx()));
    expect(JSON.stringify(list)).toContain('lazybrain.route');
    expect(JSON.stringify(list)).toContain('Call lazybrain.route before non-trivial coding');
    expect((list.result as { tools: unknown[] }).tools).toEqual(MCP_TOOL_DEFINITIONS.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: {
        type: tool.inputSchema.type,
        properties: { ...tool.inputSchema.properties },
        ...(tool.inputSchema.required ? { required: [...tool.inputSchema.required] } : {}),
      },
    })));
  });

  it('returns RouteSpec through lazybrain.route', async () => {
    const response = resultOf(await handleMcpRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'lazybrain.route', arguments: { query: 'review code for regressions', target: 'codex' } },
    }, ctx()));
    const text = toolContentText(response);
    expect(text).toContain('"schemaVersion": "1.5.0"');
    expect(text).toContain('"target": "codex"');
    expect(text).toContain('"choices"');
    expect(text).not.toContain('/tmp/example-agent');
    const payload = toolPayload(response);
    expect(payload.status).toBe('success');
    expect(payload).toHaveProperty('summary');
    expect(payload).toHaveProperty('next_actions');
    expect(payload).toHaveProperty('artifacts');
    expect(payload).toHaveProperty('choices');
    expect((payload.choices as Record<string, unknown>).recommended).toBeTruthy();
    expect((payload.data as Record<string, unknown>).schemaVersion).toBe('1.5.0');
  });

  it('returns combo entry metadata through lazybrain.route', async () => {
    const response = resultOf(await handleMcpRequest({
      jsonrpc: '2.0',
      id: 31,
      method: 'tools/call',
      params: { name: 'lazybrain.route', arguments: { query: '检查认证权限和密钥泄漏安全风险', target: 'codex' } },
    }, ctx()));
    const text = toolContentText(response);
    expect(text).toContain('"combo": "audit_security"');
    expect(text).toContain('"entryCommand"');
    expect(text).toContain('"executionMode"');
    expect(text).toContain('"modelStrategy"');
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
    const payload = toolPayload(response);
    expect(payload.status).toBe('success');
    expect(payload.artifacts).toEqual(['capability:review']);
  });

  it('rejects oversized route queries', async () => {
    const response = resultOf(await handleMcpRequest({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'lazybrain.route', arguments: { query: 'x'.repeat(2001) } },
    }, ctx()));
    expect((response.result as { isError?: boolean }).isError).toBe(true);
    expect(JSON.stringify(response)).toContain('Query is too long');
    const payload = toolPayload(response);
    expect(payload.status).toBe('error');
    expect(payload).toHaveProperty('next_actions');
    expect(payload).toHaveProperty('error');
    expect(JSON.stringify(payload)).toContain('safe_retry');
  });
});
