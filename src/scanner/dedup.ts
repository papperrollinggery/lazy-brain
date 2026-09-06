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
import { realpathSync } from 'node:fs';

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
 * - Only the same canonical file, kind, and provider is duplicate evidence
 * - Same names from separate user/project/plugin scopes remain distinct
 */
export function dedup(capabilities: RawCapability[]): RawCapability[] {
  // Phase 1: Filter out translations
  const nonTranslation = capabilities.filter(c => !isTranslationPath(c.filePath));

  // Phase 2: preserve source identity. `realpathSync` only collapses aliases to
  // the same file, never same-named files from different scopes.
  const groups = new Map<string, RawCapability[]>();
  for (const cap of nonTranslation) {
    let canonicalPath = cap.filePath;
    try { canonicalPath = realpathSync(cap.filePath); } catch {}
    const key = `${cap.kind}:${cap.provider ?? ''}:${cap.name}:${canonicalPath}`;
    const group = groups.get(key);
    if (group) {
      group.push(cap);
    } else {
      groups.set(key, [cap]);
    }
  }

  // Phase 3: Merge duplicate aliases only.
  const result: RawCapability[] = [];
  for (const group of groups.values()) {
    const canonical = group.reduce((best, cap) => {
      if (best.disabled !== cap.disabled) return best.disabled ? cap : best;
      if (best.discovery !== cap.discovery) return best.discovery === 'plugin-cache' ? cap : best;
      return cap.compatibility.length > best.compatibility.length ? cap : best;
    });

    // Merge triggers from all duplicates
    if (group.length > 1) {
      const allTriggers = new Set<string>();
      for (const cap of group) {
        for (const t of cap.triggers ?? []) {
          allTriggers.add(t);
        }
      }
      canonical.triggers = [...allTriggers].sort((a, b) => a.localeCompare(b));
    }

    result.push(canonical);
  }

  return result;
}
