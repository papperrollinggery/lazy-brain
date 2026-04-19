import { describe, expect, it } from 'vitest';
import { runPreflight } from '../../src/governance/preflight.js';
import type { BudgetState } from '../../src/budget/state-machine.js';
import type { UserConfig } from '../../src/types.js';

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

function makeConfig(): UserConfig {
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
    },
  };
}

describe('runPreflight', () => {
  it('returns a GovernanceDecision', () => {
    const result = runPreflight({
      query: '帮我优化代码',
      budgetState: makeBudgetState(),
      config: makeConfig(),
    });
    expect(result.mode).toBeTruthy();
    expect(result.estimatedCostUsd).toBeGreaterThanOrEqual(0);
    expect(result.estimatedInputTokens).toBeGreaterThan(0);
    expect(result.estimatedDurationMinutes).toBeGreaterThan(0);
  });

  it('detects polish goal and sets mode to regular', () => {
    const result = runPreflight({
      query: '润色这段代码',
      budgetState: makeBudgetState(),
      config: makeConfig(),
    });
    expect(result.reasons.some(r => r.includes('polish'))).toBe(true);
    expect(result.mode).toBe('regular');
  });

  it('detects systematize goal and sets mode to ralplan', () => {
    const result = runPreflight({
      query: '设计一个系统架构',
      budgetState: makeBudgetState(),
      config: makeConfig(),
    });
    expect(result.reasons.some(r => r.includes('systematize'))).toBe(true);
    expect(result.mode).toBe('ralplan');
  });

  it('returns haiku plan in survival mode', () => {
    const result = runPreflight({
      query: '写一个函数',
      budgetState: makeBudgetState({ mode: 'survival' }),
      config: makeConfig(),
    });
    expect(result.selectedModelPlan).toBe('haiku');
  });

  it('includes downgrade option when plan is not haiku', () => {
    const result = runPreflight({
      query: '帮我重构',
      budgetState: makeBudgetState(),
      config: makeConfig(),
    });
    expect(result.downgradeOption).toBeDefined();
    expect(result.downgradeOption?.plan).toBe('haiku');
  });

  it('does not include downgrade option when plan is already haiku', () => {
    const result = runPreflight({
      query: '简单润色',
      budgetState: makeBudgetState({ mode: 'survival' }),
      config: makeConfig(),
    });
    expect(result.downgradeOption).toBeUndefined();
  });

  it('sets requiresConfirmation for destructive capability', () => {
    const result = runPreflight({
      query: '删除所有临时文件',
      recommendation: {
        matches: [{
          capability: {
            id: 'destructive-skill',
            kind: 'skill' as const,
            name: 'cleanup',
            description: '',
            origin: 'test',
            status: 'installed' as const,
            compatibility: ['claude-code'],
            tags: [],
            exampleQueries: [],
            category: 'other',
            riskLevel: 'destructive',
          },
          score: 0.9,
          layer: 'tag' as const,
          confidence: 'high' as const,
        }],
        comparisons: [],
        compositions: [],
        upgrades: [],
        external: [],
      },
      budgetState: makeBudgetState(),
      config: makeConfig(),
    });
    expect(result.confirmationLevel).toBe('hard');
  });

  it('team composition sets mode to team', () => {
    const result = runPreflight({
      query: '帮我完成任务',
      teamComposition: {
        members: [
          { agent: { id: 'a', kind: 'agent', name: 'planner', description: '', origin: '', status: 'installed', compatibility: [], tags: [], exampleQueries: [], category: 'planning' }, reason: 'plan', category: 'planning' },
          { agent: { id: 'b', kind: 'agent', name: 'coder', description: '', origin: '', status: 'installed', compatibility: [], tags: [], exampleQueries: [], category: 'development' }, reason: 'execute', category: 'development' },
        ],
        overallReason: 'plan then execute',
        suggestedCommand: '/team',
        omcBridge: { workerType: 'test', workerCount: 2, command: 'team', leadBrief: '' },
      },
      budgetState: makeBudgetState(),
      config: makeConfig(),
    });
    expect(result.mode).toBe('team');
    expect(result.reasons.some(r => r.includes('2 名 agent'))).toBe(true);
  });

  it('returns non-null confirmationLevel for all paths', () => {
    const result = runPreflight({
      query: 'hello world',
      budgetState: makeBudgetState(),
      config: makeConfig(),
    });
    expect(['none', 'soft', 'hard']).toContain(result.confirmationLevel);
  });
});
