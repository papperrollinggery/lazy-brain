import { describe, expect, it } from 'vitest';
import { validateConfigUpdate } from '../../src/config/schema.js';

describe('config schema', () => {
  it('rejects unknown keys', () => {
    expect(validateConfigUpdate({ arbitraryKey: 'value' })).toEqual({
      ok: false,
      error: 'Unknown config key: arbitraryKey',
    });
  });

  it('validates enum values', () => {
    expect(validateConfigUpdate({ strategy: 'recommend' })).toEqual({
      ok: false,
      error: 'Invalid strategy. Must be one of: always-main, optimal, ask',
    });
    expect(validateConfigUpdate({ strategy: 'optimal' })).toEqual({
      ok: true,
      patch: { strategy: 'optimal' },
      ignoredKeys: [],
    });
  });

  it('validates autoThreshold bounds', () => {
    expect(validateConfigUpdate({ autoThreshold: 1.1 })).toEqual({
      ok: false,
      error: 'autoThreshold must be a finite number between 0 and 1',
    });
    expect(validateConfigUpdate({ autoThreshold: 0.75 })).toEqual({
      ok: true,
      patch: { autoThreshold: 0.75 },
      ignoredKeys: [],
    });
  });

  it('ignores blank secret values', () => {
    expect(validateConfigUpdate({
      compileApiKey: '',
      compileApiBase: 'https://api.example.test/v1',
    })).toEqual({
      ok: true,
      patch: { compileApiBase: 'https://api.example.test/v1' },
      ignoredKeys: ['compileApiKey'],
    });
  });

  it('requires string values for text config', () => {
    expect(validateConfigUpdate({ compileModel: 123 })).toEqual({
      ok: false,
      error: 'config key "compileModel" must be a string',
    });
  });
});
