import { stdin, stdout } from 'node:process';
import { existsSync } from 'node:fs';
import { Graph } from '../graph/graph.js';
import { GRAPH_PATH } from '../constants.js';
import { find } from '../matcher/matcher.js';
import { orchestrate } from '../orchestrator/engine.js';
import { signalFromQuery } from '../orchestrator/signals.js';
import { getStats, loadRecent } from '../history/history.js';
import { scan } from '../scanner/scanner.js';
import { formatDecisionMarkdown, recommend } from '../recommendation/recommend.js';
import { formatDesktopVisualizationFallback, toDesktopVisualization } from '../recommendation/desktop-visualization.js';
import { getPackageVersion } from '../version.js';

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

function textContent(text: string, structuredContent?: JsonObject): JsonObject {
  return { content: [{ type: 'text', text }], ...(structuredContent ? { structuredContent } : {}) };
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

function recommendation(query: string): JsonObject {
  const decision = recommend(query, { graph: loadGraph(), history: loadRecent(30), limit: 3 });
  const desktopVisualization = toDesktopVisualization(decision);
  const structured = { ...decision, desktopVisualization } as unknown as JsonObject;
  const text = desktopVisualization.shouldRender
    ? formatDesktopVisualizationFallback(desktopVisualization)
    : formatDecisionMarkdown(decision);
  return textContent(text, structured);
}

function catalog(): JsonObject {
  const graph = loadGraph();
  const capabilities = graph?.getAllNodes() ?? scan().capabilities;
  const byKind = capabilities.reduce<Record<string, number>>((counts, item) => {
    counts[item.kind] = (counts[item.kind] ?? 0) + 1;
    return counts;
  }, {});
  const structured = { total: capabilities.length, byKind };
  const lines = [`Indexed capabilities: ${capabilities.length}`, ...Object.entries(byKind).sort().map(([kind, count]) => `${kind}: ${count}`)];
  return textContent(lines.join('\n'), structured);
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
  const readOnly = { readOnlyHint: true, openWorldHint: false, destructiveHint: false };
  return [
    { name: 'lazybrain_recommend', description: 'Choose the best installed local Skill, Plugin, MCP server, agent, or command for a vague task. Returns a backward-compatible decision plus a Codex desktop @Visualize payload, alternatives, evidence, and an optional execution order. Read-only.', inputSchema: stringSchema, annotations: readOnly },
    { name: 'lazybrain_find', description: 'Search installed local capabilities that match a task. Read-only.', inputSchema: stringSchema, annotations: readOnly },
    { name: 'lazybrain_orchestrate', description: 'Build a read-only execution plan from installed capabilities; this does not run the plan.', inputSchema: stringSchema, annotations: readOnly },
    { name: 'lazybrain_catalog', description: 'Summarize the local capability catalog by type. Read-only.', inputSchema: { type: 'object', properties: {} }, annotations: readOnly },
    { name: 'lazybrain_stats', description: 'Return recent local LazyBrain usage stats. Read-only.', inputSchema: { type: 'object', properties: {} }, annotations: readOnly },
    { name: 'lazybrain_scan', description: 'Read local capability metadata and report what is discoverable without changing files.', inputSchema: { type: 'object', properties: {} }, annotations: readOnly },
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
  if (name === 'lazybrain_recommend') return recommendation(argString(params, 'query'));
  if (name === 'lazybrain_find') return textContent(formatFind(argString(params, 'query')));
  if (name === 'lazybrain_orchestrate') return textContent(formatOrchestration(argString(params, 'query')));
  if (name === 'lazybrain_catalog') return catalog();
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
      ? {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {}, resources: {} },
        serverInfo: { name: 'lazybrain', version: getPackageVersion() },
        instructions: 'Use lazybrain_recommend in the Codex desktop app when a user has a vague task or asks which local Skill, Plugin, MCP server, agent, or command to use. When desktopVisualization.shouldRender is true and @Visualize is exposed because the user selected it in the composer, pass desktopVisualization.visualizePrompt to @Visualize; otherwise use the Markdown tool content and provide the exact prompt for a user-selected @Visualize task. The server only recommends and plans; it never executes the suggested workflow.',
      }
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

export function consumeMessages(input: string): { messages: JsonRpcRequest[]; remainder: string } {
  const messages: JsonRpcRequest[] = [];
  let remainder = input;
  while (remainder.length > 0) {
    const leading = remainder.match(/^\s*/)?.[0] ?? '';
    if (leading) remainder = remainder.slice(leading.length);
    if (!remainder) break;

    if (/^Content-Length:/i.test(remainder)) {
      const separator = remainder.match(/\r?\n\r?\n/);
      if (!separator || separator.index === undefined) break;
      const header = remainder.slice(0, separator.index);
      const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);
      if (!lengthMatch) throw new Error('Missing Content-Length value');
      const bodyStart = separator.index + separator[0].length;
      const bodyBuffer = Buffer.from(remainder.slice(bodyStart), 'utf8');
      const length = Number(lengthMatch[1]);
      if (bodyBuffer.length < length) break;
      messages.push(JSON.parse(bodyBuffer.subarray(0, length).toString('utf8')) as JsonRpcRequest);
      remainder = bodyBuffer.subarray(length).toString('utf8');
      continue;
    }

    const newline = remainder.indexOf('\n');
    if (newline === -1) break;
    const line = remainder.slice(0, newline).trim();
    remainder = remainder.slice(newline + 1);
    if (line) messages.push(JSON.parse(line) as JsonRpcRequest);
  }
  return { messages, remainder };
}

export function startServer(): void {
  stdin.setEncoding('utf8');
  let buffer = '';
  stdin.on('data', (chunk) => {
    buffer += chunk;
    const consumed = consumeMessages(buffer);
    buffer = consumed.remainder;
    for (const request of consumed.messages) {
      const response = handleRequest(request);
      if (response) stdout.write(`${JSON.stringify(response)}\n`);
    }
  });
  stdin.on('end', () => {
    if (!buffer.trim()) return;
    const consumed = consumeMessages(`${buffer}\n`);
    for (const request of consumed.messages) {
      const response = handleRequest(request);
      if (response) stdout.write(`${JSON.stringify(response)}\n`);
    }
  });
}
