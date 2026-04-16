/**
 * LazyBrain — Token Estimation
 *
 * Heuristic token estimation for Proposal A/B/C.
 * Not precise — provides rough cost awareness to help user decisions.
 *
 * Note: True token tracking requires post-execution analysis (usage.jsonl).
 * These estimates are ballpark figures derived from prompt length and
 * historical usage patterns, not accurate predictions.
 */

import { loadUsageEntries } from '../history/usage.js';
import { COST_PER_1M } from '../history/usage.js';

const CHARS_PER_TOKEN = 4; // Chinese roughly 1-2 chars/token, English ~4

/** Opus baseline cost per 1M tokens (most expensive) */
const OPUS_INPUT = 15.0;
const OPUS_OUTPUT = 75.0;

/** Estimate tokens from a string */
function estimateFromString(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Per-task overhead tokens (task description + reasoning) */
const TASK_OVERHEAD = 150;

/**
 * Estimate input tokens for a prompt + N tasks.
 */
export function estimateInputTokens(prompt: string, taskCount = 1): number {
  const promptTokens = estimateFromString(prompt);
  return promptTokens + taskCount * TASK_OVERHEAD;
}

/**
 * Estimate output tokens for a given model tier.
 */
export function estimateOutputTokens(taskCount: number, model: 'sonnet' | 'haiku' | 'opus'): number {
  const base = taskCount * 200;
  const multipliers = { opus: 1.5, sonnet: 1.0, haiku: 0.5 };
  return Math.round(base * multipliers[model]);
}

/**
 * Estimate USD cost for a given token count + model tier.
 */
export function estimateCost(inputTokens: number, outputTokens: number, model: 'sonnet' | 'haiku' | 'opus'): number {
  const rates = COST_PER_1M[model] ?? COST_PER_1M['sonnet'];
  const cost = (inputTokens / 1_000_000) * rates.input
    + (outputTokens / 1_000_000) * rates.output;
  return Math.round(cost * 1000) / 1000;
}

/** Opus baseline estimate for same prompt */
function opusEstimate(prompt: string, tasks = 1): number {
  const input = estimateInputTokens(prompt, tasks);
  const output = estimateOutputTokens(tasks, 'opus');
  return estimateCost(input, output, 'opus');
}

/**
 * Generate A/B/C proposals for a given prompt and match score.
 *
 * A = Direct sonnet (fast, no agent overhead)
 * B = Agent composition (分解执行，省 Opus token)
 * C = Haiku lightweight (最便宜，简单任务)
 */
export function generateProposals(
  prompt: string,
  matchConfidence: number,
): import('../types.js').ProposalOption[] {
  const taskCount = 1; // baseline

  // Proposal A: Direct Sonnet
  const aInput = estimateInputTokens(prompt, taskCount);
  const aOutput = estimateOutputTokens(taskCount, 'sonnet');
  const aCost = estimateCost(aInput, aOutput, 'sonnet');
  const aOpus = opusEstimate(prompt, taskCount);
  const aSavings = aOpus > 0 ? Math.round((1 - aCost / aOpus) * 100) / 100 : 0;
  // Proposal A savings are relative to Opus baseline (the "no optimization" path).
  // Proposal A label shows "主模型直推" meaning Sonnet direct — savings vs Opus baseline.

  // Proposal B: Agent composition — derive complexity from query signals, not matchConfidence
  const queryLen = prompt.length;
  const isComplex = /\b(规划|设计|完整|全面|系统|多步骤|分解|架构|审查|优化|重构)\b/.test(prompt) || queryLen > 60;
  const bSavings = isComplex ? 0.3 : 0.15;
  const bLabel = isComplex ? 'Agent 组合' : 'Agent 辅助';
  const bReason = isComplex
    ? '复杂任务，分解执行可节省约 30% Opus token'
    : '多步骤任务，agent 分解可提高准确性';

  // Proposal C: Haiku lightweight (haiku model pricing, same task scope as A)
  const cInput = estimateInputTokens(prompt, taskCount);
  const cOutput = estimateOutputTokens(taskCount, 'haiku');
  const cCost = estimateCost(cInput, cOutput, 'haiku');
  const cSavings = aOpus > 0 ? Math.round((1 - cCost / aOpus) * 100) / 100 : 0;

  return [
    {
      id: 'A',
      label: '主模型直推',
      model: 'sonnet',
      estimatedTokens: aInput + aOutput,
      savings: aSavings,
      reason: `简单任务，主模型足够快，节省 ${Math.round(aSavings * 100)}%`,
    },
    {
      id: 'B',
      label: bLabel,
      model: 'sonnet+haiku',
      estimatedTokens: Math.round((aInput + aOutput) * 0.6),
      savings: bSavings,
      reason: bReason,
    },
    {
      id: 'C',
      label: 'Haiku 轻量',
      model: 'haiku',
      estimatedTokens: cInput + cOutput,
      savings: cSavings,
      reason: `haiku 模型，节省 ${Math.round(cSavings * 100)}% vs Opus 基线`,
    },
  ];
}
