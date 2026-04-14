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
  Capability,
  Link,
  LLMProvider,
  LLMResponse,
} from '../types.js';
import { CATEGORIES, GRAPH_VERSION } from '../constants.js';
import { Graph } from '../graph/graph.js';

/** Generate deterministic capability ID */
export function makeCapabilityId(kind: string, name: string, origin: string): string {
  return createHash('sha256')
    .update(`${kind}:${name}:${origin}`)
    .digest('hex')
    .slice(0, 16);
}

// ─── LLM Prompt Templates ────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a capability classifier for AI coding agent tools.
Given a tool's name and description, generate structured metadata.
Always respond in valid JSON. No markdown, no explanation.`;

function makeTagPrompt(cap: RawCapability): string {
  return `Analyze this AI coding agent capability and generate metadata.

Name: ${cap.name}
Kind: ${cap.kind}
Description: ${cap.description}
${cap.triggers?.length ? `Triggers: ${cap.triggers.join(', ')}` : ''}

Respond with JSON:
{
  "tags": ["keyword1", "keyword2", ...],       // 8-15 semantic tags (include Chinese if description has CJK)
  "exampleQueries": ["query1", "query2", ...], // 5-8 example user queries that should match this (mix languages)
  "category": "one-of: ${CATEGORIES.join(', ')}",
  "scenario": "one sentence: when a user should use this"
}`;
}

function makeRelationPrompt(
  cap: RawCapability,
  neighbors: Array<{ name: string; description: string }>,
): string {
  const neighborList = neighbors
    .map(n => `  - ${n.name}: ${n.description}`)
    .join('\n');

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

Only include relationships with confidence >= 0.6. Return [] if none found.`;
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
  /** Progress callback */
  onProgress?: (current: number, total: number, name: string) => void;
  /** Relation inference progress callback */
  onRelationProgress?: (current: number, total: number) => void;
}

export async function compile(
  rawCapabilities: RawCapability[],
  options: CompileOptions,
): Promise<CompileResult> {
  const { llm, modelName, existingGraph, onProgress, onRelationProgress } = options;
  const batchSize = options.relationBatchSize ?? 10;
  const concurrency = options.concurrency ?? 5;

  const graph = existingGraph ?? new Graph();
  const totalTokens = { input: 0, output: 0 };
  let compiled = 0;
  let skipped = 0;
  const errors: string[] = [];
  let progressCount = 0;

  // Phase 1: Enrich each capability with tags, example queries, category
  // Filter out already-compiled nodes first
  const toCompile: Array<{ raw: RawCapability; index: number }> = [];
  for (let i = 0; i < rawCapabilities.length; i++) {
    const raw = rawCapabilities[i];
    const id = makeCapabilityId(raw.kind, raw.name, raw.origin);
    if (existingGraph?.getNode(id)) {
      skipped++;
    } else {
      toCompile.push({ raw, index: i });
    }
  }

  // Process in concurrent batches
  for (let i = 0; i < toCompile.length; i += concurrency) {
    const batch = toCompile.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map(async ({ raw }) => {
        const prompt = makeTagPrompt(raw);
        const response = await llm.complete(prompt, SYSTEM_PROMPT);
        return { raw, response };
      }),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        const batchItem = batch[results.indexOf(result)];
        const raw = batchItem.raw;
        const id = makeCapabilityId(raw.kind, raw.name, raw.origin);
        const errMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
        errors.push(`${raw.name}: ${errMsg}`);
        graph.addNode({
          id,
          kind: raw.kind,
          name: raw.name,
          description: raw.description,
          origin: raw.origin,
          status: 'installed',
          compatibility: raw.compatibility,
          filePath: raw.filePath,
          tags: raw.triggers ?? [],
          exampleQueries: [],
          category: 'other',
          meta: raw.meta,
        });
        compiled++;
        progressCount++;
        onProgress?.(progressCount + skipped, rawCapabilities.length, raw.name);
        continue;
      }

      const { raw, response } = result.value;
      const id = makeCapabilityId(raw.kind, raw.name, raw.origin);
      totalTokens.input += response.inputTokens;
      totalTokens.output += response.outputTokens;

      const enrichment = parseJsonResponse<{
        tags: string[];
        exampleQueries: string[];
        category: string;
        scenario: string;
      }>(response.content);

      if (!enrichment) {
        process.stderr.write(`\n[PARSE FAIL] ${raw.name}: ${JSON.stringify(response.content.slice(0, 200))}\n`);
      }

      graph.addNode({
        id,
        kind: raw.kind,
        name: raw.name,
        description: raw.description,
        origin: raw.origin,
        status: 'installed',
        compatibility: raw.compatibility,
        filePath: raw.filePath,
        tags: enrichment?.tags ?? [],
        exampleQueries: enrichment?.exampleQueries ?? [],
        category: enrichment?.category ?? 'other',
        scenario: enrichment?.scenario,
        triggers: raw.triggers,
        meta: raw.meta,
        tier: raw.tier,
      });
      compiled++;
      progressCount++;
      onProgress?.(progressCount + skipped, rawCapabilities.length, raw.name);
    }

    // Check for total batch failure (first batch only) - likely API key issue
    if (i === 0) {
      const failedCount = results.filter(r => r.status === 'rejected').length;
      if (failedCount === batch.length && batch.length > 0) {
        const firstError = (results.find(r => r.status === 'rejected') as PromiseRejectedResult).reason;
        const errMsg = firstError instanceof Error ? firstError.message : String(firstError);
        throw new Error(`LLM API error (all ${batch.length} requests failed): ${errMsg}`);
      }
    }
  }

  // Phase 2: Infer relationships between capabilities (concurrent)
  // Only process tier 0+1 nodes for relations; tier 2 is skipped for speed
  const allNodes = graph.getAllNodes();
  const relationNodes = allNodes.filter(n => n.tier === undefined || n.tier <= 1);
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
        );
        const response = await llm.complete(prompt, SYSTEM_PROMPT);
        totalTokens.input += response.inputTokens;
        totalTokens.output += response.outputTokens;

        const relations = parseJsonResponse<Array<{
          target: string;
          type: string;
          description?: string;
          diff?: string;
          confidence: number;
        }>>(response.content);

        return { nodeId: node.id, relations: Array.isArray(relations) ? relations : [] };
      }),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        const batchIndex = results.indexOf(result);
        const failedNode = batch[batchIndex];
        const errMsg = result.reason instanceof Error ? result.reason.message : String(result.reason);
        errors.push(`relation:${failedNode?.name ?? '?'}: ${errMsg}`);
        continue;
      }
      if (!result.value || Array.isArray(result.value)) continue;
      const { nodeId, relations } = result.value as { nodeId: string; relations: Array<{ target: string; type: string; description?: string; diff?: string; confidence: number }> };
      for (const rel of relations) {
        const targetNode = graph.findByName(rel.target);
        if (!targetNode) continue;
        if (rel.confidence < 0.6) continue;
        graph.addLink({
          source: nodeId,
          target: targetNode.id,
          type: rel.type as Link['type'],
          description: rel.description,
          diff: rel.diff,
          confidence: rel.confidence,
        });
      }
    }

    const relationCount = Math.min(i + concurrency, relationNodes.length);
    onRelationProgress?.(relationCount, relationNodes.length);
  }

  graph.setCompileInfo(modelName);
  return { graph, totalTokens, compiled, skipped, errors };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function parseJsonResponse<T>(content: string): T | null {
  try {
    // Strip <think>...</think> blocks (closed or truncated/unclosed)
    const cleaned = content
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .replace(/<think>[\s\S]*/g, '')
      .replace(/^```(?:json)?\s*/m, '')
      .replace(/\s*```\s*$/m, '')
      .trim();
    if (!cleaned) return null;
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}
