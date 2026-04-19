/**
 * LazyBrain — Policy Engine
 *
 * Phase 3.x: Evaluates GovernanceDecision against user-defined thresholds
 * to produce an actionable policy response.
 */

import type { GovernanceDecision } from '../types.js';
import type { BudgetState } from '../budget/state-machine.js';
import type { UserConfig } from '../types.js';

// ─── Policy Actions ───────────────────────────────────────────────────────────

export type PolicyAction = 'allow' | 'ask' | 'block' | 'downgrade';

/** Result of evaluating a governance decision against policy thresholds */
export interface PolicyResult {
  action: PolicyAction;
  reason: string;
  /** Whether confirmation is required before proceeding */
  requiresConfirmation: boolean;
  /** Severity of the blocking reason (if any) */
  severity: 'info' | 'warn' | 'critical';
}

// ─── Policy Evaluation ─────────────────────────────────────────────────────────

function getGovernanceConfig(config: UserConfig) {
  return config.governance ?? {
    enablePreflight: true,
    softCostUsd: 0.5,
    hardCostUsd: 5.0,
    softTokenThreshold: 50_000,
    hardTokenThreshold: 200_000,
    heavyModes: ['team', 'ralph', 'ralplan'] as const,
  };
}

function isHeavyMode(mode: string, heavyModes: readonly string[]): boolean {
  return heavyModes.includes(mode);
}

/**
 * Evaluate a GovernanceDecision against user-configured thresholds.
 * Returns the action to take: allow, ask, block, or downgrade.
 */
export function evaluatePolicy(
  decision: GovernanceDecision,
  budgetState: BudgetState,
  config: UserConfig,
): PolicyResult {
  const gov = getGovernanceConfig(config);

  if (!gov.enablePreflight) {
    return { action: 'allow', reason: 'preflight disabled', requiresConfirmation: false, severity: 'info' };
  }

  // 1. Check hard cost threshold — block if exceeded
  if (decision.estimatedCostUsd > gov.hardCostUsd) {
    return {
      action: 'block',
      reason: 'estimated cost $' + decision.estimatedCostUsd.toFixed(3) + ' exceeds hard limit $' + gov.hardCostUsd,
      requiresConfirmation: true,
      severity: 'critical',
    };
  }

  // 2. Check hard token threshold — block if exceeded
  const totalTokens = decision.estimatedInputTokens + decision.estimatedOutputTokens;
  if (totalTokens > gov.hardTokenThreshold) {
    return {
      action: 'block',
      reason: `estimated ${totalTokens} tokens exceeds hard limit ${gov.hardTokenThreshold}`,
      requiresConfirmation: true,
      severity: 'critical',
    };
  }

  // 3. Check budget mode — downgrade if in survival/restricted mode
  if (budgetState.mode === 'survival') {
    return {
      action: 'downgrade',
      reason: `budget mode is survival — downgrade to haiku`,
      requiresConfirmation: true,
      severity: 'critical',
    };
  }

  if (budgetState.mode === 'restricted') {
    if (decision.selectedModelPlan !== 'haiku') {
      return {
        action: 'downgrade',
        reason: `budget mode is restricted — recommend haiku over ${decision.selectedModelPlan}`,
        requiresConfirmation: true,
        severity: 'warn',
      };
    }
  }

  // 4. Check soft cost threshold — ask if exceeded
  if (decision.estimatedCostUsd > gov.softCostUsd) {
    return {
      action: 'ask',
      reason: 'estimated cost $' + decision.estimatedCostUsd.toFixed(3) + ' exceeds soft limit $' + gov.softCostUsd,
      requiresConfirmation: false,
      severity: 'warn',
    };
  }

  // 5. Check heavy mode gating — ask for heavy modes
  if (isHeavyMode(decision.mode, gov.heavyModes)) {
    return {
      action: 'ask',
      reason: decision.mode + ' is a heavy mode — confirm before proceeding',
      requiresConfirmation: true,
      severity: 'warn',
    };
  }

  // 6. Check destructive capability risk — ask
  if (decision.requiresConfirmation) {
    return {
      action: 'ask',
      reason: `capability requires confirmation (risk level: destructive)`,
      requiresConfirmation: true,
      severity: 'warn',
    };
  }

  return { action: 'allow', reason: 'all checks passed', requiresConfirmation: false, severity: 'info' };
}

/**
 * Select the best model plan based on budget mode and decision.
 */
export function selectModelPlan(
  current: GovernanceDecision['selectedModelPlan'],
  budgetState: BudgetState,
): GovernanceDecision['selectedModelPlan'] {
  if (budgetState.mode === 'survival' || budgetState.mode === 'restricted') {
    return 'haiku';
  }
  return current;
}

// ─── Governance Context Injection (for hook output) ─────────────────────────────

const HEAVY_MODE_KEYWORDS = ['team', 'ralph', 'ralplan', 'autopilot'] as const;

/**
 * Detect whether a query triggers heavy-mode governance gating.
 */
export function isHeavyModeQuery(query: string): boolean {
  const q = query.toLowerCase();
  return HEAVY_MODE_KEYWORDS.some(kw => q.includes(kw));
}

/**
 * Format a governance injection block for hook output.
 * Returns an empty string if the policy result is 'allow'.
 */
export function formatGovernanceInjection(
  decision: GovernanceDecision,
  policyResult: PolicyResult,
): string {
  if (policyResult.action === 'allow') return '';

  const lines: string[] = [];
  lines.push('## Governance Preflight');
  lines.push('');
  lines.push('| 项目 | 值 |');
  lines.push('|------|------|');
  lines.push('| 执行模式 | ' + decision.mode + ' |');
  lines.push('| 估算 tokens | ' + decision.estimatedInputTokens + ' ~ ' + (decision.estimatedInputTokens + decision.estimatedOutputTokens) + ' |');
  lines.push('| 估算成本 | $' + decision.estimatedCostUsd.toFixed(3) + ' |');
  lines.push('| 推荐模型 | ' + decision.selectedModelPlan + ' |');

  if (policyResult.severity === 'critical') {
    lines.push('');
    lines.push('> **建议**: 先只输出计划（plan-only），不直接进入重执行。确认后再继续。');
    if (decision.downgradeOption) {
      lines.push('> **降级选项**: ' + decision.downgradeOption.plan + '（约 $' + decision.downgradeOption.estimatedCostUsd.toFixed(3) + '）');
    }
  } else if (policyResult.severity === 'warn') {
    lines.push('');
    lines.push('> **提示**: 当前预估成本 $' + decision.estimatedCostUsd.toFixed(3) + '，高于软限制。确认是否继续？');
    if (decision.downgradeOption) {
      lines.push('> **降级选项**: ' + decision.downgradeOption.plan + '（约 $' + decision.downgradeOption.estimatedCostUsd.toFixed(3) + '）');
    }
  }

  return lines.join('\n');
}
