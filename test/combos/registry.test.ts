import { describe, expect, test } from 'vitest';
import { COMBOS, findCombo, listCombos } from '../../src/combos/registry.js';

describe('combo registry', () => {
  test('expands to at least twelve complete combos', () => {
    expect(COMBOS.length).toBeGreaterThanOrEqual(12);
    for (const combo of COMBOS) {
      expect(combo.keywords.length).toBeGreaterThan(0);
      expect(combo.negativeKeywords?.length).toBeGreaterThan(0);
      expect(combo.workflow.length).toBeGreaterThan(0);
      expect(combo.guardrails.length).toBeGreaterThan(0);
      expect(combo.verification.length).toBeGreaterThan(0);
      expect(combo.doneWhen.length).toBeGreaterThan(0);
    }
  });

  test('includes sprint three scenarios', () => {
    expect(COMBOS.map((combo) => combo.id)).toEqual(expect.arrayContaining([
      'api_endpoint_build',
      'refactor_safe',
      'new_feature_full',
      'performance_fix',
      'documentation_complete',
      'ci_repair',
      'database_migration_safe',
      'onboarding_new_repo',
    ]));
  });

  test('matches Chinese keywords and respects negative keywords', () => {
    expect(findCombo('帮我新增一个后端接口')?.id).toBe('api_endpoint_build');
    expect(findCombo('copy endpoint')).toBeUndefined();
  });

  test('filters combos by category', () => {
    expect(listCombos('database').map((combo) => combo.id)).toEqual(['database_migration_safe']);
  });
});
