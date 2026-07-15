import type { RawCapability } from '../../types.js';
import { inferPlatformFromPath, inferSinglePlatformFromPath } from '../../constants.js';

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

function transport(config: JsonObject): string {
  if (typeof config.url === 'string') return 'streamable HTTP';
  if (typeof config.command === 'string') return 'stdio';
  return 'configured';
}

function capability(filePath: string, name: string, config: JsonObject): RawCapability {
  const kind = transport(config);
  return {
    kind: 'mcp',
    name,
    description: `${name} MCP server (${kind})`,
    origin: `mcp:${name}`,
    provider: name,
    filePath,
    triggers: [name, `${name} MCP`, 'MCP server', kind],
    compatibility: inferPlatformFromPath(filePath),
    platform: inferSinglePlatformFromPath(filePath),
    sideEffects: ['unknown'],
  };
}

function fromJson(filePath: string, content: string): RawCapability[] {
  const root = object(JSON.parse(content));
  if (!root) return [];
  const servers = object(root.mcpServers) ?? object(root.servers);
  if (!servers) return [];
  return Object.entries(servers).flatMap(([name, value]) => {
    const config = object(value);
    return config ? [capability(filePath, name, config)] : [];
  });
}

function fromToml(filePath: string, content: string): RawCapability[] {
  const names = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*\[mcp_servers\.(?:"([^"]+)"|'([^']+)'|([^\]]+))\]\s*$/);
    const name = (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim();
    if (name) names.add(name);
  }
  return [...names].map((name) => capability(filePath, name, {}));
}

export function parseMcpConfig(filePath: string, content: string): RawCapability[] {
  try {
    return filePath.endsWith('.toml') ? fromToml(filePath, content) : fromJson(filePath, content);
  } catch {
    return [];
  }
}
