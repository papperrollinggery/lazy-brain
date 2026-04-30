import type { Capability, ChoiceSet, RouteSpec, RouteTarget, UserConfig } from '../types.js';
import type { Graph } from '../graph/graph.js';
import { buildRouteSpec, isRouteTarget } from '../orchestrator/route.js';
import { loadChoicePreferences } from '../orchestrator/choice-preferences.js';
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
type ToolStatus = 'success' | 'warning' | 'error';

interface ToolObservation<T = unknown> {
  status: ToolStatus;
  summary: string;
  next_actions: string[];
  artifacts: string[];
  choices?: ChoiceSet;
  data?: T;
  error?: {
    message: string;
    root_cause_hint: string;
    safe_retry: string;
    stop_condition: string;
  };
}

function errorResponse(id: JsonRpcRequest['id'], code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

function okResponse(id: JsonRpcRequest['id'], result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function paramsObject(params: unknown): Record<string, unknown> {
  return params && typeof params === 'object' ? params as Record<string, unknown> : {};
}

function toolText(data: unknown, isError = false) {
  return {
    ...(isError ? { isError: true } : {}),
    content: [
      { type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) },
    ],
  };
}

function successObservation<T>(
  summary: string,
  data: T,
  nextActions: string[],
  artifacts: string[] = [],
  choices?: ChoiceSet,
): ToolObservation<T> {
  return {
    status: 'success',
    summary,
    next_actions: nextActions,
    artifacts,
    ...(choices ? { choices } : {}),
    data,
  };
}

function errorObservation(
  summary: string,
  message: string,
  rootCauseHint: string,
  safeRetry: string,
  stopCondition: string,
): ToolObservation {
  return {
    status: 'error',
    summary,
    next_actions: [safeRetry, stopCondition],
    artifacts: [],
    error: {
      message,
      root_cause_hint: rootCauseHint,
      safe_retry: safeRetry,
      stop_condition: stopCondition,
    },
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

function routeNextActions(spec: RouteSpec): string[] {
  if (spec.mode === 'no_route_needed') {
    return ['Handle directly; do not load skill bodies unless the task grows.'];
  }
  if (spec.mode === 'needs_clarification') {
    return ['Ask the clarification questions before selecting tools.', 'Call lazybrain.route again after the user clarifies.'];
  }
  return [
    spec.entryCommand ? `Use entry command: ${spec.entryCommand}` : `Use adapters.${spec.target}.prompt as the execution prompt.`,
    'Run the listed verification before marking the task done.',
  ];
}

function routeArtifacts(spec: RouteSpec): string[] {
  return [
    `route:${spec.mode}`,
    `target:${spec.target}`,
    ...(spec.combo ? [`combo:${spec.combo}`] : []),
    ...spec.skills.slice(0, 5).map((skill) => `capability:${skill.id}`),
  ];
}

function invalidQueryObservation(toolName: string, value: unknown): ReturnType<typeof toolText> | null {
  if (typeof value !== 'string' || !value.trim()) {
    return toolText(errorObservation(
      `${toolName} could not run: missing query`,
      'Missing required argument: query',
      'The tool requires a non-empty query string.',
      'Retry with {"query":"<the user task>"} and keep it under the documented length limit.',
      'Stop retrying if there is no concrete user task to route or search.',
    ), true);
  }
  if (value.length > MAX_QUERY_LENGTH) {
    return toolText(errorObservation(
      `${toolName} could not run: query too long`,
      `Query is too long. Limit: ${MAX_QUERY_LENGTH} characters.`,
      'The request exceeds the MCP tool input budget.',
      'Retry with a shorter task summary and put large context in file references.',
      'Stop retrying if reducing the query would remove the task objective.',
    ), true);
  }
  return null;
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
      const invalid = invalidQueryObservation('lazybrain.route', query);
      if (invalid) return invalid;
      const queryText = (query as string).trim();
      const spec = await buildRouteSpec(queryText, {
        graph: ctx.graph,
        config: ctx.config,
        history: loadRecentHistory(50),
        profile: loadProfile() ?? undefined,
        choicePreferences: loadChoicePreferences(),
        target,
      });
      return toolText(successObservation(
        `RouteSpec ${spec.mode} for target ${spec.target}`,
        spec,
        routeNextActions(spec),
        routeArtifacts(spec),
        spec.choices,
      ));
    }
    case 'lazybrain.search': {
      const query = args.query;
      const limit = Math.min(MAX_LIMIT, Math.max(1, Number(args.limit ?? 8)));
      const invalid = invalidQueryObservation('lazybrain.search', query);
      if (invalid) return invalid;
      const queryText = (query as string).trim();
      const results = searchCapabilities(ctx.graph, queryText, Number.isFinite(limit) ? limit : 8);
      return toolText(successObservation(
        `Found ${results.length} capabilities for "${queryText}"`,
        { results },
        results.length > 0
          ? ['Call lazybrain.skill_card for compact metadata on a selected capability.', 'Call lazybrain.route with the full task before execution.']
          : ['Retry with broader task words or a different category.', 'Stop retrying if the capability graph is empty and run lazybrain scan first.'],
        results.map((result) => `capability:${String(result.id)}`),
      ));
    }
    case 'lazybrain.skill_card': {
      const nameArg = args.name;
      if (typeof nameArg !== 'string' || !nameArg.trim()) {
        return toolText(errorObservation(
          'lazybrain.skill_card could not run: missing name',
          'Missing required argument: name',
          'The tool requires a skill or capability name.',
          'Retry with {"name":"<capability name>"} from lazybrain.search or lazybrain.route.',
          'Stop retrying if no candidate capability is available.',
        ), true);
      }
      const cap = findCapability(ctx.graph, nameArg.trim());
      if (!cap) {
        return toolText(errorObservation(
          'lazybrain.skill_card could not find that capability',
          `Capability not found: ${nameArg}`,
          'The requested name does not match a capability id, exact name, or name substring.',
          'Retry with lazybrain.search to discover the canonical capability name.',
          'Stop retrying if search returns no relevant capability.',
        ), true);
      }
      return toolText(successObservation(
        `Capability card for ${cap.name}`,
        { capability: sanitizeCapability(cap) },
        ['Use this metadata to decide whether the capability fits.', 'Call lazybrain.route for workflow, guardrails, and verification before execution.'],
        [`capability:${cap.id}`],
      ));
    }
    case 'lazybrain.combos': {
      const category = typeof args.category === 'string' ? args.category : undefined;
      const combos = listCombos(category);
      return toolText(successObservation(
        `Found ${combos.length} route combos${category ? ` in ${category}` : ''}`,
        { combos },
        ['Call lazybrain.route with a real task to select and adapt a combo.', 'Use combo entryCommand only after confirming the target agent.'],
        combos.map((combo) => `combo:${combo.id}`),
      ));
    }
    default:
      return toolText(errorObservation(
        'Unknown LazyBrain MCP tool',
        `Unknown tool: ${name}`,
        'The MCP client requested a tool name that is not in tools/list.',
        'Retry with one of lazybrain.route, lazybrain.search, lazybrain.skill_card, or lazybrain.combos.',
        'Stop retrying if tools/list does not include the desired tool.',
      ), true);
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
