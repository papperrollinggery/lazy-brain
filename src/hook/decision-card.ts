/**
 * LazyBrain — Decision Card (LAZ-40)
 * Formats matcher results into user-readable Decision Cards.
 */

import type { MatchResult, ProposalOption } from '../types.js';

export const DECISION_CARD_DIVIDER = '━━━ 分隔 ━━━';

/**
 * Stub for LAZ-42 — returns explanation based on match score.
 */
export function getExplanation(topTool: string, score: number, query: string): string {
  if (score >= 0.85) {
    return `根据你的需求"${query.slice(0, 20)}${query.length > 20 ? '...' : ''}"，/「${topTool}」是最高置信度匹配`;
  }
  if (score >= 0.7) {
    return `「${topTool}」与你的需求"${query.slice(0, 15)}${query.length > 15 ? '...' : ''}"高度相关`;
  }
  return `选择「${topTool}」作为推荐工具`;
}

export interface DecisionCardOptions {
  query: string;
  topMatch: MatchResult;
  alternates: MatchResult[];
  tokenSavings?: number;
  lookupSavings?: number;
  proposals?: ProposalOption[];
  explanation?: string;
}

/**
 * Format a decision card for high-confidence matches.
 * Output format per LAZ-40 acceptance criteria:
 * ━━━ 分隔 ━━━
 * 🧠 LazyBrain 替你做了一个决定
 * 你想: <原 query>
 * 我选: <工具名> [置信度]
 * 为何: <自然语言理由，来自 explanation_template>
 * 备选: <top-2 备选 + 置信度>
 * 估算: <省 tokens / 省查找次数>
 * ━━━ 分隔 ━━━
 */
export function formatDecisionCard(opts: DecisionCardOptions): string {
  const { query, topMatch, alternates, tokenSavings, lookupSavings, explanation } = opts;
  const toolName = topMatch.capability.name;
  const confidence = Math.round(topMatch.score * 100);
  const explanationText = explanation ?? getExplanation(toolName, topMatch.score, query);

  const alternateLines = alternates
    .slice(0, 2)
    .map((alt) => `/「${alt.capability.name}」 [${Math.round(alt.score * 100)}%]`)
    .join(', ');

  let savingsLine = '';
  if (tokenSavings !== undefined || lookupSavings !== undefined) {
    const parts: string[] = [];
    if (tokenSavings !== undefined) parts.push(`省 ~${tokenSavings} tokens`);
    if (lookupSavings !== undefined) parts.push(`省 ${lookupSavings} 次查找`);
    savingsLine = parts.join(' / ');
  }

  const lines: string[] = [];
  lines.push(DECISION_CARD_DIVIDER);
  lines.push('🧠 LazyBrain 替你做了一个决定');
  lines.push(`你想: ${query}`);
  lines.push(`我选: /「${toolName}」 [${confidence}%]`);
  lines.push(`为何: ${explanationText}`);
  if (alternateLines) lines.push(`备选: ${alternateLines}`);
  if (savingsLine) lines.push(`估算: ${savingsLine}`);
  lines.push(DECISION_CARD_DIVIDER);

  return lines.join('\n');
}

/** Compact fallback for medium/low confidence matches. */
export function formatDecisionCardCompact(
  topTool: string,
  score: number,
  alternates: Array<{ name: string; score: number }>,
): string {
  const parts: string[] = [];
  parts.push(`🧠 LazyBrain: /「${topTool}」 (${Math.round(score * 100)}%)`);
  if (alternates.length > 0) {
    const altStr = alternates
      .slice(0, 2)
      .map((a) => `/「${a.name}」 (${Math.round(a.score * 100)}%)`)
      .join(', ');
    parts.push(altStr);
  }
  return parts.join(' · ');
}
