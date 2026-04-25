/**
 * LazyBrain — Default Config Helpers
 */

import type { Platform, UserConfig } from '../types.js';
import { DEFAULT_CONFIG } from '../constants.js';

export function getDefaults(): UserConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as UserConfig;
}

export function mergeWithDefaults(partial: Partial<UserConfig>): UserConfig {
  const defaults = getDefaults();
  return {
    ...defaults,
    ...partial,
    platforms: { ...defaults.platforms, ...(partial.platforms ?? {}) } as Record<Platform, boolean>,
    governance: { ...defaults.governance, ...(partial.governance ?? {}) } as NonNullable<UserConfig['governance']>,
    hookSafety: { ...defaults.hookSafety, ...(partial.hookSafety ?? {}) } as NonNullable<UserConfig['hookSafety']>,
  };
}
