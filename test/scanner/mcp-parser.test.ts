import { describe, expect, test } from 'vitest';
import { parseMcpConfig } from '../../src/scanner/parsers/mcp-parser.js';

describe('MCP configuration discovery', () => {
  test('does not turn TOML subtables into enabled servers', () => {
    const entries = parseMcpConfig('/fixture/config.toml', [
      '[mcp_servers.demo]', 'enabled = false', '[mcp_servers.demo.env]',
      'NOTE = "fixture only"', '[mcp_servers."with.dot"] # quoted server name',
      'enabled = false', '[mcp_servers."with.dot".http_headers]', 'Custom = "fixture"',
    ].join('\n'));
    expect(entries.map((item) => [item.name, item.disabled])).toEqual([['demo', true], ['with.dot', true]]);
    expect(JSON.stringify(entries)).not.toContain('fixture only');
  });

  test('accepts both Codex JSON wrappers and a direct server map', () => {
    for (const config of [
      { mcpServers: { docs: { command: 'docs' } } },
      { mcp_servers: { docs: { command: 'docs' } } },
      { docs: { command: 'docs' }, metadata: { author: 'fixture' } },
    ]) {
      expect(parseMcpConfig('/fixture/.mcp.json', JSON.stringify(config)).map((item) => item.name)).toEqual(['docs']);
    }
  });
});
