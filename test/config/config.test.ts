import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadConfig, saveConfig, updateConfig } from '../../src/config/config.js';
import { CONFIG_PATH } from '../../src/constants.js';

describe('config', () => {
  const configDir = dirname(CONFIG_PATH);
  const originalConfig = existsSync(CONFIG_PATH)
    ? { content: writeFileSync ? undefined : undefined, raw: null as string | null }
    : { raw: null };

  beforeEach(() => {
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    if (existsSync(CONFIG_PATH)) {
      originalConfig.raw = require('node:fs').readFileSync(CONFIG_PATH, 'utf-8');
      unlinkSync(CONFIG_PATH);
    }
  });

  afterEach(() => {
    if (existsSync(CONFIG_PATH)) {
      unlinkSync(CONFIG_PATH);
    }
    if (originalConfig.raw) {
      require('node:fs').writeFileSync(CONFIG_PATH, originalConfig.raw, 'utf-8');
    }
  });

  describe('loadConfig', () => {
    it('returns defaults when config file does not exist', () => {
      const config = loadConfig();
      expect(config.mode).toBeDefined();
      expect(config.engine).toBeDefined();
    });

    it('loads existing config file', () => {
      const testConfig = {
        mode: 'auto',
        engine: 'llm',
        aliases: {},
        scanPaths: [],
        autoThreshold: 0.9,
        compileModel: 'test-model',
        externalDiscovery: false,
        platform: 'claude-code',
        language: 'zh' as const,
      };
      writeFileSync(CONFIG_PATH, JSON.stringify(testConfig), 'utf-8');

      const config = loadConfig();
      expect(config.mode).toBe('auto');
      expect(config.engine).toBe('llm');
    });

    it('merges with defaults for missing fields', () => {
      const partialConfig = {
        mode: 'auto',
      };
      writeFileSync(CONFIG_PATH, JSON.stringify(partialConfig), 'utf-8');

      const config = loadConfig();
      expect(config.mode).toBe('auto');
      expect(config.engine).toBeDefined();
    });
  });

  describe('saveConfig', () => {
    it('creates config file', () => {
      const config = loadConfig();
      config.mode = 'select';
      saveConfig(config);

      expect(existsSync(CONFIG_PATH)).toBe(true);
      const saved = require('node:fs').readFileSync(CONFIG_PATH, 'utf-8');
      const parsed = JSON.parse(saved);
      expect(parsed.mode).toBe('select');
    });
  });

  describe('updateConfig', () => {
    it('updates single field', () => {
      const config = loadConfig();
      saveConfig(config);

      updateConfig('mode', 'auto');
      const updated = loadConfig();
      expect(updated.mode).toBe('auto');
    });

    it('updates nested field', () => {
      const config = loadConfig();
      saveConfig(config);

      updateConfig('autoThreshold', 0.95);
      const updated = loadConfig();
      expect(updated.autoThreshold).toBe(0.95);
    });
  });
});
