/**
 * LazyBrain — Tag Generator
 *
 * Generates semantic tags and example queries for capabilities using LLM.
 */

import type { LLMProvider, RawCapability } from '../types.js';
import { CATEGORIES } from '../constants.js';

export interface TagResult {
  tags: string[];
  exampleQueries: string[];
  scenario: string;
}

const SYSTEM_PROMPT = `You are a capability classifier for AI coding agent tools.
Given a tool's name and description, generate structured metadata.
Always respond in valid JSON. No markdown, no explanation.`;

function makeTagPrompt(cap: RawCapability): string {
  const hasCJK = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/.test(
    cap.description + cap.name,
  );

  return `Analyze this AI coding agent capability and generate metadata.

Name: ${cap.name}
Kind: ${cap.kind}
Description: ${cap.description}
${cap.triggers?.length ? `Triggers: ${cap.triggers.join(', ')}` : ''}

Respond with JSON:
{
  "tags": ["keyword1", "keyword2", ...],       // 8-15 semantic tags${hasCJK ? ' (include Chinese)' : ''}
  "exampleQueries": ["query1", "query2", ...], // 5-8 example user queries that should match this
  "scenario": "one sentence: when a user should use this"
}

Allowed categories: ${CATEGORIES.join(', ')}`;
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

function extractFallbackTags(cap: RawCapability): string[] {
  const text = `${cap.name} ${cap.description}`.toLowerCase();
  const words = text.split(/[\s\-_/,#]+/).filter(w => w.length > 2);
  const unique = [...new Set(words)];
  return unique.slice(0, 10);
}

export async function generateTags(
  cap: RawCapability,
  llm: LLMProvider,
): Promise<TagResult> {
  try {
    const prompt = makeTagPrompt(cap);
    const response = await llm.complete(prompt, SYSTEM_PROMPT);

    const parsed = parseJsonResponse<{
      tags: unknown;
      exampleQueries: unknown;
      scenario: unknown;
    }>(response.content);

    if (parsed && Array.isArray(parsed.tags) && typeof parsed.scenario === 'string') {
      return {
        tags: parsed.tags.filter((t): t is string => typeof t === 'string').slice(0, 15),
        exampleQueries: Array.isArray(parsed.exampleQueries)
          ? parsed.exampleQueries.filter((q): q is string => typeof q === 'string').slice(0, 8)
          : [],
        scenario: parsed.scenario,
      };
    }
  } catch {
    // Fall through to fallback
  }

  return {
    tags: extractFallbackTags(cap),
    exampleQueries: [],
    scenario: `Use ${cap.name} for ${cap.description.slice(0, 100)}`,
  };
}
