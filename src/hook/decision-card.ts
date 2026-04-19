/**
 * LazyBrain — Decision Card
 * Formats matcher results into user-readable Decision Cards.
 */

import type { MatchResult, ProposalOption } from '../types.js';

export const DECISION_CARD_PREFIX = 'LazyBrain 选工具';

function formatToolName(name: string): string {
  return `/${name}`;
}

function layerReason(layer: MatchResult['layer']): string {
  switch (layer) {
    case 'alias':
      return '命中了你设置过的别名';
    case 'tag':
      return '命中了工具标签和示例用法';
    case 'semantic':
      return '语义上最接近你的需求';
    case 'llm':
      return '由秘书层复判后推荐';
  }
}

function platformReason(match: MatchResult): string {
  const platforms = match.capability.compatibility;
  if (platforms.includes('universal')) return '，并且是跨平台能力';
  if (platforms.length > 0) return `，适用于 ${platforms.join('/')}`;
  return '';
}

/**
 * Fallback explanation when the matcher did not provide a compiled template.
 */
export function getExplanation(topTool: string, score: number, query: string): string {
  if (score >= 0.85) {
    return `根据你的需求"${query.slice(0, 20)}${query.length > 20 ? '...' : ''}"，${formatToolName(topTool)} 是最高置信度匹配`;
  }
  if (score >= 0.7) {
    return `${formatToolName(topTool)} 与你的需求"${query.slice(0, 15)}${query.length > 15 ? '...' : ''}"高度相关`;
  }
  return `选择 ${formatToolName(topTool)} 作为推荐工具`;
}

export function explainMatch(match: MatchResult, query: string, explicitExplanation?: string): string {
  if (explicitExplanation?.trim()) return explicitExplanation.trim();
  if (match.explanation?.trim()) return match.explanation.trim();

  const base = getExplanation(match.capability.name, match.score, query);
  const reason = layerReason(match.layer);
  const platform = platformReason(match);
  const history = match.historyBoost && match.historyBoost > 0
    ? `；历史偏好给它加了 ${Math.round(match.historyBoost * 100)} 分`
    : '';
  return `${base}：${reason}${platform}${history}。`;
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
 * Format a visible decision notice.
 *
 * Keep this intentionally short and plain. Claude CLI tends to fold large
 * hook/terminal blocks behind Ctrl+O; a compact 2-3 line notice is more likely
 * to remain visible in the normal conversation flow.
 */
export function formatDecisionCard(opts: DecisionCardOptions): string {
  const { query, topMatch, alternates, tokenSavings, lookupSavings, explanation } = opts;
  const toolName = topMatch.capability.name;
  const confidence = Math.round(topMatch.score * 100);
  const explanationText = explainMatch(topMatch, query, explanation);

  const alternateLines = alternates
    .slice(0, 2)
    .map((alt) => `${formatToolName(alt.capability.name)} [${Math.round(alt.score * 100)}%]`)
    .join(', ');

  let savingsLine = '';
  if (tokenSavings !== undefined || lookupSavings !== undefined) {
    const parts: string[] = [];
    if (tokenSavings !== undefined) parts.push(`省 ~${tokenSavings} tokens`);
    if (lookupSavings !== undefined) parts.push(`省 ${lookupSavings} 次查找`);
    savingsLine = parts.join(' / ');
  }

  const tail: string[] = [];
  if (alternateLines) tail.push(`备选 ${alternateLines}`);
  if (savingsLine) tail.push(savingsLine);

  const lines: string[] = [];
  lines.push(`${DECISION_CARD_PREFIX}: ${formatToolName(toolName)} [${confidence}%]`);
  lines.push(`原因: ${explanationText}`);
  if (tail.length > 0) lines.push(tail.join('；'));

  return lines.join('\n');
}

/** Compact fallback for medium/low confidence matches. */
export function formatDecisionCardCompact(
  topTool: string,
  score: number,
  alternates: Array<{ name: string; score: number }>,
): string {
  const parts: string[] = [];
  parts.push(`🧠 LazyBrain: ${formatToolName(topTool)} (${Math.round(score * 100)}%)`);
  if (alternates.length > 0) {
    const altStr = alternates
      .slice(0, 2)
      .map((a) => `${formatToolName(a.name)} (${Math.round(a.score * 100)}%)`)
      .join(', ');
    parts.push(altStr);
  }
  return parts.join(' · ');
}
