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
  /** Progress callback */
  onProgress?: (current: number, total: number, name: string) => void;
}

export async function compile(
  rawCapabilities: RawCapability[],
  options: CompileOptions,
): Promise<CompileResult> {
  const { llm, modelName, existingGraph, onProgress } = options;
  const batchSize = options.relationBatchSize ?? 10;

  const graph = existingGraph ?? new Graph();
  const totalTokens = { input: 0, output: 0 };
  let compiled = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Phase 1: Enrich each capability with tags, example queries, category
  for (let i = 0; i < rawCapabilities.length; i++) {
    const raw = rawCapabilities[i];
    const id = makeCapabilityId(raw.kind, raw.name, raw.origin);

    // Skip if already compiled (incremental)
    if (existingGraph?.getNode(id)) {
      skipped++;
      continue;
    }

    onProgress?.(i + 1, rawCapabilities.length, raw.name);

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

      const capability: Capability = {
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
      };

      graph.addNode(capability);
      compiled++;
    } catch (err) {
      errors.push(`${raw.name}: ${err instanceof Error ? err.message : String(err)}`);
      // Still add the node with minimal data
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
    }
  }

  // Phase 2: Infer relationships between capabilities
  const allNodes = graph.getAllNodes();
  for (let i = 0; i < allNodes.length; i += batchSize) {
    const batch = allNodes.slice(i, i + batchSize);
    for (const node of batch) {
      // Find potential neighbors: same category or overlapping tags
      const candidates = allNodes
        .filter(n => n.id !== node.id)
        .filter(n =>
          n.category === node.category ||
          n.tags.some(t => node.tags.includes(t)),
        )
        .slice(0, 15); // Cap candidates per node

      if (candidates.length === 0) continue;

      try {
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

        if (Array.isArray(relations)) {
          for (const rel of relations) {
            const targetNode = graph.findByName(rel.target);
            if (!targetNode) continue;
            if (rel.confidence < 0.6) continue;

            const link: Link = {
              source: node.id,
              target: targetNode.id,
              type: rel.type as Link['type'],
              description: rel.description,
              diff: rel.diff,
              confidence: rel.confidence,
            };
            graph.addLink(link);
          }
        }
      } catch {
        // Relation inference failure is non-fatal
      }
    }
  }

  graph.setCompileInfo(modelName);
  return { graph, totalTokens, compiled, skipped, errors };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function parseJsonResponse<T>(content: string): T | null {
  try {
    // Strip markdown code fences if present
    const cleaned = content
      .replace(/^```(?:json)?\s*/m, '')
      .replace(/\s*```\s*$/m, '')
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}
