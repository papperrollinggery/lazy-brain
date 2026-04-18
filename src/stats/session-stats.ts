/**
 * LazyBrain — Session Stats Module
 *
 * Aggregates statistics from history.jsonl, usage.jsonl, and graph
 * for the SessionStart dashboard display.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Graph } from '../graph/graph.js';
import { HISTORY_PATH, LAZYBRAIN_DIR } from '../constants.js';
import type { HistoryEntry } from '../types.js';
import type { DuplicatePair } from '../graph/duplicate-detector.js';

const USAGE_PATH = join(LAZYBRAIN_DIR, 'usage.jsonl');
const LAST_MATCH_PATH = join(LAZYBRAIN_DIR, 'last-match.json');
const COMPILED_AT_PATH = join(LAZYBRAIN_DIR, '.compiled-at');

export interface SessionStats {
  totalCapabilities: number;
  totalMatches: number;
  hitRate: number;
  baselineTokens: number;
  actualTokens: number;
  savedTokens: number;
  baselineCostUSD: number;
  actualCostUSD: number;
  savedCostUSD: number;
  recentMatches: Array<{
    timestamp: string;
    query: string;
    matched: string;
    accepted: boolean;
  }>;
  newCapsThisWeek: number;
  duplicatePairs: number;
}

interface LastMatchEntry {
  tool: string | null;
  score: number;
  historyBoost: number;
  model: string;
  updatedAt: number;
}

function loadHistoryEntries(): HistoryEntry[] {
  if (!existsSync(HISTORY_PATH)) return [];
  try {
    const raw = readFileSync(HISTORY_PATH, 'utf-8').trim();
    if (!raw) return [];
    return raw.split('\n').filter(Boolean).map(l => JSON.parse(l) as HistoryEntry);
  } catch {
    return [];
  }
}

function loadUsageEntries(): Array<{ inputTokens: number; outputTokens: number; cacheWriteTokens: number; cacheReadTokens: number; costUsd: number }> {
  if (!existsSync(USAGE_PATH)) return [];
  try {
    const raw = readFileSync(USAGE_PATH, 'utf-8').trim();
    if (!raw) return [];
    return raw.split('\n').filter(Boolean).map(l => {
      const entry = JSON.parse(l);
      return {
        inputTokens: entry.inputTokens ?? 0,
        outputTokens: entry.outputTokens ?? 0,
        cacheWriteTokens: entry.cacheWriteTokens ?? 0,
        cacheReadTokens: entry.cacheReadTokens ?? 0,
        costUsd: entry.costUsd ?? 0,
      };
    });
  } catch {
    return [];
  }
}

function loadLastCompiledAt(): number {
  if (!existsSync(COMPILED_AT_PATH)) return 0;
  try {
    const raw = readFileSync(COMPILED_AT_PATH, 'utf-8').trim();
    return parseInt(raw, 10) || 0;
  } catch {
    return 0;
  }
}

function getWeekAgo(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export function buildSessionStats(graph: Graph, duplicatePairs: DuplicatePair[] = []): SessionStats {
  const history = loadHistoryEntries();
  const usageEntries = loadUsageEntries();

  const totalCapabilities = graph.getAllNodes().length;
  const totalMatches = history.filter(h => h.query && h.matched).length;

  const acceptedMatches = history.filter(h => h.query && h.matched && h.accepted).length;
  const hitRate = totalMatches > 0 ? Math.round((acceptedMatches / totalMatches) * 100) : 0;

  let baselineTokens = 0;
  let actualTokens = 0;
  let baselineCostUSD = 0;
  let actualCostUSD = 0;

  for (const u of usageEntries) {
    const entryBaseline = u.inputTokens + u.outputTokens;
    const entryActual = entryBaseline - u.cacheReadTokens;
    baselineTokens += entryBaseline;
    actualTokens += entryActual;

    // Calculate costs using model-specific rates
    const rates = { input: 3.0, output: 15.0, cacheRead: 0.30 };
    const model = (u as unknown as { model?: string }).model?.toLowerCase() ?? 'sonnet';
    if (model.includes('opus')) {
      rates.input = 15.0; rates.output = 75.0; rates.cacheRead = 1.5;
    } else if (model.includes('haiku')) {
      rates.input = 0.80; rates.output = 4.0; rates.cacheRead = 0.08;
    } else if (model.includes('glm')) {
      rates.input = 0.07; rates.output = 0.07; rates.cacheRead = 0;
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

  const weekAgo = getWeekAgo();
  const recentMatches = history
    .filter(h => h.query && h.matched)
    .slice(-10)
    .reverse()
    .map(h => ({
      timestamp: formatTimestamp(h.timestamp),
      query: h.query.slice(0, 20),
      matched: h.matched,
      accepted: h.accepted,
    }))
    .slice(0, 3);

  const lastCompiledAt = loadLastCompiledAt();
  const weekAgoMs = weekAgo.getTime();
  const newCapsThisWeek = lastCompiledAt > weekAgoMs ? 0 : 0;

  return {
    totalCapabilities,
    totalMatches,
    hitRate,
    baselineTokens,
    actualTokens,
    savedTokens,
    baselineCostUSD,
    actualCostUSD,
    savedCostUSD,
    recentMatches,
    newCapsThisWeek,
    duplicatePairs: duplicatePairs.length,
  };
}

export function loadRecentMatchesForStats(n = 3): Array<{ timestamp: string; query: string; matched: string; accepted: boolean }> {
  const history = loadHistoryEntries();
  return history
    .filter(h => h.query && h.matched)
    .slice(-n)
    .reverse()
    .map(h => ({
      timestamp: formatTimestamp(h.timestamp),
      query: h.query.slice(0, 20),
      matched: h.matched,
      accepted: h.accepted,
    }));
}
