import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { HISTORY_PATH } from '../constants.js';
import type { HistoryEntry as LegacyHistoryEntry, MatchLayer } from '../types.js';

export interface HistoryEntry {
  timestamp: string;
  query: string;
  recommended: string;
  used: string | null;
  sessionId: string;
}

export interface UsageStats {
  total: number;
  accepted: number;
  ignored: number;
  bySkill: Array<{ skill: string; count: number }>;
  recent: HistoryEntry[];
}

function ensureDir(): void {
  const dir = dirname(HISTORY_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function parseLine(line: string): HistoryEntry | null {
  try {
    const value = JSON.parse(line) as Partial<HistoryEntry>;
    if (typeof value.timestamp !== 'string') return null;
    if (typeof value.query !== 'string') return null;
    if (typeof value.recommended !== 'string') return null;
    const used = value.used === null || typeof value.used === 'string' ? value.used : null;
    return {
      timestamp: value.timestamp,
      query: value.query,
      recommended: value.recommended,
      used,
      sessionId: typeof value.sessionId === 'string' ? value.sessionId : 'unknown',
    };
  } catch {
    return null;
  }
}

export function append(entry: HistoryEntry): void {
  ensureDir();
  appendFileSync(HISTORY_PATH, `${JSON.stringify(entry)}\n`);
}

export function loadRecent(days = 30): HistoryEntry[] {
  if (!existsSync(HISTORY_PATH)) return [];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return readFileSync(HISTORY_PATH, 'utf-8')
    .split('\n')
    .map(parseLine)
    .filter((entry): entry is HistoryEntry => entry !== null && Date.parse(entry.timestamp) >= cutoff);
}

export function getStats(): UsageStats {
  const recent = loadRecent(30);
  const counts = new Map<string, number>();
  for (const entry of recent) {
    const key = entry.used ?? entry.recommended;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const bySkill = [...counts.entries()]
    .map(([skill, count]) => ({ skill, count }))
    .sort((a, b) => b.count - a.count || a.skill.localeCompare(b.skill));
  return {
    total: recent.length,
    accepted: recent.filter((entry) => entry.used !== null).length,
    ignored: recent.filter((entry) => entry.used === null).length,
    bySkill,
    recent,
  };
}

export function loadRecentHistory(limit = 50): LegacyHistoryEntry[] {
  return loadRecent(30)
    .slice(-limit)
    .map((entry) => ({
      timestamp: entry.timestamp,
      query: entry.query,
      matched: entry.recommended,
      accepted: entry.used !== null,
      layer: 'tag' as MatchLayer,
      sessionId: entry.sessionId,
      reason: entry.used === null ? 'low_score' : 'matched',
    }));
}
