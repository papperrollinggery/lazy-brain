/**
 * LazyBrain — Alias Layer
 *
 * Exact alias matching for user queries.
 */

import type { Capability, MatchResult } from '../types.js';

export function aliasMatch(
  query: string,
  aliases: Record<string, string>,
  capabilities: Capability[],
): MatchResult | null {
  const lowerQuery = query.toLowerCase();

  for (const [aliasKey, targetName] of Object.entries(aliases)) {
    const lowerKey = aliasKey.toLowerCase();
    if (lowerQuery.includes(lowerKey)) {
      const capability = capabilities.find(c => c.name === targetName);
      if (capability) {
        return {
          capability,
          score: 1.0,
          layer: 'alias',
          confidence: 'high',
        };
      }
    }
  }

  return null;
}
