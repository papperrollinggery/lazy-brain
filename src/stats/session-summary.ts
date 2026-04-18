/**
 * LazyBrain — Session Summary Module
 *
 * Computes per-session summary statistics for SessionEnd hook output
 * and /lazybrain summary CLI command.
 *
 * Data sources:
 *   - history.jsonl: route/accept events with sessionId
 *   - usage.jsonl: token usage per session
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
  /** Baseline tokens (without cache optimization) */
  baselineTokens: number;
  /** Actual tokens consumed this session (after cache reads) */
  actualTokens: number;
  /** Saved tokens = baselineTokens - actualTokens */
  savedTokens: number;
  /** Baseline cost USD (full price, no cache) */
  baselineCostUSD: number;
  /** Actual cost USD this session (after cache reads) */
  actualCostUSD: number;
  /** Saved cost USD = baselineCostUSD - actualCostUSD */
  savedCostUSD: number;
  /** Cheapest task in this session */
  cheapestTask: CheapestTask | null;
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

  // Baseline = full price tokens (input + output, no cache discount)
  // Actual = tokens after cache read savings
  // Saved = baseline - actual = cacheReadTokens (tokens that got cache discount)
  let baselineTokens = 0;
  let actualTokens = 0;
  let baselineCostUSD = 0;
  let actualCostUSD = 0;

  for (const u of sessionUsage) {
    const entryBaseline = u.inputTokens + u.outputTokens;
    const entryActual = entryBaseline - u.cacheReadTokens;

    baselineTokens += entryBaseline;
    actualTokens += entryActual;

    // Calculate baseline cost at full rates, actual cost uses cached rates
    const rates = { input: 3.0, output: 15.0, cacheWrite: 3.75, cacheRead: 0.30 };
    const model = u.model?.toLowerCase() ?? 'sonnet';
    if (model.includes('opus')) {
      rates.input = 15.0; rates.output = 75.0; rates.cacheWrite = 18.75; rates.cacheRead = 1.5;
    } else if (model.includes('haiku')) {
      rates.input = 0.80; rates.output = 4.0; rates.cacheWrite = 1.0; rates.cacheRead = 0.08;
    } else if (model.includes('glm')) {
      rates.input = 0.07; rates.output = 0.07; rates.cacheWrite = 0; rates.cacheRead = 0;
    }

    baselineCostUSD += (u.inputTokens / 1_000_000) * rates.input
      + (u.outputTokens / 1_000_000) * rates.output;
    actualCostUSD += (u.inputTokens / 1_000_000) * rates.input
      + (u.outputTokens / 1_000_000) * rates.output
      + (u.cacheReadTokens / 1_000_000) * rates.cacheRead;
  }

  const savedTokens = baselineTokens - actualTokens;
  const savedCostUSD = Math.round((baselineCostUSD - actualCostUSD) * 100) / 100;
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
    savedTokens,
    baselineCostUSD,
    actualCostUSD,
    savedCostUSD,
    cheapestTask: cheapest,
  };
}

export function formatSessionSummary(summary: SessionSummary): string {
  const lines: string[] = [];

  lines.push('本次会话小结：');
  lines.push(`• 路由 ${summary.routeCount} 次，你接受了 ${summary.acceptCount} 次 (${summary.acceptRate}%)`);
  lines.push(`• 替你避开过 ${summary.avoidCount} 次错选`);
  lines.push(`• 节省估算：~${formatTokens(summary.savedTokens)} tokens / ~$${summary.savedCostUSD.toFixed(summary.savedCostUSD < 1 ? 2 : 1)}`);

  if (summary.cheapestTask) {
    const ct = summary.cheapestTask;
    lines.push(`• 最省钱的一次：${formatTokens(ct.tokens)} 用 ${ct.model} 做 ${ct.taskType}`);
  }

  return lines.join('\n');
}

function formatTokens(n: number): string {
  return `~${(n / 1000).toFixed(1)}k`;
}
