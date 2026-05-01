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
        description: 'Review source code.',
        conflictGroup: 'skill:review',
        sourcePriority: 0,
      }),
      cap({
        id: 'b',
        kind: 'skill',
        name: 'review',
        origin: 'plugin',
        provider: 'plugin',
        description: 'Review and rewrite source code.',
        conflictGroup: 'skill:review',
        sideEffects: ['writes_files'],
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
    expect(conflicts[0].suggestedAction).toContain('Choose one primary provider');
  });

  it('downgrades equivalent duplicate providers to info', () => {
    const conflicts = detectCapabilityConflicts([
      cap({
        id: 'a',
        kind: 'skill',
        name: 'setup',
        origin: 'local',
        provider: 'local',
        description: 'Route setup requests.',
        conflictGroup: 'skill:setup',
        sourcePriority: 0,
      }),
      cap({
        id: 'b',
        kind: 'skill',
        name: 'setup',
        origin: 'plugin',
        provider: 'plugin',
        description: 'Route setup requests.',
        conflictGroup: 'skill:setup',
        sourcePriority: 10,
      }),
    ]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      group: 'skill:setup',
      winner: 'a',
      suppressed: ['b'],
      severity: 'info',
    });
    expect(conflicts[0].suggestedAction).toContain('No action required');
  });

  it('treats same-name providers with highly similar descriptions as equivalent', () => {
    const conflicts = detectCapabilityConflicts([
      cap({
        id: 'a',
        kind: 'skill',
        name: 'frontend-design',
        origin: 'core',
        provider: 'core',
        description: 'Create distinctive production-grade frontend interfaces with high design quality for web components and pages.',
        sourcePriority: 0,
      }),
      cap({
        id: 'b',
        kind: 'skill',
        name: 'frontend-design',
        origin: 'plugin',
        provider: 'plugin',
        description: 'Create distinctive production-grade frontend interfaces with high design quality for web components and applications.',
        sourcePriority: 10,
      }),
    ]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      group: 'skill:frontend-design',
      severity: 'info',
    });
    expect(conflicts[0].suggestedAction).toContain('No action required');
  });
});
