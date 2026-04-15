/**
 * LazyBrain — Tag Layer (Primary Matching Layer)
 *
 * Matches user input against LLM-compiled tags and example queries.
 * This is the main matching engine — fast, zero API cost at query time.
 */

import type { Capability, MatchResult, Platform } from '../types.js';
import { MIN_MATCH_SCORE } from '../constants.js';
import { expandTokens } from '../utils/cjk-bridge.js';

/**
 * Tokenize input into searchable terms.
 * Handles CJK characters (Chinese/Japanese/Korean) by splitting on each character,
 * and Latin text by splitting on word boundaries.
 */
export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens: string[] = [];

  // Extract CJK segments (2+ chars only — single chars are too noisy)
  const cjk = lower.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]{2,}/g);
  if (cjk) {
    for (const segment of cjk) {
      tokens.push(segment);
    }
  }

  // Extract Latin words (including single-char like "ai", "v2", "3d"):
  const words = lower.match(/[a-z0-9][a-z0-9-]*/g);
  if (words) tokens.push(...words);

  return [...new Set(tokens)];
}

/** Weight multiplier for bridge-expanded tokens vs original tokens */
const BRIDGE_WEIGHT = 0.6;

/**
 * Check if a token matches a target string.
 */
function tokenMatches(token: string, target: string): boolean {
  return target.includes(token) || token.includes(target);
}

/**
 * Score how well a capability matches the query tokens.
 * Original tokens score at full weight; bridge-expanded tokens at reduced weight.
 */
function scoreCapability(
  original: string[],
  expanded: string[],
  cap: Capability,
): number {
  if (original.length === 0 && expanded.length === 0) return 0;

  let hits = 0;
  let totalWeight = 0;

  // Check tags (weight: 1.0 per hit)
  for (const tag of cap.tags) {
    const tagLower = tag.toLowerCase();
    let matched = false;

    // Original tokens: full weight
    for (const token of original) {
      if (tokenMatches(token, tagLower)) {
        hits += 1.0;
        matched = true;
        break;
      }
    }
    // Expanded tokens: reduced weight (only if original didn't match)
    if (!matched) {
      for (const token of expanded) {
        if (tokenMatches(token, tagLower)) {
          hits += 1.0 * BRIDGE_WEIGHT;
          break;
        }
      }
    }
    totalWeight += 1.0;
  }

  // Check example queries (weight: 1.5 per hit)
  const allTokens = [...original, ...expanded];
  for (const query of cap.exampleQueries) {
    const queryLower = query.toLowerCase();
    let queryHits = 0;
    let queryTotal = 0;
    for (const token of original) {
      if (queryLower.includes(token)) queryHits += 1.0;
      queryTotal += 1.0;
    }
    for (const token of expanded) {
      if (queryLower.includes(token)) queryHits += BRIDGE_WEIGHT;
      queryTotal += 1.0;
    }
    if (queryHits > 0 && queryTotal > 0) {
      hits += 1.5 * (queryHits / queryTotal);
    }
    totalWeight += 1.5;
  }

  // Check name (weight: 0.5)
  const nameLower = cap.name.toLowerCase();
  let nameHit = false;
  for (const token of original) {
    if (nameLower.includes(token)) { hits += 0.5; nameHit = true; break; }
  }
  if (!nameHit) {
    for (const token of expanded) {
      if (nameLower.includes(token)) { hits += 0.5 * BRIDGE_WEIGHT; break; }
    }
  }
  totalWeight += 0.5;

  // Check description (weight: 0.3)
  const descLower = cap.description.toLowerCase();
  let descHit = false;
  for (const token of original) {
    if (descLower.includes(token)) { hits += 0.3; descHit = true; break; }
  }
  if (!descHit) {
    for (const token of expanded) {
      if (descLower.includes(token)) { hits += 0.3 * BRIDGE_WEIGHT; break; }
    }
  }
  totalWeight += 0.3;

  // Check original triggers (weight: 2.0 — highest, user-defined)
  if (cap.triggers) {
    for (const trigger of cap.triggers) {
      const triggerLower = trigger.toLowerCase();
      let triggerHit = false;
      for (const token of original) {
        if (triggerLower === token || triggerLower.includes(token)) {
          hits += 2.0;
          triggerHit = true;
          break;
        }
      }
      if (!triggerHit) {
        for (const token of expanded) {
          if (triggerLower === token || triggerLower.includes(token)) {
            hits += 2.0 * BRIDGE_WEIGHT;
            break;
          }
        }
      }
      totalWeight += 2.0;
    }
  }

  return totalWeight > 0 ? Math.min(1, hits / (totalWeight * 0.3)) : 0;
}

/**
 * Match user input against all capabilities using tags and example queries.
 */
export function tagMatch(
  query: string,
  capabilities: Capability[],
  platform?: Platform,
  maxResults: number = 5,
): MatchResult[] {
  const rawTokens = tokenize(query);
  const { original, expanded } = expandTokens(rawTokens);
  if (original.length === 0 && expanded.length === 0) return [];

  // Filter by platform compatibility
  const filtered = platform
    ? capabilities.filter(
        c => c.compatibility.includes(platform) || c.compatibility.includes('universal'),
      )
    : capabilities;

  // Score all capabilities
  const scored: MatchResult[] = [];
  for (const cap of filtered) {
    const score = scoreCapability(original, expanded, cap);
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
