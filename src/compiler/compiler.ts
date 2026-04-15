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
    "scenario": "one sentence: when to use this"
  },
  ...
]`;
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
  /** Force full relation inference (not just new nodes) */
  forceRelations?: boolean;
  /** Path to save incremental checkpoint after each capability */
  checkpointPath?: string;
  /** Progress callback */
  onProgress?: (current: number, total: number, name: string) => void;
  /** Relation inference progress callback */
  onRelationProgress?: (current: number, total: number) => void;
}

export async function compile(
  rawCapabilities: RawCapability[],
  options: CompileOptions,
): Promise<CompileResult> {
  const { llm, modelName, existingGraph, onProgress, onRelationProgress, forceRelations = false, checkpointPath } = options;
  const batchSize = options.relationBatchSize ?? 10;
  const concurrency = options.concurrency ?? 5;

  const graph = existingGraph ?? new Graph();
  const totalTokens = { input: 0, output: 0 };
  let compiled = 0;
  let skipped = 0;
  const errors: string[] = [];
  let progressCount = 0;
  const newlyCompiledIds: string[] = [];

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

  // Process in concurrent batches (batch of capabilities per LLM call)
  const BATCH_SIZE = 5;
  for (let i = 0; i < toCompile.length; i += BATCH_SIZE) {
    const batch = toCompile.slice(i, i + BATCH_SIZE);
    const batchRaws = batch.map(b => b.raw);

    // Try batch prompt first
    const batchPrompt = makeBatchTagPrompt(batchRaws);
    const batchResponse = await llm.complete(batchPrompt, SYSTEM_PROMPT);
    totalTokens.input += batchResponse.inputTokens;
    totalTokens.output += batchResponse.outputTokens;

    const enrichments = parseJsonResponse<Array<{
      tags: string[];
      exampleQueries: string[];
      category: string;
      scenario: string;
    }>>(batchResponse.content);

    // If batch failed, fallback to individual prompts
    if (!enrichments || enrichments.length !== batchRaws.length) {
      process.stderr.write(`\n[BATCH PARSE FAIL] Expected ${batchRaws.length}, got ${enrichments?.length ?? 0}. Falling back to individual prompts.\n`);
      for (let j = 0; j < batch.length; j++) {
        const { raw } = batch[j];
        const id = makeCapabilityId(raw.kind, raw.name, raw.origin);

        try {
          const prompt = makeTagPrompt(raw);
          const response = await llm.complete(prompt, SYSTEM_PROMPT);
          totalTokens.input += response.inputTokens;
          totalTokens.output += response.outputTokens;

          const enrichment = parseJsonResponse<{
            tags: string[];
            exampleQueries: string[];
            category: string;
            scenario: string;
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
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
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
        }
        newlyCompiledIds.push(id);
        compiled++;
        progressCount++;
        onProgress?.(progressCount + skipped, rawCapabilities.length, raw.name);
        if (checkpointPath) graph.save(checkpointPath);
      }
      continue;
    }

    // Process successful batch results
    for (let j = 0; j < batch.length; j++) {
      const raw = batch[j].raw;
      const enrichment = enrichments[j];
      const id = makeCapabilityId(raw.kind, raw.name, raw.origin);

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
      newlyCompiledIds.push(id);
      compiled++;
      progressCount++;
      onProgress?.(progressCount + skipped, rawCapabilities.length, raw.name);
      if (checkpointPath) graph.save(checkpointPath);
    }

    // Check for total batch failure (first batch only) - likely API key issue
    if (i === 0) {
      const failedCount = batch.length - (enrichments?.length ?? 0);
      if (failedCount === batch.length && batch.length > 0) {
        throw new Error(`LLM API error: batch parse failed completely`);
      }
    }
  }

  // Phase 2: Infer relationships between capabilities (concurrent)
  // Only process tier 0+1 nodes for relations; tier 2 is skipped for speed
  // If forceRelations is false, only process newly compiled nodes (incremental mode)
  const allNodes = graph.getAllNodes();
  const relationNodes = forceRelations
    ? allNodes.filter(n => n.tier === undefined || n.tier <= 1)
    : allNodes.filter(n => newlyCompiledIds.includes(n.id));

  // Skip Phase 2 if no new nodes to process
  if (relationNodes.length === 0) {
    return {
      graph,
      compiled,
      skipped,
      totalTokens,
      errors,
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

        if (!relations) {
          errors.push(`relation:${node.id}: failed to parse LLM response`);
          return { nodeId: node.id, relations: [] };
        }

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
      if (result.status !== 'fulfilled') continue;
      const val = result.value;
      if (!val || Array.isArray(val)) continue;
      const { nodeId, relations } = val as { nodeId: string; relations: Array<{ target: string; type: string; description?: string; diff?: string; confidence: number }> };
      for (const rel of relations.filter(r => r.target && r.type && typeof r.confidence === 'number')) {
        const targetNode = graph.findByName(rel.target);
        if (!targetNode) {
          process.stderr.write(`[DEBUG] relation:${nodeId}->${rel.target}: target not found\n`);
          continue;
        }
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
