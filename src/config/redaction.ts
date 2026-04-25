import type { UserConfig } from '../types.js';

export function isSensitiveConfigKey(key: string): boolean {
  return /(apiKey|token|secretKey|password)$/i.test(key);
}

export function redactConfig(config: UserConfig): UserConfig {
  return JSON.parse(JSON.stringify(config, (key, value) => {
    if (isSensitiveConfigKey(key) && typeof value === 'string') {
      return value ? '<redacted>' : value;
    }
    return value;
  })) as UserConfig;
}
