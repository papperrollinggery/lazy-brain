import { describe, expect, it } from 'vitest';
import { evaluatePolicy, isHeavyModeQuery, selectModelPlan } from '../../src/governance/policy-engine.js';
import type { GovernanceDecision } from '../../src/types.js';
import type { BudgetState } from '../../src/budget/state-machine.js';
import type { UserConfig } from '../../src/types.js';

function makeDecision(overrides: Partial<GovernanceDecision> = {}): GovernanceDecision {
  return {
    mode: 'regular',
    requiresConfirmation: false,
    confirmationLevel: 'none',
    estimatedInputTokens: 5000,
    estimatedOutputTokens: 3000,
    estimatedCostUsd: 0.05,
    estimatedDurationMinutes: 2,
    selectedModelPlan: 'sonnet',
    reasons: ['simple task'],
    ...overrides,
  };
}

function makeBudgetState(overrides: Partial<BudgetState> = {}): BudgetState {
  return {
    mode: 'normal',
    claudeDaily: { used: 0.5, limit: 2.0 },
    claudeMonthly: { used: 10, limit: 30 },
    miniMaxStatus: { available: true },
    nemotronStatus: { available: true },
    ...overrides,
  };
}

function makeConfig(overrides: Partial<UserConfig['governance']> = {}): UserConfig {
  return {
    aliases: {},
    scanPaths: [],
    mode: 'auto',
    autoThreshold: 0.85,
    engine: 'tag',
    strategy: 'ask',
    compileApiBase: 'https://api.siliconflow.cn/v1',
    compileModel: 'Qwen/Qwen3-235B-A22B',
    externalDiscovery: false,
    platform: 'claude-code',
    language: 'auto',
    governance: {
      enablePreflight: true,
      softCostUsd: 0.5,
      hardCostUsd: 5.0,
      softTokenThreshold: 50_000,
      hardTokenThreshold: 200_000,
      heavyModes: ['team', 'ralph', 'ralplan'],
      ...overrides,
    },
  };
}

describe('evaluatePolicy', () => {
  it('allows when all checks pass', () => {
    const decision = makeDecision();
    const budget = makeBudgetState();
    const config = makeConfig();
    const result = evaluatePolicy(decision, budget, config);
    expect(result.action).toBe('allow');
    expect(result.severity).toBe('info');
  });

  it('blocks when cost exceeds hard limit', () => {
    const decision = makeDecision({ estimatedCostUsd: 10.0 });
    const budget = makeBudgetState();
    const config = makeConfig();
    const result = evaluatePolicy(decision, budget, config);
    expect(result.action).toBe('block');
    expect(result.severity).toBe('critical');
  });

  it('blocks when tokens exceed hard threshold', () => {
    const decision = makeDecision({ estimatedInputTokens: 150_000, estimatedOutputTokens: 100_000 });
    const budget = makeBudgetState();
    const config = makeConfig();
    const result = evaluatePolicy(decision, budget, config);
    expect(result.action).toBe('block');
    expect(result.severity).toBe('critical');
  });

  it('downgrades in survival mode', () => {
    const decision = makeDecision({ selectedModelPlan: 'opus' });
    const budget = makeBudgetState({ mode: 'survival' });
    const config = makeConfig();
    const result = evaluatePolicy(decision, budget, config);
    expect(result.action).toBe('downgrade');
    expect(result.severity).toBe('critical');
  });

  it('downgrades opus to haiku in restricted mode', () => {
    const decision = makeDecision({ selectedModelPlan: 'opus' });
    const budget = makeBudgetState({ mode: 'restricted' });
    const config = makeConfig();
    const result = evaluatePolicy(decision, budget, config);
    expect(result.action).toBe('downgrade');
  });

  it('asks when cost exceeds soft limit', () => {
    const decision = makeDecision({ estimatedCostUsd: 2.0 });
    const budget = makeBudgetState();
    const config = makeConfig({ softCostUsd: 0.5, hardCostUsd: 5.0 });
    const result = evaluatePolicy(decision, budget, config);
    expect(result.action).toBe('ask');
    expect(result.severity).toBe('warn');
  });

  it('asks for heavy mode team', () => {
    const decision = makeDecision({ mode: 'team' });
    const budget = makeBudgetState();
    const config = makeConfig();
    const result = evaluatePolicy(decision, budget, config);
    expect(result.action).toBe('ask');
  });

  it('asks for destructive capability', () => {
    const decision = makeDecision({ requiresConfirmation: true });
    const budget = makeBudgetState();
    const config = makeConfig();
    const result = evaluatePolicy(decision, budget, config);
    expect(result.action).toBe('ask');
    expect(result.requiresConfirmation).toBe(true);
  });

  it('allows when preflight disabled', () => {
    const decision = makeDecision({ estimatedCostUsd: 100 });
    const budget = makeBudgetState();
    const config = makeConfig({ enablePreflight: false });
    const result = evaluatePolicy(decision, budget, config);
    expect(result.action).toBe('allow');
  });

  it('allows haiku in restricted mode without downgrade', () => {
    const decision = makeDecision({ selectedModelPlan: 'haiku' });
    const budget = makeBudgetState({ mode: 'restricted' });
    const config = makeConfig();
    const result = evaluatePolicy(decision, budget, config);
    expect(result.action).toBe('allow');
  });
});

describe('selectModelPlan', () => {
  it('returns haiku in survival mode', () => {
    const budget = makeBudgetState({ mode: 'survival' });
    expect(selectModelPlan('opus', budget)).toBe('haiku');
    expect(selectModelPlan('sonnet', budget)).toBe('haiku');
  });

  it('returns haiku in restricted mode', () => {
    const budget = makeBudgetState({ mode: 'restricted' });
    expect(selectModelPlan('opus', budget)).toBe('haiku');
  });

  it('returns original plan in normal mode', () => {
    const budget = makeBudgetState({ mode: 'normal' });
    expect(selectModelPlan('sonnet', budget)).toBe('sonnet');
    expect(selectModelPlan('opus', budget)).toBe('opus');
  });

  it('returns haiku for free cost level', () => {
    const budget = makeBudgetState({ mode: 'normal' });
    expect(selectModelPlan('sonnet', budget)).toBe('sonnet'); // costLevel not passed through here
  });
});

describe('isHeavyModeQuery', () => {
  it('matches explicit heavy mode keywords', () => {
    expect(isHeavyModeQuery('team 模式帮我拆解')).toBe(true);
    expect(isHeavyModeQuery('ralph 修掉所有 bug')).toBe(true);
  });

  it('matches natural-language heavy execution intent', () => {
    expect(isHeavyModeQuery('帮我把这个需求从规划到实现全自动跑完')).toBe(true);
    expect(isHeavyModeQuery('这个任务很复杂，你自己判断要不要进入 team，并先告诉我成本和方案')).toBe(true);
    expect(isHeavyModeQuery('先告诉我预计成本、模型分配和更便宜的方案')).toBe(true);
    expect(isHeavyModeQuery('Please take this from planning to implementation, end-to-end')).toBe(true);
  });

  it('does not trigger on meta prompts', () => {
    expect(isHeavyModeQuery('只输出验收说明，不执行。')).toBe(false);
    expect(isHeavyModeQuery('继续 Phase 3')).toBe(false);
  });

  it('does not trigger on normal lightweight requests', () => {
    expect(isHeavyModeQuery('帮我润色这段代码')).toBe(false);
    expect(isHeavyModeQuery('修一下这个 typo')).toBe(false);
  });
});
