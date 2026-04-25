/**
 * LazyBrain — Session Stats Module
 *
 * Aggregates lightweight startup recap statistics from history.jsonl,
 * recommendations.jsonl, and graph
 * for the SessionStart dashboard display.
 */

import { existsSync, readFileSync } from 'node:fs';
import type { Graph } from '../graph/graph.js';
import { HISTORY_PATH } from '../constants.js';
import type { HistoryEntry } from '../types.js';
import type { DuplicatePair } from '../graph/duplicate-detector.js';
import { loadRecommendations } from '../history/tool-usage-tracker.js';

export interface SessionStats {
  totalCapabilities: number;
  totalRecommendations: number;
  acceptedRecommendations: number;
  adoptionRate: number;
  skippedRecommendations: number;
  lastRecommendedTool: string | null;
  recentMatches: Array<{
    timestamp: string;
    query: string;
    matched: string;
    accepted: boolean;
  }>;
  topCapabilities: string[];
  newCapsThisWeek: number;
  duplicatePairs: number;
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
  const recommendations = loadRecommendations();
  const routedHistory = history.filter(h =>
    h.query &&
    h.matched &&
    h.reason !== 'stop' &&
    h.reason !== 'meta_bypass' &&
    h.reason !== 'no_graph'
  );

  const totalCapabilities = graph.getAllNodes().length;
  const totalRecommendations = routedHistory.length;
  const acceptedRecommendations = routedHistory.filter(h => h.accepted).length;
  const skippedRecommendations = routedHistory.filter(h => !h.accepted).length;
  const adoptionRate = totalRecommendations > 0
    ? Math.round((acceptedRecommendations / totalRecommendations) * 100)
    : 0;

  const recentMatches = routedHistory
    .slice(-10)
    .reverse()
    .map(h => ({
      timestamp: formatTimestamp(h.timestamp),
      query: h.query.slice(0, 20),
      matched: h.matched,
      accepted: h.accepted,
    }))
    .slice(0, 3);

  const topCapabilities = [...routedHistory
    .reduce((acc, entry) => {
      acc.set(entry.matched, (acc.get(entry.matched) ?? 0) + 1);
      return acc;
    }, new Map<string, number>())
    .entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name]) => name);

  const lastRecommendedTool = recommendations.length > 0
    ? recommendations[recommendations.length - 1].recommended[0] ?? null
    : null;

  return {
    totalCapabilities,
    totalRecommendations,
    acceptedRecommendations,
    adoptionRate,
    skippedRecommendations,
    lastRecommendedTool,
    recentMatches,
    topCapabilities,
    newCapsThisWeek: 0,
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
