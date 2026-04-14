/**
 * LazyBrain — Relation Inferrer
 *
 * Infers relationships between capabilities using LLM.
 */

import type { LLMProvider, RawCapability, LinkType } from '../types.js';

export interface InferredRelation {
  targetName: string;
  type: LinkType;
  description: string;
  diff?: string;
  confidence: number;
}

const SYSTEM_PROMPT = `You are a capability relationship analyzer.
Given a capability and a list of others, identify relationships.
Always respond in valid JSON. No markdown, no explanation.`;

function makeRelationPrompt(
  cap: RawCapability,
  candidates: Array<{ name: string; description: string }>,
): string {
  const neighborList = candidates
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

function parseJsonResponse<T>(content: string): T | null {
  try {
    const cleaned = content
      .replace(/^```(?:json)?\s*/m, '')
      .replace(/\s*```\s*$/m, '')
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

const VALID_TYPES: LinkType[] = [
  'similar_to',
  'composes_with',
  'supersedes',
  'depends_on',
  'belongs_to',
];

export async function inferRelations(
  cap: RawCapability,
  candidates: Array<{ name: string; description: string }>,
  llm: LLMProvider,
): Promise<InferredRelation[]> {
  if (candidates.length === 0) return [];

  try {
    const prompt = makeRelationPrompt(cap, candidates);
    const response = await llm.complete(prompt, SYSTEM_PROMPT);

    const parsed = parseJsonResponse<Array<{
      target?: unknown;
      type?: unknown;
      description?: unknown;
      diff?: unknown;
      confidence?: unknown;
    }>>(response.content);

    if (!Array.isArray(parsed)) return [];

    const relations: InferredRelation[] = [];

    for (const item of parsed) {
      if (
        typeof item.target !== 'string' ||
        typeof item.type !== 'string' ||
        typeof item.description !== 'string' ||
        typeof item.confidence !== 'number'
      ) {
        continue;
      }

      if (item.confidence < 0.6) continue;

      const type = item.type as string;
      if (!VALID_TYPES.includes(type as LinkType)) continue;

      relations.push({
        targetName: item.target,
        type: type as LinkType,
        description: item.description,
        diff: typeof item.diff === 'string' ? item.diff : undefined,
        confidence: item.confidence,
      });
    }

    return relations;
  } catch {
    return [];
  }
}
