import { describe, it, expect } from 'vitest';
import { aliasMatch } from '../../src/matcher/alias-layer.js';
import type { Capability } from '../../src/types.js';

describe('aliasMatch', () => {
  const mockCapabilities: Capability[] = [
    {
      id: '1',
      kind: 'skill',
      name: 'code-review',
      description: 'Code review',
      origin: 'ECC',
      status: 'installed',
      compatibility: ['claude-code'],
      tags: [],
      exampleQueries: [],
      category: 'code-quality',
    },
    {
      id: '2',
      kind: 'agent',
      name: 'designer',
      description: 'UI/UX Designer',
      origin: 'ECC',
      status: 'installed',
      compatibility: ['claude-code'],
      tags: [],
      exampleQueries: [],
      category: 'design',
    },
  ];

  const aliases = {
    '疯狗模式': 'code-review',
    '设计师': 'designer',
    'review': 'code-review',
  };

  it('matches Chinese alias', () => {
    const result = aliasMatch('开启疯狗模式', aliases, mockCapabilities);
    expect(result).not.toBeNull();
    expect(result!.capability.name).toBe('code-review');
    expect(result!.score).toBe(1.0);
    expect(result!.layer).toBe('alias');
    expect(result!.confidence).toBe('high');
  });

  it('matches English alias', () => {
    const result = aliasMatch('use review', aliases, mockCapabilities);
    expect(result).not.toBeNull();
    expect(result!.capability.name).toBe('code-review');
  });

  it('returns null when no alias matches', () => {
    const result = aliasMatch('something random', aliases, mockCapabilities);
    expect(result).toBeNull();
  });

  it('returns null when alias target not found', () => {
    const badAliases = {
      'test': 'non-existent',
    };
    const result = aliasMatch('test alias', badAliases, mockCapabilities);
    expect(result).toBeNull();
  });

  it('is case insensitive for alias keys', () => {
    const result = aliasMatch('USE REVIEW', aliases, mockCapabilities);
    expect(result).not.toBeNull();
    expect(result!.capability.name).toBe('code-review');
  });
});
