const TOOL_DESCRIPTION_ROUTE =
  'Call lazybrain.route before non-trivial coding, review, debugging, UI, docs, release, hook, testing, or multi-agent tasks. Call it when the request is vague or when routing skills/agents can reduce context. Do not call it for simple factual answers or tiny edits.';

export const MAX_MCP_QUERY_LENGTH = 2000;
export const MAX_MCP_LIMIT = 20;

export type McpInputSchema = {
  readonly type: 'object';
  readonly properties: Record<string, unknown>;
  readonly required?: readonly string[];
};

export interface McpToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: McpInputSchema;
}

export const MCP_TOOL_DEFINITIONS = [
  {
    name: 'lazybrain.route',
    description: TOOL_DESCRIPTION_ROUTE,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', maxLength: MAX_MCP_QUERY_LENGTH },
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
        query: { type: 'string', maxLength: MAX_MCP_QUERY_LENGTH },
        limit: { type: 'number', minimum: 1, maximum: MAX_MCP_LIMIT },
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
] as const satisfies readonly McpToolDefinition[];

export function listMcpToolDefinitions(): McpToolDefinition[] {
  return MCP_TOOL_DEFINITIONS.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: {
      type: tool.inputSchema.type,
      properties: { ...tool.inputSchema.properties },
      ...('required' in tool.inputSchema ? { required: [...tool.inputSchema.required] } : {}),
    },
  }));
}

export function listMcpToolNames(): string[] {
  return MCP_TOOL_DEFINITIONS.map(tool => tool.name);
}
