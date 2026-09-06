import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { resolve } from 'node:path';
import { consumeMessages, handleRequest } from '../../src/mcp/server.js';
import { getPackageVersion } from '../../src/version.js';

const cwd = process.cwd();
const call = (name: string, args: Record<string, unknown> = {}) =>
  handleRequest({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: { cwd, ...args } } })?.result as any;

beforeAll(() => vi.stubEnv('LAZYBRAIN_SCAN_PATHS', resolve('test/fixtures/metadata-skill')));
afterAll(() => vi.unstubAllEnvs());

describe('MCP discovery contract', () => {
  test('advertises exactly the two distinct read-only lookup tools', () => {
    const response = handleRequest({ jsonrpc: '2.0', id: 0, method: 'tools/list' });
    expect(response?.id).toBe(0);
    const listed = (response?.result as any).tools;
    expect(listed.map((item: any) => item.name)).toEqual(['lazybrain_recommend', 'lazybrain_catalog']);
    expect(listed.every((item: any) => item.annotations.readOnlyHint && item.inputSchema.additionalProperties === false)).toBe(true);
  });

  test('returns source evidence without an unsolicited visualization or workflow', () => {
    const result = call('lazybrain_recommend', { query: 'metadata-skill' });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({
      schemaVersion: 2, action: 'use',
      primary: { name: 'metadata-skill', discovery: 'local-file', callableVerified: false },
      workflow: [], catalog: { callableVerified: false, cwd },
    });
    expect(result.structuredContent.desktopVisualization).toBeUndefined();
    expect(result.structuredContent.primary.filePath).toContain('metadata-skill/SKILL.md');
  });

  test('includes a comparison payload only on request', () => {
    expect(call('lazybrain_recommend', { query: 'metadata-skill', visualize: true })
      .structuredContent.desktopVisualization).toMatchObject({ surface: 'codex-desktop' });
  });

  test('catalog provides page items, identity, state, and a terminal cursor', () => {
    const page = call('lazybrain_catalog', { limit: 1 }).structuredContent;
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ name: 'metadata-skill', status: 'discovered' });
    expect(page.nextOffset).toBeNull();
    expect(call('lazybrain_catalog', { offset: 1 }).structuredContent.items).toEqual([]);
  });

  test('catalog keyword audits include disabled and listed entries that recommendation excludes', () => {
    const normal = resolve('test/fixtures/metadata-skill');
    try {
      vi.stubEnv('LAZYBRAIN_SCAN_PATHS', resolve('test/fixtures/mcp-disabled/.mcp.json'));
      const disabled = call('lazybrain_catalog', { query: 'disabled-server' });
      expect(disabled.structuredContent.items[0]).toMatchObject({ name: 'disabled-server', status: 'disabled' });
      expect(disabled.content[0].text).toContain('disabled');
      expect(call('lazybrain_recommend', { query: 'disabled-server' }).structuredContent.primary).toBeNull();
      vi.stubEnv('LAZYBRAIN_SCAN_PATHS', resolve('test/fixtures/plugins/multi/marketplace.json'));
      const listed = call('lazybrain_catalog', { query: 'catalog-one' });
      expect(listed.structuredContent.items[0]).toMatchObject({ name: 'catalog-one', status: 'listed' });
    } finally { vi.stubEnv('LAZYBRAIN_SCAN_PATHS', normal); }
  });

  test.each([
    { query: '' }, { query: 5 }, { query: 'x', limit: -1 }, { query: 'x', limit: 1.5 },
    { query: 'x', limit: 100 }, { query: 'x', platform: 'invalid' }, { query: 'x', kind: 'invalid' },
    { query: 'x', cwd: 'relative' }, { query: 'x', refresh: 'yes' }, { query: 'x', unknown: true },
  ])('rejects invalid tool arguments without crashing: %j', (args) => {
    expect(call('lazybrain_recommend', args).isError).toBe(true);
  });

  test('uses MCP tool errors for invalid tool names', () => {
    expect(call('missing').isError).toBe(true);
  });

  test('negotiates supported protocol versions and reports the actual package version', () => {
    const initialize = (version: string) => handleRequest({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: version } });
    expect(initialize('2025-06-18')?.result).toMatchObject({
      protocolVersion: '2025-06-18', serverInfo: { name: 'lazybrain', version: getPackageVersion() },
    });
    expect(initialize('unsupported')?.result).toMatchObject({ protocolVersion: '2025-11-25' });
    expect(handleRequest({ jsonrpc: '2.0', id: 3, method: 'ping' })?.result).toEqual({});
  });

  test('ignores notifications and rejects invalid requests', () => {
    expect(handleRequest({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
    expect(handleRequest({ jsonrpc: '2.0', method: 'ping' })).toBeNull();
    for (const input of [null, [], {}, { jsonrpc: '1.0', method: 'ping' }]) {
      expect(handleRequest(input)?.error?.code).toBe(-32600);
    }
    expect(handleRequest({ jsonrpc: '2.0', id: 1, method: 'unknown' })?.error?.code).toBe(-32601);
  });

  test('recovers from malformed JSON and preserves partial messages', () => {
    const first = consumeMessages('not-json\n{"jsonrpc":"2.0","id":1,"method":"ping"}\n{"jsonrpc"');
    expect(first.errors[0]?.error?.code).toBe(-32700);
    expect(first.messages).toHaveLength(1);
    const next = consumeMessages(first.remainder + ':"2.0","id":2,"method":"ping"}\n');
    expect(next.messages).toHaveLength(1);
    expect(next.errors).toEqual([]);
    expect(next.remainder).toBe('');
  });

  test('buffers byte-counted legacy frames with CJK payloads', () => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'lazybrain_recommend', arguments: { query: '中文分镜' } } });
    const frame = 'Content-Length: ' + Buffer.byteLength(body) + '\r\n\r\n' + body;
    const first = consumeMessages(frame.slice(0, 35));
    const second = consumeMessages(first.remainder + frame.slice(35));
    expect(second.messages).toHaveLength(1);
    expect(second.errors).toEqual([]);
  });

  test('bounds unfinished and oversized frames', () => {
    expect(consumeMessages('x'.repeat(1_048_577)).errors[0]?.error?.code).toBe(-32700);
    expect(consumeMessages('Content-Length: 9000000\r\n\r\n').errors[0]?.error?.code).toBe(-32700);
  });
});
