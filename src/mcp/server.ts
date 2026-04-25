import type { Capability, RouteTarget, UserConfig } from '../types.js';
import type { Graph } from '../graph/graph.js';
import { buildRouteSpec, isRouteTarget } from '../orchestrator/route.js';
import { listCombos } from '../combos/registry.js';
import { loadRecentHistory } from '../history/history.js';
import { loadProfile } from '../history/profile.js';
import { getPackageVersion } from '../version.js';

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
};

type McpContext = {
  graph: Graph;
  config: UserConfig;
};

const TOOL_DESCRIPTION_ROUTE =
  'Call lazybrain.route before non-trivial coding, review, debugging, UI, docs, release, hook, testing, or multi-agent tasks. Call it when the request is vague or when routing skills/agents can reduce context. Do not call it for simple factual answers or tiny edits.';

const MAX_QUERY_LENGTH = 2000;
const MAX_LIMIT = 20;

function errorResponse(id: JsonRpcRequest['id'], code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

function okResponse(id: JsonRpcRequest['id'], result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function paramsObject(params: unknown): Record<string, unknown> {
  return params && typeof params === 'object' ? params as Record<string, unknown> : {};
}

function toolText(data: unknown) {
  return {
    content: [
      { type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) },
    ],
  };
}

function sanitizeCapability(cap: Capability): Record<string, unknown> {
  return {
    id: cap.id,
    name: cap.name,
    kind: cap.kind,
    category: cap.category,
    origin: cap.origin,
    status: cap.status,
    compatibility: cap.compatibility,
    description: cap.description,
    tags: cap.tags.slice(0, 12),
    exampleQueries: cap.exampleQueries.slice(0, 5),
    scenario: cap.scenario,
  };
}

function findCapability(graph: Graph, name: string): Capability | undefined {
  const lower = name.toLowerCase();
  return graph.getNode(name) ??
    graph.findByName(name) ??
    graph.getAllNodes().find((cap) => cap.name.toLowerCase() === lower) ??
    graph.getAllNodes().find((cap) => cap.name.toLowerCase().includes(lower));
}

function searchCapabilities(graph: Graph, query: string, limit: number): Record<string, unknown>[] {
  const lower = query.toLowerCase();
  return graph.getAllNodes()
    .filter((cap) => cap.name.toLowerCase().includes(lower) ||
      cap.description.toLowerCase().includes(lower) ||
      cap.tags.some((tag) => tag.toLowerCase().includes(lower)) ||
      cap.category.toLowerCase().includes(lower))
    .slice(0, limit)
    .map(sanitizeCapability);
}

function toolsList() {
  return {
    tools: [
      {
        name: 'lazybrain.route',
        description: TOOL_DESCRIPTION_ROUTE,
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', maxLength: MAX_QUERY_LENGTH },
            target: { type: 'string', enum: ['generic', 'claude', 'codex', 'cursor'] },
          },
          required: ['query'],
        },
      },
      {
        name: 'lazybrain.search',
        description: 'Search the LazyBrain capability database without loading full skill bodies.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', maxLength: MAX_QUERY_LENGTH },
            limit: { type: 'number', minimum: 1, maximum: MAX_LIMIT },
          },
          required: ['query'],
        },
      },
      {
        name: 'lazybrain.skill_card',
        description: 'Return compact public metadata for one skill or capability. Does not return the full skill body.',
        inputSchema: {
          type: 'object',
          properties: { name: { type: 'string', maxLength: 200 } },
          required: ['name'],
        },
      },
      {
        name: 'lazybrain.combos',
        description: 'List built-in advisory route combo templates by optional category.',
        inputSchema: {
          type: 'object',
          properties: { category: { type: 'string', maxLength: 100 } },
        },
      },
    ],
  };
}

async function callTool(name: string, args: Record<string, unknown>, ctx: McpContext): Promise<unknown> {
  switch (name) {
    case 'lazybrain.route': {
      const query = args.query;
      const target = typeof args.target === 'string' && isRouteTarget(args.target) ? args.target as RouteTarget : 'generic';
      if (typeof query !== 'string' || !query.trim()) throw new Error('Missing required argument: query');
      if (query.length > MAX_QUERY_LENGTH) throw new Error(`Query is too long. Limit: ${MAX_QUERY_LENGTH} characters.`);
      const spec = await buildRouteSpec(query, {
        graph: ctx.graph,
        config: ctx.config,
        history: loadRecentHistory(50),
        profile: loadProfile() ?? undefined,
        target,
      });
      return toolText(spec);
    }
    case 'lazybrain.search': {
      const query = args.query;
      const limit = Math.min(MAX_LIMIT, Math.max(1, Number(args.limit ?? 8)));
      if (typeof query !== 'string' || !query.trim()) throw new Error('Missing required argument: query');
      if (query.length > MAX_QUERY_LENGTH) throw new Error(`Query is too long. Limit: ${MAX_QUERY_LENGTH} characters.`);
      return toolText({ results: searchCapabilities(ctx.graph, query, Number.isFinite(limit) ? limit : 8) });
    }
    case 'lazybrain.skill_card': {
      const nameArg = args.name;
      if (typeof nameArg !== 'string' || !nameArg.trim()) throw new Error('Missing required argument: name');
      const cap = findCapability(ctx.graph, nameArg.trim());
      if (!cap) throw new Error(`Capability not found: ${nameArg}`);
      return toolText({ capability: sanitizeCapability(cap) });
    }
    case 'lazybrain.combos': {
      const category = typeof args.category === 'string' ? args.category : undefined;
      return toolText({ combos: listCombos(category) });
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export async function handleMcpRequest(request: JsonRpcRequest, ctx: McpContext): Promise<unknown | null> {
  if (!request.id && request.method?.startsWith('notifications/')) return null;

  try {
    switch (request.method) {
      case 'initialize':
        return okResponse(request.id, {
          protocolVersion: '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'lazybrain', version: getPackageVersion() },
        });
      case 'tools/list':
        return okResponse(request.id, toolsList());
      case 'tools/call': {
        const params = paramsObject(request.params);
        const name = params.name;
        if (typeof name !== 'string') return errorResponse(request.id, -32602, 'Missing tool name');
        const args = paramsObject(params.arguments);
        return okResponse(request.id, await callTool(name, args, ctx));
      }
      default:
        return errorResponse(request.id, -32601, `Method not found: ${request.method ?? '(missing)'}`);
    }
  } catch (error) {
    return errorResponse(request.id, -32000, error instanceof Error ? error.message : String(error));
  }
}

function writeFramed(message: unknown): void {
  const payload = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(payload)}\r\n\r\n${payload}`);
}

function extractMessages(buffer: string): { messages: string[]; rest: string } {
  const messages: string[] = [];
  let rest = buffer;

  while (rest.length > 0) {
    if (rest.startsWith('Content-Length:')) {
      const headerEnd = rest.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;
      const header = rest.slice(0, headerEnd);
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        const next = rest.indexOf('\n');
        rest = next === -1 ? '' : rest.slice(next + 1);
        continue;
      }
      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      if (rest.length < bodyStart + length) break;
      messages.push(rest.slice(bodyStart, bodyStart + length));
      rest = rest.slice(bodyStart + length);
      continue;
    }

    const newline = rest.indexOf('\n');
    if (newline === -1) break;
    const line = rest.slice(0, newline).trim();
    rest = rest.slice(newline + 1);
    if (line) messages.push(line);
  }

  return { messages, rest };
}

export function runMcpStdioServer(ctx: McpContext): void {
  let buffer = '';
  process.stdin.setEncoding('utf-8');
  process.stdin.on('data', async (chunk: string) => {
    buffer += chunk;
    const parsed = extractMessages(buffer);
    buffer = parsed.rest;
    for (const message of parsed.messages) {
      try {
        const response = await handleMcpRequest(JSON.parse(message) as JsonRpcRequest, ctx);
        if (response) writeFramed(response);
      } catch {
        writeFramed(errorResponse(null, -32700, 'Parse error'));
      }
    }
  });
}

export function getMcpToolNames(): string[] {
  return toolsList().tools.map((tool) => tool.name);
}
