/**
 * LazyBrain — Default Config Helpers
 */

import type { UserConfig } from '../types.js';
import { DEFAULT_CONFIG } from '../constants.js';

export function getDefaults(): UserConfig {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as UserConfig;
}

export function mergeWithDefaults(partial: Partial<UserConfig>): UserConfig {
  const defaults = getDefaults();
  return { ...defaults, ...partial };
}
