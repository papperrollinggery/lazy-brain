import { describe, expect, test } from 'vitest';
import { consumeMessages, handleRequest } from '../../src/mcp/server.js';

describe('mcp server', () => {
  test('lists tools', () => {
    const response = handleRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(response?.result).toMatchObject({
      tools: expect.arrayContaining([
        expect.objectContaining({ name: 'lazybrain_find' }),
        expect.objectContaining({ name: 'lazybrain_orchestrate' }),
        expect.objectContaining({ name: 'lazybrain_recommend', annotations: expect.objectContaining({ readOnlyHint: true }) }),
      ]),
    });
  });

  test('returns a structured recommendation decision', () => {
    const response = handleRequest({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'lazybrain_recommend', arguments: { query: 'review this PR for security issues' } },
    });
    expect(response?.result).toMatchObject({
      structuredContent: {
        schemaVersion: 1,
        action: 'use',
        primary: expect.objectContaining({ name: 'security-review' }),
        desktopVisualization: expect.objectContaining({
          surface: 'codex-desktop',
          renderer: expect.objectContaining({ preferredPlugin: '@Visualize' }),
          shouldRender: true,
        }),
      },
    });
  });

  test('reports the package version during initialization', () => {
    const response = handleRequest({ jsonrpc: '2.0', id: 6, method: 'initialize' });
    expect(response?.result).toMatchObject({ serverInfo: { name: 'lazybrain', version: '2.1.0' } });
    expect(JSON.stringify(response?.result)).toContain('Codex desktop app');
  });

  test('calls find tool', () => {
    const response = handleRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'lazybrain_find', arguments: { query: 'review this PR for security issues' } },
    });
    expect(JSON.stringify(response?.result)).toContain('security-review');
  });

  test('reads resources with no compiled graph', () => {
    const response = handleRequest({
      jsonrpc: '2.0',
      id: 3,
      method: 'resources/read',
      params: { uri: 'lazybrain://history/recent' },
    });
    expect(response?.result).toMatchObject({
      contents: [expect.objectContaining({ uri: 'lazybrain://history/recent', mimeType: 'text/plain' })],
    });
  });

  test('returns json-rpc error for unknown tool', () => {
    const response = handleRequest({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'missing' },
    });
    expect(response?.error?.message).toContain('Unknown tool');
  });

  test('keeps incomplete line-delimited messages buffered', () => {
    const first = consumeMessages('{"jsonrpc":"2.0","id":1,"method":"tools/list"');
    expect(first.messages).toEqual([]);
    const second = consumeMessages(`${first.remainder}}\n`);
    expect(second.messages).toHaveLength(1);
    expect(second.remainder).toBe('');
  });

  test('keeps incomplete Content-Length frames buffered', () => {
    const body = '{"jsonrpc":"2.0","id":1,"method":"tools/list"}';
    const frame = `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
    const split = Math.floor(frame.length / 2);
    const first = consumeMessages(frame.slice(0, split));
    expect(first.messages).toEqual([]);
    const second = consumeMessages(first.remainder + frame.slice(split));
    expect(second.messages[0]?.method).toBe('tools/list');
    expect(second.remainder).toBe('');
  });
});
