import { describe, expect, it } from 'vitest';
import { redactPromptForStorage, sanitizePromptRecord } from '../../src/privacy/prompts.js';

describe('prompt privacy helpers', () => {
  it('redacts raw prompts into stable hash labels', () => {
    const privatePath = ['', 'Users', 'me', 'project'].join('/');
    const first = redactPromptForStorage(`review private repo path ${privatePath}`);
    const second = redactPromptForStorage(`review private repo path ${privatePath}`);

    expect(first.query).toMatch(/^\[redacted-prompt:[a-f0-9]{16}\]$/);
    expect(first.queryHash).toBe(second.queryHash);
    expect(JSON.stringify(first)).not.toContain(privatePath);
  });

  it('sanitizes legacy query records on read', () => {
    const record = sanitizePromptRecord({ query: 'raw private prompt', matched: 'tool-a' });

    expect(record.query).toMatch(/^\[redacted-prompt:[a-f0-9]{16}\]$/);
    expect(record).toHaveProperty('queryHash');
    expect(JSON.stringify(record)).not.toContain('raw private prompt');
  });
});
