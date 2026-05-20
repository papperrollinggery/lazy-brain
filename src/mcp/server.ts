import { stdin, stdout } from 'node:process';
import { existsSync } from 'node:fs';
import { Graph } from '../graph/graph.js';
import { GRAPH_PATH } from '../constants.js';
import { find } from '../matcher/matcher.js';
import { orchestrate } from '../orchestrator/engine.js';
import { signalFromQuery } from '../orchestrator/signals.js';
import { getStats, loadRecent } from '../history/history.js';
import { scan } from '../scanner/scanner.js';

type JsonObject = Record<string, unknown>;

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method: string;
  params?: JsonObject;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

function textContent(text: string): JsonObject {
  return { content: [{ type: 'text', text }] };
}

function argString(params: JsonObject | undefined, key: string): string {
  const args = params?.arguments;
  const source = args && typeof args === 'object' ? args as JsonObject : params;
  const value = source?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

function loadGraph(): Graph | undefined {
  return existsSync(GRAPH_PATH) ? Graph.load(GRAPH_PATH) : undefined;
}

function formatFind(query: string): string {
  const results = find(query, { graph: loadGraph(), limit: 5, threshold: 0.3, history: loadRecent(30) });
  if (!results.length) return 'No match found.';
  return results.map((item, index) => `${index + 1}. /${item.skill} ${Math.round(item.score * 100)}% - ${item.reason}`).join('\n');
}

function formatOrchestration(query: string): string {
  const plan = orchestrate(signalFromQuery(query));
  if (!plan) return formatFind(query);
  const steps = plan.enhancements.map((item) => `${item.priority}. /${item.name} - ${item.reason}`).join('\n');
  return `Plan ${Math.round(plan.confidence * 100)}% (${plan.sequence})\n${plan.reason}\n${steps}`;
}

function formatStats(): string {
  const stats = getStats();
  const top = stats.bySkill.slice(0, 8).map((item) => `/${item.skill}: ${item.count}`).join('\n');
  return [
    `Total queries: ${stats.total}`,
    `Accepted: ${stats.accepted}`,
    `Ignored: ${stats.ignored}`,
    top ? `Top skills:\n${top}` : 'Top skills: none',
  ].join('\n');
}

function formatGraphStats(): string {
  const graph = loadGraph();
  if (!graph) return 'Graph not compiled yet. Run lazybrain scan or lazybrain compile first.';
  return `Nodes: ${graph.getNodeCount()}\nLinks: ${graph.getAllLinks().length}`;
}

function formatHistory(): string {
  const recent = loadRecent(30).slice(-20);
  if (!recent.length) return 'No recent history.';
  return recent.map((entry) => `${entry.timestamp} ${entry.query} -> ${entry.used ?? entry.recommended}`).join('\n');
}

function tools(): JsonObject[] {
  const stringSchema = { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] };
  return [
    { name: 'lazybrain_find', description: 'Find matching LazyBrain skills for a task.', inputSchema: stringSchema },
    { name: 'lazybrain_orchestrate', description: 'Build an orchestration plan for a task.', inputSchema: stringSchema },
    { name: 'lazybrain_stats', description: 'Return recent LazyBrain usage stats.', inputSchema: { type: 'object', properties: {} } },
    { name: 'lazybrain_scan', description: 'Scan local capability sources.', inputSchema: { type: 'object', properties: {} } },
  ];
}

function resources(): JsonObject[] {
  return [
    { uri: 'lazybrain://graph/stats', name: 'LazyBrain graph stats', mimeType: 'text/plain' },
    { uri: 'lazybrain://history/recent', name: 'LazyBrain recent history', mimeType: 'text/plain' },
  ];
}

function toolCall(params: JsonObject | undefined): JsonObject {
  const name = typeof params?.name === 'string' ? params.name : '';
  if (name === 'lazybrain_find') return textContent(formatFind(argString(params, 'query')));
  if (name === 'lazybrain_orchestrate') return textContent(formatOrchestration(argString(params, 'query')));
  if (name === 'lazybrain_stats') return textContent(formatStats());
  if (name === 'lazybrain_scan') {
    const result = scan();
    return textContent(`Scanned ${result.scannedPaths} paths. Found ${result.capabilities.length} capabilities.`);
  }
  throw new Error(`Unknown tool: ${name}`);
}

function resourceRead(params: JsonObject | undefined): JsonObject {
  const uri = typeof params?.uri === 'string' ? params.uri : '';
  const text = uri === 'lazybrain://graph/stats'
    ? formatGraphStats()
    : uri === 'lazybrain://history/recent'
      ? formatHistory()
      : undefined;
  if (text === undefined) throw new Error(`Unknown resource: ${uri}`);
  return { contents: [{ uri, mimeType: 'text/plain', text }] };
}

export function handleRequest(request: JsonRpcRequest): JsonRpcResponse | null {
  if (!request.id && request.method.startsWith('notifications/')) return null;
  try {
    const result = request.method === 'initialize'
      ? { protocolVersion: '2024-11-05', capabilities: { tools: {}, resources: {} }, serverInfo: { name: 'lazybrain', version: '1.0.0' } }
      : request.method === 'tools/list'
        ? { tools: tools() }
        : request.method === 'tools/call'
          ? toolCall(request.params)
          : request.method === 'resources/list'
            ? { resources: resources() }
            : request.method === 'resources/read'
              ? resourceRead(request.params)
              : undefined;
    if (result === undefined) throw new Error(`Unknown method: ${request.method}`);
    return { jsonrpc: '2.0', id: request.id ?? null, result };
  } catch (error) {
    return { jsonrpc: '2.0', id: request.id ?? null, error: { code: -32000, message: error instanceof Error ? error.message : String(error) } };
  }
}

function readMessages(input: string): JsonRpcRequest[] {
  const messages: JsonRpcRequest[] = [];
  const trimmed = input.trim();
  if (!trimmed) return messages;
  if (trimmed.includes('Content-Length:')) {
    for (const part of trimmed.split(/\r?\n\r?\n/).slice(1)) messages.push(JSON.parse(part.trim()) as JsonRpcRequest);
    return messages;
  }
  for (const line of trimmed.split(/\r?\n/)) messages.push(JSON.parse(line) as JsonRpcRequest);
  return messages;
}

export function startServer(): void {
  stdin.setEncoding('utf8');
  let buffer = '';
  stdin.on('data', (chunk) => {
    buffer += chunk;
    for (const request of readMessages(buffer)) {
      const response = handleRequest(request);
      if (response) stdout.write(`${JSON.stringify(response)}\n`);
    }
    buffer = '';
  });
}
