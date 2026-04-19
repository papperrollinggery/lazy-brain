/**
 * LazyBrain — Tag Layer (Primary Matching Layer)
 *
 * Matches user input against LLM-compiled tags and example queries.
 * This is the main matching engine — fast, zero API cost at query time.
 */

import type { Capability, MatchResult, Platform } from '../types.js';
import { MIN_MATCH_SCORE } from '../constants.js';
import { expandTokens } from '../utils/cjk-bridge.js';
import { enrichQueryForMatching, isIntentExpansionToken, normalizeQuery } from '../utils/query-normalizer.js';

/**
 * English stopwords that carry no domain signal.
 * Filtering these prevents "for", "to", "the" from inflating scores on
 * uncompiled capabilities whose totalWeight is near zero.
 */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'up', 'as', 'is', 'it', 'its', 'be', 'was',
  'are', 'been', 'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would',
  'can', 'could', 'may', 'might', 'this', 'that', 'these', 'those', 'my',
  'your', 'our', 'their', 'me', 'him', 'her', 'us', 'them', 'i', 'we',
  'you', 'he', 'she', 'they', 'what', 'which', 'who', 'how', 'when',
  'where', 'why', 'all', 'any', 'some', 'no', 'not', 'so', 'if', 'then',
]);

/**
 * Tokenize input into searchable terms.
 * Returns { semantic, bigrams } where:
 *   semantic — meaningful units used as the normalization denominator
 *              (CJK full segments ≥2 chars, Latin words after stopword filter)
 *   bigrams  — CJK 2-char sliding windows used only for bridge key matching
 *
 * Keeping them separate lets scoreCapability normalize by semantic count
 * instead of total token count, preventing CJK bigram explosion from
 * diluting scores on short queries.
 */
export function tokenize(text: string): string[] {
  const lower = enrichQueryForMatching(text).toLowerCase();
  const tokens: string[] = [];

  // Extract CJK segments with sliding window (2-char bigrams + full segment)
  // This allows "帮我审查代码" to match bridge keys like "审查" and "代码"
  const cjk = lower.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]+/g);
  if (cjk) {
    for (const segment of cjk) {
      // Add full segment (for exact tag matches like "代码审查")
      if (segment.length >= 2) tokens.push(segment);
      // Add 2-char bigrams (for bridge key matching like "审查", "代码")
      for (let i = 0; i < segment.length - 1; i++) {
        tokens.push(segment.slice(i, i + 2));
      }
    }
  }

  // Extract Latin words, filtering stopwords
  const words = lower.match(/[a-z0-9][a-z0-9-]*/g);
  if (words) {
    for (const w of words) {
      if (!STOPWORDS.has(w)) tokens.push(w);
    }
  }

  return [...new Set(tokens)];
}

/** Weight multiplier for bridge-expanded tokens vs original tokens */
const BRIDGE_WEIGHT = 0.4;

/**
 * Language/framework keywords that make a capability specialized.
 * When the query lacks these but the capability has them, we apply a penalty.
 */
const LANG_KEYWORDS = new Set([
  'cpp', 'c++', 'c#', 'kotlin', 'python', 'go', 'golang', 'rust',
  'flutter', 'dart', 'swift', 'java', 'ruby', 'php', 'scala',
  'django', 'spring', 'springboot', 'laravel', 'rails', 'react', 'vue',
  'angular', 'svelte', 'nextjs', 'nuxt', 'fastapi', 'flask', 'express',
  'kubernetes', 'docker', 'terraform', 'android', 'ios', 'macos', 'windows',
  'linux', 'webassembly', 'wasm', 'solidity', 'blockchain', 'mcp',
  'postgres', 'mysql', 'mongodb', 'redis', 'clickhouse',
  'gradle', 'maven', 'webpack', 'vite', 'bun', 'deno',
]);

/** Penalty multiplier for language-specialized capabilities on generic queries */
const LANG_SPECIALTY_PENALTY = 0.5;

/**
 * Check if a capability is language/framework-specialized.
 * Returns the matching language keyword, or undefined if generic.
 */
function getLangSpecialty(cap: Capability): string | undefined {
  const nameLower = cap.name.toLowerCase();
  const tagsLower = cap.tags.map(t => t.toLowerCase());
  for (const kw of LANG_KEYWORDS) {
    if (nameLower.includes(kw) || tagsLower.some(t => t.includes(kw))) {
      return kw;
    }
  }
  return undefined;
}

/**
 * Check if any query token mentions a language/framework.
 */
function queryHasLangHint(tokens: string[]): boolean {
  for (const t of tokens) {
    if (LANG_KEYWORDS.has(t)) return true;
    // Also check expanded tokens (e.g. "代码" → "code" doesn't help, but "go" from bridge would)
    for (const kw of LANG_KEYWORDS) {
      if (t.includes(kw) && t.length <= kw.length + 3) return true;
    }
  }
  return false;
}

/**
 * Check if a token matches a target string.
 */
function tokenMatches(token: string, target: string): boolean {
  if (token.length < 2) return target === token;
  // Require word-boundary match: token must appear as a complete word segment
  // "unit" matches "unit-test", "unit_test", "unit" but NOT "community"
  const idx = target.indexOf(token);
  if (idx === -1) return false;
  const before = idx === 0 || /[^a-z0-9]/.test(target[idx - 1]);
  const after = idx + token.length === target.length || /[^a-z0-9]/.test(target[idx + token.length]);
  return before && after;
}

/**
 * Score how well a capability matches the query tokens.
 * Original tokens score at full weight; bridge-expanded tokens at reduced weight.
 */
/**
 * Score a capability against query tokens.
 *
 * Scoring is query-centric: we measure what fraction of query tokens are
 * "covered" by the capability, weighted by signal quality:
 *   - trigger match  → 1.0 (user-defined, highest signal)
 *   - tag match      → 0.8 (compiled, high signal)
 *   - exampleQuery   → 0.6 (compiled, medium signal)
 *   - name match     → 0.4 (structural, lower signal)
 *   - desc match     → 0.2 (noisy, lowest signal)
 *
 * Each query token contributes at most once per signal tier.
 * Bridge-expanded tokens are down-weighted by BRIDGE_WEIGHT.
 *
 * Final score = sum(token_scores) / queryTokenCount, capped at 1.0.
 * This means a 2-token query and a 10-token query are scored on the same
 * scale — capability size no longer inflates or deflates the score.
 */
function scoreCapability(
  original: string[],
  expanded: string[],
  cap: Capability,
  query: string,
): number {
  if (original.length === 0 && expanded.length === 0) return 0;

  // Uncompiled capabilities have no tags or example queries.
  // Without them there is no domain signal — skip entirely.
  if (cap.tags.length === 0 && cap.exampleQueries.length === 0) return 0;

  const allTokens = [...original, ...expanded];
  const isExpanded = new Set(expanded);
  const normalizedQuery = normalizeQuery(query);
  const intentTokens = new Set(
    allTokens.filter(token => isIntentExpansionToken(token, normalizedQuery)),
  );

  // Per-token best score across all signal tiers
  const tokenScore = new Map<string, number>();

  function credit(token: string, weight: number) {
    const w = isExpanded.has(token) ? weight * BRIDGE_WEIGHT : weight;
    const prev = tokenScore.get(token) ?? 0;
    if (w > prev) tokenScore.set(token, w);
  }

  const tagLowers = cap.tags.map(t => t.toLowerCase());
  const nameLower = cap.name.toLowerCase();
  const descLower = cap.description.toLowerCase();

  // Triggers (1.0) — each trigger word must appear as a complete word
  // in the query. This prevents "add" from matching "wiki add" trigger.
  if (cap.triggers) {
    for (const trigger of cap.triggers) {
      const triggerWords = trigger.toLowerCase().split(/\s+/);
      // Count how many trigger words are present in query tokens
      let matchedWords = 0;
      for (const tw of triggerWords) {
        if (tw.length < 2) continue; // Skip single-char trigger words
        for (const token of allTokens) {
          if (token === tw || tokenMatches(tw, token)) {
            matchedWords++;
            break;
          }
        }
      }
      // Only credit if ALL trigger words are present in the query
      if (matchedWords === triggerWords.filter(w => w.length >= 2).length && matchedWords > 0) {
        for (const tw of triggerWords) {
          if (tw.length < 2) continue;
          for (const token of allTokens) {
            if (token === tw || tokenMatches(tw, token)) {
              credit(token, 1.0);
              break;
            }
          }
        }
      }
    }
  }

  // Tags (0.8) — each tag can only be claimed by one token
  const claimedTags = new Set<number>();
  for (const token of allTokens) {
    for (let i = 0; i < tagLowers.length; i++) {
      if (!claimedTags.has(i) && tokenMatches(token, tagLowers[i])) {
        credit(token, 0.8);
        claimedTags.add(i);
        break;
      }
    }
  }

  // Aliases (0.9) — exact match, author-defined triggers
  if (cap.aliases && cap.aliases.length > 0) {
    const aliasLowers = cap.aliases.map(a => a.toLowerCase());
    for (const token of allTokens) {
      if (aliasLowers.includes(token)) {
        credit(token, 0.9);
      }
    }
  }

  // EvolvedTags (0.6) — tokenMatches, user-learned (may have noise)
  if (cap.evolvedTags && cap.evolvedTags.length > 0) {
    const evolvedLowers = cap.evolvedTags.map(t => t.toLowerCase());
    for (const token of allTokens) {
      for (const evolved of evolvedLowers) {
        if (tokenMatches(token, evolved)) {
          credit(token, 0.6);
          break;
        }
      }
    }
  }

  // Example queries (0.6) — best-matching query per token
  if (cap.exampleQueries.length > 0) {
    for (const token of allTokens) {
      for (const query of cap.exampleQueries) {
        if (query.toLowerCase().includes(token)) {
          credit(token, 0.6);
          break;
        }
      }
    }
  }

  // Name (0.4)
  for (const token of allTokens) {
    if (nameLower.includes(token)) credit(token, 0.4);
  }

  // Description (0.2) — only for tokens >= 3 chars to reduce noise
  for (const token of allTokens) {
    if (token.length >= 3 && descLower.includes(token)) credit(token, 0.2);
  }

  if (tokenScore.size === 0) return 0;

  // Normalization denominator:
  // - Latin queries: number of original tokens (each word = 1 unit)
  // - CJK queries: ceil(bigram_count / 2) + latin_word_count
  //   CJK bigrams overlap (sliding window), so 2 bigrams ≈ 1 concept.
  //   "代码审查" → 3 bigrams → ceil(3/2) = 2 concepts (代码, 审查). ✓
  //   "代码库新人上手" → 6 bigrams → ceil(6/2) = 3 concepts. ✓
  //   This is more stable than using expanded.length, which varies with
  //   bridge coverage and can be larger than the actual concept count.
  const hasCJK = original.some(t => /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(t));
  const latinOriginal = original.filter(t => /^[a-z0-9][a-z0-9-]*$/.test(t));
  let queryCount: number;
  if (hasCJK) {
    const bigramCount = original.filter(t =>
      /^[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]{2}$/.test(t)
    ).length;
    queryCount = Math.max(1, Math.ceil(bigramCount / 2) + latinOriginal.length);
  } else {
    queryCount = Math.max(1, original.length);
  }

  if (intentTokens.size > 0) {
    const intentHitCount = [...intentTokens].filter(t => tokenScore.has(t)).length;
    if (intentHitCount > 0) {
      queryCount = Math.min(queryCount, Math.max(1, intentTokens.size));
    }
  }

  const totalScore = [...tokenScore.values()].reduce((a, b) => a + b, 0);
  return Math.min(1, totalScore / queryCount);
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
  const hasLangHint = queryHasLangHint([...original, ...expanded]);
  const scored: MatchResult[] = [];
  for (const cap of filtered) {
    let score = scoreCapability(original, expanded, cap, query);
    if (score < MIN_MATCH_SCORE) continue;

    // Penalize language-specialized capabilities on generic queries
    if (!hasLangHint && getLangSpecialty(cap)) {
      score *= LANG_SPECIALTY_PENALTY;
    }

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
