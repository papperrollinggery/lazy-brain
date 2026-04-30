import { describe, expect, it } from 'vitest';
import { classifyCompileError, formatCompileErrorReport, summarizeCompileErrors } from '../../src/compiler/compile-errors.js';

describe('compile error reporting', () => {
  it('classifies structured compiler errors by prefix', () => {
    expect(classifyCompileError('relation_invalid_type:source->target: blocks')).toBe('relation_invalid_type');
    expect(classifyCompileError('plain failure')).toBe('unknown');
  });

  it('summarizes error counts by code', () => {
    const summary = summarizeCompileErrors([
      'relation_invalid_type:a',
      'relation_invalid_type:b',
      'relation_target_missing:c',
    ]);

    expect(summary.total).toBe(3);
    expect(summary.byCode).toEqual({
      relation_invalid_type: 2,
      relation_target_missing: 1,
    });
  });

  it('formats a bounded human-readable report', () => {
    const report = formatCompileErrorReport([
      'relation_invalid_type:a',
      'relation_target_missing:b',
      'relation_parse_failed:c',
    ], 2);

    expect(report).toContain('Persisted compile errors: 3');
    expect(report).toContain('relation_invalid_type: 1');
    expect(report).toContain('First 2 errors');
    expect(report).toContain('... 1 more');
  });
});
