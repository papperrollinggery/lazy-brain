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
    disabled: config.enabled === false || config.disabled === true,
    discovery: 'configured',
  };
}

function fromJson(filePath: string, content: string): RawCapability[] {
  const root = object(JSON.parse(content));
  if (!root) return [];
  const wrapped = object(root.mcpServers) ?? object(root.mcp_servers) ?? object(root.servers);
  const servers = wrapped ?? root;
  return Object.entries(servers).flatMap(([name, value]) => {
    const config = object(value);
    if (!wrapped && typeof config?.command !== 'string' && typeof config?.url !== 'string') return [];
    return config ? [capability(filePath, name, config)] : [];
  });
}

function fromToml(filePath: string, content: string): RawCapability[] {
  const servers = new Map<string, JsonObject>();
  let current: JsonObject | undefined;
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*\[mcp_servers\.(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+))\]\s*(?:#.*)?$/);
    const name = (match?.[1] ?? match?.[2] ?? match?.[3] ?? '').trim();
    if (name) {
      current = {};
      servers.set(name, current);
      continue;
    }
    if (/^\s*\[/.test(line)) {
      current = undefined;
      continue;
    }
    if (!current) continue;
    const enabled = line.match(/^\s*enabled\s*=\s*(true|false)\s*(?:#.*)?$/i);
    if (enabled) current.enabled = enabled[1].toLowerCase() === 'true';
  }
  return [...servers.entries()].map(([name, config]) => capability(filePath, name, config));
}

export function parseMcpConfig(filePath: string, content: string): RawCapability[] {
  try {
    return filePath.endsWith('.toml') ? fromToml(filePath, content) : fromJson(filePath, content);
  } catch {
    return [];
  }
}
