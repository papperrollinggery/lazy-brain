/**
 * LazyBrain — Preflight Check
 *
 * Phase 3.x: Runs pre-execution checks and produces a GovernanceDecision.
 * Combines token estimation, budget state, and capability governance fields.
 */

import type { GovernanceDecision, Recommendation, UserConfig, ExecutionMode } from '../types.js';
import type { BudgetState } from '../budget/state-machine.js';
import type { TeamComposition } from '../matcher/team-recommender.js';
import { estimateInputTokens, estimateOutputTokens, estimateCost } from '../utils/token-estimate.js';
import { detectGoal } from './user-goals.js';
import type { GoalType } from './user-goals.js';

// ─── Model Plan ───────────────────────────────────────────────────────────────

type ModelPlan = Exclude<GovernanceDecision['selectedModelPlan'], 'custom'>;

// ─── Helper ───────────────────────────────────────────────────────────────────

function selectDefaultPlan(budgetState: BudgetState, costLevel?: string): ModelPlan {
  if (budgetState.mode === 'survival') return 'haiku';
  if (budgetState.mode === 'restricted') return 'sonnet';
  if (costLevel === 'free') return 'haiku';
  if (costLevel === 'low') return 'haiku';
  return 'sonnet';
}

function estimateDuration(inputTokens: number, outputTokens: number, plan: ModelPlan): number {
  // Rough estimate: ~100 tokens/sec for sonnet/opus, ~200 tokens/sec for haiku
  const throughput = plan === 'haiku' ? 200 : 100;
  const totalSeconds = (inputTokens + outputTokens) / throughput;
  return Math.max(1, Math.round(totalSeconds / 60));
}

function buildReasons(
  query: string,
  goal: GoalType | null,
  plan: ModelPlan,
  teamComposition: TeamComposition | null,
): string[] {
  const reasons: string[] = [];
  if (goal) reasons.push(`目标: ${goal}`);
  if (teamComposition) reasons.push(`${teamComposition.members.length} 名 agent 协作`);
  reasons.push(`模型: ${plan}`);
  if (teamComposition?.overallReason) reasons.push(teamComposition.overallReason.slice(0, 60));
  return reasons;
}

function buildDowngradeOption(decision: GovernanceDecision): GovernanceDecision['downgradeOption'] | undefined {
  if (decision.selectedModelPlan === 'haiku') return undefined;
  const haikuCost = estimateCost(decision.estimatedInputTokens, decision.estimatedOutputTokens, 'haiku');
  return {
    plan: 'haiku',
    estimatedCostUsd: haikuCost,
    tradeoffs: 'haiku 速度更快但推理深度有限，适用于简单或探索性任务',
  };
}

// ─── Confirmation Level ───────────────────────────────────────────────────────

function getConfirmationLevel(
  requiresConfirmation?: boolean,
  costUsd?: number,
  riskLevel?: string,
): GovernanceDecision['confirmationLevel'] {
  if (riskLevel === 'destructive') return 'hard';
  if (requiresConfirmation) return 'soft';
  if ((costUsd ?? 0) > 1.0) return 'soft';
  return 'none';
}

// ─── Main Preflight ────────────────────────────────────────────────────────────

export interface PreflightOptions {
  query: string;
  recommendation?: Recommendation | null;
  teamComposition?: TeamComposition | null;
  budgetState: BudgetState;
  config: UserConfig;
}

/**
 * Run preflight checks and produce a GovernanceDecision.
 *
 * Uses existing token-estimate and budget-state for rough estimation.
 * Does NOT call any external APIs — fully synchronous.
 */
export function runPreflight(opts: PreflightOptions): GovernanceDecision {
  const { query, recommendation, teamComposition, budgetState } = opts;

  // 1. Detect goal
  const goal = detectGoal(query);
  const goalType: GoalType | null = goal?.goal ?? null;

  // 2. Estimate tokens
  const topMatch = recommendation?.matches[0];
  const taskCount = teamComposition ? teamComposition.members.length : 1;
  const inputTokens = estimateInputTokens(query, taskCount);
  const outputTokens = estimateOutputTokens(taskCount, 'sonnet');

  // 3. Determine model plan
  const costLevel = topMatch?.capability.costLevel;
  const plan: ModelPlan = selectDefaultPlan(budgetState, costLevel);
  const finalInputTokens = estimateInputTokens(query, taskCount);
  const finalOutputTokens = estimateOutputTokens(taskCount, plan);
  const costUsd = estimateCost(finalInputTokens, finalOutputTokens, plan);

  // 4. Determine execution mode
  let mode: ExecutionMode = 'regular';
  if (teamComposition && teamComposition.members.length > 1) {
    mode = 'team';
  } else if (goal?.needsPlanning) {
    mode = 'ralplan';
  } else if (recommendation?.decisionHint?.type === 'complex_impl') {
    mode = 'ralplan';
  }

  // 5. Determine confirmation requirements
  const requiresConfirmation = topMatch?.capability.requiresConfirmation ?? false;
  const riskLevel = topMatch?.capability.riskLevel;
  const confirmationLevel = getConfirmationLevel(requiresConfirmation, costUsd, riskLevel);

  // 6. Build reasons
  const reasons = buildReasons(query, goalType, plan, teamComposition ?? null);

  // 7. Downgrade option
  const downgradeOption = buildDowngradeOption({
    mode,
    requiresConfirmation,
    confirmationLevel,
    estimatedInputTokens: finalInputTokens,
    estimatedOutputTokens: finalOutputTokens,
    estimatedCostUsd: costUsd,
    estimatedDurationMinutes: estimateDuration(finalInputTokens, finalOutputTokens, plan),
    selectedModelPlan: plan,
    reasons,
  });

  return {
    mode,
    requiresConfirmation,
    confirmationLevel,
    estimatedInputTokens: finalInputTokens,
    estimatedOutputTokens: finalOutputTokens,
    estimatedCostUsd: costUsd,
    estimatedDurationMinutes: estimateDuration(finalInputTokens, finalOutputTokens, plan),
    selectedModelPlan: plan,
    reasons,
    downgradeOption,
  };
}
