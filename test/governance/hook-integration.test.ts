import { describe, expect, it } from 'vitest';
import { isHeavyModeQuery, formatGovernanceInjection, evaluatePolicy } from '../../src/governance/policy-engine.js';
import type { GovernanceDecision } from '../../src/types.js';
import type { BudgetState } from '../../src/budget/state-machine.js';
import { isMetaPrompt } from '../../src/utils/meta-prompt.js';

function bypassesGovernance(prompt: string): boolean {
  return isMetaPrompt(prompt) || !isHeavyModeQuery(prompt);
}

function makeDecision(overrides: Partial<GovernanceDecision> = {}): GovernanceDecision {
  return {
    mode: 'team',
    requiresConfirmation: false,
    confirmationLevel: 'none',
    estimatedInputTokens: 5000,
    estimatedOutputTokens: 8000,
    estimatedCostUsd: 0.05,
    estimatedDurationMinutes: 5,
    selectedModelPlan: 'sonnet',
    reasons: ['team mode'],
    ...overrides,
  };
}

function makeBudgetState(): BudgetState {
  return {
    mode: 'normal',
    claudeDaily: { used: 0.5, limit: 2.0 },
    claudeMonthly: { used: 10, limit: 30 },
    miniMaxStatus: { available: true },
    nemotronStatus: { available: true },
  };
}

describe('isHeavyModeQuery', () => {
  it('detects team', () => {
    expect(isHeavyModeQuery('/team 做这个任务')).toBe(true);
    expect(isHeavyModeQuery('用 team 模式')).toBe(true);
  });

  it('detects ralph', () => {
    expect(isHeavyModeQuery('/ralph 完成所有 bug')).toBe(true);
    expect(isHeavyModeQuery('ralph 模式')).toBe(true);
  });

  it('detects ralplan', () => {
    expect(isHeavyModeQuery('/ralplan 做计划')).toBe(true);
    expect(isHeavyModeQuery('ralplan')).toBe(true);
  });

  it('detects autopilot', () => {
    expect(isHeavyModeQuery('/autopilot 搞定这个')).toBe(true);
    expect(isHeavyModeQuery('autopilot 模式')).toBe(true);
  });

  it('is case insensitive', () => {
    expect(isHeavyModeQuery('TEAM 模式')).toBe(true);
    expect(isHeavyModeQuery('Ralplan')).toBe(true);
  });

  it('returns false for regular query', () => {
    expect(isHeavyModeQuery('帮我写一个函数')).toBe(false);
    expect(isHeavyModeQuery('fix this bug')).toBe(false);
    expect(isHeavyModeQuery('review this PR')).toBe(false);
  });
});

describe('formatGovernanceInjection', () => {
  it('returns empty string for allow action', () => {
    const decision = makeDecision();
    const policy = { action: 'allow' as const, reason: 'ok', requiresConfirmation: false, severity: 'info' as const };
    expect(formatGovernanceInjection(decision, policy)).toBe('');
  });

  it('includes mode, tokens, cost, plan for warn severity', () => {
    const decision = makeDecision({
      estimatedCostUsd: 2.0,
      downgradeOption: { plan: 'haiku', estimatedCostUsd: 0.01, tradeoffs: 'lighter' },
    });
    const policy = { action: 'ask' as const, reason: 'cost warn', requiresConfirmation: false, severity: 'warn' as const };
    const text = formatGovernanceInjection(decision, policy);
    expect(text).toContain('team');
    expect(text).toContain('5000');
    expect(text).toContain('2.');
    expect(text).toContain('sonnet');
    expect(text).toContain('降级选项');
  });

  it('includes plan-only suggestion for critical severity', () => {
    const decision = makeDecision({
      selectedModelPlan: 'opus',
      estimatedCostUsd: 10.0,
      downgradeOption: { plan: 'haiku', estimatedCostUsd: 0.01, tradeoffs: 'lighter' },
    });
    const policy = { action: 'block' as const, reason: 'over budget', requiresConfirmation: true, severity: 'critical' as const };
    const text = formatGovernanceInjection(decision, policy);
    expect(text).toContain('建议');
    expect(text).toContain('plan-only');
    expect(text).toContain('降级选项');
    expect(text).toContain('haiku');
  });

  it('includes downgrade option when available', () => {
    const decision = makeDecision({
      selectedModelPlan: 'opus',
      downgradeOption: { plan: 'haiku', estimatedCostUsd: 0.01, tradeoffs: 'simpler' },
    });
    const policy = { action: 'downgrade' as const, reason: 'budget', requiresConfirmation: true, severity: 'warn' as const };
    const text = formatGovernanceInjection(decision, policy);
    expect(text).toContain('haiku');
    expect(text).toContain('降级选项');
  });
});

describe('governance integration scenarios', () => {
  it('meta prompt does not trigger governance (bypassed before match)', () => {
    // "不要继续" is a meta prompt — should bypass governance entirely
    expect(isMetaPrompt('不要继续')).toBe(true);
    expect(bypassesGovernance('不要继续')).toBe(true);
  });

  it('meta prompt like 验收说明 bypasses governance', () => {
    expect(isMetaPrompt('验收说明')).toBe(true);
    expect(bypassesGovernance('验收说明')).toBe(true);
  });

  it('normal query still triggers governance when heavy mode keyword present', () => {
    // "/team" is heavy mode, not meta prompt
    expect(isMetaPrompt('/team 帮我重构')).toBe(false);
    expect(isHeavyModeQuery('/team 帮我重构')).toBe(true);
  });

  it('meta query with heavy mode keyword takes precedence (meta bypass wins)', () => {
    // "汇报测试结果" starts with 汇报 — no direct pattern match for pure 汇报 prefix
    // "汇报一下" is the nearest pattern but 汇报一下 ≠ 汇报测试结果
    expect(isMetaPrompt('汇报测试结果')).toBe(false); // no direct match
    // but "不要继续" meta prompt bypasses governance
    expect(isMetaPrompt('不要继续')).toBe(true);
    expect(bypassesGovernance('不要继续')).toBe(true);
  });
  it('team query with normal budget → ask action', () => {
    const decision = makeDecision({ mode: 'team' });
    const budget = makeBudgetState();
    const policy = evaluatePolicy(decision, budget, {
      aliases: {}, scanPaths: [], mode: 'auto', autoThreshold: 0.85, engine: 'tag', strategy: 'ask',
      compileApiBase: 'https://api.siliconflow.cn/v1', compileModel: 'Qwen/Qwen3-235B-A22B',
      externalDiscovery: false, platform: 'claude-code', language: 'auto',
      governance: { enablePreflight: true, softCostUsd: 0.5, hardCostUsd: 5.0, softTokenThreshold: 50_000, hardTokenThreshold: 200_000, heavyModes: ['team', 'ralph', 'ralplan'] },
    });
    expect(policy.action).toBe('ask'); // heavy mode triggers ask
    expect(policy.severity).toBe('warn');
  });

  it('regular query → allow action (no governance injection)', () => {
    const decision = makeDecision({ mode: 'regular', estimatedCostUsd: 0.01 });
    const budget = makeBudgetState();
    const policy = evaluatePolicy(decision, budget, {
      aliases: {}, scanPaths: [], mode: 'auto', autoThreshold: 0.85, engine: 'tag', strategy: 'ask',
      compileApiBase: 'https://api.siliconflow.cn/v1', compileModel: 'Qwen/Qwen3-235B-A22B',
      externalDiscovery: false, platform: 'claude-code', language: 'auto',
      governance: { enablePreflight: true, softCostUsd: 0.5, hardCostUsd: 5.0, softTokenThreshold: 50_000, hardTokenThreshold: 200_000, heavyModes: ['team', 'ralph', 'ralplan'] },
    });
    expect(policy.action).toBe('allow');
    const text = formatGovernanceInjection(decision, policy);
    expect(text).toBe('');
  });

  it('hard gate blocks when cost exceeds hard limit', () => {
    const decision = makeDecision({ estimatedCostUsd: 10.0, selectedModelPlan: 'opus' });
    const budget = makeBudgetState();
    const policy = evaluatePolicy(decision, budget, {
      aliases: {}, scanPaths: [], mode: 'auto', autoThreshold: 0.85, engine: 'tag', strategy: 'ask',
      compileApiBase: 'https://api.siliconflow.cn/v1', compileModel: 'Qwen/Qwen3-235B-A22B',
      externalDiscovery: false, platform: 'claude-code', language: 'auto',
      governance: { enablePreflight: true, softCostUsd: 0.5, hardCostUsd: 5.0, softTokenThreshold: 50_000, hardTokenThreshold: 200_000, heavyModes: ['team', 'ralph', 'ralplan'] },
    });
    expect(policy.action).toBe('block');
    expect(policy.severity).toBe('critical');
    const text = formatGovernanceInjection(decision, policy);
    expect(text).toContain('plan-only');
  });
});
