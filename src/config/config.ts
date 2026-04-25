/**
 * LazyBrain — Config Loader/Saver
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { Platform, UserConfig } from '../types.js';
import { CONFIG_PATH, DEFAULT_CONFIG } from '../constants.js';

function ensureDir(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function loadConfig(): UserConfig {
  if (!existsSync(CONFIG_PATH)) {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as UserConfig;
  }

  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as Partial<UserConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...raw,
      platforms: { ...DEFAULT_CONFIG.platforms, ...(raw.platforms ?? {}) } as Record<Platform, boolean>,
      governance: { ...DEFAULT_CONFIG.governance, ...(raw.governance ?? {}) } as NonNullable<UserConfig['governance']>,
      hookSafety: { ...DEFAULT_CONFIG.hookSafety, ...(raw.hookSafety ?? {}) } as NonNullable<UserConfig['hookSafety']>,
    };
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as UserConfig;
  }
}

export function saveConfig(config: UserConfig): void {
  ensureDir(CONFIG_PATH);
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
}

export function updateConfig(key: string, value: unknown): void {
  const config = loadConfig();
  const keyParts = key.split('.');
  let current: Record<string, unknown> = config as unknown as Record<string, unknown>;

  for (let i = 0; i < keyParts.length - 1; i++) {
    const part = keyParts[i];
    if (typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  const lastKey = keyParts[keyParts.length - 1];
  current[lastKey] = value;
  saveConfig(config);
}
