import { describe, expect, test } from 'vitest';
import { handleRequest } from '../../src/mcp/server.js';

describe('mcp server', () => {
  test('lists tools', () => {
    const response = handleRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
    expect(response?.result).toMatchObject({
      tools: expect.arrayContaining([
        expect.objectContaining({ name: 'lazybrain_find' }),
        expect.objectContaining({ name: 'lazybrain_orchestrate' }),
      ]),
    });
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
});
