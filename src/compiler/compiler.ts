/**
 * LazyBrain — Compiler
 *
 * Orchestrates wiki compilation: takes raw scanned capabilities,
 * enriches them via LLM (tags, relations, categories), and builds the graph.
 *
 * Supports full and incremental compilation.
 */

import { createHash } from 'node:crypto';
import type {
  RawCapability,
  LLMProvider,
} from '../types.js';
import { isLinkType } from '../types.js';
import { CATEGORIES, GRAPH_VERSION } from '../constants.js';
import { Graph } from '../graph/graph.js';

/** Generate deterministic capability ID with optional platform prefix */
export function makeCapabilityId(kind: string, name: string, origin: string, platform?: string): string {
  const prefix = platform && platform !== 'claude-code' ? `${platform}:` : '';
  return createHash('sha256')
    .update(`${prefix}${kind}:${name}:${origin}`)
    .digest('hex')
    .slice(0, 16);
}

// ─── LLM Prompt Templates ────────────────────────────────────────────────

const DEFAULT_SYSTEM_PROMPT = `You are a capability classifier for AI coding agent tools.
Given a tool's name and description, generate structured metadata.
Always respond in valid JSON. No markdown, no explanation, no thinking process.`;

function getSystemPrompt(config?: { compileSystemPrompt?: string }): string {
  return config?.compileSystemPrompt || DEFAULT_SYSTEM_PROMPT;
}

function renderPromptTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\$\{([A-Za-z0-9_.]+)\}|\{([A-Za-z0-9_.]+)\}/g, (match, dollarKey: string | undefined, braceKey: string | undefined) => {
    const key = dollarKey ?? braceKey;
    return key && values[key] !== undefined ? values[key] : match;
  });
}

function makeTagPrompt(cap: RawCapability, config?: { compileTagPrompt?: string }): string {
  if (config?.compileTagPrompt?.trim()) {
    return renderPromptTemplate(config.compileTagPrompt, {
      name: cap.name,
      kind: cap.kind,
      description: cap.description,
      origin: cap.origin,
      filePath: cap.filePath,
      compatibility: cap.compatibility.join(', '),
      triggers: (cap.triggers ?? []).join(', '),
      categories: CATEGORIES.join(', '),
    });
  }

  return `Analyze this AI coding agent capability and generate metadata.

Name: ${cap.name}
Kind: ${cap.kind}
Description: ${cap.description}
${cap.triggers?.length ? `Triggers: ${cap.triggers.join(', ')}` : ''}

Respond with JSON:
{
  "tags": ["keyword1", "keyword2"],
  "exampleQueries": ["query1", "query2"],
  "category": "one-of: ${CATEGORIES.join(', ')}",
  "scenario": "one sentence: when a user should use this",
  "explanation_template": "Chinese template explaining why this tool matches: {query_tags} {history_hint} {tool_name}"
}

Return only valid JSON. Do not include comments, markdown fences, or extra text.`;
}

function makeBatchTagPrompt(caps: RawCapability[]): string {
  const items = caps.map((cap, i) =>
    `[${i + 1}] Name: ${cap.name}
Kind: ${cap.kind}
Description: ${cap.description}
${cap.triggers?.length ? `Triggers: ${cap.triggers.join(', ')}` : ''}`
  ).join('\n\n');

  return `Analyze these ${caps.length} AI coding agent capabilities and generate metadata for EACH.

${items}

Respond with a JSON array (one object per capability, in order):
[
  {
    "name": "capability-name",
    "tags": ["keyword1", "keyword2", ...],
    "exampleQueries": ["query1", "query2", ...],
    "category": "one-of: ${CATEGORIES.join(', ')}",
    "scenario": "one sentence: when to use this",
    "explanation_template": "Chinese template: {query_tags} {history_hint} {tool_name}"
  },
  ...
]`;
}

function makeRelationPrompt(
  cap: RawCapability,
  neighbors: Array<{ name: string; description: string }>,
  config?: { compileRelationPrompt?: string },
): string {
  const neighborList = neighbors
    .map(n => `  - ${n.name}: ${n.description}`)
    .join('\n');

  if (config?.compileRelationPrompt?.trim()) {
    return renderPromptTemplate(config.compileRelationPrompt, {
      name: cap.name,
      kind: cap.kind,
      description: cap.description,
      origin: cap.origin,
      filePath: cap.filePath,
      compatibility: cap.compatibility.join(', '),
      triggers: (cap.triggers ?? []).join(', '),
      'cap.name': cap.name,
      'cap.kind': cap.kind,
      'cap.description': cap.description,
      neighbors: neighborList,
      neighborList,
      categories: CATEGORIES.join(', '),
    });
  }

  return `Given this capability and a list of other capabilities, identify relationships.

This capability:
  Name: ${cap.name}
  Description: ${cap.description}

Other capabilities:
${neighborList}

For each relationship found, respond with JSON array:
[
  {
    "target": "other-capability-name",
    "type": "similar_to | composes_with | supersedes | depends_on",
    "description": "brief explanation",
    "diff": "for similar_to only: what's the key difference",
    "confidence": 0.0-1.0
  }
]

Only include relationships with confidence >= 0.6. Return [] if none found.
Return only valid JSON. Do not include comments, markdown fences, or extra text.`;
}

// ─── Compiler ─────────────────────────────────────────────────────────────

export interface CompileResult {
  graph: Graph;
  totalTokens: { input: number; output: number };
  compiled: number;
  skipped: number;
  errors: string[];
}

export interface CompileOptions {
  config?: { compileSystemPrompt?: string; compileTagPrompt?: string; compileRelationPrompt?: string };
  /** LLM provider for compilation */
  llm: LLMProvider;
  /** Model name for metadata */
  modelName: string;
  /** Existing graph for incremental compilation */
  existingGraph?: Graph;
  /** Batch size for relation inference */
  relationBatchSize?: number;
  /** Concurrency for LLM calls in Phase 1 */
  concurrency?: number;
  /** Force full relation inference (not just new nodes) */
  forceRelations?: boolean;
  /** Skip Phase 2 relation inference entirely */
  skipRelations?: boolean;
  /** Path to save incremental checkpoint after each capability */
  checkpointPath?: string;
  /** Progress callback */
  onProgress?: (current: number, total: number, name: string) => void;
  /** Relation inference progress callback */
  onRelationProgress?: (current: number, total: number) => void;
}

function isRelationCompileError(error: string): boolean {
  return error.startsWith('relation_');
}

function mergeCompileErrors(currentErrors: string[], preservedErrors: string[]): string[] {
  return [...new Set([...currentErrors, ...preservedErrors])];
}

export async function compile(
  rawCapabilities: RawCapability[],
  options: CompileOptions,
): Promise<CompileResult> {
  const { llm, modelName, existingGraph, onProgress, onRelationProgress, forceRelations = false, skipRelations = false, checkpointPath } = options;
  const batchSize = options.relationBatchSize ?? 10;
  const concurrency = options.concurrency ?? 5;

  const graph = existingGraph ?? new Graph();
  const totalTokens = { input: 0, output: 0 };
  let compiled = 0;
  let skipped = 0;
  const errors: string[] = [];
  let progressCount = 0;
  const newlyCompiledIds: string[] = [];
  const preservedRelationErrors = existingGraph && (skipRelations || !forceRelations)
    ? existingGraph.getCompileErrors().filter(isRelationCompileError)
    : [];

  // Phase 1: Enrich each capability with tags, example queries, category
  // Filter out already-compiled nodes first
  const toCompile: Array<{ raw: RawCapability; index: number }> = [];
  for (let i = 0; i < rawCapabilities.length; i++) {
    const raw = rawCapabilities[i];
    const id = makeCapabilityId(raw.kind, raw.name, raw.origin, raw.platform);
    const existingNode = existingGraph?.getNode(id);
    if (existingNode) {
      const hasQualityData = existingNode.exampleQueries &&
        existingNode.exampleQueries.length > 1 &&
        existingNode.exampleQueries.some(q => q.length >= 8 && q !== existingNode.name);
      if (hasQualityData) {
        skipped++;
        continue;
      }
    }
    toCompile.push({ raw, index: i });
  }

  // Process concurrently in chunks of `concurrency` — one LLM call per capability.
  // Batch prompts were removed: reasoning models (M2.7, Qwen3) emit <think> blocks
  // that break JSON array parsing. Single-item prompts are simpler and more stable.
  const CHUNK_SIZE = concurrency;
  for (let i = 0; i < toCompile.length; i += CHUNK_SIZE) {
    const chunk = toCompile.slice(i, i + CHUNK_SIZE);

    await Promise.all(chunk.map(async ({ raw }) => {
      const id = makeCapabilityId(raw.kind, raw.name, raw.origin, raw.platform);

      // First call: abort early on API config issues
      const isFirst = i === 0 && chunk[0].raw === raw;

      try {
        const prompt = makeTagPrompt(raw, options.config);
        const response = await llm.complete(prompt, getSystemPrompt(options.config));
        totalTokens.input += response.inputTokens;
        totalTokens.output += response.outputTokens;

        const enrichment = parseJsonResponse<{
          tags: string[];
          exampleQueries: string[];
          category: string;
          scenario: string;
          explanation_template?: string;
        }>(response.content);

        if (!enrichment) {
          process.stderr.write(`[PARSE FAIL] ${raw.name}\n`);
        }

        graph.addNode({
          id,
          kind: raw.kind,
          name: raw.name,
          description: raw.description,
          origin: raw.origin,
          status: raw.disabled ? 'disabled' : 'installed',
          compatibility: raw.compatibility,
          filePath: raw.filePath,
          tags: enrichment?.tags ?? raw.triggers ?? [],
          exampleQueries: enrichment?.exampleQueries ?? [],
          category: enrichment?.category ?? 'other',
          scenario: enrichment?.scenario,
          explanation_template: enrichment?.explanation_template,
          triggers: raw.triggers,
          meta: raw.meta,
          tier: raw.tier,
          schema: raw.schema,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        if (isFirst) {
          console.error(`\nLLM API error (first call failed): ${errMsg}`);
          console.error('Check: compileApiBase, compileApiKey, compileModel in ~/.lazybrain/config.json');
          process.exit(1);
        }
        errors.push(`${raw.name}: ${errMsg}`);
        graph.addNode({
          id,
          kind: raw.kind,
          name: raw.name,
          description: raw.description,
          origin: raw.origin,
          status: raw.disabled ? 'disabled' : 'installed',
          compatibility: raw.compatibility,
          filePath: raw.filePath,
          tags: raw.triggers ?? [],
          exampleQueries: [],
          category: 'other',
          meta: raw.meta,
          tier: raw.tier,
          schema: raw.schema,
        });
      }

      newlyCompiledIds.push(id);
      compiled++;
      progressCount++;
      onProgress?.(progressCount + skipped, rawCapabilities.length, raw.name);
      if (checkpointPath) graph.save(checkpointPath);
    }));
  }

  // Phase 2: Infer relationships between capabilities (concurrent)
  // Only process tier 0+1 nodes for relations; tier 2 is skipped for speed
  // If forceRelations is false, only process newly compiled nodes (incremental mode)
  if (skipRelations) {
    const finalErrors = mergeCompileErrors(errors, preservedRelationErrors);
    graph.setCompileInfo(modelName, finalErrors);
    return { graph, compiled, skipped, errors: finalErrors, totalTokens };
  }

  const allNodes = graph.getAllNodes();
  const relationNodes = forceRelations
    ? allNodes.filter(n => n.tier === undefined || n.tier <= 1)
    : allNodes.filter(n => newlyCompiledIds.includes(n.id));

  // Skip Phase 2 if no new nodes to process
  if (relationNodes.length === 0) {
    const finalErrors = mergeCompileErrors(errors, preservedRelationErrors);
    graph.setCompileInfo(modelName, finalErrors);
    return {
      graph,
      compiled,
      skipped,
      totalTokens,
      errors: finalErrors,
    };
  }

  for (let i = 0; i < relationNodes.length; i += concurrency) {
    const batch = relationNodes.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map(async (node) => {
        const candidates = allNodes
          .filter(n => n.id !== node.id)
          .filter(n =>
            n.category === node.category ||
            n.tags.some(t => node.tags.includes(t)),
          )
          .slice(0, 15);

        if (candidates.length === 0) return [];

        const prompt = makeRelationPrompt(
          { kind: node.kind, name: node.name, description: node.description, origin: node.origin, filePath: node.filePath ?? '', compatibility: node.compatibility, triggers: node.triggers },
          candidates.map(c => ({ name: c.name, description: c.description })),
          options.config,
        );
        const response = await llm.complete(prompt, getSystemPrompt(options.config));
        totalTokens.input += response.inputTokens;
        totalTokens.output += response.outputTokens;

        const relations = parseJsonResponse<Array<{
          target?: unknown;
          type?: unknown;
          description?: unknown;
          diff?: unknown;
          confidence?: unknown;
        }>>(response.content);

        if (!relations) {
          errors.push(`relation_parse_failed:${node.name}:${node.id}: failed to parse LLM response`);
          return { nodeId: node.id, relations: [] };
        }

        if (!Array.isArray(relations)) {
          errors.push(`relation_invalid_shape:${node.name}:${node.id}: relation response must be an array`);
          return { nodeId: node.id, relations: [] };
        }

        return { nodeId: node.id, relations };
      }),
    );

    for (let resultIndex = 0; resultIndex < results.length; resultIndex++) {
      const result = results[resultIndex];
      if (result.status === 'rejected') {
        const failedNode = batch[resultIndex];
        const errMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
        errors.push(`relation_call_failed:${failedNode?.name ?? '?'}:${failedNode?.id ?? '?'}: ${errMsg}`);
        continue;
      }
      if (result.status !== 'fulfilled') continue;
      const val = result.value;
      if (!val || Array.isArray(val)) continue;
      const { nodeId, relations } = val as { nodeId: string; relations: Array<{ target?: unknown; type?: unknown; description?: unknown; diff?: unknown; confidence?: unknown }> };
      for (const rel of relations) {
        if (typeof rel.target !== 'string' || typeof rel.type !== 'string' || typeof rel.confidence !== 'number') {
          errors.push(`relation_invalid_shape:${nodeId}: missing target/type/confidence`);
          continue;
        }
        if (rel.confidence < 0.6) continue;
        if (!isLinkType(rel.type)) {
          errors.push(`relation_invalid_type:${nodeId}->${rel.target}: ${rel.type}`);
          continue;
        }
        const targetNode = graph.findByName(rel.target);
        if (!targetNode) {
          errors.push(`relation_target_missing:${nodeId}->${rel.target}`);
          continue;
        }
        graph.addLink({
          source: nodeId,
          target: targetNode.id,
          type: rel.type,
          description: typeof rel.description === 'string' ? rel.description : undefined,
          diff: typeof rel.diff === 'string' ? rel.diff : undefined,
          confidence: rel.confidence,
        });
      }
    }

    const relationCount = Math.min(i + concurrency, relationNodes.length);
    onRelationProgress?.(relationCount, relationNodes.length);
  }

  const finalErrors = mergeCompileErrors(errors, preservedRelationErrors);
  graph.setCompileInfo(modelName, finalErrors);
  return { graph, totalTokens, compiled, skipped, errors: finalErrors };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function parseJsonResponse<T>(content: string): T | null {
  // Strip <think>...</think> blocks (closed or truncated/unclosed).
  const cleaned = content
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<think>[\s\S]*/g, '')
    .trim();
  if (!cleaned) return null;

  const candidates = [cleaned, extractJsonCandidate(cleaned)]
    .filter((value): value is string => Boolean(value?.trim()));

  for (const candidate of candidates) {
    const normalized = normalizeJsonCandidate(candidate);
    try {
      return JSON.parse(normalized) as T;
    } catch {}
  }

  return null;
}

function normalizeJsonCandidate(content: string): string {
  const withoutFences = content
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  return stripJsonComments(withoutFences).replace(/,\s*([}\]])/g, '$1').trim();
}

function extractJsonCandidate(content: string): string | null {
  const start = findFirstJsonStart(content);
  if (start < 0) return null;

  const open = content[start];
  const close = open === '{' ? '}' : ']';
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = start; i < content.length; i++) {
    const char = content[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{' || char === '[') {
      stack.push(char === '{' ? '}' : ']');
      continue;
    }
    if (char === '}' || char === ']') {
      if (stack.pop() !== char) return null;
      if (stack.length === 0 && char === close) return content.slice(start, i + 1);
    }
  }

  return null;
}

function findFirstJsonStart(content: string): number {
  const objectStart = content.indexOf('{');
  const arrayStart = content.indexOf('[');
  if (objectStart < 0) return arrayStart;
  if (arrayStart < 0) return objectStart;
  return Math.min(objectStart, arrayStart);
}

function stripJsonComments(content: string): string {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const next = content[i + 1];

    if (inString) {
      result += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }

    if (char === '/' && next === '/') {
      while (i < content.length && content[i] !== '\n') i++;
      result += '\n';
      continue;
    }

    if (char === '/' && next === '*') {
      i += 2;
      while (i < content.length && !(content[i] === '*' && content[i + 1] === '/')) i++;
      i++;
      continue;
    }

    result += char;
  }

  return result;
}
