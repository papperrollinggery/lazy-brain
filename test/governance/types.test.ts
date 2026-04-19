import { describe, expect, it } from 'vitest';
import type {
  Capability,
  GovernanceDecision,
  UserConfig,
  ExecutionMode,
} from '../../src/types.js';

describe('Capability governance fields', () => {
  it('accepts all costLevel values', () => {
    const levels: Capability['costLevel'][] = ['free', 'low', 'medium', 'high'];
    for (const level of levels) {
      const cap: Capability = {
        id: 'test',
        kind: 'skill',
        name: 'test',
        description: 'test',
        origin: 'test',
        status: 'installed',
        compatibility: ['claude-code'],
        tags: [],
        exampleQueries: [],
        category: 'other',
        costLevel: level,
      };
      expect(cap.costLevel).toBe(level);
    }
  });

  it('accepts all riskLevel values', () => {
    const levels: Capability['riskLevel'][] = ['safe', 'caution', 'destructive'];
    for (const level of levels) {
      const cap: Capability = {
        id: 'test',
        kind: 'skill',
        name: 'test',
        description: 'test',
        origin: 'test',
        status: 'installed',
        compatibility: ['claude-code'],
        tags: [],
        exampleQueries: [],
        category: 'other',
        riskLevel: level,
      };
      expect(cap.riskLevel).toBe(level);
    }
  });

  it('accepts all governance boolean flags', () => {
    const cap: Capability = {
      id: 'test',
      kind: 'skill',
      name: 'test',
      description: 'test',
      origin: 'test',
      status: 'installed',
      compatibility: ['claude-code'],
      tags: [],
      exampleQueries: [],
      category: 'other',
      requiresConfirmation: true,
      hiddenByDefault: false,
      sourcePriority: 0,
      overlapsWith: ['similar-skill'],
    };
    expect(cap.requiresConfirmation).toBe(true);
    expect(cap.hiddenByDefault).toBe(false);
    expect(cap.sourcePriority).toBe(0);
    expect(cap.overlapsWith).toEqual(['similar-skill']);
  });

  it('allows all fields to be optional (backward compatibility)', () => {
    const cap: Capability = {
      id: 'test',
      kind: 'skill',
      name: 'test',
      description: 'test',
      origin: 'test',
      status: 'installed',
      compatibility: ['claude-code'],
      tags: [],
      exampleQueries: [],
      category: 'other',
    };
    expect(cap.costLevel).toBeUndefined();
    expect(cap.riskLevel).toBeUndefined();
    expect(cap.requiresConfirmation).toBeUndefined();
    expect(cap.hiddenByDefault).toBeUndefined();
    expect(cap.sourcePriority).toBeUndefined();
    expect(cap.overlapsWith).toBeUndefined();
  });
});

describe('GovernanceDecision', () => {
  it('accepts valid decision with all fields', () => {
    const decision: GovernanceDecision = {
      mode: 'regular',
      requiresConfirmation: false,
      confirmationLevel: 'none',
      estimatedInputTokens: 5000,
      estimatedOutputTokens: 3000,
      estimatedCostUsd: 0.05,
      estimatedDurationMinutes: 2,
      selectedModelPlan: 'sonnet',
      reasons: ['simple task', 'clear intent'],
      downgradeOption: {
        plan: 'haiku',
        estimatedCostUsd: 0.01,
        tradeoffs: 'may miss nuanced reasoning',
      },
    };
    expect(decision.mode).toBe('regular');
    expect(decision.downgradeOption?.plan).toBe('haiku');
  });

  it('accepts hard confirmation for destructive risk', () => {
    const decision: GovernanceDecision = {
      mode: 'ralph',
      requiresConfirmation: true,
      confirmationLevel: 'hard',
      estimatedInputTokens: 80_000,
      estimatedOutputTokens: 60_000,
      estimatedCostUsd: 3.5,
      estimatedDurationMinutes: 30,
      selectedModelPlan: 'opus',
      reasons: ['complex multi-step task'],
    };
    expect(decision.confirmationLevel).toBe('hard');
    expect(decision.requiresConfirmation).toBe(true);
  });

  it('accepts all execution modes', () => {
    const modes: ExecutionMode[] = ['regular', 'ralplan', 'team', 'ralph'];
    for (const mode of modes) {
      const decision: GovernanceDecision = {
        mode,
        requiresConfirmation: false,
        confirmationLevel: 'none',
        estimatedInputTokens: 0,
        estimatedOutputTokens: 0,
        estimatedCostUsd: 0,
        estimatedDurationMinutes: 1,
        selectedModelPlan: 'sonnet',
        reasons: [],
      };
      expect(decision.mode).toBe(mode);
    }
  });

  it('downgradeOption is optional', () => {
    const decision: GovernanceDecision = {
      mode: 'regular',
      requiresConfirmation: false,
      confirmationLevel: 'none',
      estimatedInputTokens: 1000,
      estimatedOutputTokens: 500,
      estimatedCostUsd: 0.01,
      estimatedDurationMinutes: 1,
      selectedModelPlan: 'haiku',
      reasons: [],
    };
    expect(decision.downgradeOption).toBeUndefined();
  });
});

describe('UserConfig.governance', () => {
  it('governance section is optional', () => {
    const config: UserConfig = {
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
    };
    expect(config.governance).toBeUndefined();
  });

  it('accepts full governance config', () => {
    const config: UserConfig = {
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
        heavyModes: ['team', 'ralph'],
      },
    };
    expect(config.governance?.enablePreflight).toBe(true);
    expect(config.governance?.hardCostUsd).toBe(5.0);
    expect(config.governance?.heavyModes).toContain('team');
  });

  it('heavyModes accepts all execution modes', () => {
    const config: UserConfig = {
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
        enablePreflight: false,
        softCostUsd: 0.1,
        hardCostUsd: 1.0,
        softTokenThreshold: 10_000,
        hardTokenThreshold: 100_000,
        heavyModes: ['regular', 'ralplan', 'team', 'ralph'],
      },
    };
    expect(config.governance?.heavyModes.length).toBe(4);
  });
});
