import { describe, expect, it } from 'vitest';
import { getDefaultScanPaths, DEFAULT_GOVERNANCE_CONFIG } from '../src/constants.js';

describe('getDefaultScanPaths', () => {
  it('defaults to Claude paths when no platform filter is provided', () => {
    const paths = getDefaultScanPaths();
    expect(paths.some(path => path.includes('/.claude/'))).toBe(true);
  });

  it('does not include Claude paths when scanning only codex', () => {
    const paths = getDefaultScanPaths({ codex: true });
    expect(paths.some(path => path.includes('/.claude/'))).toBe(false);
    expect(paths.some(path => path.includes('/.codex/'))).toBe(true);
  });

  it('includes multiple explicit platforms without leaking defaults', () => {
    const paths = getDefaultScanPaths({ codex: true, hermes: true });
    expect(paths.some(path => path.includes('/.codex/'))).toBe(true);
    expect(paths.some(path => path.includes('/.hermes/'))).toBe(true);
    expect(paths.some(path => path.includes('/.claude/'))).toBe(false);
  });
});

describe('DEFAULT_GOVERNANCE_CONFIG', () => {
  it('enablePreflight is true by default', () => {
    expect(DEFAULT_GOVERNANCE_CONFIG.enablePreflight).toBe(true);
  });

  it('softCostUsd is less than hardCostUsd', () => {
    expect(DEFAULT_GOVERNANCE_CONFIG.softCostUsd).toBeLessThan(DEFAULT_GOVERNANCE_CONFIG.hardCostUsd);
  });

  it('softTokenThreshold is less than hardTokenThreshold', () => {
    expect(DEFAULT_GOVERNANCE_CONFIG.softTokenThreshold).toBeLessThan(DEFAULT_GOVERNANCE_CONFIG.hardTokenThreshold);
  });

  it('heavyModes includes team, ralph, and ralplan', () => {
    expect(DEFAULT_GOVERNANCE_CONFIG.heavyModes).toContain('team');
    expect(DEFAULT_GOVERNANCE_CONFIG.heavyModes).toContain('ralph');
    expect(DEFAULT_GOVERNANCE_CONFIG.heavyModes).toContain('ralplan');
  });
});
