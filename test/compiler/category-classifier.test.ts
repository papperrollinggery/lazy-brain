import { describe, it, expect } from 'vitest';
import { classifyCategory } from '../../src/compiler/category-classifier.js';

describe('classifyCategory', () => {
  it('classifies code review as code-quality', () => {
    const cap = {
      kind: 'skill' as const,
      name: 'code-review',
      description: 'Comprehensive code review tool for PRs',
      origin: 'ECC',
      filePath: '/test/SKILL.md',
      compatibility: ['claude-code'] as const,
    };
    expect(classifyCategory(cap)).toBe('code-quality');
  });

  it('classifies testing tools', () => {
    const cap = {
      kind: 'skill' as const,
      name: 'tdd-workflow',
      description: 'Test-driven development workflow',
      origin: 'ECC',
      filePath: '/test/SKILL.md',
      compatibility: ['claude-code'] as const,
    };
    expect(classifyCategory(cap)).toBe('testing');
  });

  it('classifies design tools', () => {
    const cap = {
      kind: 'skill' as const,
      name: 'ui-design',
      description: 'Create UI design with CSS layouts',
      origin: 'ECC',
      filePath: '/test/SKILL.md',
      compatibility: ['claude-code'] as const,
    };
    expect(classifyCategory(cap)).toBe('design');
  });

  it('classifies deployment tools', () => {
    const cap = {
      kind: 'skill' as const,
      name: 'ci-cd-deploy',
      description: 'Deploy with GitHub Actions CI/CD',
      origin: 'ECC',
      filePath: '/test/SKILL.md',
      compatibility: ['claude-code'] as const,
    };
    expect(classifyCategory(cap)).toBe('deployment');
  });

  it('returns other for unknown categories', () => {
    const cap = {
      kind: 'skill' as const,
      name: 'unknown-tool',
      description: 'A completely generic tool',
      origin: 'ECC',
      filePath: '/test/SKILL.md',
      compatibility: ['claude-code'] as const,
    };
    expect(classifyCategory(cap)).toBe('other');
  });

  it('classifies Chinese keywords', () => {
    const cap = {
      kind: 'skill' as const,
      name: '代码审查',
      description: '代码审查工具',
      origin: 'ECC',
      filePath: '/test/SKILL.md',
      compatibility: ['claude-code'] as const,
    };
    expect(classifyCategory(cap)).toBe('code-quality');
  });
});
