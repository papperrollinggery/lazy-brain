/**
 * LazyBrain — Deduplication
 *
 * Handles 531 SKILL.md files → ~212 unique capabilities.
 * Dedup strategy:
 *   1. Skip translation paths (zh-CN, ja-JP, ko-KR, etc.)
 *   2. Group by origin + name → keep first found (canonical)
 *   3. Merge triggers from duplicates into canonical
 */

import type { RawCapability } from '../types.js';
import { TRANSLATION_PATH_PATTERNS } from '../constants.js';

/**
 * Check if a file path is a translation/localization variant.
 */
export function isTranslationPath(filePath: string): boolean {
  return TRANSLATION_PATH_PATTERNS.some(pattern => pattern.test(filePath));
}

/**
 * Deduplicate raw capabilities.
 *
 * Rules:
 * - Translation paths are skipped entirely
 * - Same origin + name = duplicate → keep first, merge triggers
 * - Same name but different origin = different capabilities (keep both)
 */
export function dedup(capabilities: RawCapability[]): RawCapability[] {
  // Phase 1: Filter out translations
  const nonTranslation = capabilities.filter(c => !isTranslationPath(c.filePath));

  // Phase 2: Group by origin:name
  const groups = new Map<string, RawCapability[]>();
  for (const cap of nonTranslation) {
    const key = `${cap.origin}:${cap.name}`;
    const group = groups.get(key);
    if (group) {
      group.push(cap);
    } else {
      groups.set(key, [cap]);
    }
  }

  // Phase 3: Merge each group into one canonical entry
  const result: RawCapability[] = [];
  for (const group of groups.values()) {
    const canonical = group[0]; // First found = canonical

    // Merge triggers from all duplicates
    if (group.length > 1) {
      const allTriggers = new Set(canonical.triggers ?? []);
      for (let i = 1; i < group.length; i++) {
        for (const t of group[i].triggers ?? []) {
          allTriggers.add(t);
        }
      }
      canonical.triggers = [...allTriggers];
    }

    result.push(canonical);
  }

  return result;
}
