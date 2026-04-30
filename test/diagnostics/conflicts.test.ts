import { describe, expect, it } from 'vitest';
import { detectCapabilityConflicts, inferCapabilityConflictGroup, inferCapabilityProvider, inferCapabilitySideEffects } from '../../src/diagnostics/conflicts.js';
import type { Capability, RawCapability } from '../../src/types.js';

function raw(overrides: Partial<RawCapability> & Pick<RawCapability, 'kind' | 'name' | 'origin'>): RawCapability {
  return {
    description: '',
    filePath: '/tmp/tool.md',
    compatibility: ['universal'],
    ...overrides,
  };
}

function cap(overrides: Partial<Capability> & Pick<Capability, 'id' | 'kind' | 'name' | 'origin'>): Capability {
  return {
    description: '',
    status: 'installed',
    compatibility: ['universal'],
    tags: [],
    exampleQueries: [],
    category: 'other',
    ...overrides,
  };
}

describe('capability conflict diagnostics', () => {
  it('derives provider, conflict group, and side effects', () => {
    const capability = raw({
      kind: 'skill',
      name: 'Release Manager',
      origin: 'plugin',
      description: 'Publish release, update config, and install hook rollback checks.',
    });

    expect(inferCapabilityProvider(capability)).toBe('plugin');
    expect(inferCapabilityConflictGroup(capability)).toBe('skill:release-manager');
    expect(inferCapabilitySideEffects(capability)).toEqual(expect.arrayContaining(['publishes', 'changes_config', 'installs_hooks']));
  });

  it('reports same conflict group across providers', () => {
    const conflicts = detectCapabilityConflicts([
      cap({
        id: 'a',
        kind: 'skill',
        name: 'review',
        origin: 'core',
        provider: 'core',
        conflictGroup: 'skill:review',
        sourcePriority: 0,
      }),
      cap({
        id: 'b',
        kind: 'skill',
        name: 'review',
        origin: 'plugin',
        provider: 'plugin',
        conflictGroup: 'skill:review',
        sourcePriority: 10,
      }),
    ]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      group: 'skill:review',
      winner: 'a',
      suppressed: ['b'],
      severity: 'warn',
    });
  });
});
