/**
 * LazyBrain — Tag Layer (Primary Matching Layer)
 *
 * Matches user input against LLM-compiled tags and example queries.
 * This is the main matching engine — fast, zero API cost at query time.
 */

import type { Capability, MatchResult, Platform } from '../types.js';
import { MIN_MATCH_SCORE } from '../constants.js';

/**
 * Tokenize input into searchable terms.
 * Handles CJK characters (Chinese/Japanese/Korean) by splitting on each character,
 * and Latin text by splitting on word boundaries.
 */
export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens: string[] = [];

  // Extract CJK characters as individual tokens
  const cjk = lower.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]+/g);
  if (cjk) {
    for (const segment of cjk) {
      // Add the full segment and individual chars for CJK
      tokens.push(segment);
      if (segment.length > 1) {
        for (const ch of segment) tokens.push(ch);
      }
    }
  }

  // Extract Latin words (2+ chars)
  const words = lower.match(/[a-z][a-z0-9-]{1,}/g);
  if (words) tokens.push(...words);

  return [...new Set(tokens)];
}

/**
 * Score how well a capability matches the query tokens.
 * Returns 0-1 score based on tag and example query overlap.
 */
function scoreCapability(tokens: string[], cap: Capability): number {
  if (tokens.length === 0) return 0;

  let hits = 0;
  let totalWeight = 0;

  // Check tags (weight: 1.0 per hit)
  for (const tag of cap.tags) {
    const tagLower = tag.toLowerCase();
    for (const token of tokens) {
      if (tagLower.includes(token) || token.includes(tagLower)) {
        hits += 1.0;
        break;
      }
    }
    totalWeight += 1.0;
  }

  // Check example queries (weight: 1.5 per hit — more specific)
  for (const query of cap.exampleQueries) {
    const queryLower = query.toLowerCase();
    let queryHits = 0;
    for (const token of tokens) {
      if (queryLower.includes(token)) queryHits++;
    }
    if (queryHits > 0) {
      hits += 1.5 * (queryHits / tokens.length);
    }
    totalWeight += 1.5;
  }

  // Check name and description (weight: 0.5)
  const nameLower = cap.name.toLowerCase();
  const descLower = cap.description.toLowerCase();
  for (const token of tokens) {
    if (nameLower.includes(token)) { hits += 0.5; break; }
  }
  totalWeight += 0.5;
  for (const token of tokens) {
    if (descLower.includes(token)) { hits += 0.3; break; }
  }
  totalWeight += 0.3;

  // Check original triggers (weight: 2.0 — highest, user-defined)
  if (cap.triggers) {
    for (const trigger of cap.triggers) {
      const triggerLower = trigger.toLowerCase();
      for (const token of tokens) {
        if (triggerLower === token || triggerLower.includes(token)) {
          hits += 2.0;
          break;
        }
      }
      totalWeight += 2.0;
    }
  }

  return totalWeight > 0 ? Math.min(1, hits / (totalWeight * 0.3)) : 0;
}

/**
 * Match user input against all capabilities using tags and example queries.
 *
 * @param query - User's natural language input
 * @param capabilities - All capabilities to search
 * @param platform - Current platform (for filtering)
 * @param maxResults - Maximum results to return
 */
export function tagMatch(
  query: string,
  capabilities: Capability[],
  platform?: Platform,
  maxResults: number = 5,
): MatchResult[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  // Filter by platform compatibility
  const filtered = platform
    ? capabilities.filter(
        c => c.compatibility.includes(platform) || c.compatibility.includes('universal'),
      )
    : capabilities;

  // Score all capabilities
  const scored: MatchResult[] = [];
  for (const cap of filtered) {
    const score = scoreCapability(tokens, cap);
    if (score >= MIN_MATCH_SCORE) {
      scored.push({
        capability: cap,
        score,
        layer: 'tag',
        confidence: score >= 0.8 ? 'high' : score >= 0.5 ? 'medium' : 'low',
      });
    }
  }

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults);
}
