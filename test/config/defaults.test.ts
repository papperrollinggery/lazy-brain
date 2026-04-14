import { describe, it, expect } from 'vitest';
import { getDefaults, mergeWithDefaults } from '../../src/config/defaults.js';
import { DEFAULT_CONFIG } from '../../src/constants.js';

describe('defaults', () => {
  describe('getDefaults', () => {
    it('returns a deep copy of default config', () => {
      const defaults = getDefaults();
      expect(defaults).toEqual(DEFAULT_CONFIG);
      expect(defaults).not.toBe(DEFAULT_CONFIG);
    });

    it('modifying returned object does not affect DEFAULT_CONFIG', () => {
      const defaults = getDefaults();
      defaults.mode = 'auto';
      expect(DEFAULT_CONFIG.mode).toBe('select');
    });
  });

  describe('mergeWithDefaults', () => {
    it('merges partial config with defaults', () => {
      const partial = { mode: 'auto' as const };
      const result = mergeWithDefaults(partial);
      expect(result.mode).toBe('auto');
      expect(result.engine).toBe(DEFAULT_CONFIG.engine);
    });

    it('partial overrides defaults', () => {
      const partial = {
        engine: 'llm' as const,
        autoThreshold: 0.9,
      };
      const result = mergeWithDefaults(partial);
      expect(result.engine).toBe('llm');
      expect(result.autoThreshold).toBe(0.9);
      expect(result.mode).toBe(DEFAULT_CONFIG.mode);
    });

    it('returns full config even with empty partial', () => {
      const result = mergeWithDefaults({});
      expect(result).toEqual(DEFAULT_CONFIG);
    });
  });
});
