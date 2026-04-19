/**
 * LazyBrain — Session Summary Module
 *
 * Computes manual per-session audit statistics for the `lazybrain summary`
 * command. This module is no longer tied to the Stop hook lifecycle.
 *
 * Data sources:
 *   - history.jsonl: route/accept events with sessionId
 *   - usage.jsonl: optional local token/accounting records
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HISTORY_PATH, LAZYBRAIN_DIR } from '../constants.js';
import type { HistoryEntry } from '../types.js';

const USAGE_PATH = join(LAZYBRAIN_DIR, 'usage.jsonl');

export interface CheapestTask {
  tokens: number;
  model: string;
  taskType: string;
}

export interface SessionSummary {
  /** Total routing events this session (query matched something) */
  routeCount: number;
  /** How many recommendations user accepted */
  acceptCount: number;
  /** Acceptance rate as percentage */
  acceptRate: number;
  /** Wrong recommendations we helped avoid (accepted=false) */
  avoidCount: number;
  /** Audited token baseline from usage log */
  baselineTokens: number;
  /** Audited actual tokens consumed this session */
  actualTokens: number;
  /** Difference between baseline and actual, when usage logs exist */
  tokenDelta: number;
  /** Audited baseline cost USD */
  baselineCostUSD: number;
  /** Audited actual cost USD */
  actualCostUSD: number;
  /** Difference between baseline and actual cost, when usage logs exist */
  costDeltaUSD: number;
  /** Lowest-cost task observed in this session */
  lowestCostTask: CheapestTask | null;
}

interface UsageEntry {
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  model: string;
  costUsd: number;
  taskType: string;
}

function ratesForModel(model: string | undefined): {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
} {
  const name = model?.toLowerCase() ?? 'sonnet';
  if (name.includes('opus')) {
    return { input: 15.0, output: 75.0, cacheWrite: 18.75, cacheRead: 1.5 };
  }
  if (name.includes('haiku')) {
    return { input: 0.80, output: 4.0, cacheWrite: 1.0, cacheRead: 0.08 };
  }
  if (name.includes('glm')) {
    return { input: 0.07, output: 0.07, cacheWrite: 0, cacheRead: 0 };
  }
  return { input: 3.0, output: 15.0, cacheWrite: 3.75, cacheRead: 0.30 };
}

function loadHistoryEntries(historyPath?: string): HistoryEntry[] {
  const path = historyPath ?? HISTORY_PATH;
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, 'utf-8').trim();
    if (!raw) return [];
    return raw.split('\n').filter(Boolean).map(l => JSON.parse(l) as HistoryEntry);
  } catch {
    return [];
  }
}

function loadUsageEntries(usagePath?: string): UsageEntry[] {
  const path = usagePath ?? USAGE_PATH;
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, 'utf-8').trim();
    if (!raw) return [];
    return raw.split('\n').filter(Boolean).map(l => JSON.parse(l) as UsageEntry);
  } catch {
    return [];
  }
}

export interface SessionSummaryOptions {
  historyPath?: string;
  usagePath?: string;
}

export function buildSessionSummary(sessionId: string, options?: SessionSummaryOptions): SessionSummary {
  const history = loadHistoryEntries(options?.historyPath);
  const usage = loadUsageEntries(options?.usagePath);

  // Filter to current session
  const sessionHistory = history.filter(h => h.sessionId === sessionId);
  const sessionUsage = usage.filter(u => u.sessionId === sessionId);

  // Route count: history entries with a matched tool (query != '')
  const routed = sessionHistory.filter(h => h.query && h.matched);
  const routeCount = routed.length;
  const acceptCount = routed.filter(h => h.accepted).length;
  const avoidCount = routed.filter(h => !h.accepted).length;
  const acceptRate = routeCount > 0 ? Math.round((acceptCount / routeCount) * 100) : 0;

  // Baseline is what the session would have cost without prompt-cache reads.
  // Actual is the transcript cost model: normal input/output, cache writes at
  // write rates, and cache reads at the discounted read rate.
  let baselineTokens = 0;
  let actualTokens = 0;
  let baselineCostUSD = 0;
  let actualCostUSD = 0;

  for (const u of sessionUsage) {
    const entryBaseline = u.inputTokens + u.outputTokens + u.cacheWriteTokens + u.cacheReadTokens;
    const entryActual = u.inputTokens + u.outputTokens + u.cacheWriteTokens;

    baselineTokens += entryBaseline;
    actualTokens += entryActual;

    const rates = ratesForModel(u.model);

    baselineCostUSD += (u.inputTokens / 1_000_000) * rates.input
      + (u.outputTokens / 1_000_000) * rates.output
      + (u.cacheWriteTokens / 1_000_000) * rates.input
      + (u.cacheReadTokens / 1_000_000) * rates.input;
    actualCostUSD += (u.inputTokens / 1_000_000) * rates.input
      + (u.outputTokens / 1_000_000) * rates.output
      + (u.cacheWriteTokens / 1_000_000) * rates.cacheWrite
      + (u.cacheReadTokens / 1_000_000) * rates.cacheRead;
  }

  const tokenDelta = baselineTokens - actualTokens;
  const costDeltaUSD = Math.round((baselineCostUSD - actualCostUSD) * 100) / 100;
  actualCostUSD = Math.round(actualCostUSD * 100) / 100;
  baselineCostUSD = Math.round(baselineCostUSD * 100) / 100;

  // Find cheapest task
  let cheapest: CheapestTask | null = null;
  if (sessionUsage.length > 0) {
    const cheapestEntry = sessionUsage.reduce((min, cur) =>
      cur.costUsd < min.costUsd ? cur : min,
    );
    cheapest = {
      tokens: cheapestEntry.inputTokens + cheapestEntry.outputTokens,
      model: cheapestEntry.model,
      taskType: cheapestEntry.taskType,
    };
  }

  return {
    routeCount,
    acceptCount,
    acceptRate,
    avoidCount,
    baselineTokens,
    actualTokens,
    tokenDelta,
    baselineCostUSD,
    actualCostUSD,
    costDeltaUSD,
    lowestCostTask: cheapest,
  };
}

export function formatSessionSummary(summary: SessionSummary): string {
  const lines: string[] = [];

  lines.push('本次会话审计：');
  lines.push(`• 路由 ${summary.routeCount} 次，你接受了 ${summary.acceptCount} 次 (${summary.acceptRate}%)`);
  lines.push(`• 跳过/拒绝 ${summary.avoidCount} 次推荐`);
  lines.push(`• 使用记录：基线 ${formatTokens(summary.baselineTokens)} / 实际 ${formatTokens(summary.actualTokens)} / 差值 ${formatSignedTokens(summary.tokenDelta)}`);
  lines.push(`• 成本记录：基线 ~$${summary.baselineCostUSD.toFixed(summary.baselineCostUSD < 1 ? 2 : 1)} / 实际 ~$${summary.actualCostUSD.toFixed(summary.actualCostUSD < 1 ? 2 : 1)} / 差值 ${formatSignedCost(summary.costDeltaUSD)}`);

  if (summary.lowestCostTask) {
    const ct = summary.lowestCostTask;
    lines.push(`• 最低成本任务：${formatTokens(ct.tokens)} 用 ${ct.model} 做 ${ct.taskType}`);
  }

  return lines.join('\n');
}

function formatTokens(n: number): string {
  return `~${(n / 1000).toFixed(1)}k`;
}

function formatSignedTokens(n: number): string {
  const prefix = n > 0 ? '-' : n < 0 ? '+' : '±';
  return `${prefix}${formatTokens(Math.abs(n))}`;
}

function formatSignedCost(n: number): string {
  const prefix = n > 0 ? '-' : n < 0 ? '+' : '±';
  return `${prefix}$${Math.abs(n).toFixed(Math.abs(n) < 1 ? 2 : 1)}`;
}
